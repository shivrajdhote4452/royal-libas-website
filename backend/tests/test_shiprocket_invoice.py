"""Automated Verification Suite for Shiprocket Invoice Download & Fulfillment Flow.

Tests:
1. Shiprocket Service `generate_invoice`:
   - Valid invoice PDF response (passes Shiprocket order ID in payload `ids: [id]`).
   - Handles `not_created` list failures with descriptive 400 error.
   - Validates returned URL format (blocks non-HTTP/malformed URLs).
2. Admin Fulfillment Invoice API (`POST /admin/orders/{id}/fulfillment/invoice`):
   - Rejects unauthenticated requests with 401.
   - Returns 404 for non-existent orders.
   - Returns 400 when order has not yet been shipped via Shiprocket (requires "Ship via Shiprocket" first).
   - Successfully generates, returns, and persists `order.invoice_url` in DB.
3. Invoice Retrieval & Regeneration (`GET /admin/orders/{id}/fulfillment/invoice`):
   - Returns stored invoice URL or regenerates when `regenerate=true`.
4. Idempotency & Safety:
   - Invoice generation does NOT call `create_order` or `assign_awb` or duplicate shipments.
5. Shipping Label Retry (`POST /admin/orders/{id}/fulfillment/label`):
   - Generates and persists label when shipment_id exists.
6. Address validation:
   - Incomplete shipping address is caught and rejected before calling Shiprocket.
"""

import os
import sys
import shutil
import tempfile
import unittest
from decimal import Decimal
from unittest.mock import patch, MagicMock

# 1. Enforce strict database isolation
TEMP_DIR = tempfile.mkdtemp(prefix="test_shiprocket_inv_")
ISOLATED_DB_PATH = os.path.join(TEMP_DIR, "isolated_test_shiprocket.db")
os.environ["DATABASE_URL"] = f"sqlite:///{ISOLATED_DB_PATH.replace(os.sep, '/')}"
os.environ["JWT_SECRET"] = "isolated-test-jwt-secret-key-shiprocket-invoice-32bytes"
os.environ["SHIPROCKET_API_EMAIL"] = "test@royallibas.com"
os.environ["SHIPROCKET_API_PASSWORD"] = "test_shiprocket_password"

FORBIDDEN_DB_PATTERNS = ["royal_libas.db", "postgres", "hostinger", "neon"]
for pattern in FORBIDDEN_DB_PATTERNS:
    if pattern in os.environ["DATABASE_URL"].lower():
        raise RuntimeError(f"CRITICAL SAFETY VIOLATION: Test configured with real database: {os.environ['DATABASE_URL']}")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import Admin, Order, OrderItem, Address
from app.auth import hash_password, create_access_token
from app.services import shiprocket


