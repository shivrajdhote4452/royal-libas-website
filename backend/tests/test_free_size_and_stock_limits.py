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

    def test_08_free_size_only_size_guide_visibility_rules(self):
        """Case 8: Refinement for Size Guide visibility rules:
        - Free Size-only product WITHOUT explicit chart: should NOT show generic S/M/L Size Guide.
        - Free Size-only product WITH explicit chart: DOES show the explicit chart.
        - Standard-size product (e.g. S, M, L) WITHOUT explicit chart: DOES show the default Size Guide.
        - Mixed-size product (e.g. Free Size + S/M) WITHOUT explicit chart: DOES show the default Size Guide.
        """
        import json

        def evaluate_size_guide_display(product_data: dict) -> dict:
            variants = product_data.get("variants") or []
            size_chart_raw = product_data.get("size_chart")
            parsed_chart = None
            if size_chart_raw:
                try:
                    parsed_chart = json.loads(size_chart_raw)
                except Exception:
                    parsed_chart = None

            # Extract explicit rows
            explicit_rows = []
            if parsed_chart and isinstance(parsed_chart, (dict, list)):
                source = parsed_chart.get("measurements") if isinstance(parsed_chart, dict) else parsed_chart
                if source is None and isinstance(parsed_chart, dict):
                    metadata_keys = {'name', 'title', 'unit', 'description', 'notes', 'advice'}
                    filtered = {k: v for k, v in parsed_chart.items() if k.lower() not in metadata_keys}
                    if filtered:
                        for k, v in filtered.items():
                            explicit_rows.append({"size": k})
                elif isinstance(source, list):
                    for item in source:
                        explicit_rows.append({"size": item.get("size", "Free Size")})
                elif isinstance(source, dict):
                    for k in source.keys():
                        explicit_rows.append({"size": k})

            has_explicit_chart = len(explicit_rows) > 0

            # Determine if product has ONLY Free Size variants
            def norm(s):
                s_str = str(s or "").strip().lower()
                if s_str in ["free size", "freesize", "free-size", "free_size", "fs", "f.s."]:
                    return "free size"
                return s_str

            is_only_free_size = (
                len(variants) > 0 and
                all(norm(v.get("size")) == "free size" for v in variants)
            )

            # Rule: Free Size-only without explicit chart hides size guide; others show it
            should_show_size_guide = (not is_only_free_size) or has_explicit_chart
            return {
                "is_only_free_size": is_only_free_size,
                "has_explicit_chart": has_explicit_chart,
                "should_show_size_guide": should_show_size_guide,
                "explicit_rows": explicit_rows,
            }

        # Scenario 1: Free Size-only product WITHOUT explicit chart
        p_fs_no_chart = Product(
            name="Unstitched Chiffon Dupatta Suit",
            slug="unstitched-chiffon-dupatta-suit",
            category="UNSTITCHED MATERIAL",
            status="PUBLISHED",
            is_active=True,
            size_chart=None,
        )
        self.db.add(p_fs_no_chart)
        self.db.commit()
        self.db.refresh(p_fs_no_chart)
        v_fs1 = ProductVariant(
            product_id=p_fs_no_chart.id,
            size="Free Size",
            sku="UCDS-FS",
            selling_price=Decimal("1999.00"),
            stock=10,
            is_active=True,
        )
        self.db.add(v_fs1)
        self.db.commit()

        res1 = client.get(f"/products/{p_fs_no_chart.slug}")
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()
        eval1 = evaluate_size_guide_display(data1)
        self.assertTrue(eval1["is_only_free_size"])
        self.assertFalse(eval1["has_explicit_chart"])
        self.assertFalse(eval1["should_show_size_guide"], "Free Size-only product without chart MUST NOT show generic Size Guide")

        # Scenario 2: Free Size-only product WITH explicit chart
        p_fs_with_chart = Product(
            name="Handloom Chanderi Unstitched Set",
            slug="handloom-chanderi-unstitched-set",
            category="UNSTITCHED MATERIAL",
            status="PUBLISHED",
            is_active=True,
            size_chart=json.dumps({
                "name": "Unstitched Fabric Dimensions",
                "measurements": [
                    {"size": "Free Size", "bust": 110, "waist": 95, "hip": 115, "length": 125}
                ],
                "advice": "Fabric length: 2.5m Kurta, 2.5m Bottom, 2.25m Dupatta"
            }),
        )
        self.db.add(p_fs_with_chart)
        self.db.commit()
        self.db.refresh(p_fs_with_chart)
        v_fs2 = ProductVariant(
            product_id=p_fs_with_chart.id,
            size="Free Size",
            sku="HCUS-FS",
            selling_price=Decimal("3499.00"),
            stock=8,
            is_active=True,
        )
        self.db.add(v_fs2)
        self.db.commit()

        res2 = client.get(f"/products/{p_fs_with_chart.slug}")
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        eval2 = evaluate_size_guide_display(data2)
        self.assertTrue(eval2["is_only_free_size"])
        self.assertTrue(eval2["has_explicit_chart"])
        self.assertTrue(eval2["should_show_size_guide"], "Free Size-only product WITH explicit chart MUST show Size Guide")
        self.assertEqual(len(eval2["explicit_rows"]), 1)

        # Scenario 3: Standard-size product (S, M, L) WITHOUT explicit chart
        p_std_no_chart = Product(
            name="Boutique Velvet Kurti",
            slug="boutique-velvet-kurti",
            category="TWO PIECES",
            status="PUBLISHED",
            is_active=True,
            size_chart=None,
        )
        self.db.add(p_std_no_chart)
        self.db.commit()
        self.db.refresh(p_std_no_chart)
        v_s = ProductVariant(product_id=p_std_no_chart.id, size="S", selling_price=Decimal("2999.00"), stock=5, is_active=True)
        v_m = ProductVariant(product_id=p_std_no_chart.id, size="M", selling_price=Decimal("2999.00"), stock=5, is_active=True)
        v_l = ProductVariant(product_id=p_std_no_chart.id, size="L", selling_price=Decimal("2999.00"), stock=5, is_active=True)
        self.db.add_all([v_s, v_m, v_l])
        self.db.commit()

        res3 = client.get(f"/products/{p_std_no_chart.slug}")
        self.assertEqual(res3.status_code, 200)
        data3 = res3.json()
        eval3 = evaluate_size_guide_display(data3)
        self.assertFalse(eval3["is_only_free_size"])
        self.assertFalse(eval3["has_explicit_chart"])
        self.assertTrue(eval3["should_show_size_guide"], "Standard multi-size product WITHOUT explicit chart MUST keep standard fallback Size Guide")

        # Scenario 4: Mixed-size product (S, M, Free Size) WITHOUT explicit chart
        p_mixed_no_chart = Product(
            name="Fusion Co-ord Set",
            slug="fusion-co-ord-set",
            category="THREE PIECES",
            status="PUBLISHED",
            is_active=True,
            size_chart=None,
        )
        self.db.add(p_mixed_no_chart)
        self.db.commit()
        self.db.refresh(p_mixed_no_chart)
        v_mix1 = ProductVariant(product_id=p_mixed_no_chart.id, size="S", selling_price=Decimal("3299.00"), stock=4, is_active=True)
        v_mix2 = ProductVariant(product_id=p_mixed_no_chart.id, size="Free Size", selling_price=Decimal("3299.00"), stock=4, is_active=True)
        self.db.add_all([v_mix1, v_mix2])
        self.db.commit()

        res4 = client.get(f"/products/{p_mixed_no_chart.slug}")
        self.assertEqual(res4.status_code, 200)
        data4 = res4.json()
        eval4 = evaluate_size_guide_display(data4)
        self.assertFalse(eval4["is_only_free_size"])
        self.assertFalse(eval4["has_explicit_chart"])
        self.assertTrue(eval4["should_show_size_guide"], "Mixed-size product WITHOUT explicit chart MUST keep standard fallback Size Guide")

    def test_09_create_product_and_add_variant_without_mrp(self):
        """Case 9: Verify creating a product and adding Free Size variants with ONLY selling price (no MRP)."""
        create_payload = {
            "name": "Only Selling Price Chanderi Kurta",
            "slug": "only-selling-price-chanderi-kurta",
            "category": "TWO PIECES",
            "fabric": "Chanderi Silk",
            "status": "PUBLISHED",
            "is_active": True,
            "variants": [
                {
                    "size": "Free Size",
                    "selling_price": 2799.00,
                    # Note: mrp is omitted / not supplied
                    "stock": 12,
                    "sku": "OSP-CK-FS",
                    "is_active": True,
                }
            ],
        }

        res = client.post("/admin/products", json=create_payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201)
        created = res.json()
        self.assertEqual(len(created["variants"]), 1)
        v = created["variants"][0]
        self.assertEqual(v["size"], "Free Size")
        self.assertEqual(Decimal(str(v["selling_price"])), Decimal("2799.00"))
        self.assertIsNone(v["mrp"], "New variant created without MRP must have null mrp")

        # Now add another size variant (e.g. M) without MRP
        add_res = client.post(
            f"/admin/products/{created['id']}/variants",
            json={
                "size": "M",
                "selling_price": 2799.00,
                # mrp omitted
                "stock": 6,
                "sku": "OSP-CK-M",
                "is_active": True,
            },
            headers=self.admin_headers,
        )
        self.assertEqual(add_res.status_code, 201)
        added_v = add_res.json()
        self.assertEqual(added_v["size"], "M")
        self.assertEqual(Decimal(str(added_v["selling_price"])), Decimal("2799.00"))
        self.assertIsNone(added_v["mrp"])

        # Verify Storefront GET /products/{slug} returns the selling price cleanly
        detail = client.get(f"/products/{created['slug']}").json()
        self.assertEqual(len(detail["variants"]), 2)
        for var in detail["variants"]:
            self.assertEqual(Decimal(str(var["selling_price"])), Decimal("2799.00"))
            self.assertIsNone(var["mrp"])

    def test_10_selling_price_increase_higher_than_stored_mrp_without_deleting_mrp(self):
        """Case 10:
        1. An existing variant price can be edited and remains correct after reload,
           including when it is higher than the old stored MRP.
        2. Existing hidden MRP data is NOT silently cleared or overwritten by a price save.
        3. Explicit invalid MRPs (new_sp > explicit new_mrp) are still rejected.
        """
        # Seed product with existing stored MRP of ₹2500 and selling price ₹2000
        p = Product(
            name="Hidden MRP Protection Gown",
            slug="hidden-mrp-protection-gown",
            category="HEAVY DRESS",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        v = ProductVariant(
            product_id=p.id,
            size="Free Size",
            sku="HMPG-FS",
            selling_price=Decimal("2000.00"),
            mrp=Decimal("2500.00"),  # Old stored MRP
            stock=10,
            is_active=True,
        )
        self.db.add(v)
        self.db.commit()
        self.db.refresh(v)

        # 1. Admin increases selling price to ₹3500 (HIGHER than old stored MRP ₹2500)
        # via atomic bulk update without passing mrp
        bulk_res = client.patch(
            f"/admin/products/{p.id}/variants/bulk-update",
            json={
                "items": [
                    {
                        "variant_id": v.id,
                        "selling_price": 3500.00,
                        # "mrp" is omitted entirely
                    }
                ]
            },
            headers=self.admin_headers,
        )
        self.assertEqual(
            bulk_res.status_code,
            200,
            f"Raising selling price above old stored MRP must succeed: {bulk_res.text}",
        )
        updated_bulk = bulk_res.json()["updated_variants"][0]
        self.assertEqual(Decimal(str(updated_bulk["selling_price"])), Decimal("3500.00"))
        # Crucial check: old stored MRP must NOT be cleared!
        self.assertEqual(
            Decimal(str(updated_bulk["mrp"])),
            Decimal("2500.00"),
            "Existing stored MRP must remain preserved!",
        )

        # 2. Reload after save: verify from database and API
        self.db.expire_all()
        reloaded_v = self.db.query(ProductVariant).filter(ProductVariant.id == v.id).first()
        self.assertEqual(reloaded_v.selling_price, Decimal("3500.00"))
        self.assertEqual(reloaded_v.mrp, Decimal("2500.00"), "Stored MRP in database must be preserved")

        # 3. Same check on unified product update (PATCH /admin/products/{id})
        unified_res = client.patch(
            f"/admin/products/{p.id}",
            json={
                "name": "Hidden MRP Protection Gown (Refined)",
                "variants": [
                    {
                        "variant_id": v.id,
                        "selling_price": 3800.00,  # Even higher than old MRP 2500
                        # mrp omitted
                    }
                ],
            },
            headers=self.admin_headers,
        )
        self.assertEqual(unified_res.status_code, 200)
        unified_v = unified_res.json()["variants"][0]
        self.assertEqual(Decimal(str(unified_v["selling_price"])), Decimal("3800.00"))
        self.assertEqual(Decimal(str(unified_v["mrp"])), Decimal("2500.00"), "MRP must remain intact")

        # 4. Same check on single variant update (PATCH /admin/variants/{id})
        single_res = client.patch(
            f"/admin/variants/{v.id}",
            json={
                "selling_price": 4200.00,
                # mrp omitted
            },
            headers=self.admin_headers,
        )
        self.assertEqual(single_res.status_code, 200)
        self.assertEqual(Decimal(str(single_res.json()["selling_price"])), Decimal("4200.00"))
        self.assertEqual(Decimal(str(single_res.json()["mrp"])), Decimal("2500.00"))

        # 5. Explicitly supplying an invalid MRP (where selling_price > new_mrp) is still rejected
        invalid_res = client.patch(
            f"/admin/variants/{v.id}",
            json={
                "selling_price": 5000.00,
                "mrp": 4000.00,  # Explicitly supplied invalid MRP < selling price
            },
            headers=self.admin_headers,
        )
        self.assertEqual(invalid_res.status_code, 400)
        self.assertIn("cannot exceed mrp", invalid_res.json()["detail"].lower())


if __name__ == "__main__":
    unittest.main()
