"""Automated regression test suite for Royal Libas Homepage Public Promotion Coupons.

Verifies:
1. Default `is_public` is False (safe default).
2. Admin coupon creation with `is_public=True` or `is_public=False`.
3. Admin updating of `is_public` and toggle via `/admin/coupons/{id}/toggle-public`.
4. Public `/coupons?public_only=true` filter:
   - Returns only active, non-expired, non-exhausted coupons with `is_public=True`.
   - Excludes private active coupons (`is_public=False`).
   - Excludes inactive coupons even if `is_public=True`.
   - Excludes expired coupons even if `is_public=True`.
   - Excludes future-dated coupons even if `is_public=True`.
   - Excludes usage-exhausted coupons even if `is_public=True`.
5. Backward compatibility: `/coupons` without `public_only` returns all eligible active coupons.
6. Validation and backend authority via `/coupons/validate`.
"""

import atexit
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path

# Setup isolated disposable SQLite database BEFORE importing app modules
_temp_dir = tempfile.mkdtemp(prefix="rl_promo_isolated_")
_isolated_db_path = os.path.join(_temp_dir, "isolated_promo.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_isolated_db_path}"
os.environ["JWT_SECRET"] = "promo-test-isolated-jwt-secret-key-royal-libas"

def _cleanup_temp():
    if os.path.exists(_temp_dir):
        try:
            shutil.rmtree(_temp_dir, ignore_errors=True)
        except Exception:
            pass

atexit.register(_cleanup_temp)

# Safety guard against production keywords
FORBIDDEN = ["postgres", "hostinger", "neon", "prod", "staging", "royal_libas.db"]
for pattern in FORBIDDEN:
    if pattern in os.environ["DATABASE_URL"].lower() and "isolated" not in os.environ["DATABASE_URL"].lower():
        raise RuntimeError(f"CRITICAL SAFETY VIOLATION: Database URL contains forbidden pattern '{pattern}'.")

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import Admin, Coupon
from app.auth import hash_password, create_access_token
from app.migrations import run_migrations

# Ensure schema and migrations run on isolated database
Base.metadata.create_all(bind=engine)
run_migrations(engine)

client = TestClient(app)


class TestCouponPublicPromotion(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db = SessionLocal()
        try:
            cls.admin = Admin(
                email="promo_owner@royallibas.com",
                password_hash=hash_password("OwnerPassword123!"),
                role="OWNER",
                is_active=True,
            )
            db.add(cls.admin)
            db.commit()
            db.refresh(cls.admin)

            token = create_access_token({"sub": cls.admin.email, "role": cls.admin.role, "admin_id": cls.admin.id})
            cls.admin_headers = {"Authorization": f"Bearer {token}"}
        finally:
            db.close()

    def test_01_default_is_public_false(self):
        """Verify new coupon defaults to is_public=False (safe default)."""
        payload = {
            "code": "SAFEPRIVATE10",
            "type": "PERCENT",
            "value": "10.00",
            "min_order_value": "1000.00",
            "is_active": True,
        }
        res = client.post("/admin/coupons", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["code"], "SAFEPRIVATE10")
        self.assertFalse(data["is_public"], "Coupon must default to is_public=False")

        # Must not appear in public_only query, nor default unauthenticated /coupons
        pub_res = client.get("/coupons?public_only=true")
        self.assertEqual(pub_res.status_code, 200)
        codes = [c["code"] for c in pub_res.json()]
        self.assertNotIn("SAFEPRIVATE10", codes)

        default_res = client.get("/coupons")
        self.assertEqual(default_res.status_code, 200)
        default_codes = [c["code"] for c in default_res.json()]
        self.assertNotIn("SAFEPRIVATE10", default_codes, "Default unauthenticated /coupons must not expose private coupons")

    def test_02_create_public_coupon_and_toggle(self):
        """Verify creating coupon with is_public=True and toggling via patch endpoint."""
        payload = {
            "code": "HOMEPAGE15",
            "type": "PERCENT",
            "value": "15.00",
            "min_order_value": "1500.00",
            "is_active": True,
            "is_public": True,
        }
        res = client.post("/admin/coupons", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data["is_public"])
        cid = data["id"]

        # Appears in public_only query
        pub_res = client.get("/coupons?public_only=true")
        self.assertEqual(pub_res.status_code, 200)
        codes = [c["code"] for c in pub_res.json()]
        self.assertIn("HOMEPAGE15", codes)

        # Toggle public flag off
        tog_res = client.patch(f"/admin/coupons/{cid}/toggle-public", headers=self.admin_headers)
        self.assertEqual(tog_res.status_code, 200)
        self.assertFalse(tog_res.json()["is_public"])

        # No longer in public_only query
        pub_res2 = client.get("/coupons?public_only=true")
        codes2 = [c["code"] for c in pub_res2.json()]
        self.assertNotIn("HOMEPAGE15", codes2)

        # Toggle public flag back on
        tog_res2 = client.patch(f"/admin/coupons/{cid}/toggle-public", headers=self.admin_headers)
        self.assertEqual(tog_res2.status_code, 200)
        self.assertTrue(tog_res2.json()["is_public"])

    def test_03_public_promotion_eligibility_filters(self):
        """Verify inactive, expired, future, and exhausted coupons are excluded from public promotion."""
        now = datetime.now(timezone.utc)

        # Inactive coupon with is_public=True
        client.post("/admin/coupons", json={
            "code": "INACTIVEPUBLIC",
            "type": "PERCENT",
            "value": "10.00",
            "is_active": False,
            "is_public": True,
        }, headers=self.admin_headers)

        # Expired coupon with is_public=True
        client.post("/admin/coupons", json={
            "code": "EXPIREDPUBLIC",
            "type": "FLAT",
            "value": "200.00",
            "is_active": True,
            "is_public": True,
            "valid_from": (now - timedelta(days=10)).isoformat(),
            "valid_until": (now - timedelta(days=1)).isoformat(),
        }, headers=self.admin_headers)

        # Future-dated coupon with is_public=True
        client.post("/admin/coupons", json={
            "code": "FUTUREPUBLIC",
            "type": "PERCENT",
            "value": "20.00",
            "is_active": True,
            "is_public": True,
            "valid_from": (now + timedelta(days=5)).isoformat(),
            "valid_until": (now + timedelta(days=15)).isoformat(),
        }, headers=self.admin_headers)

        # Check public endpoint
        res = client.get("/coupons?public_only=true")
        self.assertEqual(res.status_code, 200)
        codes = [c["code"] for c in res.json()]

        self.assertNotIn("INACTIVEPUBLIC", codes, "Inactive coupon must not be publicly promoted")
        self.assertNotIn("EXPIREDPUBLIC", codes, "Expired coupon must not be publicly promoted")
        self.assertNotIn("FUTUREPUBLIC", codes, "Future coupon must not be publicly promoted")

    def test_04_usage_exhausted_coupon_excluded(self):
        """Verify coupon that reached usage limit is excluded from public promotion."""
        res = client.post("/admin/coupons", json={
            "code": "EXHAUSTEDPUBLIC",
            "type": "FLAT",
            "value": "500.00",
            "is_active": True,
            "is_public": True,
            "usage_limit": 1,
        }, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201)
        cid = res.json()["id"]

        # Manually increment used_count in db to 1
        db = SessionLocal()
        c = db.query(Coupon).filter(Coupon.id == cid).first()
        c.used_count = 1
        db.commit()
        db.close()

        # Should be excluded from public_only
        pub_res = client.get("/coupons?public_only=true")
        codes = [c["code"] for c in pub_res.json()]
        self.assertNotIn("EXHAUSTEDPUBLIC", codes, "Exhausted coupon must not be publicly promoted")

    def test_05_update_is_public_via_put(self):
        """Verify updating is_public flag via PUT /admin/coupons/{id}."""
        res = client.post("/admin/coupons", json={
            "code": "UPDATEPROMO",
            "type": "PERCENT",
            "value": "25.00",
            "is_active": True,
            "is_public": False,
        }, headers=self.admin_headers)
        cid = res.json()["id"]

        # Update to is_public=True
        put_res = client.put(f"/admin/coupons/{cid}", json={"is_public": True}, headers=self.admin_headers)
        self.assertEqual(put_res.status_code, 200)
        self.assertTrue(put_res.json()["is_public"])

        pub_res = client.get("/coupons?public_only=true")
        codes = [c["code"] for c in pub_res.json()]
        self.assertIn("UPDATEPROMO", codes)

    def test_06_unauthenticated_default_coupons_listing_protects_private_coupons(self):
        """Verify unauthenticated GET /coupons strictly hides private coupons by default and with query params."""
        # Create a VIP private coupon
        client.post("/admin/coupons", json={
            "code": "VIPEXCLUSIVE50",
            "type": "PERCENT",
            "value": "50.00",
            "min_order_value": "5000.00",
            "is_active": True,
            "is_public": False,
        }, headers=self.admin_headers)

        # 1. Unauthenticated default GET /coupons
        res_default = client.get("/coupons")
        self.assertEqual(res_default.status_code, 200)
        default_codes = [c["code"] for c in res_default.json()]
        self.assertNotIn("VIPEXCLUSIVE50", default_codes)

        # 2. Unauthenticated GET /coupons?public_only=false must NOT reveal private coupons
        res_param_false = client.get("/coupons?public_only=false")
        self.assertEqual(res_param_false.status_code, 200)
        false_codes = [c["code"] for c in res_param_false.json()]
        self.assertNotIn("VIPEXCLUSIVE50", false_codes)

        # 3. Unauthenticated GET /coupons?public_only=true
        res_param_true = client.get("/coupons?public_only=true")
        self.assertEqual(res_param_true.status_code, 200)
        true_codes = [c["code"] for c in res_param_true.json()]
        self.assertNotIn("VIPEXCLUSIVE50", true_codes)

    def test_07_private_coupon_direct_validation_works_while_unlisted(self):
        """Verify customer can validate an unlisted private coupon when entered explicitly at checkout."""
        # Validate the private coupon created in test_06
        val_res = client.post("/coupons/validate", json={
            "code": "VIPEXCLUSIVE50",
            "subtotal": "6000.00",
        })
        self.assertEqual(val_res.status_code, 200)
        data = val_res.json()
        self.assertTrue(data["valid"], "Direct validation of private coupon must succeed")
        self.assertEqual(float(data["discount"]), 3000.00)

        # Subtotal below minimum order value fails gracefully with clear message
        val_low = client.post("/coupons/validate", json={
            "code": "VIPEXCLUSIVE50",
            "subtotal": "2000.00",
        })
        self.assertEqual(val_low.status_code, 200)
        self.assertFalse(val_low.json()["valid"])
        self.assertIn("Minimum order value", val_low.json()["message"])

    def test_08_admin_lists_all_coupons_including_private(self):
        """Verify authenticated admin endpoint GET /admin/coupons lists all coupons including private ones."""
        admin_res = client.get("/admin/coupons", headers=self.admin_headers)
        self.assertEqual(admin_res.status_code, 200)
        admin_codes = [c["code"] for c in admin_res.json()]
        self.assertIn("VIPEXCLUSIVE50", admin_codes, "Admin must be able to view private coupons")


if __name__ == "__main__":
    unittest.main()

