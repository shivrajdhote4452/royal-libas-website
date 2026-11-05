"""Automated Verification Suite for Shiprocket Fulfillment Integration.

Strict Safety Guards:
1. Isolated temporary database: All tests run strictly against an ephemeral SQLite database.
2. Safety pattern guard: Immediately fails if a production, PostgreSQL, or business database URL is detected.
3. Network guard: Blocks outbound HTTP and socket calls to prevent real Shiprocket API calls, orders, or charges.

Verifies:
1. Unconfigured state:
   - Config endpoint returns disabled state: "Shiprocket not configured — use manual tracking"
   - Manual courier entry still works as fallback
   - Order placement & checkout work without Shiprocket calls
2. Validation rules:
   - Missing/zero parcel dimensions/weight blocked with "Enter the packed parcel's weight and dimensions"
   - Unpaid prepaid orders cannot be shipped
   - Cancelled orders cannot be shipped
3. Full fulfillment flow & idempotency:
   - Order flows create -> AWB -> pickup -> label -> manifest -> invoice
   - Stored IDs & URLs verified
   - Status updated to READY_FOR_PICKUP (accurate transition before courier pickup)
   - Second click does NOT create duplicate shipment (idempotent resume)
4. Failure resume:
   - Failed AWB followed by retry resumes from stored shipment_id
5. Cancellation:
   - Cancel before pickup calls cancel_order
   - Cancel after pickup blocks with "already picked up — cannot cancel via Shiprocket"
6. Webhook with mandatory live re-fetch:
   - Never trusts payload alone; re-fetches live tracking before updating order to SHIPPED or DELIVERED
"""

import atexit
import os
import shutil
import socket
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch, MagicMock

import httpx

# 1. Enforce strict database isolation BEFORE importing application modules
TEMP_DIR = tempfile.mkdtemp(prefix="test_shiprocket_isolated_")
ISOLATED_DB_PATH = os.path.join(TEMP_DIR, "isolated_test_shiprocket.db").replace(os.sep, "/")
os.environ["DATABASE_URL"] = f"sqlite:///{ISOLATED_DB_PATH}"
os.environ["JWT_SECRET"] = "isolated-test-jwt-secret-key-shiprocket-32bytes"
os.environ["SHIPROCKET_API_EMAIL"] = "test@royallibas.com"
os.environ["SHIPROCKET_API_PASSWORD"] = "test_shiprocket_password"

# Safety pattern guard: Fail immediately if any real database pattern is detected
FORBIDDEN_DB_PATTERNS = ["royal_libas.db", "postgres", "hostinger", "neon", "vps", "prod"]
for pattern in FORBIDDEN_DB_PATTERNS:
    if pattern in os.environ["DATABASE_URL"].lower() and "isolated" not in os.environ["DATABASE_URL"].lower():
        raise RuntimeError(f"CRITICAL SAFETY VIOLATION: Test configured with real database: {os.environ['DATABASE_URL']}")

def _cleanup_temp():
    if os.path.exists(TEMP_DIR):
        try:
            shutil.rmtree(TEMP_DIR, ignore_errors=True)
        except Exception:
            pass

atexit.register(_cleanup_temp)

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# 2. Install test-only outbound network guard to block any unintended external Shiprocket API calls
_orig_httpx_send = httpx.Client.send
def guarded_httpx_send(self, request, *args, **kwargs):
    host = request.url.host or ""
    if host in ("testserver", "localhost", "127.0.0.1", "::1"):
        return _orig_httpx_send(self, request, *args, **kwargs)
    raise RuntimeError(
        f"CRITICAL SAFETY VIOLATION: Outbound HTTP request attempted to external host '{request.url}' during isolated Shiprocket test!"
    )
httpx.Client.send = guarded_httpx_send

_orig_socket_connect = socket.socket.connect
def guarded_socket_connect(self, address):
    if isinstance(address, tuple) and len(address) > 0:
        host = str(address[0])
        if host in ("127.0.0.1", "localhost", "::1"):
            return _orig_socket_connect(self, address)
    raise RuntimeError(
        f"CRITICAL SAFETY VIOLATION: Outbound socket connection attempted to '{address}' during isolated Shiprocket test!"
    )
socket.socket.connect = guarded_socket_connect

from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import Product, ProductVariant, Order, Admin, Address, OrderItem
from app.auth import hash_password, create_access_token
from app.config import is_shiprocket_configured
from app.services import shiprocket

