"""Automated regression test suite for product-wise size availability controls.

Verifies:
1. Toggling variant is_active ON/OFF via admin API persists without altering stock, SKU, price, or product.
2. Toggling one product's variant size does not affect another product's variants.
3. Disabled variants (is_active=False) have is_available=False on the storefront regardless of stock level.
4. Disabled sizes are excluded from storefront size filtering (/products?size=S).
5. Cart validation (/cart/validate) flags disabled sizes as unavailable and sets is_valid=False.
6. Direct order placement (/orders) for a disabled variant is rejected with HTTP 400.
7. Enabled sizes (is_active=True) obey stock limits and successfully decrement stock upon order placement.
8. Historical orders referencing disabled variants remain completely intact.
"""

import atexit
import os
import shutil
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

# Setup isolated disposable SQLite database BEFORE importing app modules
_temp_dir = tempfile.mkdtemp(prefix="rl_variant_avail_isolated_")
_isolated_db_path = os.path.join(_temp_dir, "isolated_variant_avail.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_isolated_db_path}"
os.environ["JWT_SECRET"] = "phase6-test-isolated-jwt-secret-key-royal-libas"

def _cleanup_temp():
    if os.path.exists(_temp_dir):
        try:
            shutil.rmtree(_temp_dir, ignore_errors=True)
        except Exception:
            pass

atexit.register(_cleanup_temp)

# Guard: abort immediately if DATABASE_URL contains business/production keywords
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
from app.models import Admin, Product, ProductVariant, Order, OrderItem, Address, StoreSetting
from app.auth import hash_password

client = TestClient(app)

# Ensure schema and migrations are initialized on isolated database
Base.metadata.create_all(bind=engine)


class TestVariantAvailability(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db = SessionLocal()
        try:
            # Seed isolated test owner admin
            owner = Admin(
                id=1,
                email="avail_owner@royallibas.local",
                name="Store Owner",
                role="OWNER",
                password_hash=hash_password("OwnerPassword123!"),
                is_active=True,
            )
            db.add(owner)

            # Store settings with COD enabled for order tests
            setting = StoreSetting(
                id=1,
                cod_enabled=True,
                online_payment_enabled=True,
                standard_shipping_fee=Decimal("99.00"),
                standard_cod_free_threshold=Decimal("1500.00"),
            )
            db.add(setting)

            # Seed Product A
            p_a = Product(
                id=1,
                name="Gulzar Velvet Anarkali Suit",
                slug="gulzar-velvet-anarkali-suit",
                category="SUIT SET",
                subcategory="Three Pieces",
                status="PUBLISHED",
                is_active=True,
            )
            db.add(p_a)

            # Seed Product B (to verify isolation between products)
            p_b = Product(
                id=2,
                name="Noor Silk Kurta Set",
                slug="noor-silk-kurta-set",
                category="TWO PIECES",
                subcategory="Kurta Pant",
                status="PUBLISHED",
                is_active=True,
            )
            db.add(p_b)
            db.commit()

            # Seed variants for Product A
            v_a_s = ProductVariant(
                id=101,
                product_id=1,
                size="S",
                colour="Maroon",
                sku="RL-GULZAR-S",
                selling_price=Decimal("2999.00"),
                stock=10,
                is_active=True,
            )
            v_a_m = ProductVariant(
                id=102,
                product_id=1,
                size="M",
                colour="Maroon",
                sku="RL-GULZAR-M",
                selling_price=Decimal("2999.00"),
                stock=15,
                is_active=True,
            )
            v_a_l = ProductVariant(
                id=103,
                product_id=1,
                size="L",
                colour="Maroon",
                sku="RL-GULZAR-L",
                selling_price=Decimal("2999.00"),
                stock=0,  # Out of stock
                is_active=True,
            )

            # Seed variants for Product B
            v_b_s = ProductVariant(
                id=201,
                product_id=2,
                size="S",
                colour="Blue",
                sku="RL-NOOR-S",
                selling_price=Decimal("1999.00"),
                stock=8,
                is_active=True,
            )
            db.add_all([v_a_s, v_a_m, v_a_l, v_b_s])
            db.commit()
        finally:
            db.close()

        # Login and obtain auth token
        login_res = client.post(
            "/admin/login",
            json={"email": "avail_owner@royallibas.local", "password": "OwnerPassword123!"},
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        cls.auth_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    def test_01_toggle_variant_off_and_on_persists_without_modifying_stock_or_sku(self):
        """Toggle size S for Product A to OFF. Check persistence and that stock, SKU, price stay unchanged."""
        # 1. Turn OFF
        patch_res = client.patch(
            "/admin/variants/101",
            json={"is_active": False},
            headers=self.auth_headers,
        )
        self.assertEqual(patch_res.status_code, 200)
        data = patch_res.json()
        self.assertFalse(data["is_active"])
        self.assertFalse(data["is_available"])  # Disabled variant is NOT available
        self.assertEqual(data["stock"], 10)  # Stock untouched
        self.assertEqual(data["sku"], "RL-GULZAR-S")  # SKU untouched
        self.assertEqual(float(data["selling_price"]), 2999.0)  # Price untouched

        # Verify from direct database query
        db = SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == 101).first()
            self.assertFalse(v.is_active)
            self.assertEqual(v.stock, 10)
        finally:
            db.close()

        # 2. Turn back ON
        patch_res2 = client.patch(
            "/admin/variants/101",
            json={"is_active": True},
            headers=self.auth_headers,
        )
        self.assertEqual(patch_res2.status_code, 200)
        data2 = patch_res2.json()
        self.assertTrue(data2["is_active"])
        self.assertTrue(data2["is_available"])  # Now available since stock=10 > 0
        self.assertEqual(data2["stock"], 10)

    def test_02_changing_one_product_size_does_not_affect_another_product(self):
        """Toggling Product A's size S does NOT affect Product B's size S."""
        # Turn OFF Product A's size S
        client.patch(
            "/admin/variants/101",
            json={"is_active": False},
            headers=self.auth_headers,
        )

        # Check Product B's size S remains active and untouched
        detail_b = client.get("/products/noor-silk-kurta-set")
        self.assertEqual(detail_b.status_code, 200)
        variant_b_s = next(v for v in detail_b.json()["variants"] if v["id"] == 201)
        self.assertTrue(variant_b_s["is_active"])
        self.assertTrue(variant_b_s["is_available"])
        self.assertEqual(variant_b_s["stock"], 8)

        # Re-enable Product A's size S for subsequent tests
        client.patch(
            "/admin/variants/101",
            json={"is_active": True},
            headers=self.auth_headers,
        )

    def test_03_storefront_availability_and_size_filtering(self):
        """When size S on Product A is OFF, storefront reports is_available=False and excludes it from size filter."""
        # Turn OFF Product A size S
        client.patch("/admin/variants/101", json={"is_active": False}, headers=self.auth_headers)

        # Check product detail response
        detail = client.get("/products/gulzar-velvet-anarkali-suit")
        self.assertEqual(detail.status_code, 200)
        variants = {v["id"]: v for v in detail.json()["variants"]}

        # Variant 101: stock=10, is_active=False -> is_available must be False
        self.assertFalse(variants[101]["is_active"])
        self.assertFalse(variants[101]["is_available"])

        # Variant 102: stock=15, is_active=True -> is_available must be True
        self.assertTrue(variants[102]["is_active"])
        self.assertTrue(variants[102]["is_available"])

        # Variant 103: stock=0, is_active=True -> is_available must be False (out of stock)
        self.assertTrue(variants[103]["is_active"])
        self.assertFalse(variants[103]["is_available"])

        # Check size filter on /products?size=S: Product A should NOT be returned because its size S is inactive!
        # Product B should be returned because its size S is active.
        filter_res = client.get("/products?size=S")
        self.assertEqual(filter_res.status_code, 200)
        returned_ids = [p["id"] for p in filter_res.json()]
        self.assertNotIn(1, returned_ids, "Product A should be excluded from size S filter when size S is OFF")
        self.assertIn(2, returned_ids, "Product B should be included in size S filter")

        # Re-enable Product A size S
        client.patch("/admin/variants/101", json={"is_active": True}, headers=self.auth_headers)

    def test_04_cart_validation_blocks_disabled_sizes(self):
        """Cart validation /cart/validate reports disabled variants as unavailable and sets is_valid=False."""
        # Turn OFF Product A size S
        client.patch("/admin/variants/101", json={"is_active": False}, headers=self.auth_headers)

        # Customer attempts to validate cart containing disabled variant 101
        validate_res = client.post(
            "/cart/validate",
            json={"items": [{"variant_id": 101, "quantity": 1}]},
        )
        self.assertEqual(validate_res.status_code, 200)
        val_data = validate_res.json()
        self.assertFalse(val_data["is_valid"])
        self.assertIn("unavailable", val_data["unavailable_lines"][0].lower())
        self.assertFalse(val_data["items"][0]["is_available"])

        # Re-enable and verify it becomes valid
        client.patch("/admin/variants/101", json={"is_active": True}, headers=self.auth_headers)
        val_res_valid = client.post(
            "/cart/validate",
            json={"items": [{"variant_id": 101, "quantity": 1}]},
        )
        self.assertTrue(val_res_valid.json()["is_valid"])

    def test_05_direct_order_creation_with_disabled_variant_is_rejected(self):
        """Direct order creation /orders with a disabled variant fails with HTTP 400."""
        # Turn OFF Product A size S
        client.patch("/admin/variants/101", json={"is_active": False}, headers=self.auth_headers)

        order_payload = {
            "customer_name": "Test Patron",
            "phone": "9876543210",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "items": [{"variant_id": 101, "quantity": 1}],
            "address": {
                "name": "Test Patron",
                "phone": "9876543210",
                "pincode": "284001",
                "line1": "Civil Lines",
                "city": "Jhansi",
                "state": "Uttar Pradesh",
            },
        }

        # Submit order directly
        order_res = client.post("/orders", json=order_payload)
        self.assertEqual(order_res.status_code, 400)
        self.assertIn("unavailable", order_res.json()["detail"].lower())

        # Stock must remain unchanged at 10
        db = SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == 101).first()
            self.assertEqual(v.stock, 10)
        finally:
            db.close()

        # Re-enable Product A size S
        client.patch("/admin/variants/101", json={"is_active": True}, headers=self.auth_headers)

    def test_06_enabled_variant_obeys_stock_limits_and_decrements_stock(self):
        """When size is ON, placing order decrements stock; excessive quantity is rejected."""
        # Attempt to order more than available stock (stock is 10, request 15)
        over_order = {
            "customer_name": "Test Patron",
            "phone": "9876543210",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "items": [{"variant_id": 101, "quantity": 15}],
            "address": {
                "name": "Test Patron",
                "phone": "9876543210",
                "pincode": "284001",
                "line1": "Civil Lines",
                "city": "Jhansi",
                "state": "Uttar Pradesh",
            },
        }
        res_over = client.post("/orders", json=over_order)
        self.assertEqual(res_over.status_code, 400)
        self.assertIn("sold out", res_over.json()["detail"].lower())

        # Place valid order for quantity 2
        valid_order = dict(over_order)
        valid_order["items"] = [{"variant_id": 101, "quantity": 2}]
        res_valid = client.post("/orders", json=valid_order)
        self.assertEqual(res_valid.status_code, 201)
        created_order = res_valid.json()
        self.assertEqual(created_order["payment_method"], "COD")

        # Verify stock decremented from 10 to 8
        db = SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == 101).first()
            self.assertEqual(v.stock, 8)
        finally:
            db.close()

    def test_07_historical_orders_and_disabled_variant_references_remain_intact(self):
        """Historical orders preserve line items and references even if variant is later disabled."""
        # Turn OFF variant 101 now
        client.patch("/admin/variants/101", json={"is_active": False}, headers=self.auth_headers)

        db = SessionLocal()
        try:
            # Query all OrderItems for variant 101
            items = db.query(OrderItem).filter(OrderItem.variant_id == 101).all()
            self.assertGreater(len(items), 0)
            for item in items:
                self.assertEqual(item.size_snapshot, "S")
                self.assertEqual(item.variant.product.name, "Gulzar Velvet Anarkali Suit")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
