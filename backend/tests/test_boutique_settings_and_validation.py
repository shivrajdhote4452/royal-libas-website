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
from app.models import Admin, StoreSetting
from app.auth import hash_password, create_access_token


class TestBoutiqueSettingsAndValidation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp(prefix="rl_boutique_test_")
        cls.temp_db_path = os.path.join(cls.temp_dir, "test_boutique.db")
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

        # Seed initial admin accounts
        db = cls.TestingSessionLocal()
        cls.owner = Admin(
            email="boutique_owner@royallibas.com",
            password_hash=hash_password("OwnerPassword123!"),
            name="Tanya",
            role="OWNER",
            is_active=True,
        )
        cls.staff = Admin(
            email="boutique_staff@royallibas.com",
            password_hash=hash_password("StaffPassword123!"),
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
        cls.engine.dispose()
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def test_01_public_settings_exposes_boutique_fields(self):
        """1. Public GET /settings exposes boutique location, hours, and contacts."""
        res = self.client.get("/settings")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("boutique_name", data)
        self.assertIn("boutique_address", data)
        self.assertIn("boutique_short_address", data)
        self.assertIn("boutique_landmark", data)
        self.assertIn("boutique_opening_hours", data)
        self.assertIn("boutique_directions_url", data)
        self.assertIn("boutique_section_visible", data)
        self.assertIn("boutique_reviews_json", data)
        self.assertIn("boutique_reviews_visible", data)
        self.assertEqual(data["boutique_name"], "Royal Libas by Tanya")
        self.assertEqual(data["boutique_directions_url"], "https://share.google/rdahckZ4nVz7Bgu2H")
        # Reviews section starts unpublished until verified
        self.assertFalse(data["boutique_reviews_visible"])

    def test_02_admin_rbac_protection_for_settings(self):
        """2. Admin settings modification requires authentication and OWNER role."""
        # Unauthenticated PUT
        res_unauth = self.client.put("/admin/settings", json={"boutique_name": "Hacked Boutique"})
        self.assertEqual(res_unauth.status_code, 401)

        # Non-OWNER staff PUT
        res_staff = self.client.put(
            "/admin/settings",
            json={"boutique_name": "Staff Renamed Boutique"},
            headers={"Authorization": f"Bearer {self.staff_token}"},
        )
        self.assertEqual(res_staff.status_code, 403)

    def test_03_url_validation_rejects_unsafe_protocols_and_untrusted_hosts(self):
        """3. URL validation rejects insecure protocols, non-Google hosts, and unsafe schemes."""
        headers = {"Authorization": f"Bearer {self.owner_token}"}

        # Insecure HTTP embed URL
        res = self.client.put(
            "/admin/settings",
            json={"boutique_embed_url": "http://www.google.com/maps/embed?pb=123"},
            headers=headers,
        )
        self.assertEqual(res.status_code, 422)

        # Malicious non-Google host embed URL
        res = self.client.put(
            "/admin/settings",
            json={"boutique_embed_url": "https://attacker.com/maps/embed?pb=123"},
            headers=headers,
        )
        self.assertEqual(res.status_code, 422)

        # JavaScript injection in directions URL
        res = self.client.put(
            "/admin/settings",
            json={"boutique_directions_url": "javascript:alert(1)"},
            headers=headers,
        )
        self.assertEqual(res.status_code, 422)

        # Non-Google directions host
        res = self.client.put(
            "/admin/settings",
            json={"boutique_directions_url": "https://untrusted-navigation.com/route"},
            headers=headers,
        )
        self.assertEqual(res.status_code, 422)

    def test_04_url_validation_accepts_valid_google_urls_and_iframe_snippets(self):
        """4. Valid Google Maps embed URLs and iframe snippets are parsed and accepted."""
        headers = {"Authorization": f"Bearer {self.owner_token}"}

        valid_embed = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3602.8!2d78.56!3d25.44!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMjXCsDI2JzI0LjAiTiA3OMKwMzMnMzYuMCJF!5e0!3m2!1sen!2sin!4v1234567890123"
        res = self.client.put(
            "/admin/settings",
            json={"boutique_embed_url": valid_embed},
            headers=headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["boutique_embed_url"], valid_embed)

        # Paste raw iframe snippet -> extracts src attribute cleanly
        iframe_snippet = f'<iframe src="{valid_embed}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy"></iframe>'
        res_iframe = self.client.put(
            "/admin/settings",
            json={"boutique_embed_url": iframe_snippet},
            headers=headers,
        )
        self.assertEqual(res_iframe.status_code, 200)
        self.assertEqual(res_iframe.json()["boutique_embed_url"], valid_embed)

    def test_05_gallery_and_reviews_json_validation(self):
        """5. Gallery enforces 4-item limit and reviews JSON enforces structured items."""
        headers = {"Authorization": f"Bearer {self.owner_token}"}

        # Gallery exceeding 4 images rejected
        bad_gallery = [
            {"url": "https://res.cloudinary.com/demo/image/upload/sample1.jpg"},
            {"url": "https://res.cloudinary.com/demo/image/upload/sample2.jpg"},
            {"url": "https://res.cloudinary.com/demo/image/upload/sample3.jpg"},
            {"url": "https://res.cloudinary.com/demo/image/upload/sample4.jpg"},
            {"url": "https://res.cloudinary.com/demo/image/upload/sample5.jpg"},
        ]
        res = self.client.put(
            "/admin/settings",
            json={"boutique_gallery_json": json.dumps(bad_gallery)},
            headers=headers,
        )
        self.assertEqual(res.status_code, 422)

        # Valid gallery of 4 images accepted
        good_gallery = bad_gallery[:4]
        res = self.client.put(
            "/admin/settings",
            json={"boutique_gallery_json": json.dumps(good_gallery)},
            headers=headers,
        )
        self.assertEqual(res.status_code, 200)

        # Review with rating out of bounds rejected
        bad_review = [{"author_name": "Neha", "rating": 6, "review_text": "Great service"}]
        res = self.client.put(
            "/admin/settings",
            json={"boutique_reviews_json": json.dumps(bad_review)},
            headers=headers,
        )
        self.assertEqual(res.status_code, 422)

        # Valid verified review accepted
        good_reviews = [
            {
                "id": "rev_01",
                "author_name": "Pooja Sharma",
                "rating": 5,
                "review_text": "Exquisite bespoke suit set craftsmanship and wonderful in-store attention.",
                "review_date": "October 2026",
                "source_url": "https://share.google/rdahckZ4nVz7Bgu2H",
                "verified_date": "2026-10-31",
                "is_published": True,
                "sort_order": 1,
            }
        ]
        res = self.client.put(
            "/admin/settings",
            json={
                "boutique_reviews_json": json.dumps(good_reviews),
                "boutique_reviews_visible": True,
            },
            headers=headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["boutique_reviews_visible"])
        reviews_data = json.loads(res.json()["boutique_reviews_json"])
        self.assertEqual(len(reviews_data), 1)
        self.assertEqual(reviews_data[0]["author_name"], "Pooja Sharma")

    def test_06_updates_persist_and_reflect_in_public_settings(self):
        """6. Store setting updates persist to database and reflect in public GET /settings."""
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        update_payload = {
            "boutique_name": "Royal Libas by Tanya Atelier",
            "boutique_landmark": "Opposite Hotel Ambrosia, Sipri",
            "boutique_opening_hours": "Tuesday – Sunday: 11:00 AM – 8:00 PM",
            "boutique_weekly_holiday": "Monday",
            "boutique_special_notice": "Festive season extended hours until 9:00 PM.",
        }
        res_put = self.client.put("/admin/settings", json=update_payload, headers=headers)
        self.assertEqual(res_put.status_code, 200)

        # Verify public endpoint
        res_pub = self.client.get("/settings")
        self.assertEqual(res_pub.status_code, 200)
        pub_data = res_pub.json()
        self.assertEqual(pub_data["boutique_name"], "Royal Libas by Tanya Atelier")
        self.assertEqual(pub_data["boutique_landmark"], "Opposite Hotel Ambrosia, Sipri")
        self.assertEqual(pub_data["boutique_opening_hours"], "Tuesday – Sunday: 11:00 AM – 8:00 PM")
        self.assertEqual(pub_data["boutique_weekly_holiday"], "Monday")
        self.assertEqual(pub_data["boutique_special_notice"], "Festive season extended hours until 9:00 PM.")


if __name__ == "__main__":
    unittest.main()
