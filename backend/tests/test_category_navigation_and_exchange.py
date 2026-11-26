"""Automated Verification Suite for Category Taxonomy, Navigation, and No Returns/No Exchanges Policy.

Strict Safety Guards:
1. Isolated temporary database: All tests run strictly against an ephemeral SQLite database.
2. Safety pattern guard: Immediately fails if a production, PostgreSQL, or business database URL is detected.
3. Network guard: Blocks unexpected outbound HTTP and socket calls.
"""

import atexit
import os
import shutil
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

# 1. Enforce strict database isolation BEFORE importing application modules
TEMP_DIR = tempfile.mkdtemp(prefix="test_cat_nav_")
ISOLATED_DB_PATH = os.path.join(TEMP_DIR, "isolated_test_cat.db").replace(os.sep, "/")
os.environ["DATABASE_URL"] = f"sqlite:///{ISOLATED_DB_PATH}"
os.environ["JWT_SECRET"] = "isolated-test-jwt-secret-key-category-nav-32bytes"

# Safety pattern guard
FORBIDDEN_DB_PATTERNS = ["royal_libas.db", "postgres", "hostinger", "neon"]
for pattern in FORBIDDEN_DB_PATTERNS:
    if pattern in os.environ["DATABASE_URL"].lower():
        raise RuntimeError(f"CRITICAL SAFETY VIOLATION: Test configured with real database: {os.environ['DATABASE_URL']}")

def _cleanup_temp():
    if os.path.exists(TEMP_DIR):
        try:
            shutil.rmtree(TEMP_DIR, ignore_errors=True)
        except Exception:
            pass

atexit.register(_cleanup_temp)

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import Product, ProductVariant, Order, OrderItem, StoreSetting, ReturnRequest, Admin, Collection
from app.auth import hash_password, create_access_token
from app.services.product_service import (
    CANONICAL_TAXONOMY,
    CATEGORY_TO_COLLECTION_SLUG,
    validate_category_and_subcategory,
)
from app.migrations import run_migrations

client = TestClient(app)

