import json
import os
import shutil
import sys
import tempfile
import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import Base, get_db
from app.main import app
from app.models import Admin, StoreSetting, MediaAsset
from app.auth import hash_password, create_access_token
from app.services.media_usage_service import get_asset_usage_references


class TestCuratedMoments(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp(prefix="rl_curated_moments_test_")
        cls.temp_db_path = os.path.join(cls.temp_dir, "test_curated.db")
        cls.engine = create_engine(
            f"sqlite:///{cls.temp_db_path}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)

        def override_get_db():
            db = cls.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(app)

        db = cls.TestingSessionLocal()
        cls.owner = Admin(
            email="curated_owner@royallibas.com",
            password_hash=hash_password("OwnerSecurePass123!"),
            name="Tanya",
            role="OWNER",
            is_active=True,
        )
        cls.staff = Admin(
            email="curated_staff@royallibas.com",
            password_hash=hash_password("StaffSecurePass123!"),
            name="Staff Member",
            role="FULFILLMENT_STAFF",
            is_active=True,
        )
        db.add_all([cls.owner, cls.staff])
        db.commit()

        cls.owner_token = create_access_token({"sub": cls.owner.email, "role": cls.owner.role})
        cls.staff_token = create_access_token({"sub": cls.staff.email, "role": cls.staff.role})
        db.close()

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        if hasattr(cls, "client"):
            cls.client.close()
        cls.engine.dispose()
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def test_01_public_settings_has_curated_moments(self):
        """Public GET /settings exposes curated_moments_json defaulting to '[]'."""
        res = self.client.get("/settings")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("curated_moments_json", data)
        self.assertEqual(data["curated_moments_json"], "[]")

    def test_02_admin_get_settings_has_curated_moments(self):
        """Admin GET /admin/settings exposes curated_moments_json."""
        res = self.client.get("/admin/settings", headers={"Authorization": f"Bearer {self.owner_token}"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("curated_moments_json", data)

    def test_03_admin_update_curated_moments_success(self):
        """Owner can successfully save curated moments cards with valid internal links."""
        valid_cards = [
            {
                "id": "everyday-elegance",
                "title": "EVERYDAY ELEGANCE",
                "subtitle": "From everyday grace to effortless sophistication",
                "image_url": "https://res.cloudinary.com/galbyoxi/image/upload/v1/editorial/everyday.jpg",
                "media_asset_id": None,
                "link": "/shop?category=TWO+PIECES",
                "link_text": "EXPLORE COLLECTION",
                "display_order": 1,
            },
            {
                "id": "festive-celebrations",
                "title": "FESTIVE CELEBRATIONS",
                "subtitle": "Celebrations that become part of your story",
                "image_url": None,
                "media_asset_id": None,
                "link": "/shop?category=SUIT+SET",
                "link_text": "EXPLORE COLLECTION",
                "display_order": 2,
            },
            {
                "id": "wedding-guest",
                "title": "WEDDING GUEST",
                "subtitle": "Opulent couture for ceremonies",
                "image_url": None,
                "media_asset_id": None,
                "link": "/shop?category=HEAVY+DRESS",
                "link_text": "EXPLORE COLLECTION",
                "display_order": 3,
            },
        ]
        res = self.client.put(
            "/admin/settings",
            json={"curated_moments_json": json.dumps(valid_cards)},
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        parsed = json.loads(data["curated_moments_json"])
        self.assertEqual(len(parsed), 3)
        self.assertEqual(parsed[0]["title"], "EVERYDAY ELEGANCE")
        self.assertEqual(parsed[0]["link"], "/shop?category=TWO+PIECES")
        self.assertEqual(parsed[1]["title"], "FESTIVE CELEBRATIONS")
        self.assertIsNone(parsed[1]["image_url"])

    def test_04_admin_update_curated_moments_link_validation(self):
        """Rejects external, unsafe, or malformed destination links."""
        invalid_links = [
            "javascript:alert(1)",
            "https://external-phishing.com/shop",
            "http://malicious.com",
            "//protocol-relative.com",
            "/shop has spaces",
            "data:text/html;base64,PHNjcmlwdD4=",
        ]
        for bad_link in invalid_links:
            bad_cards = [
                {
                    "id": "bad-card",
                    "title": "BAD LINK CARD",
                    "link": bad_link,
                }
            ]
            res = self.client.put(
                "/admin/settings",
                json={"curated_moments_json": json.dumps(bad_cards)},
                headers={"Authorization": f"Bearer {self.owner_token}"},
            )
            self.assertEqual(
                res.status_code,
                422,
                f"Expected 422 for bad link '{bad_link}', got {res.status_code}: {res.text}",
            )

    def test_05_clear_card_image_preserves_cards_and_assets(self):
        """Clearing image_url updates setting without deleting database assets."""
        db = self.TestingSessionLocal()
        asset = MediaAsset(
            filename="curated_editorial.jpg",
            public_id="curated_editorial_pub",
            secure_url="https://res.cloudinary.com/galbyoxi/image/upload/v1/curated_editorial.jpg",
            url="http://res.cloudinary.com/galbyoxi/image/upload/v1/curated_editorial.jpg",
            resource_type="image",
            format="jpg",
            mime_type="image/jpeg",
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
        asset_id = asset.id
        db.close()

        # Set card image to asset URL
        cards_with_asset = [
            {
                "id": "everyday-elegance",
                "title": "EVERYDAY ELEGANCE",
                "image_url": asset.secure_url,
                "media_asset_id": asset_id,
                "link": "/shop?category=TWO+PIECES",
                "display_order": 1,
            }
        ]
        res = self.client.put(
            "/admin/settings",
            json={"curated_moments_json": json.dumps(cards_with_asset)},
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res.status_code, 200)

        # Check media usage detects usage
        db2 = self.TestingSessionLocal()
        loaded_asset = db2.query(MediaAsset).filter_by(id=asset_id).first()
        prod_usage, edit_usage = get_asset_usage_references(loaded_asset, db2)
        self.assertTrue(
            any("Curated Moments: EVERYDAY ELEGANCE" in u for u in edit_usage),
            f"Expected Curated Moments usage, got: {edit_usage}",
        )
        db2.close()

        # Clear image_url on the card (e.g. admin switches to placeholder)
        cards_cleared = [
            {
                "id": "everyday-elegance",
                "title": "EVERYDAY ELEGANCE",
                "image_url": None,
                "media_asset_id": None,
                "link": "/shop?category=TWO+PIECES",
                "display_order": 1,
            }
        ]
        res_clear = self.client.put(
            "/admin/settings",
            json={"curated_moments_json": json.dumps(cards_cleared)},
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_clear.status_code, 200)

        # Asset in database still exists unharmed!
        db3 = self.TestingSessionLocal()
        still_existing_asset = db3.query(MediaAsset).filter_by(id=asset_id).first()
        self.assertIsNotNone(still_existing_asset, "MediaAsset was unexpectedly deleted from DB!")
        db3.close()


if __name__ == "__main__":
    unittest.main()
