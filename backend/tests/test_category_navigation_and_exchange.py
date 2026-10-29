import sys
from pathlib import Path
import unittest
from decimal import Decimal
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app
from app.database import SessionLocal, engine
from app.models import Product, ProductVariant, Order, OrderItem, StoreSetting, ReturnRequest, Admin
from app.auth import hash_password, create_access_token

client = TestClient(app)

class TestCategoryNavigationAndExchange(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        # Ensure owner admin exists
        admin = cls.db.query(Admin).filter(Admin.email == "test_owner_cat@royallibas.com").first()
        if not admin:
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

        # Ensure a test product with category TWO PIECES and subcategory Co-ord Sets
        prod = cls.db.query(Product).filter(Product.slug == "test-coord-nav-item").first()
        if not prod:
            prod = Product(
                name="Test Silk Co-ord Set",
                slug="test-coord-nav-item",
                category="TWO PIECES",
                subcategory="Co-ord Sets",
                fabric="Pure Silk",
                status="PUBLISHED",
                is_active=True,
            )
            cls.db.add(prod)
            cls.db.commit()
            cls.db.refresh(prod)
            variant = ProductVariant(
                product_id=prod.id,
                size="M",
                colour="Ivory",
                sku="RL-COORD-TEST-M",
                mrp=Decimal("4999.00"),
                selling_price=Decimal("4499.00"),
                stock=5,
            )
            cls.db.add(variant)
            cls.db.commit()
        cls.test_product = prod

        # Ensure a test order for exchange testing
        order = cls.db.query(Order).filter(Order.order_code == "RL-2026-EXCH-TEST").first()
        if not order:
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
                variant_id=prod.variants[0].id if prod.variants else None,
                product_name_snapshot=prod.name,
                size_snapshot="M",
                colour_snapshot="Ivory",
                unit_price_snapshot=Decimal("4499.00"),
                quantity=1,
                line_total=Decimal("4499.00"),
            )
            cls.db.add(item)
            cls.db.commit()
            cls.db.refresh(item)
            cls.test_item = item
        else:
            cls.test_item = order.items[0] if order.items else None
        cls.test_order = order

    @classmethod
    def tearDownClass(cls):
        # Clean up created return requests for test order
        cls.db.query(ReturnRequest).filter(ReturnRequest.order_id == cls.test_order.id).delete()
        cls.db.commit()
        cls.db.close()

    def test_01_product_category_and_subcategory_filter(self):
        """Test filtering products by category and subcategory."""
        # 1. Filter by category
        res = client.get("/products?category=TWO%20PIECES")
        self.assertEqual(res.status_code, 200)
        items = res.json()
        self.assertTrue(any(p["slug"] == "test-coord-nav-item" for p in items))

        # 2. Filter by both category and subcategory
        res2 = client.get("/products?category=TWO%20PIECES&subcategory=Co-ord%20Sets")
        self.assertEqual(res2.status_code, 200)
        items2 = res2.json()
        self.assertTrue(any(p["slug"] == "test-coord-nav-item" for p in items2))
        for p in items2:
            if p["slug"] == "test-coord-nav-item":
                self.assertEqual(p["category"], "TWO PIECES")
                self.assertEqual(p["subcategory"], "Co-ord Sets")

        # 3. Filter with non-matching subcategory should not return it
        res3 = client.get("/products?category=TWO%20PIECES&subcategory=Kurta%20Pant")
        self.assertEqual(res3.status_code, 200)
        items3 = res3.json()
        self.assertFalse(any(p["slug"] == "test-coord-nav-item" for p in items3))

    def test_02_exchange_verification_rules(self):
        """Test customer exchange request authorization and security rules."""
        # Attempt without phone or token -> 400
        res = client.post("/orders/exchange", json={
            "order_code": self.test_order.order_code,
            "reason": "SIZE_FIT",
            "requested_size": "L",
        })
        self.assertEqual(res.status_code, 400)

        # Attempt with incorrect phone number -> 404 (anti-enumeration)
        res2 = client.post("/orders/exchange", json={
            "order_code": self.test_order.order_code,
            "phone": "9999999999",
            "reason": "SIZE_FIT",
            "requested_size": "L",
        })
        self.assertEqual(res2.status_code, 404)

        # Attempt with valid phone number -> 200 SUCCESS
        res3 = client.post("/orders/exchange", json={
            "order_code": self.test_order.order_code,
            "phone": "9876543210",
            "order_item_id": self.test_item.id if self.test_item else None,
            "reason": "SIZE_FIT",
            "requested_size": "L",
            "customer_notes": "Chest is slightly snug, need size L please.",
        })
        self.assertEqual(res3.status_code, 200)
        data = res3.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "REQUESTED")
        self.assertIn("Exchange requests are reviewed by our team", data["message"])
        self.assertTrue(data["return_code"].startswith("EXC-2026-"))

        # Duplicate active request should be rejected -> 400
        res4 = client.post("/orders/exchange", json={
            "order_code": self.test_order.order_code,
            "phone": "9876543210",
            "order_item_id": self.test_item.id if self.test_item else None,
            "reason": "SIZE_FIT",
            "requested_size": "L",
        })
        self.assertEqual(res4.status_code, 400)
        self.assertIn("already pending review", res4.json()["detail"])

    def test_03_order_tracking_reflects_exchange(self):
        """Customer order tracking should reflect the pending exchange request."""
        res = client.get(f"/orders/track?order_code={self.test_order.order_code}&phone=9876543210")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("exchanges", data)
        self.assertTrue(len(data["exchanges"]) > 0)
        exch = data["exchanges"][0]
        self.assertEqual(exch["status"], "REQUESTED")
        self.assertEqual(exch["request_type"], "EXCHANGE")
        self.assertEqual(exch["requested_size"], "L")

    def test_04_admin_can_view_and_update_exchange(self):
        """Admin can list exchange requests and update status."""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        res = client.get("/admin/returns?request_type=EXCHANGE", headers=headers)
        self.assertEqual(res.status_code, 200)
        exchanges = res.json()
        target = next((e for e in exchanges if e["order_code"] == self.test_order.order_code), None)
        self.assertIsNotNone(target)
        self.assertEqual(target["status"], "REQUESTED")
        self.assertEqual(target["exchange_size"], "L")

        # Admin approves exchange
        patch_res = client.patch(
            f"/admin/returns/{target['id']}/status",
            headers=headers,
            json={
                "status": "APPROVED",
                "staff_notes": "Exchange approved. Customer requested size L.",
            },
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["status"], "APPROVED")

    def test_05_cod_persisted_off_and_enforced(self):
        """Verify COD is OFF by default and new COD checkout is blocked server-side."""
        setting = self.db.query(StoreSetting).first()
        self.assertIsNotNone(setting)
        self.assertFalse(setting.cod_enabled)

        # Direct attempt to place COD order must fail with HTTP 400
        order_payload = {
            "customer_name": "Test COD Buyer",
            "phone": "9811223344",
            "payment_method": "COD",
            "shipping_method": "STANDARD",
            "items": [{"variant_id": self.test_product.variants[0].id, "quantity": 1}],
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
