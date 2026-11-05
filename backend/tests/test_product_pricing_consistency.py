"""Automated regression test suite for product pricing consistency across Shop listing and Product Detail.

Verifies:
1. All available sizes have the same updated price -> min_price and max_price match variant price.
2. Available sizes have different prices -> min_price reflects lowest eligible price, max_price reflects highest.
3. A cheaper size is disabled (is_active=False) or out of stock (stock=0) -> excluded from starting price.
4. No purchasable sizes remain (all stock=0 or disabled) -> min_price is None, max_price is None, 'Sold Out' badge added.
5. Price, MRP, and discount pairing remain consistent -> MRP and discount strictly correspond to each variant.
6. Admin price changes persist after reload and immediately appear on storefront -> headers include no-cache directives.
7. Cart and checkout use the correct selected-size price -> server-authoritative validation and order placement.
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
_temp_dir = tempfile.mkdtemp(prefix="rl_price_consistency_isolated_")
_isolated_db_path = os.path.join(_temp_dir, "isolated_price_consistency.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_isolated_db_path}"
os.environ["JWT_SECRET"] = "price-test-isolated-jwt-secret-key-royal-libas"

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
from app.auth import hash_password, create_access_token

client = TestClient(app)

# Ensure schema is initialized on isolated database
Base.metadata.create_all(bind=engine)


class TestProductPricingConsistency(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()

        # Seed admin user
        admin = Admin(
            email="pricing_admin@royallibas.com",
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

    def test_01_all_available_sizes_have_same_updated_price(self):
        """Case 1: All available sizes have the same price -> min_price == max_price."""
        p = Product(
            name="Neel Slate Blue Uniform Price Set",
            slug="neel-slate-blue-uniform-price-set",
            category="TWO PIECES",
            subcategory="Kurta Pant",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        # 3 variants, all selling_price = 2000.00
        for sz in ["S", "M", "L"]:
            v = ProductVariant(
                product_id=p.id,
                size=sz,
                sku=f"UNIFORM-{sz}",
                selling_price=Decimal("2000.00"),
                mrp=Decimal("2499.00"),
                stock=5,
                is_active=True,
            )
            self.db.add(v)
        self.db.commit()

        # Test Shop listing API
        res = client.get("/products")
        self.assertEqual(res.status_code, 200)
        items = res.json()
        target = next((item for item in items if item["id"] == p.id), None)
        self.assertIsNotNone(target)
        self.assertEqual(Decimal(str(target["min_price"])), Decimal("2000.00"))
        self.assertEqual(Decimal(str(target["max_price"])), Decimal("2000.00"))
        self.assertEqual(target["total_stock"], 15)
        self.assertNotIn("Sold Out", target["badges"])

        # Test Product detail API
        det = client.get(f"/products/{p.slug}")
        self.assertEqual(det.status_code, 200)
        det_data = det.json()
        for v in det_data["variants"]:
            self.assertEqual(Decimal(str(v["selling_price"])), Decimal("2000.00"))
            self.assertTrue(v["is_available"])

    def test_02_available_sizes_have_different_prices(self):
        """Case 2: Available sizes have different prices -> min_price reflects lowest eligible price."""
        p = Product(
            name="Gulmeher Multi Price Set",
            slug="gulmeher-multi-price-set",
            category="TWO PIECES",
            subcategory="Co-ord Sets",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        # S=1999, M=2000, L=2200
        prices = {"S": ("1999.00", "2499.00"), "M": ("2000.00", "2499.00"), "L": ("2200.00", "2699.00")}
        for sz, (sp, mrp) in prices.items():
            v = ProductVariant(
                product_id=p.id,
                size=sz,
                sku=f"MULTI-{sz}",
                selling_price=Decimal(sp),
                mrp=Decimal(mrp),
                stock=5,
                is_active=True,
            )
            self.db.add(v)
        self.db.commit()

        res = client.get("/products")
        self.assertEqual(res.status_code, 200)
        target = next((item for item in items if item["id"] == p.id), None) if (items := res.json()) else None
        self.assertIsNotNone(target)
        self.assertEqual(Decimal(str(target["min_price"])), Decimal("1999.00"))
        self.assertEqual(Decimal(str(target["max_price"])), Decimal("2200.00"))

    def test_03_cheaper_size_disabled_or_out_of_stock_excluded_from_starting_price(self):
        """Case 3: A cheaper size (1999) is out-of-stock or disabled -> excluded from starting price (2000)."""
        # 3a. Out of stock cheaper variant
        p1 = Product(
            name="Zaitoon Out of Stock Cheaper Size",
            slug="zaitoon-oos-cheaper-size",
            category="TWO PIECES",
            subcategory="Co-ord Sets",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p1)
        self.db.commit()
        self.db.refresh(p1)

        # Size S is 1999 but stock=0
        v_s = ProductVariant(
            product_id=p1.id,
            size="S",
            sku="OOS-CHEAP-S",
            selling_price=Decimal("1999.00"),
            mrp=Decimal("2499.00"),
            stock=0,
            is_active=True,
        )
        # Size M is 2000 and stock=5
        v_m = ProductVariant(
            product_id=p1.id,
            size="M",
            sku="OOS-CHEAP-M",
            selling_price=Decimal("2000.00"),
            mrp=Decimal("2499.00"),
            stock=5,
            is_active=True,
        )
        self.db.add_all([v_s, v_m])
        self.db.commit()

        res1 = client.get("/products")
        self.assertEqual(res1.status_code, 200)
        target1 = next((item for item in res1.json() if item["id"] == p1.id), None)
        self.assertIsNotNone(target1)
        # MUST BE 2000.00, NOT 1999.00!
        self.assertEqual(Decimal(str(target1["min_price"])), Decimal("2000.00"))
        self.assertEqual(Decimal(str(target1["max_price"])), Decimal("2000.00"))

        # 3b. Disabled cheaper variant (is_active=False, even if stock > 0)
        p2 = Product(
            name="Mehr Disabled Cheaper Size",
            slug="mehr-disabled-cheaper-size",
            category="TWO PIECES",
            subcategory="Co-ord Sets",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p2)
        self.db.commit()
        self.db.refresh(p2)

        v_s2 = ProductVariant(
            product_id=p2.id,
            size="S",
            sku="DIS-CHEAP-S",
            selling_price=Decimal("1999.00"),
            mrp=Decimal("2499.00"),
            stock=10,
            is_active=False,  # Disabled
        )
        v_m2 = ProductVariant(
            product_id=p2.id,
            size="M",
            sku="DIS-CHEAP-M",
            selling_price=Decimal("2000.00"),
            mrp=Decimal("2499.00"),
            stock=5,
            is_active=True,
        )
        self.db.add_all([v_s2, v_m2])
        self.db.commit()

        res2 = client.get("/products")
        self.assertEqual(res2.status_code, 200)
        target2 = next((item for item in res2.json() if item["id"] == p2.id), None)
        self.assertIsNotNone(target2)
        # MUST BE 2000.00, NOT 1999.00!
        self.assertEqual(Decimal(str(target2["min_price"])), Decimal("2000.00"))
        self.assertEqual(Decimal(str(target2["max_price"])), Decimal("2000.00"))

    def test_04_no_purchasable_sizes_remain(self):
        """Case 4: No purchasable sizes remain -> min_price is None, Sold Out badge."""
        # 4a. All stock 0
        p_sold_out = Product(
            name="Sold Out Velvet Ensemble",
            slug="sold-out-velvet-ensemble",
            category="SUIT SET",
            subcategory="Party Wear",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p_sold_out)
        self.db.commit()
        self.db.refresh(p_sold_out)

        v1 = ProductVariant(
            product_id=p_sold_out.id,
            size="M",
            sku="SO-M",
            selling_price=Decimal("3490.00"),
            mrp=Decimal("4999.00"),
            stock=0,
            is_active=True,
        )
        self.db.add(v1)
        self.db.commit()

        res = client.get("/products")
        target = next((item for item in res.json() if item["id"] == p_sold_out.id), None)
        self.assertIsNotNone(target)
        self.assertIsNone(target["min_price"])
        self.assertIsNone(target["max_price"])
        self.assertEqual(target["total_stock"], 0)
        self.assertIn("Sold Out", target["badges"])

        # 4b. All variants disabled
        p_all_disabled = Product(
            name="All Disabled Collection Piece",
            slug="all-disabled-collection-piece",
            category="SUIT SET",
            subcategory="Party Wear",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p_all_disabled)
        self.db.commit()
        self.db.refresh(p_all_disabled)

        v2 = ProductVariant(
            product_id=p_all_disabled.id,
            size="L",
            sku="DIS-L",
            selling_price=Decimal("3490.00"),
            mrp=Decimal("4999.00"),
            stock=10,
            is_active=False,
        )
        self.db.add(v2)
        self.db.commit()

        res2 = client.get("/products")
        target2 = next((item for item in res2.json() if item["id"] == p_all_disabled.id), None)
        self.assertIsNotNone(target2)
        self.assertIsNone(target2["min_price"])
        self.assertIsNone(target2["max_price"])
        self.assertIn("Sold Out", target2["badges"])

    def test_05_price_mrp_discount_pairing_consistency(self):
        """Case 5: MRP and discount are strictly paired to the variant with lowest price, not mixed."""
        p = Product(
            name="Consistent Pair Dress",
            slug="consistent-pair-dress",
            category="HEAVY DRESS",
            subcategory="Lehenga",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        # S has lowest price 1999 and MRP 2499 (20% off)
        # L has higher price 2400 and high MRP 4000 (40% off)
        v_s = ProductVariant(
            product_id=p.id,
            size="S",
            sku="PAIR-S",
            selling_price=Decimal("1999.00"),
            mrp=Decimal("2499.00"),
            stock=5,
            is_active=True,
        )
        v_l = ProductVariant(
            product_id=p.id,
            size="L",
            sku="PAIR-L",
            selling_price=Decimal("2400.00"),
            mrp=Decimal("4000.00"),
            stock=5,
            is_active=True,
        )
        self.db.add_all([v_s, v_l])
        self.db.commit()

        res = client.get("/products")
        target = next((item for item in res.json() if item["id"] == p.id), None)
        self.assertIsNotNone(target)
        self.assertEqual(Decimal(str(target["min_price"])), Decimal("1999.00"))

        # Verify variant details from GET /products/{slug}
        det = client.get(f"/products/{p.slug}").json()
        s_var = next(v for v in det["variants"] if v["size"] == "S")
        self.assertEqual(Decimal(str(s_var["selling_price"])), Decimal("1999.00"))
        self.assertEqual(Decimal(str(s_var["mrp"])), Decimal("2499.00"))

        l_var = next(v for v in det["variants"] if v["size"] == "L")
        self.assertEqual(Decimal(str(l_var["selling_price"])), Decimal("2400.00"))
        self.assertEqual(Decimal(str(l_var["mrp"])), Decimal("4000.00"))

    def test_06_admin_price_change_persists_and_appears_storefront_no_cache(self):
        """Case 6: Admin updates variant prices -> persists and appears immediately on GET /products with no-cache headers."""
        p = Product(
            name="Admin Updatable Anarkali",
            slug="admin-updatable-anarkali",
            category="TWO PIECES",
            subcategory="Kurta Pant",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        v_m = ProductVariant(
            product_id=p.id,
            size="M",
            sku="UPD-M",
            selling_price=Decimal("1999.00"),
            mrp=Decimal("2499.00"),
            stock=5,
            is_active=True,
        )
        self.db.add(v_m)
        self.db.commit()
        self.db.refresh(v_m)

        # Before update: min_price is 1999.00
        res_before = client.get("/products")
        t_before = next(x for x in res_before.json() if x["id"] == p.id)
        self.assertEqual(Decimal(str(t_before["min_price"])), Decimal("1999.00"))

        # Admin updates price to 2000.00 via PATCH /admin/products/{id}
        patch_res = client.patch(
            f"/admin/products/{p.id}",
            json={
                "variants": [
                    {
                        "variant_id": v_m.id,
                        "selling_price": 2000.00,
                        "mrp": 2499.00,
                    }
                ]
            },
            headers=self.admin_headers,
        )
        self.assertEqual(patch_res.status_code, 200)

        # After update: GET /products immediately reflects 2000.00
        res_after = client.get("/products")
        self.assertEqual(res_after.headers.get("Cache-Control"), "no-cache, no-store, must-revalidate")
        t_after = next(x for x in res_after.json() if x["id"] == p.id)
        self.assertEqual(Decimal(str(t_after["min_price"])), Decimal("2000.00"))

        # After update: GET /products/{slug} immediately reflects 2000.00
        det_after = client.get(f"/products/{p.slug}")
        self.assertEqual(det_after.headers.get("Cache-Control"), "no-cache, no-store, must-revalidate")
        det_v = det_after.json()["variants"][0]
        self.assertEqual(Decimal(str(det_v["selling_price"])), Decimal("2000.00"))

    def test_07_cart_and_checkout_use_correct_selected_size_price(self):
        """Case 7: Cart validation and checkout order creation strictly bill the selected variant price."""
        p = Product(
            name="Cart Sized Co-ord",
            slug="cart-sized-co-ord",
            category="TWO PIECES",
            subcategory="Co-ord Sets",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        v_s = ProductVariant(
            product_id=p.id,
            size="S",
            sku="CART-S",
            selling_price=Decimal("1999.00"),
            mrp=Decimal("2499.00"),
            stock=10,
            is_active=True,
        )
        v_m = ProductVariant(
            product_id=p.id,
            size="M",
            sku="CART-M",
            selling_price=Decimal("2000.00"),
            mrp=Decimal("2499.00"),
            stock=10,
            is_active=True,
        )
        self.db.add_all([v_s, v_m])
        self.db.commit()
        self.db.refresh(v_s)
        self.db.refresh(v_m)

        # 7a. Validate Cart for Size M (should be 2000.00)
        cart_res_m = client.post("/cart/validate", json={"items": [{"variant_id": v_m.id, "quantity": 1}]})
        self.assertEqual(cart_res_m.status_code, 200)
        cart_data_m = cart_res_m.json()
        self.assertTrue(cart_data_m["is_valid"])
        self.assertEqual(Decimal(str(cart_data_m["items"][0]["unit_price"])), Decimal("2000.00"))
        self.assertEqual(Decimal(str(cart_data_m["subtotal"])), Decimal("2000.00"))

        # 7b. Validate Cart for Size S (should be 1999.00)
        cart_res_s = client.post("/cart/validate", json={"items": [{"variant_id": v_s.id, "quantity": 1}]})
        self.assertEqual(cart_res_s.status_code, 200)
        cart_data_s = cart_res_s.json()
        self.assertTrue(cart_data_s["is_valid"])
        self.assertEqual(Decimal(str(cart_data_s["items"][0]["unit_price"])), Decimal("1999.00"))
        self.assertEqual(Decimal(str(cart_data_s["subtotal"])), Decimal("1999.00"))

        # 7c. Place order for Size M (authoritative price from DB must be 2000.00)
        order_payload_m = {
            "customer_name": "Test Customer",
            "phone": "9876543210",
            "email": "customer@royallibas.com",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "address": {
                "name": "Test Customer",
                "phone": "9876543210",
                "line1": "123 Boutique Lane",
                "city": "Jhansi",
                "state": "Uttar Pradesh",
                "pincode": "284001",
            },
            "items": [{"variant_id": v_m.id, "quantity": 1}],
        }
        order_res_m = client.post("/orders", json=order_payload_m)
        self.assertEqual(order_res_m.status_code, 201)
        created_order_m = order_res_m.json()
        self.assertEqual(Decimal(str(created_order_m["subtotal"])), Decimal("2000.00"))
        self.assertEqual(Decimal(str(created_order_m["items"][0]["unit_price_snapshot"])), Decimal("2000.00"))


if __name__ == "__main__":
    unittest.main()
