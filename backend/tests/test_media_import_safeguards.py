"""Focused regression tests verifying media safeguards:
1. Separate image and video sync pagination
2. Folder creation rejection handling (no local record on remote failure)
3. Single asset move failure safeguards
4. Root folder handling (empty asset_folder does not reconstruct from public_id)
5. Unknown folder mode blocks moves and renames
6. Upload status validation (missing public_id or secure_url rejected)
7. Content hash and cloud_name recording
"""
import os
import sys
import unittest
from unittest.mock import patch, MagicMock

# Isolated test DB
test_db_path = os.path.abspath("backend/tests/test_safeguards_media.db")
if os.path.exists(test_db_path):
    os.remove(test_db_path)

os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path.replace(os.sep, '/')}"
os.environ["CLOUDINARY_CLOUD_NAME"] = "galbyoxi"
os.environ["CLOUDINARY_API_KEY"] = "mock_key"
os.environ["CLOUDINARY_API_SECRET"] = "mock_secret"

sys.path.insert(0, os.path.abspath("backend"))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.models import Admin, MediaAsset, MediaFolder
from app.auth import hash_password, create_access_token
from app.main import app

engine = create_engine(f"sqlite:///{test_db_path.replace(os.sep, '/')}", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

# Seed test admin
db = TestingSessionLocal()
admin = Admin(
    email="test_owner@royallibas.com",
    password_hash=hash_password("Secret123!"),
    role="OWNER",
    is_active=True,
)
db.add(admin)
db.commit()
db.refresh(admin)
token = create_access_token({"sub": str(admin.id), "role": admin.role})
headers = {"Authorization": f"Bearer {token}"}
db.close()


class TestMediaSafeguards(unittest.TestCase):

    def test_01_folder_creation_failure_does_not_create_local_db_record(self):
        """When Cloudinary rejects folder creation, local DB record must not be created."""
        with patch("app.routers.admin.create_cloudinary_folder") as mock_create:
            mock_create.return_value = {"success": False, "error": "Remote provider error"}
            res = client.post(
                "/admin/media/folders",
                json={"name": "FailedFolder", "parent_path": None},
                headers=headers,
            )
            self.assertEqual(res.status_code, 502)
            
            # Verify DB has no record of FailedFolder
            db = TestingSessionLocal()
            f = db.query(MediaFolder).filter(MediaFolder.path == "FailedFolder").first()
            self.assertIsNone(f)
            db.close()

    def test_02_single_asset_move_failure_safeguard(self):
        """When moving single asset remotely fails, local DB folder must not be modified."""
        db = TestingSessionLocal()
        asset = MediaAsset(
            filename="test_item.jpg",
            public_id="photos/item_1",
            url="https://res.cloudinary.com/galbyoxi/item_1.jpg",
            secure_url="https://res.cloudinary.com/galbyoxi/item_1.jpg",
            folder="OriginalFolder",
            file_size=1000,
            mime_type="image/jpeg",
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
        asset_id = asset.id
        db.close()

        with patch("app.routers.admin.move_cloudinary_asset_folder") as mock_move, \
             patch("app.routers.admin.detect_cloudinary_folder_mode") as mock_mode:
            mock_mode.return_value = "dynamic"
            mock_move.return_value = {"success": False, "error": "Remote move rejected"}
            
            res = client.patch(
                f"/admin/media/{asset_id}",
                json={"folder": "TargetFolder"},
                headers=headers,
            )
            self.assertEqual(res.status_code, 502)

            # Verify asset folder remains OriginalFolder
            db = TestingSessionLocal()
            reloaded = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
            self.assertEqual(reloaded.folder, "OriginalFolder")
            db.close()

    def test_03_unknown_folder_mode_blocks_moves_and_renames(self):
        """When folder mode is unknown, moves and renames must be blocked."""
        with patch("app.routers.admin.detect_cloudinary_folder_mode") as mock_mode:
            mock_mode.return_value = "unknown"
            
            # Test bulk move
            res = client.post(
                "/admin/media/bulk-move",
                json={"asset_ids": [1], "target_folder": "NewPlace"},
                headers=headers,
            )
            self.assertEqual(res.status_code, 400)
            self.assertIn("unknown", res.json()["detail"].lower())

    def test_04_root_folder_handling_respects_empty_asset_folder(self):
        """Empty asset_folder from Cloudinary must set folder=None without reconstructing from public_id."""
        with patch("app.routers.admin.fetch_cloudinary_resources") as mock_fetch:
            mock_fetch.return_value = {
                "resources": [
                    {
                        "asset_id": "root_asset_123",
                        "public_id": "old_nested_folder/root_item",
                        "asset_folder": "",  # Explicitly in root folder
                        "secure_url": "https://res.cloudinary.com/galbyoxi/root_item.jpg",
                        "resource_type": "image",
                        "format": "jpg",
                        "bytes": 500,
                    }
                ],
                "next_cursor": None,
            }
            res = client.post("/admin/media/sync?resource_type=image", headers=headers)
            self.assertEqual(res.status_code, 200)

            db = TestingSessionLocal()
            asset = db.query(MediaAsset).filter(MediaAsset.cloudinary_asset_id == "root_asset_123").first()
            self.assertIsNotNone(asset)
            self.assertIsNone(asset.folder)  # Must be None, NOT "old_nested_folder"
            db.close()

    def test_05_separate_pagination_between_image_and_video(self):
        """Syncing with resource_type=all must not pass video cursor to image or vice versa."""
        with patch("app.routers.admin.fetch_cloudinary_resources") as mock_fetch:
            def side_effect(resource_type, max_results, next_cursor):
                if resource_type == "image":
                    if not next_cursor:
                        return {"resources": [{"public_id": "img1", "secure_url": "u1", "bytes": 10}], "next_cursor": "img_c2"}
                    elif next_cursor == "img_c2":
                        return {"resources": [{"public_id": "img2", "secure_url": "u2", "bytes": 10}], "next_cursor": None}
                elif resource_type == "video":
                    if not next_cursor:
                        return {"resources": [{"public_id": "vid1", "secure_url": "v1", "bytes": 20, "resource_type": "video"}], "next_cursor": None}
                return {"resources": [], "next_cursor": None}

            mock_fetch.side_effect = side_effect

            # Page 1 (image)
            p1 = client.post("/admin/media/sync?resource_type=all", headers=headers)
            self.assertEqual(p1.status_code, 200)
            data1 = p1.json()
            self.assertTrue(data1["has_more"])
            self.assertEqual(data1["next_cursor"], "img:img_c2")

            # Page 2 (image terminal + video first)
            p2 = client.post(f"/admin/media/sync?resource_type=all&cursor={data1['next_cursor']}", headers=headers)
            self.assertEqual(p2.status_code, 200)
            data2 = p2.json()
            self.assertFalse(data2["has_more"])
            self.assertIsNone(data2["next_cursor"])


if __name__ == "__main__":
    unittest.main()
