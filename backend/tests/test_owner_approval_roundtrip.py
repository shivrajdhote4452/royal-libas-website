"""
Regression test suite for Issue 1:
Preserve owner approval through settings save round trip:
Database -> GET /settings -> frontend parseReviewsJson -> Admin editing -> PUT /admin/settings -> Database.
"""
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


def simulate_frontend_parse_reviews_json(raw):
    """Exact replica of parseReviewsJson from frontend/src/lib/settings.ts."""
    list_items = []
    if isinstance(raw, list):
        list_items = raw
    elif isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                list_items = parsed
        except Exception:
            pass

    if not list_items:
        return []

    result = []
    for idx, item in enumerate(list_items):
        result.append({
            "id": str(item.get("id") or f"rev-{idx + 1}"),
            "author_name": str(item.get("author_name") or "").strip(),
            "rating": float(item.get("rating") or 5),
            "review_text": str(item.get("review_text") or "").strip(),
            "review_date": str(item.get("review_date") or "").strip() or None,
            "source": str(item.get("source") or "google").strip().lower(),
            "source_url": str(item.get("source_url") or "").strip() or None,
            "is_verified": bool(item.get("is_verified", False)),
            "owner_approved": bool(item.get("owner_approved", False) if "owner_approved" in item else item.get("is_published", False)),
            "verified_date": str(item.get("verified_date") or "").strip() or None,
            "is_published": bool(item.get("is_published", False)),
            "sort_order": int(item.get("sort_order", idx)),
        })
    return result