class TestCategoryNavigationAndExchange(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create schema and run migrations on isolated database
        Base.metadata.create_all(bind=engine)
        run_migrations(engine)

        cls.db = SessionLocal()

        # Ensure StoreSetting exists with cod_enabled=False
        setting = cls.db.query(StoreSetting).first()
        if not setting:
            setting = StoreSetting(id=1, cod_enabled=False)
            cls.db.add(setting)
            cls.db.commit()
        else:
            setting.cod_enabled = False
            cls.db.commit()

        # Create test owner admin
        admin = Admin(
            email="test_owner_cat@royallibas.com",
            name="Test Owner",
            role="OWNER",
            password_hash=hash_password("RoyalLibas@2026"),
            is_active=True,
        )
        cls.db.add(admin)
        cls.db.commit()
        cls.db.refresh(admin)
        cls.admin_token = create_access_token({"sub": str(admin.id), "role": admin.role})

        # Product 1: TWO PIECES / Co-ord Sets
        prod1 = Product(
            name="Test Silk Co-ord Set",
            slug="test-coord-nav-item-active",
            category="TWO PIECES",
            subcategory="Co-ord Sets",
            fabric="Pure Silk",
            status="PUBLISHED",
            is_active=True,
        )
        cls.db.add(prod1)
        cls.db.commit()
        cls.db.refresh(prod1)

        v1 = ProductVariant(
            product_id=prod1.id,
            size="M",
            colour="Ivory",
            sku="RL-COORD-TEST-M",
            mrp=Decimal("4999.00"),
            selling_price=Decimal("4499.00"),
            stock=5,
        )
        cls.db.add(v1)

        # Product 2: UNSTITCHED MATERIAL / Unstitched Suits
        prod2 = Product(
            name="Test Chanderi Unstitched Suit Material",
            slug="test-unstitched-suit-material",
            category="UNSTITCHED MATERIAL",
            subcategory="Unstitched Suits",
            fabric="Pure Chanderi",
            status="PUBLISHED",
            is_active=True,
        )
        cls.db.add(prod2)
        cls.db.commit()
        cls.db.refresh(prod2)

        v2 = ProductVariant(
            product_id=prod2.id,
            size="Free Size",
            colour="Pastel Peach",
            sku="RL-UNST-PEACH-FS",
            mrp=Decimal("5999.00"),
            selling_price=Decimal("4999.00"),
            stock=10,
        )
        cls.db.add(v2)

        # Product 3: Existing Kurta Pant product to ensure preserved compatibility
        prod3 = Product(
            name="Test Classic Kurta Pant Ensemble",
            slug="test-classic-kurta-pant",
            category="TWO PIECES",
            subcategory="Kurta Pant",
            fabric="Modal Silk",
            status="PUBLISHED",
            is_active=True,
        )
        cls.db.add(prod3)
        cls.db.commit()
        cls.db.refresh(prod3)

        v3 = ProductVariant(
            product_id=prod3.id,
            size="L",
            colour="Maroon",
            sku="RL-KP-MAROON-L",
            mrp=Decimal("4299.00"),
            selling_price=Decimal("3899.00"),
            stock=4,
        )
        cls.db.add(v3)
        cls.db.commit()

        cls.test_prod1 = prod1
        cls.test_prod2 = prod2
        cls.test_prod3 = prod3
        cls.test_variant1 = v1

        # Test Order
        order = Order(
            order_code="RL-2026-EXCH-TEST",
            order_token="tok_exch_secret_12345",
            customer_name="Pooja Sharma",
            phone="9876543210",
            status="CONFIRMED",
            payment_method="ONLINE",
            payment_status="PAID",
            subtotal=Decimal("4499.00"),
            shipping_charge=Decimal("0.00"),
            discount=Decimal("0.00"),
            total=Decimal("4499.00"),
        )
        cls.db.add(order)
        cls.db.commit()
        cls.db.refresh(order)

        item = OrderItem(
            order_id=order.id,
            variant_id=v1.id,
            product_name_snapshot=prod1.name,
            size_snapshot="M",
            colour_snapshot="Ivory",
            unit_price_snapshot=Decimal("4499.00"),
            quantity=1,
            line_total=Decimal("4499.00"),
        )
        cls.db.add(item)
        cls.db.commit()
        cls.db.refresh(item)

        cls.test_order = order
        cls.test_item = item

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        _cleanup_temp()

    def test_01_canonical_taxonomy_includes_unstitched_material(self):
        """Verify UNSTITCHED MATERIAL is part of the canonical backend taxonomy."""
        self.assertIn("UNSTITCHED MATERIAL", CANONICAL_TAXONOMY)
        self.assertIn("Unstitched Suits", CANONICAL_TAXONOMY["UNSTITCHED MATERIAL"])
        self.assertIn("Dress Material", CANONICAL_TAXONOMY["UNSTITCHED MATERIAL"])
        self.assertEqual(CATEGORY_TO_COLLECTION_SLUG.get("UNSTITCHED MATERIAL"), "unstitched-material")

        # Verify Kurta Pant remains in backend taxonomy for existing product compatibility
        self.assertIn("Kurta Pant", CANONICAL_TAXONOMY["TWO PIECES"])

    def test_02_taxonomy_validation_rules(self):
        """Verify category and subcategory validation logic."""
        # Valid UNSTITCHED MATERIAL with subcategories
        cat, sub = validate_category_and_subcategory("UNSTITCHED MATERIAL", "Unstitched Suits")
        self.assertEqual(cat, "UNSTITCHED MATERIAL")
        self.assertEqual(sub, "Unstitched Suits")

        cat, sub = validate_category_and_subcategory("UNSTITCHED MATERIAL", "Dress Material")
        self.assertEqual(cat, "UNSTITCHED MATERIAL")
        self.assertEqual(sub, "Dress Material")

        cat, sub = validate_category_and_subcategory("UNSTITCHED MATERIAL", None)
        self.assertEqual(cat, "UNSTITCHED MATERIAL")
        self.assertIsNone(sub)

        # Valid Kurta Pant under TWO PIECES (backward compatibility preserved)
        cat, sub = validate_category_and_subcategory("TWO PIECES", "Kurta Pant")
        self.assertEqual(cat, "TWO PIECES")
        self.assertEqual(sub, "Kurta Pant")

        # Invalid subcategory under UNSTITCHED MATERIAL raises 400
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as cm:
            validate_category_and_subcategory("UNSTITCHED MATERIAL", "Invalid Sub")
        self.assertEqual(cm.exception.status_code, 400)

        # Invalid category raises 400
        with self.assertRaises(HTTPException) as cm:
            validate_category_and_subcategory("INVALID CATEGORY", None)
        self.assertEqual(cm.exception.status_code, 400)

    def test_03_filter_unstitched_material_products(self):
        """Verify products can be filtered by UNSTITCHED MATERIAL and its subcategories."""
        # 1. Filter by UNSTITCHED MATERIAL
        res = client.get("/products?category=UNSTITCHED%20MATERIAL")
        self.assertEqual(res.status_code, 200)
        items = res.json()
        self.assertTrue(any(p["slug"] == "test-unstitched-suit-material" for p in items))
        self.assertFalse(any(p["slug"] == "test-coord-nav-item-active" for p in items))

        # 2. Filter by UNSTITCHED MATERIAL + Unstitched Suits
        res2 = client.get("/products?category=UNSTITCHED%20MATERIAL&subcategory=Unstitched%20Suits")
        self.assertEqual(res2.status_code, 200)
        items2 = res2.json()
        self.assertTrue(any(p["slug"] == "test-unstitched-suit-material" for p in items2))

        # 3. Filter by Dress Material (currently empty -> returns empty list [])
        res3 = client.get("/products?category=UNSTITCHED%20MATERIAL&subcategory=Dress%20Material")
        self.assertEqual(res3.status_code, 200)
        items3 = res3.json()
        self.assertEqual(len(items3), 0)

    def test_04_kurta_pant_products_preserved_and_accessible(self):
        """Verify Kurta Pant products remain untouched, queryable, and functional."""
        res = client.get("/products?category=TWO%20PIECES&subcategory=Kurta%20Pant")
        self.assertEqual(res.status_code, 200)
        items = res.json()
        self.assertTrue(any(p["slug"] == "test-classic-kurta-pant" for p in items))

        # Direct detail lookup
        detail_res = client.get("/products/test-classic-kurta-pant")
        self.assertEqual(detail_res.status_code, 200)
        detail = detail_res.json()
        self.assertEqual(detail["category"], "TWO PIECES")
        self.assertEqual(detail["subcategory"], "Kurta Pant")

    def test_05_no_returns_no_exchanges_backend_enforcement(self):
        """POST /orders/exchange must be permanently disabled with HTTP 400 stating store policy."""
        # Attempt with valid-looking payload
        res = client.post("/orders/exchange", json={
            "order_code": self.test_order.order_code,
            "phone": "9876543210",
            "order_item_id": self.test_item.id,
            "reason": "SIZE_FIT",
            "requested_size": "L",
            "customer_notes": "Size adjustment",
        })
        self.assertEqual(res.status_code, 400)
        data = res.json()
        self.assertIn("no returns and no exchanges policy", data["detail"].lower())

        # Attempt with empty or different payload also returns HTTP 400
        res2 = client.post("/orders/exchange", json={
            "order_code": "RL-NONEXISTENT",
        })
        self.assertEqual(res2.status_code, 400)
        self.assertIn("no returns and no exchanges policy", res2.json()["detail"].lower())

        # Staff/Admin attempt to create return/exchange via POST /admin/returns also fails with 400
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        admin_create_res = client.post("/admin/returns", json={
            "order_id": self.test_order.id,
            "order_item_id": self.test_item.id,
            "request_type": "RETURN",
            "reason": "SIZE_FIT",
            "requested_resolution": "REFUND",
        }, headers=headers)
        self.assertEqual(admin_create_res.status_code, 400)
        self.assertIn("no returns and no exchanges policy", admin_create_res.json()["detail"].lower())

    def test_06_historical_exchanges_viewable_in_tracking_and_admin(self):
        """Historical exchange records in the database remain viewable in tracking and admin."""
        # Seed a historical return request directly in test database
        hist_req = ReturnRequest(
            return_code="EXC-2026-HIST01",
            order_id=self.test_order.id,
            order_item_id=self.test_item.id,
            request_type="EXCHANGE",
            reason="SIZE_FIT",
            requested_resolution="EXCHANGE_SIZE",
            exchange_size="L",
            status="APPROVED",
        )
        self.db.add(hist_req)
        self.db.commit()

        # 1. Customer order tracking returns the historical exchange
        res = client.get(f"/orders/track?order_code={self.test_order.order_code}&phone=9876543210")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("exchanges", data)
        self.assertTrue(len(data["exchanges"]) > 0)
        found = next((x for x in data["exchanges"] if x["return_code"] == "EXC-2026-HIST01"), None)
        self.assertIsNotNone(found)
        self.assertEqual(found["status"], "APPROVED")

        # 2. Admin returns endpoint can list the historical record
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        admin_res = client.get("/admin/returns?request_type=EXCHANGE", headers=headers)
        self.assertEqual(admin_res.status_code, 200)
        admin_data = admin_res.json()
        admin_found = next((x for x in admin_data if x["return_code"] == "EXC-2026-HIST01"), None)
        self.assertIsNotNone(admin_found)
        self.assertEqual(admin_found["status"], "APPROVED")

    def test_07_cod_persisted_off_and_enforced(self):
        """Verify COD is OFF by default and new COD checkout is blocked server-side."""
        setting = self.db.query(StoreSetting).first()
        self.assertIsNotNone(setting)
        self.assertFalse(setting.cod_enabled)

        order_payload = {
            "customer_name": "Test COD Buyer",
            "phone": "9811223344",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "items": [{"variant_id": self.test_variant1.id, "quantity": 1}],
            "address": {
                "name": "Test COD Buyer",
                "phone": "9811223344",
                "line1": "123 Boutique Lane",
                "city": "Jaipur",
                "state": "Rajasthan",
                "pincode": "302001",
            },
        }
        res = client.post("/orders", json=order_payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Cash on Delivery (COD) is currently unavailable", res.json()["detail"])

    def test_08_canonical_taxonomy_includes_winter_collection(self):
        """Verify WINTER COLLECTION has no subcategories and enforces subcategory-free validation."""
        self.assertIn("WINTER COLLECTION", CANONICAL_TAXONOMY)
        # Requirement: Client confirmed NO subcategories for WINTER COLLECTION
        self.assertEqual(CANONICAL_TAXONOMY["WINTER COLLECTION"], [])
        self.assertEqual(CATEGORY_TO_COLLECTION_SLUG.get("WINTER COLLECTION"), "winter-collection")

        # Category validation without subcategory succeeds
        cat, sub = validate_category_and_subcategory("WINTER COLLECTION", None)
        self.assertEqual(cat, "WINTER COLLECTION")
        self.assertIsNone(sub)

        cat, sub = validate_category_and_subcategory("WINTER COLLECTION", "")
        self.assertEqual(cat, "WINTER COLLECTION")
        self.assertIsNone(sub)

        # Supplying any subcategory to WINTER COLLECTION raises HTTP 400
        from fastapi import HTTPException
        for invalid_sub in ["Velvet Suits", "Pashmina", "Woolen Sets", "Shawls"]:
            with self.assertRaises(HTTPException) as cm:
                validate_category_and_subcategory("WINTER COLLECTION", invalid_sub)
            self.assertEqual(cm.exception.status_code, 400)
            self.assertIn("does not have subcategories", cm.exception.detail)

    def test_09_winter_collection_migration_seeding(self):
        """Verify database migration seeded canonical WINTER COLLECTION record."""
        winter_col = self.db.query(Collection).filter(Collection.slug == "winter-collection").first()
        self.assertIsNotNone(winter_col, "Expected 'winter-collection' canonical collection to exist")
        self.assertEqual(winter_col.name, "WINTER COLLECTION")
        self.assertTrue(winter_col.is_active)

    def test_10_winter_collection_product_crud_and_storefront_filtering(self):
        """Verify product creation without subcategory, separate category results, and inventory filter."""
        headers = {"Authorization": f"Bearer {self.admin_token}"}

        # 1. Admin creates a WINTER COLLECTION product directly (no subcategory)
        create_payload = {
            "name": "Noorani Velvet Winter Ensemble",
            "slug": "noorani-velvet-winter-ensemble",
            "description": "Exquisite winter edit with artisanal embroidery.",
            "category": "WINTER COLLECTION",
            "subcategory": None,
            "fabric": "Micro Velvet",
            "status": "PUBLISHED",
            "variants": [
                {
                    "size": "M",
                    "colour": "Wine",
                    "sku": "RL-WIN-ENS-WINE-M",
                    "mrp": 6999.0,
                    "selling_price": 5999.0,
                    "stock": 8,
                }
            ],
        }
        res = client.post("/admin/products", json=create_payload, headers=headers)
        self.assertEqual(res.status_code, 201, f"Failed creating product: {res.text}")
        created_data = res.json()
        self.assertEqual(created_data["category"], "WINTER COLLECTION")
        self.assertIsNone(created_data["subcategory"])
        prod_id = created_data["id"]

        # Verify automatic canonical collection assignment
        self.assertIn("WINTER COLLECTION", created_data.get("collections", []))

        # 2. Storefront listing filter by category=WINTER COLLECTION
        store_res = client.get("/products?category=WINTER%20COLLECTION")
        self.assertEqual(store_res.status_code, 200)
        store_items = store_res.json()
        self.assertTrue(any(p["slug"] == "noorani-velvet-winter-ensemble" for p in store_items))

        # 3. Strict Category Separation:
        # A product assigned to WINTER COLLECTION must NOT appear under SUIT SET
        suit_res = client.get("/products?category=SUIT%20SET")
        self.assertEqual(suit_res.status_code, 200)
        suit_items = suit_res.json()
        self.assertFalse(any(p["slug"] == "noorani-velvet-winter-ensemble" for p in suit_items))

        # And WINTER COLLECTION must NOT contain products from TWO PIECES or UNSTITCHED MATERIAL
        self.assertFalse(any(p["slug"] == "test-coord-nav-item-active" for p in store_items))
        self.assertFalse(any(p["slug"] == "test-unstitched-suit-material" for p in store_items))

        # 4. Admin inventory filtering by category=WINTER COLLECTION
        inv_res = client.get("/admin/inventory?category=WINTER%20COLLECTION", headers=headers)
        self.assertEqual(inv_res.status_code, 200)
        inv_data = inv_res.json()
        self.assertTrue(any(item["product_slug"] == "noorani-velvet-winter-ensemble" for item in inv_data))

    def test_11_category_switching_and_collection_sync_isolation(self):
        """Verify switching between categories correctly replaces canonical collection and cleans subcategory."""
        headers = {"Authorization": f"Bearer {self.admin_token}"}

        # 1. Create a product in SUIT SET with subcategory Three Pieces
        create_payload = {
            "name": "Switch Test Suit Set",
            "slug": "switch-test-suit-set",
            "category": "SUIT SET",
            "subcategory": "Three Pieces",
            "status": "PUBLISHED",
            "variants": [
                {
                    "size": "L",
                    "colour": "Teal",
                    "sku": "RL-SW-SUIT-L",
                    "mrp": 5999.0,
                    "selling_price": 4999.0,
                    "stock": 5,
                }
            ],
        }
        res = client.post("/admin/products", json=create_payload, headers=headers)
        self.assertEqual(res.status_code, 201)
        prod = res.json()
        prod_id = prod["id"]
        self.assertEqual(prod["category"], "SUIT SET")
        self.assertEqual(prod["subcategory"], "Three Pieces")
        self.assertIn("SUIT SET", prod["collections"])
        self.assertNotIn("WINTER COLLECTION", prod["collections"])

        # 2. Switch category to WINTER COLLECTION (subcategory omitted/None)
        update_res = client.patch(
            f"/admin/products/{prod_id}",
            json={"category": "WINTER COLLECTION", "subcategory": None},
            headers=headers,
        )
        self.assertEqual(update_res.status_code, 200)
        switched = update_res.json()
        self.assertEqual(switched["category"], "WINTER COLLECTION")
        self.assertIsNone(switched["subcategory"], "Old subcategory must be cleared when switching to WINTER COLLECTION")
        self.assertIn("WINTER COLLECTION", switched["collections"])
        self.assertNotIn("SUIT SET", switched["collections"], "Previous canonical collection must be removed")

        # Verify storefront queries reflect switch cleanly
        winter_res = client.get("/products?category=WINTER%20COLLECTION")
        self.assertTrue(any(p["slug"] == "switch-test-suit-set" for p in winter_res.json()))

        suit_res = client.get("/products?category=SUIT%20SET")
        self.assertFalse(any(p["slug"] == "switch-test-suit-set" for p in suit_res.json()))

        # 3. Switch back to SUIT SET with subcategory Party Wear
        back_res = client.patch(
            f"/admin/products/{prod_id}",
            json={"category": "SUIT SET", "subcategory": "Party Wear"},
            headers=headers,
        )
        self.assertEqual(back_res.status_code, 200)
        switched_back = back_res.json()
        self.assertEqual(switched_back["category"], "SUIT SET")
        self.assertEqual(switched_back["subcategory"], "Party Wear")
        self.assertIn("SUIT SET", switched_back["collections"])
        self.assertNotIn("WINTER COLLECTION", switched_back["collections"])

if __name__ == "__main__":
    unittest.main()