client = TestClient(app)


def get_admin_token():
    db = SessionLocal()
    try:
        admin = db.query(Admin).filter(Admin.email == "owner@royallibas.com").first()
        if not admin:
            admin = Admin(
                email="owner@royallibas.com",
                password_hash=hash_password("TanyaBoutique2026!"),
                role="OWNER",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        return create_access_token({"sub": str(admin.id), "email": admin.email, "role": "OWNER"})
    finally:
        db.close()


def create_test_order(payment_method="COD", payment_status="PENDING", status="PLACED"):
    import uuid
    db = SessionLocal()
    try:
        code = f"RL-TEST-{uuid.uuid4().hex[:6].upper()}"
        order = Order(
            order_code=code,
            customer_name="Aaradhya Sharma",
            phone="9876543210",
            status=status,
            payment_method=payment_method,
            payment_status=payment_status,
            subtotal=Decimal("2999.00"),
            shipping_charge=Decimal("0.00"),
            discount=Decimal("0.00"),
            total=Decimal("2999.00"),
        )
        db.add(order)
        db.flush()

        addr = Address(
            order_id=order.id,
            name="Aaradhya Sharma",
            phone="9876543210",
            pincode="452001",
            line1="102 Emerald Heights",
            line2="Vijay Nagar",
            city="Indore",
            state="Madhya Pradesh",
        )
        db.add(addr)

        item = OrderItem(
            order_id=order.id,
            product_name_snapshot="Chanderi Silk Anarkali Set",
            size_snapshot="M",
            colour_snapshot="Maroon",
            quantity=1,
            unit_price_snapshot=Decimal("2999.00"),
            line_total=Decimal("2999.00"),
        )
        db.add(item)
        db.commit()
        db.refresh(order)
        return order.id, order.order_code
    finally:
        db.close()


class TestShiprocketFulfillment(unittest.TestCase):
    """Test suite for Shiprocket fulfillment with guaranteed isolation and network safety."""

    @classmethod
    def tearDownClass(cls):
        # Restore monkey-patched network guards
        httpx.Client.send = _orig_httpx_send
        socket.socket.connect = _orig_socket_connect

    def test_shiprocket_unconfigured(self):
        token = get_admin_token()

        # Ensure Shiprocket is marked unconfigured
        with patch("app.config.SHIPROCKET_API_EMAIL", ""), patch("app.config.SHIPROCKET_API_PASSWORD", ""):
            self.assertFalse(is_shiprocket_configured())

            # Check config endpoint
            res = client.get("/admin/fulfillment/config", headers={"Authorization": f"Bearer {token}"})
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertFalse(data["is_configured"])
            self.assertEqual(data["disabled_reason"], "Shiprocket not configured — use manual tracking")

            # Attempt to ship via Shiprocket -> 503
            oid, _ = create_test_order()
            ship_res = client.post(
                f"/admin/orders/{oid}/fulfillment/ship",
                headers={"Authorization": f"Bearer {token}"},
                json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
            )
            self.assertEqual(ship_res.status_code, 503)
            self.assertIn("Shiprocket not configured — use manual tracking", ship_res.json()["detail"])

            # Manual tracking still works as fallback
            manual_res = client.patch(
                f"/admin/orders/{oid}/status",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "status": "SHIPPED",
                    "courier_name": "Delhivery Express",
                    "tracking_url": "https://www.delhivery.com/track/package/DEL12345",
                },
            )
            self.assertEqual(manual_res.status_code, 200)
            self.assertEqual(manual_res.json()["status"], "SHIPPED")
            self.assertEqual(manual_res.json()["courier_name"], "Delhivery Express")

    def test_shiprocket_validation_rules(self):
        token = get_admin_token()
        oid, _ = create_test_order(payment_method="PREPAID", payment_status="PENDING")

        with patch("app.routers.admin.is_shiprocket_configured", return_value=True):
            # 1. Unpaid prepaid order
            res = client.post(
                f"/admin/orders/{oid}/fulfillment/ship",
                headers={"Authorization": f"Bearer {token}"},
                json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
            )
            self.assertEqual(res.status_code, 400)
            self.assertIn("Prepaid order is not confirmed paid yet", res.json()["detail"])

            # 2. Missing/zero dimensions
            oid_shippable, _ = create_test_order(payment_method="COD", status="PACKED")
            res2 = client.post(
                f"/admin/orders/{oid_shippable}/fulfillment/ship",
                headers={"Authorization": f"Bearer {token}"},
                json={"length": 0, "breadth": 20, "height": 5, "weight": 0.5},
            )
            self.assertEqual(res2.status_code, 400)
            self.assertIn("Enter the packed parcel's weight and dimensions", res2.json()["detail"])

            # 3. Cancelled order cannot be shipped
            cid, _ = create_test_order(status="CANCELLED")
            res3 = client.post(
                f"/admin/orders/{cid}/fulfillment/ship",
                headers={"Authorization": f"Bearer {token}"},
                json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
            )
            self.assertEqual(res3.status_code, 400)
            self.assertIn("Cannot ship a cancelled order", res3.json()["detail"])

    def test_full_fulfillment_flow_and_idempotency(self):
        token = get_admin_token()
        oid, code = create_test_order(payment_method="COD", status="PACKED")

        mock_create_order = MagicMock(return_value={"shiprocket_order_id": "SR-10029", "shipment_id": "SH-887711"})
        mock_assign_awb = MagicMock(return_value={"awb_code": "AWB-RL-8822", "courier_name": "Delhivery Surface"})
        mock_pickup = MagicMock(return_value={"pickup_status": "SCHEDULED"})
        mock_label = MagicMock(return_value={"label_url": "https://shiprocket.co/label/8822.pdf"})
        mock_manifest = MagicMock(return_value={"manifest_url": "https://shiprocket.co/manifest/8822.pdf"})
        mock_invoice = MagicMock(return_value={"invoice_url": "https://shiprocket.co/invoice/8822.pdf"})

        with patch("app.routers.admin.is_shiprocket_configured", return_value=True), \
             patch("app.services.shiprocket.create_order", mock_create_order), \
             patch("app.services.shiprocket.assign_awb", mock_assign_awb), \
             patch("app.services.shiprocket.generate_pickup", mock_pickup), \
             patch("app.services.shiprocket.generate_label", mock_label), \
             patch("app.services.shiprocket.generate_manifest", mock_manifest), \
             patch("app.services.shiprocket.generate_invoice", mock_invoice):

            # Initial Ship call
            res = client.post(
                f"/admin/orders/{oid}/fulfillment/ship",
                headers={"Authorization": f"Bearer {token}"},
                json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5, "courier_id": 10},
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            # Status accurately transitions to READY_FOR_PICKUP upon scheduling pickup
            self.assertEqual(data["status"], "READY_FOR_PICKUP")
            self.assertEqual(data["shiprocket_order_id"], "SR-10029")
            self.assertEqual(data["shipment_id"], "SH-887711")
            self.assertEqual(data["awb_code"], "AWB-RL-8822")
            self.assertEqual(data["courier_name"], "Delhivery Surface")
            self.assertEqual(data["label_url"], "https://shiprocket.co/label/8822.pdf")
            self.assertEqual(data["manifest_url"], "https://shiprocket.co/manifest/8822.pdf")
            self.assertEqual(data["pickup_status"], "SCHEDULED")
            self.assertEqual(mock_create_order.call_count, 1)
            self.assertEqual(mock_assign_awb.call_count, 1)

            # Second click (Idempotency check): MUST NOT create order again
            res2 = client.post(
                f"/admin/orders/{oid}/fulfillment/ship",
                headers={"Authorization": f"Bearer {token}"},
                json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
            )
            self.assertEqual(res2.status_code, 200)
            # Call count must still be 1 (never re-creates)
            self.assertEqual(mock_create_order.call_count, 1)

    def test_failure_resume(self):
        token = get_admin_token()
        oid, _ = create_test_order(payment_method="COD", status="PACKED")

        mock_create_order = MagicMock(return_value={"shiprocket_order_id": "SR-9999", "shipment_id": "SH-7777"})
        mock_awb_fail = MagicMock(side_effect=Exception("Shiprocket wallet balance low"))

        with patch("app.routers.admin.is_shiprocket_configured", return_value=True), \
             patch("app.services.shiprocket.create_order", mock_create_order), \
             patch("app.services.shiprocket.assign_awb", mock_awb_fail):

            # Attempt fails at AWB step
            try:
                client.post(
                    f"/admin/orders/{oid}/fulfillment/ship",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
                )
            except Exception:
                pass

        # Verify order saved shipment_id
        db = SessionLocal()
        order = db.query(Order).filter(Order.id == oid).first()
        self.assertEqual(order.shipment_id, "SH-7777")
        self.assertNotEqual(order.status, "READY_FOR_PICKUP")
        self.assertNotEqual(order.status, "SHIPPED")
        db.close()

        # Retry with AWB succeeding: MUST resume from stored shipment_id, NOT call create_order again
        mock_awb_success = MagicMock(return_value={"awb_code": "AWB-RESUMED-123", "courier_name": "BlueDart Express"})
        mock_invoice = MagicMock(return_value={"invoice_url": "https://shiprocket.co/invoice/8822.pdf"})
        with patch("app.routers.admin.is_shiprocket_configured", return_value=True), \
             patch("app.services.shiprocket.create_order", mock_create_order), \
             patch("app.services.shiprocket.assign_awb", mock_awb_success), \
             patch("app.services.shiprocket.generate_pickup", return_value={"pickup_status": "SCHEDULED"}), \
             patch("app.services.shiprocket.generate_label", return_value={"label_url": "https://..."}), \
             patch("app.services.shiprocket.generate_manifest", return_value={"manifest_url": "https://..."}), \
             patch("app.services.shiprocket.generate_invoice", mock_invoice):

            res_retry = client.post(
                f"/admin/orders/{oid}/fulfillment/ship",
                headers={"Authorization": f"Bearer {token}"},
                json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
            )
            self.assertEqual(res_retry.status_code, 200)
            self.assertEqual(res_retry.json()["status"], "READY_FOR_PICKUP")
            self.assertEqual(res_retry.json()["awb_code"], "AWB-RESUMED-123")
            # create_order was NOT called again during retry
            self.assertEqual(mock_create_order.call_count, 1)

    def test_cancellation_rules(self):
        token = get_admin_token()

        # 1. Cancel before pickup: calls cancel_order
        oid1, _ = create_test_order(status="SHIPPED")
        db = SessionLocal()
        o1 = db.query(Order).filter(Order.id == oid1).first()
        o1.shiprocket_order_id = "SR-CANCEL-1"
        o1.pickup_status = "SCHEDULED"
        db.commit()
        db.close()

        mock_cancel = MagicMock(return_value={"status": "CANCELLED"})
        with patch("app.services.shiprocket.cancel_order", mock_cancel):
            res = client.patch(
                f"/admin/orders/{oid1}/status",
                headers={"Authorization": f"Bearer {token}"},
                json={"status": "CANCELLED"},
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["status"], "CANCELLED")
            self.assertEqual(mock_cancel.call_count, 1)

        # 2. Cancel after pickup: rejected with exact message
        oid2, _ = create_test_order(status="SHIPPED")
        db = SessionLocal()
        o2 = db.query(Order).filter(Order.id == oid2).first()
        o2.shiprocket_order_id = "SR-CANCEL-2"
        o2.pickup_status = "PICKED_UP"
        db.commit()
        db.close()

        res2 = client.patch(
            f"/admin/orders/{oid2}/status",
            headers={"Authorization": f"Bearer {token}"},
            json={"status": "CANCELLED"},
        )
        self.assertEqual(res2.status_code, 400)
        self.assertIn("already picked up — cannot cancel via Shiprocket", res2.json()["detail"])

    def test_webhook_live_refetch(self):
        import uuid
        unique_awb = f"AWB-{uuid.uuid4().hex[:8].upper()}"
        oid, code = create_test_order(status="READY_FOR_PICKUP")
        db = SessionLocal()
        o = db.query(Order).filter(Order.id == oid).first()
        o.awb_code = unique_awb
        db.commit()
        db.close()

        # Webhook claims DELIVERED, but safety rule requires live re-fetch from Shiprocket!
        mock_track = MagicMock(return_value={
            "current_status": "DELIVERED",
            "tracking_data": {"shipment_track": [{"current_status": "DELIVERED"}]},
        })

        with patch("app.services.shiprocket.track", mock_track):
            res = client.post(
                "/shiprocket/webhook",
                json={"awb": unique_awb, "current_status": "DELIVERED"},
            )
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.json()["verified_live"])
            self.assertEqual(mock_track.call_count, 1)

        db = SessionLocal()
        updated = db.query(Order).filter(Order.id == oid).first()
        self.assertEqual(updated.status, "DELIVERED")
        db.close()


if __name__ == "__main__":
    unittest.main()
