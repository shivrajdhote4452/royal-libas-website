"""Automated regression test suite for Royal Libas Coupons & Offers Management.

Verifies:
1. Admin coupon creation with validation (code, type, value, min order, usage limit, validity dates).
2. Prevention of duplicate coupon codes (case-insensitive 409 Conflict).
3. Admin coupon updating, editing rules, and active/inactive toggling.
4. Admin status filtering and search (ALL, ACTIVE, INACTIVE, EXPIRED).
5. Customer-facing coupon validation (/coupons/validate) with case-insensitivity, minimum order check, expiration, and usage limit enforcement.
6. Server-authoritative checkout calculation in order_service and atomic usage count incrementation.
7. Admin coupon deletion.
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
_temp_dir = tempfile.mkdtemp(prefix="rl_coupons_isolated_")
_isolated_db_path = os.path.join(_temp_dir, "isolated_coupons.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_isolated_db_path}"
os.environ["JWT_SECRET"] = "coupons-test-isolated-jwt-secret-key-royal-libas"

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
from app.models import Admin, Product, ProductVariant, Order, OrderItem, Coupon, StoreSetting
from app.auth import hash_password, create_access_token
from app.migrations import run_migrations

# Ensure schema and migrations run on isolated database
Base.metadata.create_all(bind=engine)
run_migrations(engine)

client = TestClient(app)


class TestCouponsManagement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db = SessionLocal()
        try:
            # Create test admin
            cls.admin = Admin(
                email="coupon_owner@royallibas.com",
                password_hash=hash_password("OwnerPassword123!"),
                role="OWNER",
                is_active=True,
            )
            db.add(cls.admin)

            # Store setting for checkout
            setting = StoreSetting(
                standard_cod_free_threshold=Decimal("1500.00"),
                standard_shipping_fee=Decimal("99.00"),
                express_shipping_fee=Decimal("199.00"),
                cod_enabled=True,
                online_payment_enabled=True,
            )
            db.add(setting)

            # Create test product & variant for checkout tests
            product = Product(
                name="Boutique Chanderi Silk Kurta",
                slug="boutique-chanderi-silk-kurta",
                description="Luxury handloom piece",
                fabric="Silk",
                category="SUIT SET",
                status="PUBLISHED",
                is_active=True,
            )
            db.add(product)
            db.flush()

            cls.variant = ProductVariant(
                product_id=product.id,
                size="M",
                colour="Ivory",
                sku="RL-CHK-IVORY-M",
                stock=50,
                selling_price=Decimal("2000.00"),
                is_active=True,
            )
            db.add(cls.variant)
            db.commit()
            db.refresh(cls.admin)
            db.refresh(cls.variant)

            cls.admin_token = create_access_token(
                {"sub": str(cls.admin.id), "email": cls.admin.email, "role": cls.admin.role}
            )
            cls.admin_headers = {"Authorization": f"Bearer {cls.admin_token}"}
        finally:
            db.close()

    def test_01_admin_create_coupon_and_duplicate_prevention(self):
        """Verify creating coupon and rejecting duplicates with 409 Conflict."""
        # 1. Create a valid percentage coupon
        payload = {
            "code": "DIWALI20",
            "type": "PERCENT",
            "value": "20.00",
            "min_order_value": "1500.00",
            "usage_limit": 50,
            "is_active": True,
        }
        res = client.post("/admin/coupons", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["code"], "DIWALI20")
        self.assertEqual(data["type"], "PERCENT")
        self.assertEqual(Decimal(str(data["value"])), Decimal("20.00"))
        self.assertEqual(Decimal(str(data["min_order_value"])), Decimal("1500.00"))
        self.assertEqual(data["usage_limit"], 50)
        self.assertEqual(data["used_count"], 0)
        self.assertEqual(data["status"], "ACTIVE")

        # 2. Duplicate code in lowercase must be rejected with 409
        dup_res = client.post(
            "/admin/coupons",
            json={
                "code": "diwali20",
                "type": "FLAT",
                "value": "100.00",
            },
            headers=self.admin_headers,
        )
        self.assertEqual(dup_res.status_code, 409)
        self.assertIn("already exists", dup_res.json()["detail"].lower())

    def test_02_coupon_validation_constraints(self):
        """Verify server validation on invalid percentage, negative values, and date order."""
        # Percentage > 100%
        res = client.post(
            "/admin/coupons",
            json={"code": "INVALID101", "type": "PERCENT", "value": "150.00"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 422)

        # Negative value
        res = client.post(
            "/admin/coupons",
            json={"code": "NEGATIVE10", "type": "FLAT", "value": "-50.00"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 422)

        # End date earlier than start date
        now = datetime.now(timezone.utc)
        res = client.post(
            "/admin/coupons",
            json={
                "code": "BADDATES",
                "type": "FLAT",
                "value": "50.00",
                "valid_from": (now + timedelta(days=5)).isoformat(),
                "valid_until": (now + timedelta(days=1)).isoformat(),
            },
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 422)

    def test_03_admin_update_and_toggle_coupon(self):
        """Verify editing coupon rules and toggling active/inactive status."""
        # Create flat coupon
        res = client.post(
            "/admin/coupons",
            json={"code": "SUMMER100", "type": "FLAT", "value": "100.00", "min_order_value": "1000.00"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 201)
        coupon_id = res.json()["id"]

        # Update value to 150 and min_order_value to 1200
        up_res = client.put(
            f"/admin/coupons/{coupon_id}",
            json={"value": "150.00", "min_order_value": "1200.00"},
            headers=self.admin_headers,
        )
        self.assertEqual(up_res.status_code, 200)
        self.assertEqual(Decimal(str(up_res.json()["value"])), Decimal("150.00"))
        self.assertEqual(Decimal(str(up_res.json()["min_order_value"])), Decimal("1200.00"))

        # Toggle active to inactive
        tog_res = client.patch(f"/admin/coupons/{coupon_id}/toggle", headers=self.admin_headers)
        self.assertEqual(tog_res.status_code, 200)
        self.assertFalse(tog_res.json()["is_active"])
        self.assertEqual(tog_res.json()["status"], "INACTIVE")

        # Toggle back to active
        tog2_res = client.patch(f"/admin/coupons/{coupon_id}/toggle", headers=self.admin_headers)
        self.assertEqual(tog2_res.status_code, 200)
        self.assertTrue(tog2_res.json()["is_active"])
        self.assertEqual(tog2_res.json()["status"], "ACTIVE")

    def test_04_status_filtering_and_search(self):
        """Verify admin coupon list with search and status tabs (ACTIVE, INACTIVE, EXPIRED)."""
        now = datetime.now(timezone.utc)
        # Create expired coupon
        client.post(
            "/admin/coupons",
            json={
                "code": "PASTEXPIRED",
                "type": "FLAT",
                "value": "200.00",
                "valid_until": (now - timedelta(days=2)).isoformat(),
                "is_active": True,
            },
            headers=self.admin_headers,
        )

        # Query all
        all_res = client.get("/admin/coupons", headers=self.admin_headers)
        self.assertEqual(all_res.status_code, 200)
        all_coupons = all_res.json()
        codes = [c["code"] for c in all_coupons]
        self.assertIn("PASTEXPIRED", codes)

        # Filter by EXPIRED
        exp_res = client.get("/admin/coupons?status=EXPIRED", headers=self.admin_headers)
        self.assertEqual(exp_res.status_code, 200)
        for c in exp_res.json():
            self.assertEqual(c["status"], "EXPIRED")
        self.assertIn("PASTEXPIRED", [c["code"] for c in exp_res.json()])

        # Search by code
        search_res = client.get("/admin/coupons?search=diwali", headers=self.admin_headers)
        self.assertEqual(search_res.status_code, 200)
        self.assertTrue(all("DIWALI" in c["code"] for c in search_res.json()))

    def test_05_customer_coupon_validation(self):
        """Verify customer-facing /coupons/validate with subtotal, minimum order, and expiration."""
        # 1. Valid DIWALI20 (20% off) with subtotal 2000 (>= 1500) -> 400 discount
        res = client.post("/coupons/validate", json={"code": "diwali20", "subtotal": "2000.00"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["valid"])
        self.assertEqual(Decimal(str(data["discount"])), Decimal("400.00"))

        # 2. DIWALI20 with subtotal 1200 (< 1500 min order) -> rejected
        res2 = client.post("/coupons/validate", json={"code": "DIWALI20", "subtotal": "1200.00"})
        self.assertEqual(res2.status_code, 200)
        self.assertFalse(res2.json()["valid"])
        self.assertIn("Minimum order value", res2.json()["message"])

        # 3. Expired coupon -> rejected
        exp_res = client.post("/coupons/validate", json={"code": "PASTEXPIRED", "subtotal": "3000.00"})
        self.assertEqual(exp_res.status_code, 200)
        self.assertFalse(exp_res.json()["valid"])
        self.assertIn("expired", exp_res.json()["message"].lower())

    def test_06_checkout_discount_and_usage_increment(self):
        """Verify checkout order placement applies coupon discount and increments used_count."""
        # Create a single-use coupon (usage_limit=1)
        res = client.post(
            "/admin/coupons",
            json={
                "code": "FLASH150",
                "type": "FLAT",
                "value": "150.00",
                "min_order_value": "1000.00",
                "usage_limit": 1,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 201)
        coupon_id = res.json()["id"]

        # Place Order 1 with FLASH150
        order_payload = {
            "customer_name": "Riya Kapoor",
            "phone": "9812345678",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "coupon_code": "flash150",  # Test lowercase matching at checkout
            "items": [{"variant_id": self.variant.id, "quantity": 1}],
            "address": {
                "name": "Riya Kapoor",
                "phone": "9812345678",
                "pincode": "284001",
                "line1": "Flat 4B, Shanti Enclave",
                "city": "Jhansi",
                "state": "Uttar Pradesh",
            },
        }
        ord_res = client.post("/orders", json=order_payload)
        self.assertEqual(ord_res.status_code, 201)
        ord_data = ord_res.json()
        self.assertEqual(Decimal(str(ord_data["discount"])), Decimal("150.00"))
        # Subtotal 2000 - Discount 150 = 1850 (free COD shipping since >= 1500)
        self.assertEqual(Decimal(str(ord_data["total"])), Decimal("1850.00"))

        # Verify coupon used_count incremented to 1
        chk_res = client.get(f"/admin/coupons/{coupon_id}", headers=self.admin_headers)
        self.assertEqual(chk_res.status_code, 200)
        self.assertEqual(chk_res.json()["used_count"], 1)
        self.assertEqual(chk_res.json()["status"], "EXPIRED")  # limit reached

        # Subsequent validate should fail
        val_res = client.post("/coupons/validate", json={"code": "FLASH150", "subtotal": "2000.00"})
        self.assertEqual(val_res.status_code, 200)
        self.assertFalse(val_res.json()["valid"])
        self.assertIn("limit", val_res.json()["message"].lower())

    def test_07_admin_delete_coupon(self):
        """Verify deleting a coupon removes it from database."""
        # Create temporary coupon
        res = client.post(
            "/admin/coupons",
            json={"code": "TOBEDELETED", "type": "FLAT", "value": "50.00"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 201)
        cid = res.json()["id"]

        del_res = client.delete(f"/admin/coupons/{cid}", headers=self.admin_headers)
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(del_res.json()["status"], "success")

        # Verify 404
        get_res = client.get(f"/admin/coupons/{cid}", headers=self.admin_headers)
        self.assertEqual(get_res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
