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

    def test_06_frontend_camelcase_payload_roundtrip_e2e(self):
        """6. Frontend camelCase payload roundtrip (imageUrl, mediaAssetId, linkText, displayOrder)."""
        db = self.TestingSessionLocal()
        asset1 = MediaAsset(
            filename="front_everyday.jpg",
            public_id="front_everyday_pub",
            secure_url="https://res.cloudinary.com/galbyoxi/image/upload/v1/front_everyday.jpg",
            url="http://res.cloudinary.com/galbyoxi/image/upload/v1/front_everyday.jpg",
            resource_type="image",
            format="jpg",
            mime_type="image/jpeg",
        )
        asset2 = MediaAsset(
            filename="front_festive.jpg",
            public_id="front_festive_pub",
            secure_url="https://res.cloudinary.com/galbyoxi/image/upload/v1/front_festive.jpg",
            url="http://res.cloudinary.com/galbyoxi/image/upload/v1/front_festive.jpg",
            resource_type="image",
            format="jpg",
            mime_type="image/jpeg",
        )
        db.add_all([asset1, asset2])
        db.commit()
        db.refresh(asset1)
        db.refresh(asset2)
        asset1_id, asset2_id = asset1.id, asset2.id
        db.close()

        # Exact camelCase payload serialized by AdminHomepage.tsx
        frontend_cards = [
            {
                "id": "everyday-elegance",
                "title": "EVERYDAY ELEGANCE",
                "subtitle": "Thoughtful luxury",
                "imageUrl": "https://res.cloudinary.com/galbyoxi/image/upload/v1/front_everyday.jpg",
                "mediaAssetId": asset1_id,
                "link": "/shop?category=TWO+PIECES",
                "linkText": "EXPLORE EDIT",
                "displayOrder": 1,
            },
            {
                "id": "festive-celebrations",
                "title": "FESTIVE CELEBRATIONS",
                "subtitle": "Celebrations that endure",
                "imageUrl": "https://res.cloudinary.com/galbyoxi/image/upload/v1/front_festive.jpg",
                "mediaAssetId": asset2_id,
                "link": "/shop?category=SUIT+SET",
                "linkText": "EXPLORE FESTIVE",
                "displayOrder": 2,
            },
            {
                "id": "wedding-guest",
                "title": "WEDDING GUEST",
                "subtitle": "Regal ensembles",
                "imageUrl": None,
                "mediaAssetId": None,
                "link": "/shop?category=HEAVY+DRESS",
                "linkText": "EXPLORE COUTURE",
                "displayOrder": 3,
            },
        ]

        # 1. Save from admin
        put_res = self.client.put(
            "/admin/settings",
            json={"curated_moments_json": json.dumps(frontend_cards)},
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(put_res.status_code, 200)

        # 2. Reload admin settings
        admin_res = self.client.get(
            "/admin/settings",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(admin_res.status_code, 200)
        admin_cards = json.loads(admin_res.json()["curated_moments_json"])
        self.assertEqual(len(admin_cards), 3)

        # Verify Card 1 preserves image, media reference, link, linkText, order
        self.assertEqual(admin_cards[0]["imageUrl"], "https://res.cloudinary.com/galbyoxi/image/upload/v1/front_everyday.jpg")
        self.assertEqual(admin_cards[0]["image_url"], "https://res.cloudinary.com/galbyoxi/image/upload/v1/front_everyday.jpg")
        self.assertEqual(admin_cards[0]["mediaAssetId"], asset1_id)
        self.assertEqual(admin_cards[0]["media_asset_id"], asset1_id)
        self.assertEqual(admin_cards[0]["linkText"], "EXPLORE EDIT")
        self.assertEqual(admin_cards[0]["displayOrder"], 1)

        # Verify Card 2 preserves image, media reference
        self.assertEqual(admin_cards[1]["imageUrl"], "https://res.cloudinary.com/galbyoxi/image/upload/v1/front_festive.jpg")
        self.assertEqual(admin_cards[1]["mediaAssetId"], asset2_id)

        # Verify Card 3 has null image (luxury placeholder mode)
        self.assertIsNone(admin_cards[2]["imageUrl"])
        self.assertIsNone(admin_cards[2]["image_url"])

        # 3. Reload storefront settings
        public_res = self.client.get("/settings")
        self.assertEqual(public_res.status_code, 200)
        public_cards = json.loads(public_res.json()["curated_moments_json"])
        self.assertEqual(public_cards[0]["imageUrl"], "https://res.cloudinary.com/galbyoxi/image/upload/v1/front_everyday.jpg")

        # 4. Verify media usage tracking detects the saved card references
        db_usage = self.TestingSessionLocal()
        a1 = db_usage.query(MediaAsset).filter_by(id=asset1_id).first()
        _, usages = get_asset_usage_references(a1, db_usage)
        self.assertTrue(
            any("Curated Moments: EVERYDAY ELEGANCE" in u for u in usages),
            f"Expected usage tracking for Card 1, got: {usages}",
        )
        db_usage.close()

    def test_07_manager_role_can_update_curated_moments(self):
        """Verifies that STORE_MANAGER and MANAGER roles can also update homepage settings."""
        db = self.TestingSessionLocal()
        manager = Admin(
            email="curated_manager@royallibas.com",
            password_hash=hash_password("ManagerPass123!"),
            name="Store Manager",
            role="STORE_MANAGER",
            is_active=True,
        )
        db.add(manager)
        db.commit()
        db.refresh(manager)
        db.close()

        manager_token = create_access_token(
            data={"sub": manager.email, "role": manager.role}
        )
        res = self.client.put(
            "/admin/settings",
            json={
                "curated_moments_json": json.dumps([
                    {
                        "id": "everyday-elegance",
                        "title": "UPDATED BY MANAGER",
                        "link": "/shop?category=TWO+PIECES",
                        "display_order": 1,
                    }
                ])
            },
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        self.assertEqual(res.status_code, 200, f"Manager update failed: {res.text}")
        data = res.json()
        parsed = json.loads(data["curated_moments_json"])
        self.assertEqual(parsed[0]["title"], "UPDATED BY MANAGER")


if __name__ == "__main__":
    unittest.main()