class TestOwnerApprovalRoundtrip(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp(prefix="rl_roundtrip_test_")
        cls.temp_db_path = os.path.join(cls.temp_dir, "test_roundtrip.db")
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

        # Seed Owner admin account
        db = cls.TestingSessionLocal()
        cls.owner = Admin(
            email="owner_roundtrip@royallibas.com",
            password_hash=hash_password("OwnerPassword123!"),
            name="Tanya",
            role="OWNER",
            is_active=True,
        )
        db.add(cls.owner)

        # Seed initial 5 restored owner-approved reviews in database
        initial_reviews = [
            {
                "id": "rev-1",
                "author_name": "Pooja Agarwal",
                "rating": 5,
                "review_text": "Visited the boutique in Sipri Bazar for festive wedding shopping.",
                "review_date": "October 2026",
                "source": "google",
                "source_url": "https://share.google/rdahckZ4nVz7Bgu2H",
                "is_verified": False,
                "owner_approved": True,
                "verified_date": None,
                "is_published": True,
                "sort_order": 0,
            },
            {
                "id": "rev-2",
                "author_name": "Neha Sengar",
                "rating": 5,
                "review_text": "Best boutique collection in Jhansi opposite Hotel Ambrosia.",
                "review_date": "September 2026",
                "source": "google",
                "source_url": "https://share.google/rdahckZ4nVz7Bgu2H",
                "is_verified": False,
                "owner_approved": True,
                "verified_date": None,
                "is_published": True,
                "sort_order": 1,
            },
            {
                "id": "rev-3",
                "author_name": "Shalini Verma",
                "rating": 4,
                "review_text": "Very elegant collection of festive suits and designer palazzos.",
                "review_date": "October 2026",
                "source": "google",
                "source_url": "https://share.google/rdahckZ4nVz7Bgu2H",
                "is_verified": False,
                "owner_approved": True,
                "verified_date": None,
                "is_published": True,
                "sort_order": 2,
            },
            {
                "id": "rev-4",
                "author_name": "Ananya Dixit",
                "rating": 5,
                "review_text": "Exquisite handloom and velvet bridal wear.",
                "review_date": "August 2026",
                "source": "google",
                "source_url": "https://share.google/rdahckZ4nVz7Bgu2H",
                "is_verified": False,
                "owner_approved": True,
                "verified_date": None,
                "is_published": True,
                "sort_order": 3,
            },
            {
                "id": "rev-5",
                "author_name": "Ritu Bundela",
                "rating": 5,
                "review_text": "Purchased a heavy party wear set for Karwa Chauth.",
                "review_date": "October 2026",
                "source": "google",
                "source_url": "https://share.google/rdahckZ4nVz7Bgu2H",
                "is_verified": False,
                "owner_approved": True,
                "verified_date": None,
                "is_published": True,
                "sort_order": 4,
            },
        ]

        setting = StoreSetting(
            boutique_name="Royal Libas by Tanya",
            boutique_reviews_json=json.dumps(initial_reviews),
            boutique_reviews_visible=True,
            boutique_section_visible=True,
        )
        db.add(setting)
        db.commit()

        cls.owner_token = create_access_token({"sub": cls.owner.email, "role": cls.owner.role})
        db.close()

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        cls.engine.dispose()
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def test_01_full_roundtrip_preserves_owner_approval_and_published_state(self):
        """1. Database -> GET /settings -> frontend parse -> Admin Save PUT -> Reload preserves publication."""
        # Step A: Public GET /settings
        res_get = self.client.get("/settings")
        self.assertEqual(res_get.status_code, 200)
        server_data = res_get.json()
        raw_reviews_json = server_data["boutique_reviews_json"]

        # Step B: Frontend parsing
        parsed_reviews = simulate_frontend_parse_reviews_json(raw_reviews_json)
        self.assertEqual(len(parsed_reviews), 5)
        for r in parsed_reviews:
            self.assertTrue(r["owner_approved"], f"Review {r['id']} lost owner_approved in frontend parsing")
            self.assertTrue(r["is_published"], f"Review {r['id']} lost is_published in frontend parsing")

        # Step C: Admin Save PUT /admin/settings (passing parsed reviews back to server)
        save_payload = {
            "boutique_reviews_json": json.dumps(parsed_reviews),
            "boutique_reviews_visible": True,
        }
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res_put = self.client.put("/admin/settings", json=save_payload, headers=headers)
        self.assertEqual(res_put.status_code, 200)

        # Step D: Reload from server and verify all 5 remain published
        res_reload = self.client.get("/settings")
        self.assertEqual(res_reload.status_code, 200)
        reloaded_reviews = simulate_frontend_parse_reviews_json(res_reload.json()["boutique_reviews_json"])

        self.assertEqual(len(reloaded_reviews), 5)
        for r in reloaded_reviews:
            self.assertTrue(r["is_published"], f"Review {r['id']} was unpublished on save round trip!")
            self.assertTrue(r["owner_approved"], f"Review {r['id']} lost owner_approved flag!")
            self.assertGreaterEqual(r["rating"], 4)

    def test_02_edit_review_text_and_rating_preserves_publication(self):
        """2. Editing a review's content in Admin preserves owner approval and publication."""
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = self.client.get("/settings")
        reviews = simulate_frontend_parse_reviews_json(res.json()["boutique_reviews_json"])

        # Edit rev-1 text
        reviews[0]["review_text"] = "Updated owner review text after client fitting."
        reviews[0]["rating"] = 5

        res_put = self.client.put(
            "/admin/settings",
            json={"boutique_reviews_json": json.dumps(reviews)},
            headers=headers,
        )
        self.assertEqual(res_put.status_code, 200)

        # Verify on reload
        res_after = self.client.get("/settings")
        reloaded = simulate_frontend_parse_reviews_json(res_after.json()["boutique_reviews_json"])
        self.assertEqual(reloaded[0]["review_text"], "Updated owner review text after client fitting.")
        self.assertTrue(reloaded[0]["is_published"])
        self.assertTrue(reloaded[0]["owner_approved"])

    def test_03_reorder_reviews_preserves_order_and_publication(self):
        """3. Reordering review items in Admin preserves new order and publication."""
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = self.client.get("/settings")
        reviews = simulate_frontend_parse_reviews_json(res.json()["boutique_reviews_json"])

        # Swap first and second
        reviews[0], reviews[1] = reviews[1], reviews[0]
        for idx, r in enumerate(reviews):
            r["sort_order"] = idx

        res_put = self.client.put(
            "/admin/settings",
            json={"boutique_reviews_json": json.dumps(reviews)},
            headers=headers,
        )
        self.assertEqual(res_put.status_code, 200)

        # Verify on reload
        res_after = self.client.get("/settings")
        reloaded = simulate_frontend_parse_reviews_json(res_after.json()["boutique_reviews_json"])
        self.assertEqual(reloaded[0]["id"], "rev-2")
        self.assertEqual(reloaded[1]["id"], "rev-1")
        self.assertTrue(reloaded[0]["is_published"])
        self.assertTrue(reloaded[1]["is_published"])

    def test_04_unpublish_and_republish(self):
        """4. Unpublishing a review marks it draft, and republishing restores it to storefront."""
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = self.client.get("/settings")
        reviews = simulate_frontend_parse_reviews_json(res.json()["boutique_reviews_json"])

        # Unpublish rev-3
        reviews[2]["is_published"] = False
        res_put = self.client.put(
            "/admin/settings",
            json={"boutique_reviews_json": json.dumps(reviews)},
            headers=headers,
        )
        self.assertEqual(res_put.status_code, 200)

        res_check1 = self.client.get("/settings")
        check1 = simulate_frontend_parse_reviews_json(res_check1.json()["boutique_reviews_json"])
        self.assertFalse(check1[2]["is_published"])
        self.assertTrue(check1[2]["owner_approved"])

        # Republish rev-3
        check1[2]["is_published"] = True
        res_put2 = self.client.put(
            "/admin/settings",
            json={"boutique_reviews_json": json.dumps(check1)},
            headers=headers,
        )
        self.assertEqual(res_put2.status_code, 200)

        res_check2 = self.client.get("/settings")
        check2 = simulate_frontend_parse_reviews_json(res_check2.json()["boutique_reviews_json"])
        self.assertTrue(check2[2]["is_published"])


if __name__ == "__main__":
    unittest.main()