class TestShiprocketInvoice(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

        # Create isolated test admin
        db = SessionLocal()
        try:
            cls.admin = Admin(
                email="test_shiprocket_admin@test.local",
                password_hash=hash_password("SafeTestPassword123!"),
                role="OWNER",
                is_active=True,
            )
            db.add(cls.admin)
            db.commit()
            db.refresh(cls.admin)
            cls.admin_token = create_access_token(
                {"sub": str(cls.admin.id), "email": cls.admin.email, "role": cls.admin.role}
            )
        finally:
            db.close()

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        shutil.rmtree(TEMP_DIR, ignore_errors=True)

    def setUp(self):
        self.db = SessionLocal()
        # Clean existing test orders
        self.db.query(OrderItem).delete()
        self.db.query(Address).delete()
        self.db.query(Order).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _create_sample_order(self, shiprocket_order_id=None, shipment_id=None, awb_code=None, label_url=None, invoice_url=None):
        order = Order(
            order_code=f"RL-TEST-{os.urandom(3).hex().upper()}",
            customer_name="Pooja Sharma",
            phone="9876543210",
            status="PLACED",
            payment_method="PREPAID",
            payment_status="PAID",
            subtotal=Decimal("4999.00"),
            shipping_charge=Decimal("0.00"),
            discount=Decimal("0.00"),
            total=Decimal("4999.00"),
            shiprocket_order_id=shiprocket_order_id,
            shipment_id=shipment_id,
            awb_code=awb_code,
            label_url=label_url,
            invoice_url=invoice_url,
        )
        self.db.add(order)
        self.db.flush()

        addr = Address(
            order_id=order.id,
            name="Pooja Sharma",
            phone="9876543210",
            line1="Flat 402, Royal Palms",
            line2="Palasia",
            city="Indore",
            state="Madhya Pradesh",
            pincode="452001",
        )
        self.db.add(addr)

        item = OrderItem(
            order_id=order.id,
            product_name_snapshot="Noor Velvet Suit Set",
            size_snapshot="M",
            quantity=1,
            unit_price_snapshot=Decimal("4999.00"),
            line_total=Decimal("4999.00"),
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(order)
        return order

    # -------------------------------------------------------------
    # 1. Shiprocket Service Tests
    # -------------------------------------------------------------
    @patch("app.services.shiprocket._shiprocket_request")
    def test_shiprocket_service_generate_invoice_success(self, mock_sr_request):
        """Service passes Shiprocket order ID in ids array and extracts clean invoice URL."""
        mock_sr_request.return_value = {
            "is_invoice_created": True,
            "invoice_url": "https://kr-shipmultichannel.s3.ap-southeast-1.amazonaws.com/invoices/inv_998877.pdf",
            "not_created": [],
        }

        res = shiprocket.generate_invoice(998877)
        mock_sr_request.assert_called_once_with("POST", "/orders/print/invoice", json_data={"ids": [998877]})
        self.assertTrue(res["is_invoice_created"])
        self.assertEqual(res["invoice_url"], "https://kr-shipmultichannel.s3.ap-southeast-1.amazonaws.com/invoices/inv_998877.pdf")

    @patch("app.services.shiprocket._shiprocket_request")
    def test_shiprocket_service_generate_invoice_not_created_failure(self, mock_sr_request):
        """Service detects not_created list and raises 400 HTTPException."""
        mock_sr_request.return_value = {
            "is_invoice_created": False,
            "not_created": [998877],
            "message": "Order invoice not created yet",
        }

        with self.assertRaises(Exception) as ctx:
            shiprocket.generate_invoice(998877)
        self.assertIn("Shiprocket invoice generation failed", str(ctx.exception))

    @patch("app.services.shiprocket._shiprocket_request")
    def test_shiprocket_service_generate_invoice_invalid_url(self, mock_sr_request):
        """Service rejects malformed or non-HTTP invoice URLs."""
        mock_sr_request.return_value = {
            "is_invoice_created": True,
            "invoice_url": "ftp://malicious.server/test.pdf",
        }

        with self.assertRaises(Exception) as ctx:
            shiprocket.generate_invoice(998877)
        self.assertIn("malformed or non-HTTP", str(ctx.exception))

    # -------------------------------------------------------------
    # 2. Admin API Invoice Tests
    # -------------------------------------------------------------
    def test_api_generate_invoice_unauthorized(self):
        """Requests without admin token are rejected with 401."""
        order = self._create_sample_order(shiprocket_order_id="SR-99999")
        resp = self.client.post(f"/admin/orders/{order.id}/fulfillment/invoice")
        self.assertEqual(resp.status_code, 401)

    def test_api_generate_invoice_order_not_found(self):
        """Requests for non-existent order return 404."""
        resp = self.client.post(
            "/admin/orders/999999/fulfillment/invoice",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(resp.status_code, 404)

    def test_api_generate_invoice_missing_shiprocket_order_id(self):
        """Orders not yet booked via Shiprocket reject invoice generation with clear guidance."""
        order = self._create_sample_order(shiprocket_order_id=None)
        resp = self.client.post(
            f"/admin/orders/{order.id}/fulfillment/invoice",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Ship via Shiprocket", resp.json()["detail"])

    @patch("app.services.shiprocket.is_shiprocket_configured", return_value=True)
    @patch("app.services.shiprocket._shiprocket_request")
    def test_api_generate_invoice_success_and_db_persistence(self, mock_sr_request, mock_configured):
        """Successful generation returns InvoiceResponse and persists invoice_url on the order."""
        order = self._create_sample_order(shiprocket_order_id="1234567")
        self.assertIsNone(order.invoice_url)

        fake_url = "https://kr-shipmultichannel.s3.ap-southeast-1.amazonaws.com/invoices/inv_1234567.pdf"
        mock_sr_request.return_value = {
            "is_invoice_created": True,
            "invoice_url": fake_url,
            "not_created": [],
        }

        resp = self.client.post(
            f"/admin/orders/{order.id}/fulfillment/invoice",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["order_id"], order.id)
        self.assertEqual(data["order_code"], order.order_code)
        self.assertEqual(data["shiprocket_order_id"], "1234567")
        self.assertEqual(data["invoice_url"], fake_url)

        # Verify DB persistence
        self.db.expire_all()
        reloaded = self.db.query(Order).filter(Order.id == order.id).first()
        self.assertEqual(reloaded.invoice_url, fake_url)

    # -------------------------------------------------------------
    # 3. Invoice Retrieval & Regeneration
    # -------------------------------------------------------------
    @patch("app.services.shiprocket.is_shiprocket_configured", return_value=True)
    @patch("app.services.shiprocket._shiprocket_request")
    def test_api_get_invoice_retrieval_and_regeneration(self, mock_sr_request, mock_configured):
        """GET /orders/{id}/fulfillment/invoice returns stored URL or regenerates when requested."""
        saved_url = "https://kr-shipmultichannel.s3.ap-southeast-1.amazonaws.com/invoices/saved_inv.pdf"
        order = self._create_sample_order(shiprocket_order_id="55555", invoice_url=saved_url)

        # Fast GET without regenerate returns saved_url without calling Shiprocket
        resp = self.client.get(
            f"/admin/orders/{order.id}/fulfillment/invoice",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["invoice_url"], saved_url)
        mock_sr_request.assert_not_called()

        # GET with ?regenerate=true calls Shiprocket for fresh URL
        fresh_url = "https://kr-shipmultichannel.s3.ap-southeast-1.amazonaws.com/invoices/fresh_inv.pdf"
        mock_sr_request.return_value = {
            "is_invoice_created": True,
            "invoice_url": fresh_url,
            "not_created": [],
        }
        resp = self.client.get(
            f"/admin/orders/{order.id}/fulfillment/invoice?regenerate=true",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["invoice_url"], fresh_url)
        mock_sr_request.assert_called_once()

    # -------------------------------------------------------------
    # 4. Idempotency & Safety: No duplicate order/shipment creation
    # -------------------------------------------------------------
    @patch("app.services.shiprocket.is_shiprocket_configured", return_value=True)
    @patch("app.services.shiprocket.create_order")
    @patch("app.services.shiprocket.assign_awb")
    @patch("app.services.shiprocket.generate_invoice")
    def test_invoice_does_not_create_duplicate_orders_or_shipments(
        self, mock_gen_inv, mock_assign_awb, mock_create_order, mock_configured
    ):
        """Calling invoice endpoint never calls create_order or assign_awb."""
        order = self._create_sample_order(shiprocket_order_id="778899")
        mock_gen_inv.return_value = {
            "invoice_url": "https://kr-shipmultichannel.s3.ap-southeast-1.amazonaws.com/inv.pdf",
            "is_invoice_created": True,
        }

        resp = self.client.post(
            f"/admin/orders/{order.id}/fulfillment/invoice",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        mock_create_order.assert_not_called()
        mock_assign_awb.assert_not_called()

    # -------------------------------------------------------------
    # 5. Label Retry API
    # -------------------------------------------------------------
    @patch("app.services.shiprocket.is_shiprocket_configured", return_value=True)
    @patch("app.services.shiprocket.generate_label")
    def test_api_retry_label_success(self, mock_gen_label, mock_configured):
        """Retrying label generation for order with shipment_id succeeds and updates order."""
        order = self._create_sample_order(shipment_id="SH-8888")
        mock_gen_label.return_value = {
            "label_url": "https://shiprocket.co/label/SH-8888.pdf",
        }

        resp = self.client.post(
            f"/admin/orders/{order.id}/fulfillment/label",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["label_url"], "https://shiprocket.co/label/SH-8888.pdf")

    # -------------------------------------------------------------
    # 6. Address Validation on Shipment
    # -------------------------------------------------------------
    @patch("app.services.shiprocket.is_shiprocket_configured", return_value=True)
    def test_shipping_order_with_incomplete_address_fails_safely(self, mock_configured):
        """Booking shipment without valid address line1 and pincode is rejected."""
        order = self._create_sample_order()
        # Blank out line1
        addr = self.db.query(Address).filter(Address.order_id == order.id).first()
        addr.line1 = ""
        self.db.commit()

        resp = self.client.post(
            f"/admin/orders/{order.id}/fulfillment/ship",
            headers={"Authorization": f"Bearer {self.admin_token}"},
            json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("shipping address is incomplete", resp.json()["detail"])


if __name__ == "__main__":
    unittest.main()
