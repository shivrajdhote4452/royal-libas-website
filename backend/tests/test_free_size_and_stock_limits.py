"""Automated regression test suite for Free Size and stock management.

Verifies:
1. Creating a new unstitched material (or any category) product with Free Size, stock, price, and MRP.
2. Adding Free Size to an existing product via Manage Product (POST /products/{id}/variants).
3. Preventing duplicate Free Size variants on the same product (case-insensitive duplicate rejection).
4. Persisting Free Size stock, price, MRP, and availability changes after reload.
5. Cart validation and checkout order creation with Free Size (correct variant and size_snapshot).
6. Real stock limits and overselling prevention (cannot purchase more than available stock).
7. Existing standard-size products remain completely untouched without auto-added Free Size.
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
_temp_dir = tempfile.mkdtemp(prefix="rl_free_size_isolated_")
_isolated_db_path = os.path.join(_temp_dir, "isolated_free_size.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_isolated_db_path}"
os.environ["JWT_SECRET"] = "free-size-test-isolated-jwt-secret-key-royal-libas"

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
from app.models import Admin, Product, ProductVariant, Order, OrderItem, StoreSetting
from app.auth import hash_password, create_access_token

client = TestClient(app)

# Ensure schema is initialized on isolated database
Base.metadata.create_all(bind=engine)


class TestFreeSizeAndStockLimits(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()

        # Seed admin user
        admin = Admin(
            email="free_size_admin@royallibas.com",
            password_hash=hash_password("AdminSecurePass123!"),
            role="OWNER",
            is_active=True,
        )
        cls.db.add(admin)
        cls.db.commit()
        cls.db.refresh(admin)
        cls.admin_id = admin.id
        cls.admin_token = create_access_token({"sub": str(admin.id), "email": admin.email, "role": admin.role})
        cls.admin_headers = {"Authorization": f"Bearer {cls.admin_token}"}

        # Seed store settings for checkout
        setting = cls.db.query(StoreSetting).first()
        if not setting:
            setting = StoreSetting(
                cod_enabled=True,
                online_payment_enabled=True,
                standard_cod_free_threshold=Decimal("2000.00"),
                standard_shipping_fee=Decimal("100.00"),
            )
            cls.db.add(setting)
            cls.db.commit()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_01_create_unstitched_product_with_free_size(self):
        """Case 1: Admin can create a new Unstitched Material product with Free Size."""
        payload = {
            "name": "Gulabi Chanderi Unstitched Suit",
            "slug": "gulabi-chanderi-unstitched-suit",
            "category": "UNSTITCHED MATERIAL",
            "subcategory": "Unstitched Suits",
            "description": "Premium pure Chanderi unstitched suit fabric with embroidered dupatta.",
            "fabric": "Pure Chanderi Silk",
            "care": "Dry Clean Only",
            "status": "PUBLISHED",
            "is_active": True,
            "variants": [
                {
                    "size": "Free Size",
                    "selling_price": 3999.00,
                    "mrp": 4999.00,
                    "stock": 15,
                    "sku": "GULABI-FS",
                    "is_active": True,
                }
            ],
        }

        res = client.post("/admin/products", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201, f"Product creation failed: {res.text}")
        data = res.json()
        self.assertEqual(data["name"], "Gulabi Chanderi Unstitched Suit")
        self.assertEqual(len(data["variants"]), 1)
        v = data["variants"][0]
        self.assertEqual(v["size"], "Free Size")
        self.assertEqual(Decimal(str(v["selling_price"])), Decimal("3999.00"))
        self.assertEqual(Decimal(str(v["mrp"])), Decimal("4999.00"))
        self.assertEqual(v["stock"], 15)

        # Storefront GET /products/{slug}
        detail_res = client.get(f"/products/{data['slug']}")
        self.assertEqual(detail_res.status_code, 200)
        detail = detail_res.json()
        self.assertEqual(detail["variants"][0]["size"], "Free Size")
        self.assertEqual(Decimal(str(detail["variants"][0]["selling_price"])), Decimal("3999.00"))

    def test_02_add_free_size_to_existing_product(self):
        """Case 2: Adding Free Size to an existing product via Manage Product."""
        p = Product(
            name="Classic Linen Kurti",
            slug="classic-linen-kurti",
            category="TWO PIECES",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        v_s = ProductVariant(
            product_id=p.id,
            size="S",
            sku="CLK-S",
            selling_price=Decimal("2499.00"),
            mrp=Decimal("3499.00"),
            stock=8,
            is_active=True,
        )
        self.db.add(v_s)
        self.db.commit()

        # Add Free Size variant
        add_res = client.post(
            f"/admin/products/{p.id}/variants",
            json={
                "size": "Free Size",
                "selling_price": 2799.00,
                "mrp": 3799.00,
                "stock": 10,
                "sku": "CLK-FS",
                "is_active": True,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(add_res.status_code, 201, f"Add variant failed: {add_res.text}")
        new_v = add_res.json()
        self.assertEqual(new_v["size"], "Free Size")
        self.assertEqual(Decimal(str(new_v["selling_price"])), Decimal("2799.00"))
        self.assertEqual(new_v["stock"], 10)

        # Verify product now has both S and Free Size
        self.db.expire_all()
        variants = self.db.query(ProductVariant).filter(ProductVariant.product_id == p.id).all()
        sizes = [v.size for v in variants]
        self.assertIn("S", sizes)
        self.assertIn("Free Size", sizes)

    def test_03_prevent_duplicate_free_size_variant(self):
        """Case 3: Duplicate Free Size variant creation must be rejected against both modern and legacy formats."""
        p = Product(
            name="Dup Protection Dress",
            slug="dup-protection-dress",
            category="HEAVY DRESS",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        v_fs = ProductVariant(
            product_id=p.id,
            size="Free Size",
            sku="DPD-FS",
            selling_price=Decimal("4999.00"),
            mrp=Decimal("6999.00"),
            stock=5,
            is_active=True,
        )
        self.db.add(v_fs)
        self.db.commit()

        # 3a. Exact duplicate "Free Size"
        res1 = client.post(
            f"/admin/products/{p.id}/variants",
            json={
                "size": "Free Size",
                "selling_price": 4999.00,
                "stock": 5,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(res1.status_code, 400)
        self.assertIn("already exists", res1.json()["detail"].lower())

        # 3b. Casing variant "free size"
        res2 = client.post(
            f"/admin/products/{p.id}/variants",
            json={
                "size": "free size",
                "selling_price": 4999.00,
                "stock": 5,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(res2.status_code, 400)
        self.assertIn("already exists", res2.json()["detail"].lower())

        # 3c. Duplicate during product creation
        res3 = client.post(
            "/admin/products",
            json={
                "name": "Multi Free Size Error Product",
                "slug": "multi-free-size-error-product",
                "category": "TWO PIECES",
                "variants": [
                    {"size": "Free Size", "selling_price": 1999.00, "stock": 5},
                    {"size": "FREE SIZE", "selling_price": 1999.00, "stock": 5},
                ],
            },
            headers=self.admin_headers,
        )
        self.assertEqual(res3.status_code, 400)
        self.assertIn("duplicate", res3.json()["detail"].lower())

    def test_03b_legacy_variant_duplicate_protection_and_colour_rules(self):
        """Case 3b: Prevent duplicate Free Size against legacy records ('FS', 'freesize', 'free-size') while preserving colour rules."""
        p_legacy = Product(
            name="Legacy Anarkali Ensemble",
            slug="legacy-anarkali-ensemble",
            category="SUIT SET",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p_legacy)
        self.db.commit()
        self.db.refresh(p_legacy)

        # Seed legacy variant stored as "FS" with colour "Ruby Red"
        legacy_v = ProductVariant(
            product_id=p_legacy.id,
            size="FS",  # Legacy stored abbreviation
            colour="Ruby Red",
            sku="LAE-FS-RED",
            selling_price=Decimal("5490.00"),
            mrp=Decimal("7990.00"),
            stock=4,
            is_active=True,
        )
        self.db.add(legacy_v)
        self.db.commit()
        self.db.refresh(legacy_v)

        # 1. Attempting to add "Free Size" for the same colour "Ruby Red" must be rejected
        res_dup1 = client.post(
            f"/admin/products/{p_legacy.id}/variants",
            json={
                "size": "Free Size",
                "colour": "Ruby Red",
                "selling_price": 5490.00,
                "stock": 2,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(res_dup1.status_code, 400)
        self.assertIn("already exists", res_dup1.json()["detail"].lower())

        # 2. Attempting to add with whitespace/hyphen variation "  free - size  " for "Ruby Red" must be rejected
        res_dup2 = client.post(
            f"/admin/products/{p_legacy.id}/variants",
            json={
                "size": "  free - size  ",
                "colour": "ruby red",
                "selling_price": 5490.00,
                "stock": 2,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(res_dup2.status_code, 400)
        self.assertIn("already exists", res_dup2.json()["detail"].lower())

        # 3. Preserving size-and-colour rules: Adding Free Size for a different colour "Emerald Green" succeeds
        res_diff_colour = client.post(
            f"/admin/products/{p_legacy.id}/variants",
            json={
                "size": "Free Size",
                "colour": "Emerald Green",
                "selling_price": 5490.00,
                "stock": 6,
                "sku": "LAE-FS-GRN",
            },
            headers=self.admin_headers,
        )
        self.assertEqual(res_diff_colour.status_code, 201)
        created_data = res_diff_colour.json()
        self.assertEqual(created_data["size"], "Free Size")
        self.assertEqual(created_data["colour"], "Emerald Green")

        # 4. Existing legacy record MUST NOT be modified in the database
        self.db.expire_all()
        refreshed_legacy = self.db.query(ProductVariant).filter(ProductVariant.id == legacy_v.id).first()
        self.assertEqual(refreshed_legacy.size, "FS")  # Preserved as-is without destructive rewrite

    def test_04_free_size_stock_price_availability_persistence(self):
        """Case 4: Free Size stock, price, and availability edits persist after save and reload."""
        p = Product(
            name="Persistence Test Suit",
            slug="persistence-test-suit",
            category="UNSTITCHED MATERIAL",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        v = ProductVariant(
            product_id=p.id,
            size="Free Size",
            sku="PTS-FS",
            selling_price=Decimal("3000.00"),
            mrp=Decimal("4000.00"),
            stock=10,
            is_active=True,
        )
        self.db.add(v)
        self.db.commit()
        self.db.refresh(v)

        # Update stock to 18 and selling price to 3200.00
        patch_res = client.patch(
            f"/admin/variants/{v.id}",
            json={
                "stock": 18,
                "selling_price": 3200.00,
                "is_active": False,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(patch_res.status_code, 200)

        # Reload from DB directly
        self.db.expire_all()
        reloaded = self.db.query(ProductVariant).filter(ProductVariant.id == v.id).first()
        self.assertEqual(reloaded.stock, 18)
        self.assertEqual(Decimal(str(reloaded.selling_price)), Decimal("3200.00"))
        self.assertFalse(reloaded.is_active)

        # Reactivate
        patch_res2 = client.patch(
            f"/admin/variants/{v.id}",
            json={"is_active": True},
            headers=self.admin_headers,
        )
        self.assertEqual(patch_res2.status_code, 200)
        self.db.expire_all()
        reloaded2 = self.db.query(ProductVariant).filter(ProductVariant.id == v.id).first()
        self.assertTrue(reloaded2.is_active)

    def test_05_cart_and_checkout_free_size_variant(self):
        """Case 5: Free Size item can be added to cart and ordered through checkout."""
        p = Product(
            name="Orderable Free Size Set",
            slug="orderable-free-size-set",
            category="UNSTITCHED MATERIAL",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        v = ProductVariant(
            product_id=p.id,
            size="Free Size",
            sku="OFSS-FS",
            selling_price=Decimal("3500.00"),
            mrp=Decimal("4500.00"),
            stock=10,
            is_active=True,
        )
        self.db.add(v)
        self.db.commit()
        self.db.refresh(v)

        # Cart validation
        cart_res = client.post("/cart/validate", json={"items": [{"variant_id": v.id, "quantity": 2}]})
        self.assertEqual(cart_res.status_code, 200)
        cart_data = cart_res.json()
        self.assertTrue(cart_data["is_valid"])
        self.assertEqual(cart_data["items"][0]["size"], "Free Size")
        self.assertEqual(Decimal(str(cart_data["subtotal"])), Decimal("7000.00"))

        # Place checkout order
        order_payload = {
            "customer_name": "Radhika Patel",
            "phone": "9876543210",
            "email": "radhika@royallibas.com",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "address": {
                "name": "Radhika Patel",
                "phone": "9876543210",
                "line1": "Flat 302, Diamond Towers",
                "city": "Surat",
                "state": "Gujarat",
                "pincode": "395001",
            },
            "items": [{"variant_id": v.id, "quantity": 2}],
        }
        order_res = client.post("/orders", json=order_payload)
        self.assertEqual(order_res.status_code, 201, f"Checkout failed: {order_res.text}")
        order_data = order_res.json()
        self.assertEqual(order_data["items"][0]["size_snapshot"], "Free Size")
        self.assertEqual(Decimal(str(order_data["items"][0]["unit_price_snapshot"])), Decimal("3500.00"))

        # Verify stock decremented from 10 to 8
        self.db.expire_all()
        updated_v = self.db.query(ProductVariant).filter(ProductVariant.id == v.id).first()
        self.assertEqual(updated_v.stock, 8)

    def test_06_real_stock_limits_prevent_overselling(self):
        """Case 6: Real inventory limits strictly prevent ordering more than available stock."""
        p = Product(
            name="Limited Stock Free Size Dress",
            slug="limited-stock-free-size-dress",
            category="UNSTITCHED MATERIAL",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        v = ProductVariant(
            product_id=p.id,
            size="Free Size",
            sku="LSFSD-FS",
            selling_price=Decimal("2999.00"),
            mrp=Decimal("3999.00"),
            stock=2,
            is_active=True,
        )
        self.db.add(v)
        self.db.commit()
        self.db.refresh(v)

        # Attempting to order 3 units when only 2 exist must fail
        order_payload_over = {
            "customer_name": "Overbuyer",
            "phone": "9876543210",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "address": {
                "name": "Overbuyer",
                "phone": "9876543210",
                "line1": "456 Market St",
                "city": "Jaipur",
                "state": "Rajasthan",
                "pincode": "302001",
            },
            "items": [{"variant_id": v.id, "quantity": 3}],
        }
        order_res = client.post("/orders", json=order_payload_over)
        self.assertEqual(order_res.status_code, 400)
        self.assertIn("stock", order_res.json()["detail"].lower())

    def test_07_existing_standard_size_products_unaffected(self):
        """Case 7: Existing products with standard sizes XS-XXL remain untouched without auto Free Size."""
        p = Product(
            name="Standard Multi-size Suit",
            slug="standard-multi-size-suit",
            category="SUIT SET",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        v_s = ProductVariant(product_id=p.id, size="S", selling_price=Decimal("2500.00"), stock=5, is_active=True)
        v_m = ProductVariant(product_id=p.id, size="M", selling_price=Decimal("2500.00"), stock=5, is_active=True)
        v_l = ProductVariant(product_id=p.id, size="L", selling_price=Decimal("2500.00"), stock=5, is_active=True)
        self.db.add_all([v_s, v_m, v_l])
        self.db.commit()

        # Fetch detail
        res = client.get(f"/products/{p.slug}")
        self.assertEqual(res.status_code, 200)
        sizes = [v["size"] for v in res.json()["variants"]]
        self.assertEqual(sizes, ["S", "M", "L"])
        self.assertNotIn("Free Size", sizes)


if __name__ == "__main__":
    unittest.main()
