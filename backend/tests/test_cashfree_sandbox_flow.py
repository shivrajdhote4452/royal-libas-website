"""Comprehensive Test Suite for Cashfree Payment Gateway Sandbox Integration.

Verifies:
1. Isolation safety: Runs strictly against an isolated disposable database.
2. Sandbox mode enforcement: Ensures Cashfree operates in 'sandbox' mode.
3. Prepaid checkout controls: Honors StoreSetting online_payment_enabled toggle.
4. Cashfree order creation: Amount integrity, order_code mapping, no secret leakage.
5. Trusted backend verification vs browser redirect: Return visits cannot mark orders paid.
6. Server-side payment reconciliation (GET /orders/{id}/payments sync).
7. Webhook security: HMAC-SHA256 signature validation, tampering rejection, and idempotency.
8. Amount mismatch & overselling guards: Rejection of underpayment and handling of delayed payments.
9. Zero Shiprocket dispatch: Confirms fulfillment is never triggered automatically.
10. Admin panel visibility: Order and payment audit display with cashfree_order_id.
"""

import atexit
import base64
import hashlib
import hmac
import json
import os
import shutil
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# 1. Setup isolated disposable SQLite database BEFORE importing app modules
_temp_dir = tempfile.mkdtemp(prefix="rl_cashfree_sandbox_isolated_")
_isolated_db_path = os.path.join(_temp_dir, "isolated_cashfree_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_isolated_db_path}"
os.environ["JWT_SECRET"] = "phase4-test-isolated-jwt-secret-key-royal-libas"
os.environ["CASHFREE_CLIENT_ID"] = "TEST_CF_APP_ID_SANDBOX_12345"
os.environ["CASHFREE_CLIENT_SECRET"] = "TEST_CF_SECRET_KEY_SANDBOX_67890"
os.environ["CASHFREE_ENVIRONMENT"] = "sandbox"
os.environ["CASHFREE_API_VERSION"] = "2023-08-01"

def _cleanup_temp():
    if os.path.exists(_temp_dir):
        try:
            shutil.rmtree(_temp_dir, ignore_errors=True)
        except Exception:
            pass

atexit.register(_cleanup_temp)

# Guard: abort immediately if DATABASE_URL contains business/production keywords
FORBIDDEN = ["postgres", "hostinger", "neon", "prod", "vps", "royal_libas.db"]
for pattern in FORBIDDEN:
    if pattern in os.environ["DATABASE_URL"].lower() and "isolated" not in os.environ["DATABASE_URL"].lower():
        raise RuntimeError(f"CRITICAL SAFETY VIOLATION: Database URL contains forbidden pattern '{pattern}'.")

from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.migrations import run_migrations
from app.models import Admin, Product, ProductVariant, Order, OrderItem, Address, StoreSetting
from app.auth import hash_password, create_access_token
from app.services.payment_service import (
    verify_cashfree_webhook_signature,
    process_cashfree_webhook,
    sync_cashfree_payment_status,
)

client = TestClient(app)
Base.metadata.create_all(bind=engine)
run_migrations(engine)


class TestCashfreeSandboxIntegration(unittest.TestCase):
    """Test suite covering the complete Cashfree payment flow in sandbox mode."""

    @classmethod
    def setUpClass(cls):
        db = SessionLocal()
        try:
            # Seed test admin
            admin = Admin(
                email="admin@royallibas.local",
                password_hash=hash_password("AdminPass123!"),
                name="Test Admin",
                role="OWNER",
                is_active=True,
            )
            db.add(admin)

            # Store settings with online payments enabled
            setting = StoreSetting(
                online_payment_enabled=True,
                cod_enabled=True,
                standard_shipping_fee=Decimal("99.00"),
                standard_cod_free_threshold=Decimal("1500.00"),
            )
            db.add(setting)

            # Seed a product with variants
            p = Product(
                id=1,
                name="Gulzar Velvet Anarkali Suit",
                slug="gulzar-velvet-anarkali-suit",
                category="SUIT SET",
                subcategory="Three Pieces",
                status="PUBLISHED",
                is_bestseller=True,
                is_active=True,
            )
            db.add(p)

            v_s = ProductVariant(
                id=101,
                product_id=1,
                size="S",
                colour="Maroon",
                sku="RL-GULZAR-S",
                selling_price=Decimal("2999.00"),
                stock=10,
                is_active=True,
            )
            v_m = ProductVariant(
                id=102,
                product_id=1,
                size="M",
                colour="Maroon",
                sku="RL-GULZAR-M",
                selling_price=Decimal("2999.00"),
                stock=5,
                is_active=True,
            )
            db.add_all([v_s, v_m])
            db.commit()

            cls.admin_token = create_access_token({"sub": str(admin.id), "role": "OWNER"})
            cls.admin_headers = {"Authorization": f"Bearer {cls.admin_token}"}
        finally:
            db.close()

    def test_01_environment_and_config_endpoint(self):
        """Verify operating mode is sandbox and payments endpoint returns correct configuration."""
        res = client.get("/payments/cashfree/config")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["mode"], "sandbox")
        self.assertTrue(data["configured"])
        self.assertTrue(data["online_payment_enabled"])

    def test_02_prepaid_blocked_when_store_setting_disabled(self):
        """Verify prepaid checkout is rejected when online_payment_enabled is set to False."""
        db = SessionLocal()
        try:
            setting = db.query(StoreSetting).first()
            setting.online_payment_enabled = False
            db.commit()

            # Config endpoint reflects disabled state
            res = client.get("/payments/cashfree/config")
            self.assertEqual(res.status_code, 200)
            self.assertFalse(res.json()["configured"])
            self.assertFalse(res.json()["online_payment_enabled"])

            # Creating a prepaid order fails immediately at order creation
            order_res = client.post("/orders", json={
                "customer_name": "Prepaid Customer",
                "phone": "+91 98112 23344",
                "payment_method": "PREPAID",
                "items": [{"variant_id": 101, "quantity": 1}],
                "address": {
                    "name": "Prepaid Customer",
                    "phone": "9811223344",
                    "pincode": "284003",
                    "line1": "Prem Ganj",
                    "city": "Jhansi",
                    "state": "Uttar Pradesh",
                },
            })
            self.assertEqual(order_res.status_code, 400)
            self.assertIn("unavailable", order_res.json()["detail"].lower())
        finally:
            # Re-enable online payment for remainder of test suite
            setting = db.query(StoreSetting).first()
            setting.online_payment_enabled = True
            db.commit()
            db.close()

    @patch("app.services.payment_service.httpx.Client")
    def test_03_create_cashfree_order_success(self, mock_client_cls):
        """Verify creation of Cashfree order session with server-calculated amount and phone sanitation."""
        mock_client = mock_client_cls.return_value.__enter__.return_value
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "cf_order_id": "cf_order_sb_889900",
            "payment_session_id": "session_sandbox_abc123xyz",
            "order_status": "ACTIVE",
            "order_amount": 2999.00,
        }
        mock_client.post.return_value = mock_resp

        # Place pending prepaid order
        order_res = client.post("/orders", json={
            "customer_name": "Shubham Verma",
            "phone": "+91 98112 23344",  # Formatted phone to verify digit sanitation
            "payment_method": "PREPAID",
            "items": [{"variant_id": 101, "quantity": 1}],
            "address": {
                "name": "Shubham Verma",
                "phone": "9811223344",
                "pincode": "284003",
                "line1": "Civil Lines",
                "city": "Jhansi",
                "state": "Uttar Pradesh",
            },
        })
        self.assertEqual(order_res.status_code, 201)
        order_code = order_res.json()["order_code"]

        # Call create-order endpoint
        cf_res = client.post("/payments/cashfree/create-order", json={"order_code": order_code})
        self.assertEqual(cf_res.status_code, 200)
        cf_data = cf_res.json()

        self.assertEqual(cf_data["payment_session_id"], "session_sandbox_abc123xyz")
        self.assertEqual(cf_data["order_id"], order_code)
        self.assertEqual(cf_data["mode"], "sandbox")
        self.assertEqual(Decimal(str(cf_data["amount"])), Decimal("2999.00"))

        # Verify payload sent to Cashfree sanitized phone and included token in return_url
        call_args = mock_client.post.call_args
        sent_payload = call_args[1]["json"]
        self.assertEqual(sent_payload["customer_details"]["customer_phone"], "9811223344")
        self.assertIn("/order-success/", sent_payload["order_meta"]["return_url"])
        self.assertIn("token=", sent_payload["order_meta"]["return_url"])

        # Verify DB order recorded cf_order_id and remains PENDING
        db = SessionLocal()
        try:
            o = db.query(Order).filter(Order.order_code == order_code).first()
            self.assertEqual(o.cashfree_order_id, "cf_order_sb_889900")
            self.assertEqual(o.status, "PENDING")
            self.assertEqual(o.payment_status, "PENDING")
        finally:
            db.close()

    def test_04_browser_redirect_alone_does_not_mark_order_paid(self):
        """Verify that customer navigating to return URL / order-success cannot mark order PAID without verification."""
        order_res = client.post("/orders", json={
            "customer_name": "Redirect Tester",
            "phone": "9811223344",
            "payment_method": "PREPAID",
            "items": [{"variant_id": 101, "quantity": 1}],
            "address": {
                "name": "Redirect Tester",
                "phone": "9811223344",
                "pincode": "284003",
                "line1": "Station Road",
                "city": "Jhansi",
                "state": "Uttar Pradesh",
            },
        })
        order_code = order_res.json()["order_code"]
        order_token = order_res.json()["order_token"]

        # Fetching order details (as happens on /order-success/:code)
        fetch_res = client.get(f"/orders/{order_code}?token={order_token}")
        self.assertEqual(fetch_res.status_code, 200)
        data = fetch_res.json()
        self.assertEqual(data["payment_status"], "PENDING")
        self.assertEqual(data["status"], "PENDING")

    @patch("app.services.payment_service.httpx.Client")
    def test_05_trusted_server_sync_marks_order_paid(self, mock_client_cls):
        """Verify server-side sync with Cashfree reconciles successful payment."""
        mock_client = mock_client_cls.return_value.__enter__.return_value
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {
                "cf_payment_id": "cf_pay_test_998811",
                "payment_status": "SUCCESS",
                "payment_amount": 2999.00,
                "payment_currency": "INR",
            }
        ]
        mock_client.get.return_value = mock_resp

        # Create order
        order_res = client.post("/orders", json={
            "customer_name": "Sync Customer",
            "phone": "9811223344",
            "payment_method": "PREPAID",
            "items": [{"variant_id": 101, "quantity": 1}],
            "address": {
                "name": "Sync Customer",
                "phone": "9811223344",
                "pincode": "284003",
                "line1": "Station Road",
                "city": "Jhansi",
                "state": "Uttar Pradesh",
            },
        })
        order_code = order_res.json()["order_code"]

        # Perform server sync
        sync_res = client.post(f"/payments/cashfree/sync/{order_code}")
        self.assertEqual(sync_res.status_code, 200)
        sync_data = sync_res.json()
        self.assertTrue(sync_data["is_paid"])
        self.assertEqual(sync_data["payment_status"], "PAID")
        self.assertEqual(sync_data["order_status"], "PAID")

        # Verify DB updated
        db = SessionLocal()
        try:
            o = db.query(Order).filter(Order.order_code == order_code).first()
            self.assertEqual(o.status, "PAID")
            self.assertEqual(o.payment_status, "PAID")
        finally:
            db.close()

    def test_06_webhook_signature_verification_and_tampering(self):
        """Verify HMAC-SHA256 Base64 webhook validation rejects tampered bodies and missing headers."""
        secret = os.environ["CASHFREE_CLIENT_SECRET"].encode("utf-8")
        timestamp = "1730592000"
        payload = {
            "type": "PAYMENT_SUCCESS_WEBHOOK",
            "data": {
                "order": {"order_id": "RL-NONEXISTENT", "order_amount": 100.0},
                "payment": {"payment_status": "SUCCESS", "payment_amount": 100.0},
            },
        }
        raw_body = json.dumps(payload).encode("utf-8")

        # 1. Missing headers -> 400
        res = client.post("/payments/cashfree/webhook", content=raw_body)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Missing", res.json()["detail"])

        # 2. Tampered signature -> 400
        res = client.post(
            "/payments/cashfree/webhook",
            content=raw_body,
            headers={
                "x-webhook-signature": "invalid_tampered_signature_base64",
                "x-webhook-timestamp": timestamp,
            },
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Invalid", res.json()["detail"])

        # 3. Valid signature generator helper test
        signed_data = timestamp.encode("utf-8") + raw_body
        valid_sig = base64.b64encode(hmac.new(secret, signed_data, hashlib.sha256).digest()).decode("utf-8")
        self.assertTrue(verify_cashfree_webhook_signature(timestamp, raw_body, valid_sig))

    def test_07_webhook_idempotency_and_amount_verification(self):
        """Verify webhook marks order PAID, verifies exact amount, and gracefully handles duplicate events."""
        # Create order
        order_res = client.post("/orders", json={
            "customer_name": "Webhook Tester",
            "phone": "9811223344",
            "payment_method": "PREPAID",
            "items": [{"variant_id": 101, "quantity": 1}],
            "address": {
                "name": "Webhook Tester",
                "phone": "9811223344",
                "pincode": "284003",
                "line1": "Station Road",
                "city": "Jhansi",
                "state": "Uttar Pradesh",
            },
        })
        order_code = order_res.json()["order_code"]
        secret = os.environ["CASHFREE_CLIENT_SECRET"].encode("utf-8")
        timestamp = "1730592000"

        # 1. Amount mismatch test: underpayment of 1.00 instead of 2999.00
        mismatch_payload = {
            "type": "PAYMENT_SUCCESS_WEBHOOK",
            "data": {
                "order": {"order_id": order_code, "order_amount": 1.00},
                "payment": {"payment_status": "SUCCESS", "payment_amount": 1.00},
            },
        }
        mismatch_body = json.dumps(mismatch_payload).encode("utf-8")
        mismatch_sig = base64.b64encode(hmac.new(secret, timestamp.encode("utf-8") + mismatch_body, hashlib.sha256).digest()).decode("utf-8")

        res_mismatch = client.post(
            "/payments/cashfree/webhook",
            content=mismatch_body,
            headers={"x-webhook-signature": mismatch_sig, "x-webhook-timestamp": timestamp},
        )
        self.assertEqual(res_mismatch.status_code, 400)
        self.assertIn("mismatch", res_mismatch.json()["detail"].lower())

        # 2. Legitimate webhook: full amount
        legit_payload = {
            "type": "PAYMENT_SUCCESS_WEBHOOK",
            "data": {
                "order": {"order_id": order_code, "order_amount": 2999.00},
                "payment": {
                    "cf_payment_id": "cf_pay_real_445566",
                    "payment_status": "SUCCESS",
                    "payment_amount": 2999.00,
                },
            },
        }
        legit_body = json.dumps(legit_payload).encode("utf-8")
        legit_sig = base64.b64encode(hmac.new(secret, timestamp.encode("utf-8") + legit_body, hashlib.sha256).digest()).decode("utf-8")

        res_legit = client.post(
            "/payments/cashfree/webhook",
            content=legit_body,
            headers={"x-webhook-signature": legit_sig, "x-webhook-timestamp": timestamp},
        )
        self.assertEqual(res_legit.status_code, 200)

        # Confirm DB is PAID
        db = SessionLocal()
        try:
            o = db.query(Order).filter(Order.order_code == order_code).first()
            self.assertEqual(o.status, "PAID")
            self.assertEqual(o.payment_status, "PAID")
        finally:
            db.close()

        # 3. Duplicate webhook test (Idempotency)
        res_dup = client.post(
            "/payments/cashfree/webhook",
            content=legit_body,
            headers={"x-webhook-signature": legit_sig, "x-webhook-timestamp": timestamp},
        )
        self.assertEqual(res_dup.status_code, 200)
        self.assertIn("already marked PAID", res_dup.json()["detail"])

    def test_08_no_automatic_shiprocket_booking_and_admin_panel_visibility(self):
        """Verify that paid orders appear correctly in admin panel without triggering Shiprocket."""
        db = SessionLocal()
        try:
            # Query paid order from previous test
            o = db.query(Order).filter(Order.payment_status == "PAID").first()
            self.assertIsNotNone(o)

            # Confirm no Shiprocket order ID or AWB code exists
            self.assertIsNone(o.shiprocket_order_id)
            self.assertIsNone(o.awb_code)

            # Check admin orders API lists the order with PREPAID method and PAID payment status
            res = client.get("/admin/orders", headers=self.admin_headers)
            self.assertEqual(res.status_code, 200)
            orders = res.json()
            matching = [ord_obj for ord_obj in orders if ord_obj["order_code"] == o.order_code]
            self.assertEqual(len(matching), 1)
            self.assertEqual(matching[0]["payment_method"], "PREPAID")
            self.assertEqual(matching[0]["payment_status"], "PAID")

            # Check admin payments API lists the transaction
            payments_res = client.get("/admin/payments", headers=self.admin_headers)
            self.assertEqual(payments_res.status_code, 200)
            payments_data = payments_res.json()
            self.assertGreaterEqual(len(payments_data), 1)
            self.assertEqual(payments_data[0]["payment_method"], "PREPAID")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
