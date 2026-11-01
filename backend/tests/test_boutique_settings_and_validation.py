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
                "source": "google",
                "source_url": "https://share.google/rdahckZ4nVz7Bgu2H",
                "is_verified": True,
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
        self.assertTrue(reviews_data[0]["is_published"])
        self.assertTrue(reviews_data[0]["is_verified"])

    def test_06_unverified_and_low_rated_reviews_cannot_be_published(self):
        """6. Unverified reviews and low-rated reviews (< 4) are strictly excluded from publication."""
        headers = {"Authorization": f"Bearer {self.owner_token}"}

        test_reviews = [
            {
                "id": "unverified_rev",
                "author_name": "Unverified User",
                "rating": 5,
                "review_text": "Great service but unverified.",
                "source": "google",
                "is_verified": False,  # Not verified
                "is_published": True,  # Attempting to publish
            },
            {
                "id": "low_rated_rev",
                "author_name": "Critique User",
                "rating": 3,  # Below 4 stars
                "review_text": "Average experience.",
                "source": "google",
                "is_verified": True,
                "is_published": True,  # Attempting to publish
            },
            {
                "id": "non_google_rev",
                "author_name": "Justdial User",
                "rating": 5,
                "review_text": "Found on Justdial.",
                "source": "justdial",  # Not Google
                "is_verified": True,
                "is_published": True,  # Attempting to publish
            },
            {
                "id": "valid_positive_rev",
                "author_name": "Authentic Patron",
                "rating": 4,
                "review_text": "Delighted with the handloom craftsmanship.",
                "source": "google",
                "is_verified": True,
                "is_published": True,  # Eligible
            },
        ]

        res = self.client.put(
            "/admin/settings",
            json={"boutique_reviews_json": json.dumps(test_reviews)},
            headers=headers,
        )
        self.assertEqual(res.status_code, 200)
        parsed = json.loads(res.json()["boutique_reviews_json"])

        # Check that only the eligible verified 4-star Google review is published
        rev_map = {r["id"]: r for r in parsed}
        self.assertFalse(rev_map["unverified_rev"]["is_published"])
        self.assertFalse(rev_map["low_rated_rev"]["is_published"])
        self.assertFalse(rev_map["non_google_rev"]["is_published"])
        self.assertTrue(rev_map["valid_positive_rev"]["is_published"])
        self.assertEqual(rev_map["valid_positive_rev"]["rating"], 4.0)

    def test_07_clearing_optional_settings_persists_as_none(self):
        """7. Explicit clearing with null or empty string persists and does not restore default placeholders."""
        headers = {"Authorization": f"Bearer {self.owner_token}"}

        clear_payload = {
            "boutique_phone": "",
            "boutique_whatsapp": "",
            "boutique_opening_hours": "",
            "boutique_weekly_holiday": "",
            "boutique_special_notice": "",
            "boutique_embed_url": "",
            "boutique_main_image": "",
            "boutique_gallery_json": "[]",
            "boutique_reviews_json": "[]",
            "boutique_reviews_visible": False,
        }

        res = self.client.put("/admin/settings", json=clear_payload, headers=headers)
        self.assertEqual(res.status_code, 200)

        # Verify DB directly
        db = self.TestingSessionLocal()
        setting = db.query(StoreSetting).first()
        self.assertIsNone(setting.boutique_phone)
        self.assertIsNone(setting.boutique_whatsapp)
        self.assertIsNone(setting.boutique_opening_hours)
        self.assertIsNone(setting.boutique_weekly_holiday)
        self.assertIsNone(setting.boutique_special_notice)
        self.assertIsNone(setting.boutique_embed_url)
        self.assertIsNone(setting.boutique_main_image)
        self.assertEqual(setting.boutique_gallery_json, "[]")
        self.assertEqual(setting.boutique_reviews_json, "[]")
        self.assertFalse(setting.boutique_reviews_visible)
        db.close()

        # Verify public GET /settings returns null/empty rather than placeholder strings
        res_pub = self.client.get("/settings")
        self.assertEqual(res_pub.status_code, 200)
        pub_data = res_pub.json()
        self.assertIsNone(pub_data["boutique_phone"])
        self.assertIsNone(pub_data["boutique_whatsapp"])
        self.assertIsNone(pub_data["boutique_opening_hours"])
        self.assertIsNone(pub_data["boutique_weekly_holiday"])
        self.assertIsNone(pub_data["boutique_embed_url"])
        self.assertIsNone(pub_data["boutique_main_image"])
        self.assertEqual(pub_data["boutique_gallery_json"], "[]")
        self.assertEqual(pub_data["boutique_reviews_json"], "[]")
        self.assertFalse(pub_data["boutique_reviews_visible"])

    def test_08_contact_inquiry_submission(self):
        """8. Contact inquiry endpoint accepts valid submissions and validates input."""
        # Valid submission
        inquiry_data = {
            "name": "Shreya Bundela",
            "email": "shreya@example.com",
            "message": "Inquiry regarding bespoke bridal stitching and visiting the atelier next week.",
        }
        res = self.client.post("/contact", json=inquiry_data)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["status"], "success")

        # Invalid email rejected
        bad_inquiry = {
            "name": "Shreya",
            "email": "notanemail",
            "message": "Valid inquiry message text.",
        }
        res_bad = self.client.post("/contact", json=bad_inquiry)
        self.assertEqual(res_bad.status_code, 422)


if __name__ == "__main__":
    unittest.main()
