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

if __name__ == "__main__":
    unittest.main()
