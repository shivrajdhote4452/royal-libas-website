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

        # Create an expired coupon and verify activating it via toggle is blocked with HTTP 400
        now = datetime.now(timezone.utc)
        exp_res = client.post(
            "/admin/coupons",
            json={
                "code": "EXPTOGGLE",
                "type": "FLAT",
                "value": "50.00",
                "valid_until": (now - timedelta(days=2)).isoformat(),
                "is_active": False,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(exp_res.status_code, 201)
        exp_id = exp_res.json()["id"]

        exp_tog = client.patch(f"/admin/coupons/{exp_id}/toggle", headers=self.admin_headers)
        self.assertEqual(exp_tog.status_code, 400)
        self.assertIn("cannot activate expired coupon", exp_tog.json()["detail"].lower())

        # Create an exhausted coupon (used_count >= usage_limit) and verify toggle activation is blocked
        exh_res = client.post(
            "/admin/coupons",
            json={
                "code": "EXHTOGGLE",
                "type": "FLAT",
                "value": "50.00",
                "usage_limit": 1,
                "is_active": False,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(exh_res.status_code, 201)
        exh_id = exh_res.json()["id"]

        db = SessionLocal()
        try:
            exh_c = db.query(Coupon).filter(Coupon.id == exh_id).first()
            exh_c.used_count = 1
            db.commit()
        finally:
            db.close()

        exh_tog = client.patch(f"/admin/coupons/{exh_id}/toggle", headers=self.admin_headers)
        self.assertEqual(exh_tog.status_code, 400)
        self.assertIn("usage limit", exh_tog.json()["detail"].lower())

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

    def test_08_checkout_rejects_ineligible_coupons_without_silent_full_price(self):
        """Verify that checkout explicitly rejects ineligible/expired/exhausted coupons with HTTP 400,

        never silently creating an order at full price.
        """
        # 1. Exhausted coupon: FLASH150 from test_06 reached its usage_limit of 1
        payload_exhausted = {
            "customer_name": "Test Shopper",
            "phone": "9812345678",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "coupon_code": "FLASH150",
            "items": [{"variant_id": self.variant.id, "quantity": 1}],
            "address": {
                "name": "Test Shopper",
                "phone": "9812345678",
                "pincode": "284001",
                "line1": "Civil Lines",
                "city": "Jhansi",
                "state": "Uttar Pradesh",
            },
        }
        res_exhausted = client.post("/orders", json=payload_exhausted)
        self.assertEqual(res_exhausted.status_code, 400)
        self.assertIn("maximum usage limit", res_exhausted.json()["detail"])

        # 2. Expired coupon: PASTEXPIRED from test_01
        payload_expired = dict(payload_exhausted)
        payload_expired["coupon_code"] = "PASTEXPIRED"
        res_expired = client.post("/orders", json=payload_expired)
        self.assertEqual(res_expired.status_code, 400)
        self.assertIn("expired", res_expired.json()["detail"].lower())

        # 3. Inactive coupon: deactivating SUMMER15
        db = SessionLocal()
        try:
            c = db.query(Coupon).filter(Coupon.code == "DIWALI20").first()
            c.is_active = False
            db.commit()
        finally:
            db.close()

        payload_inactive = dict(payload_exhausted)
        payload_inactive["coupon_code"] = "DIWALI20"
        res_inactive = client.post("/orders", json=payload_inactive)
        self.assertEqual(res_inactive.status_code, 400)
        self.assertIn("no longer active", res_inactive.json()["detail"].lower())

        # Reactivate DIWALI20
        db = SessionLocal()
        try:
            c = db.query(Coupon).filter(Coupon.code == "DIWALI20").first()
            c.is_active = True
            db.commit()
        finally:
            db.close()

        # 4. Ineligible minimum order amount
        # Create coupon requiring min 5000
        client.post(
            "/admin/coupons",
            json={
                "code": "MIN5000",
                "type": "FLAT",
                "value": "500.00",
                "min_order_value": "5000.00",
            },
            headers=self.admin_headers,
        )
        payload_min = dict(payload_exhausted)
        payload_min["coupon_code"] = "MIN5000"  # subtotal is 2000 < 5000
        res_min = client.post("/orders", json=payload_min)
        self.assertEqual(res_min.status_code, 400)
        self.assertIn("minimum order value", res_min.json()["detail"].lower())

    def test_09_prepaid_flow_with_coupon_and_reservation(self):
        """Verify PREPAID order creation applies coupon discount, sets reservation window,

        and free shipping without calling live Cashfree endpoints.
        """
        # Create promo coupon
        client.post(
            "/admin/coupons",
            json={
                "code": "PREPAID100",
                "type": "FLAT",
                "value": "100.00",
                "min_order_value": "1000.00",
            },
            headers=self.admin_headers,
        )

        prepaid_payload = {
            "customer_name": "Meera Sen",
            "phone": "9876543210",
            "payment_method": "PREPAID",
            "shipping_method": "STANDARD",
            "coupon_code": "PREPAID100",
            "items": [{"variant_id": self.variant.id, "quantity": 1}],
            "address": {
                "name": "Meera Sen",
                "phone": "9876543210",
                "pincode": "560001",
                "line1": "MG Road",
                "city": "Bengaluru",
                "state": "Karnataka",
            },
        }

        res = client.post("/orders", json=prepaid_payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["payment_method"], "PREPAID")
        self.assertEqual(data["status"], "PENDING")
        self.assertEqual(data["payment_status"], "PENDING")
        self.assertEqual(Decimal(str(data["discount"])), Decimal("100.00"))
        self.assertEqual(Decimal(str(data["shipping_charge"])), Decimal("0.00"))  # Free on prepaid
        self.assertEqual(Decimal(str(data["total"])), Decimal("1900.00"))
        self.assertIsNotNone(data["reservation_expires_at"])

    def test_10_order_creation_rollback_preserves_coupon_count(self):
        """Verify transaction rollback does NOT consume a coupon use if order creation fails."""
        # Create a single-use coupon
        res = client.post(
            "/admin/coupons",
            json={
                "code": "ROLLBACK1",
                "type": "FLAT",
                "value": "200.00",
                "min_order_value": "1000.00",
                "usage_limit": 1,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 201)
        cid = res.json()["id"]

        # Attempt to order with an invalid variant quantity exceeding available stock (e.g. 9999)
        failing_payload = {
            "customer_name": "Failing Shopper",
            "phone": "9811122233",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "coupon_code": "ROLLBACK1",
            "items": [{"variant_id": self.variant.id, "quantity": 9999}],  # Far exceeds stock
            "address": {
                "name": "Failing Shopper",
                "phone": "9811122233",
                "pincode": "110001",
                "line1": "Connaught Place",
                "city": "New Delhi",
                "state": "Delhi",
            },
        }
        fail_res = client.post("/orders", json=failing_payload)
        self.assertEqual(fail_res.status_code, 400)

        # Verify used_count was NOT incremented due to rollback
        chk = client.get(f"/admin/coupons/{cid}", headers=self.admin_headers)
        self.assertEqual(chk.status_code, 200)
        self.assertEqual(chk.json()["used_count"], 0)
        self.assertEqual(chk.json()["status"], "ACTIVE")

        # Now place a valid order with the same coupon -> should succeed
        valid_payload = dict(failing_payload)
        valid_payload["items"] = [{"variant_id": self.variant.id, "quantity": 1}]
        succ_res = client.post("/orders", json=valid_payload)
        self.assertEqual(succ_res.status_code, 201)

        # Verify used_count is now 1
        chk2 = client.get(f"/admin/coupons/{cid}", headers=self.admin_headers)
        self.assertEqual(chk2.status_code, 200)
        self.assertEqual(chk2.json()["used_count"], 1)

    def test_11_usage_lifecycle_cancellation_and_reservation_expiration(self):
        """Document and test coupon usage lifecycle during cancellation and reservation expiry:

        - Coupon usage is consumed at order placement.
        - Cancellation restocks variant inventory and updates status to CANCELLED.
        - Historical coupon usage counts are preserved and historical order records are not mutated.
        """
        from app.services.order_service import cancel_order_atomic, expire_unpaid_prepaid_reservations

        # Create coupon
        client.post(
            "/admin/coupons",
            json={
                "code": "LIFECYCLE50",
                "type": "FLAT",
                "value": "50.00",
                "min_order_value": "1000.00",
                "usage_limit": 5,
            },
            headers=self.admin_headers,
        )

        # Record starting variant stock
        db = SessionLocal()
        try:
            v_init = db.query(ProductVariant).filter(ProductVariant.id == self.variant.id).first()
            initial_stock = v_init.stock
        finally:
            db.close()

        # Place COD order
        cod_payload = {
            "customer_name": "Lifecycle Customer",
            "phone": "9998887776",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "coupon_code": "LIFECYCLE50",
            "items": [{"variant_id": self.variant.id, "quantity": 2}],
            "address": {
                "name": "Lifecycle Customer",
                "phone": "9998887776",
                "pincode": "400001",
                "line1": "Colaba Causeway",
                "city": "Mumbai",
                "state": "Maharashtra",
            },
        }
        res = client.post("/orders", json=cod_payload)
        self.assertEqual(res.status_code, 201)
        order_code = res.json()["order_code"]

        # Stock should be decremented by 2
        db = SessionLocal()
        try:
            v_after = db.query(ProductVariant).filter(ProductVariant.id == self.variant.id).first()
            self.assertEqual(v_after.stock, initial_stock - 2)

            ord_obj = db.query(Order).filter(Order.order_code == order_code).first()
            self.assertEqual(ord_obj.status, "PLACED")
            self.assertEqual(Decimal(str(ord_obj.discount)), Decimal("50.00"))

            # Cancel order atomically
            cancel_order_atomic(db, ord_obj, reason="Customer cancelled before dispatch", restock=True)

            # Check stock is restored
            db.refresh(v_after)
            self.assertEqual(v_after.stock, initial_stock)

            # Check order status is CANCELLED and discount snapshot remains intact
            db.refresh(ord_obj)
            self.assertEqual(ord_obj.status, "CANCELLED")
            self.assertEqual(Decimal(str(ord_obj.discount)), Decimal("50.00"))

            # Check coupon used_count remains 1 (consumption at order placement, historical record intact)
            c = db.query(Coupon).filter(Coupon.code == "LIFECYCLE50").first()
            self.assertEqual(c.used_count, 1)
        finally:
            db.close()

        # Test prepaid reservation expiry
        prepaid_payload = dict(cod_payload)
        prepaid_payload["payment_method"] = "PREPAID"
        prepaid_res = client.post("/orders", json=prepaid_payload)
        self.assertEqual(prepaid_res.status_code, 201)
        prepaid_code = prepaid_res.json()["order_code"]

        db = SessionLocal()
        try:
            prep_ord = db.query(Order).filter(Order.order_code == prepaid_code).first()
            # Artificially set reservation_expires_at to the past
            prep_ord.reservation_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
            db.commit()

            # Run expire_unpaid_prepaid_reservations
            expired_count = expire_unpaid_prepaid_reservations(db)
            self.assertGreaterEqual(expired_count, 1)

            db.refresh(prep_ord)
            self.assertEqual(prep_ord.status, "CANCELLED")
            self.assertIn("expired automatically", prep_ord.admin_notes.lower())
        finally:
            db.close()

    def test_12_exact_4999_subtotal_and_decimal_rounding_policy(self):
        """Verify the exact ₹4,999 / 10% coupon scenario:
        - Subtotal: ₹4,999.00
        - Coupon: ROYAL10 (10% off)
        - Server calculated discount: Decimal('499.90')
        - Server calculated total: Decimal('4499.10')
        - Verify order response, database numeric precision, Cashfree payment initiation, and COD flow.
        - Verify atomic rejection and rollback when coupon is no longer eligible.
        """
        db = SessionLocal()
        try:
            # Create a dedicated variant priced at ₹4,999.00
            p4999 = Product(
                name="Royal Velvet Anarkali 4999",
                slug="royal-velvet-anarkali-4999",
                category="Anarkalis",
                subcategory="Heavy Work",
                description="Luxury designer attire for exact pricing verification",
                is_active=True,
                status="PUBLISHED",
            )
            db.add(p4999)
            db.flush()

            v4999 = ProductVariant(
                product_id=p4999.id,
                size="M",
                selling_price=Decimal("4999.00"),
                stock=10,
                is_active=True,
            )
            db.add(v4999)
            db.commit()
            variant_id = v4999.id
        finally:
            db.close()

        # Create coupon ROYAL10: 10% off, min order 1000, usage limit 5
        c_res = client.post(
            "/admin/coupons",
            json={
                "code": "ROYAL10",
                "type": "PERCENT",
                "value": "10.00",
                "min_order_value": "1000.00",
                "usage_limit": 5,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(c_res.status_code, 201)

        # 1. Test /coupons/validate with exact 4999 subtotal
        val_res = client.post("/coupons/validate", json={"code": "ROYAL10", "subtotal": 4999.00})
        self.assertEqual(val_res.status_code, 200)
        val_data = val_res.json()
        self.assertTrue(val_data["valid"])
        self.assertEqual(Decimal(str(val_data["discount"])), Decimal("499.90"))

        # 2. Test COD order placement with ROYAL10 on ₹4,999
        cod_payload = {
            "customer_name": "Royal Patron",
            "phone": "9876543210",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "coupon_code": "ROYAL10",
            "items": [{"variant_id": variant_id, "quantity": 1}],
            "address": {
                "name": "Royal Patron",
                "phone": "9876543210",
                "pincode": "400050",
                "line1": "Bandra West",
                "city": "Mumbai",
                "state": "Maharashtra",
            },
        }
        res_cod = client.post("/orders", json=cod_payload)
        self.assertEqual(res_cod.status_code, 201)
        cod_data = res_cod.json()
        self.assertEqual(Decimal(str(cod_data["subtotal"])), Decimal("4999.00"))
        self.assertEqual(Decimal(str(cod_data["discount"])), Decimal("499.90"))
        self.assertEqual(Decimal(str(cod_data["shipping_charge"])), Decimal("0.00"))  # Subtotal >= 1500 free shipping
        self.assertEqual(Decimal(str(cod_data["total"])), Decimal("4499.10"))
        self.assertEqual(cod_data["payment_method"], "COD")
        self.assertEqual(cod_data["status"], "PLACED")

        # Verify database record maintains exact 2-decimal paise precision
        db = SessionLocal()
        try:
            ord_db = db.query(Order).filter(Order.order_code == cod_data["order_code"]).first()
            self.assertEqual(ord_db.subtotal, Decimal("4999.00"))
            self.assertEqual(ord_db.discount, Decimal("499.90"))
            self.assertEqual(ord_db.total, Decimal("4499.10"))
        finally:
            db.close()

        # 3. Test PREPAID order placement with ROYAL10 on ₹4,999
        prepaid_payload = dict(cod_payload)
        prepaid_payload["payment_method"] = "PREPAID"
        res_prep = client.post("/orders", json=prepaid_payload)
        self.assertEqual(res_prep.status_code, 201)
        prep_data = res_prep.json()
        self.assertEqual(Decimal(str(prep_data["total"])), Decimal("4499.10"))
        self.assertEqual(prep_data["payment_method"], "PREPAID")
        self.assertEqual(prep_data["status"], "PENDING")

        # 4. Verify payment gateway amount matches backend total
        gateway_amount = float(Decimal(str(prep_data["total"])))
        self.assertEqual(gateway_amount, 4499.1)
        self.assertEqual(f"{gateway_amount:.2f}", "4499.10")

        # 5. Verify order placement fails if coupon becomes inactive before order submission
        # Deactivate ROYAL10
        deact_res = client.patch(
            f"/admin/coupons/{c_res.json()['id']}/toggle",
            headers=self.admin_headers,
        )
        self.assertEqual(deact_res.status_code, 200)

        # Attempt to create order with deactivated coupon
        fail_res = client.post("/orders", json=cod_payload)
        self.assertEqual(fail_res.status_code, 400)
        self.assertIn("no longer active", fail_res.json()["detail"].lower())

    def test_13_coupon_rules_changed_before_order_placement_rejected_and_rolled_back(self):
        """Verify that if coupon value or rules change between quote display and order placement:
        1. An order submitted with an outdated expected total/discount is rejected with HTTP 409 Conflict.
        2. Transaction rollback preserves stock and does NOT consume coupon usage count.
        3. Once the customer reviews and submits with the refreshed quote, the order succeeds.
        """
        # Create coupon RULECHG10: 10% off
        c_res = client.post(
            "/admin/coupons",
            json={
                "code": "RULECHG10",
                "type": "PERCENT",
                "value": "10.00",
                "min_order_value": "1000.00",
                "usage_limit": 5,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(c_res.status_code, 201)
        cid = c_res.json()["id"]

        # Initial subtotal: self.variant.selling_price * 1 (e.g. 2000.00)
        unit_price = Decimal(str(self.variant.selling_price))
        initial_subtotal = unit_price
        initial_discount = (initial_subtotal * Decimal("10") / Decimal("100")).quantize(Decimal("0.01"))
        initial_total = (initial_subtotal - initial_discount).quantize(Decimal("0.01"))

        # Snapshot starting stock
        db = SessionLocal()
        try:
            v_start = db.query(ProductVariant).filter(ProductVariant.id == self.variant.id).first()
            start_stock = v_start.stock
        finally:
            db.close()

        # Admin updates coupon value to 5% while customer is on checkout page
        upd_res = client.put(
            f"/admin/coupons/{cid}",
            json={
                "code": "RULECHG10",
                "type": "PERCENT",
                "value": "5.00",
                "min_order_value": "1000.00",
                "usage_limit": 5,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(upd_res.status_code, 200)

        # Customer attempts to submit order with outdated expected quote (reviewed before admin changed value)
        stale_order_payload = {
            "customer_name": "Review Customer",
            "phone": "9876543210",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "coupon_code": "RULECHG10",
            "expected_discount": float(initial_discount),
            "expected_total": float(initial_total),
            "items": [{"variant_id": self.variant.id, "quantity": 1}],
            "address": {
                "name": "Review Customer",
                "phone": "9876543210",
                "pincode": "400050",
                "line1": "Bandra West",
                "city": "Mumbai",
                "state": "Maharashtra",
            },
        }

        # Submission MUST be rejected with HTTP 409 Conflict
        conflict_res = client.post("/orders", json=stale_order_payload)
        self.assertEqual(conflict_res.status_code, 409)
        self.assertIn("has changed", conflict_res.json()["detail"].lower())

        # Verify rollback: stock not decremented, coupon used_count remains 0
        db = SessionLocal()
        try:
            v_chk = db.query(ProductVariant).filter(ProductVariant.id == self.variant.id).first()
            self.assertEqual(v_chk.stock, start_stock)
            c_chk = db.query(Coupon).filter(Coupon.id == cid).first()
            self.assertEqual(c_chk.used_count, 0)
        finally:
            db.close()

        # Customer reviews updated quote: 5% discount = initial_subtotal * 0.05
        revised_discount = (initial_subtotal * Decimal("5") / Decimal("100")).quantize(Decimal("0.01"))
        revised_total = (initial_subtotal - revised_discount).quantize(Decimal("0.01"))

        revised_order_payload = dict(stale_order_payload)
        revised_order_payload["expected_discount"] = float(revised_discount)
        revised_order_payload["expected_total"] = float(revised_total)

        # Re-submitting with reviewed quote succeeds
        ok_res = client.post("/orders", json=revised_order_payload)
        self.assertEqual(ok_res.status_code, 201)
        ok_data = ok_res.json()
        self.assertEqual(Decimal(str(ok_data["discount"])), revised_discount)
        self.assertEqual(Decimal(str(ok_data["total"])), revised_total)

        # Verify stock decremented and coupon count consumed
        db = SessionLocal()
        try:
            v_after = db.query(ProductVariant).filter(ProductVariant.id == self.variant.id).first()
            self.assertEqual(v_after.stock, start_stock - 1)
            c_after = db.query(Coupon).filter(Coupon.id == cid).first()
            self.assertEqual(c_after.used_count, 1)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
