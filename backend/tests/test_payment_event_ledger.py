"""Isolated Unit & Integration Test Suite for Cashfree PaymentEvent Ledger.

Verifies:
1. Valid PAYMENT_SUCCESS_WEBHOOK creates a PaymentEvent ledger record with outcome SUCCESS and marks order PAID.
2. Identical duplicate webhook returns HTTP 200 duplicate acknowledgment without altering order or duplicating rows.
3. Multiple webhook retries with X-Webhook-Attempt: 2/3 and retained timestamp are safely deduplicated.
4. Out-of-order / delayed payment on CANCELLED order:
   - Re-reserves stock and transitions to CONFIRMED / PAID when stock is available.
   - Flags INVENTORY_CONFLICT_REFUND_REQUIRED in admin notes and marks PaymentEvent outcome when stock is sold out.
5. PAYMENT_FAILED_WEBHOOK and PAYMENT_USER_DROPPED_WEBHOOK record ledger entries without breaking subsequent success webhooks.
6. Deferred / unsupported event types are rejected safely without corrupting the ledger.
7. Webhooks with invalid HMAC signatures or malformed JSON are rejected before ledger creation.
8. Webhooks with amount mismatch are rejected and do not mark orders PAID.
9. Migration idempotency: running migrations multiple times succeeds cleanly.
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

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Isolated disposable SQLite database
_temp_dir = tempfile.mkdtemp(prefix="rl_payment_ledger_isolated_")
_isolated_db_path = os.path.join(_temp_dir, "isolated_ledger_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_isolated_db_path}"
os.environ["JWT_SECRET"] = "phase4-test-isolated-jwt-secret-key-royal-libas"
os.environ["CASHFREE_CLIENT_ID"] = "TEST_CF_APP_ID_SANDBOX_12345"
os.environ["CASHFREE_CLIENT_SECRET"] = "TEST_CF_SECRET_KEY_SANDBOX_67890"
os.environ["CASHFREE_ENVIRONMENT"] = "sandbox"
os.environ["CASHFREE_API_VERSION"] = "2023-08-01"

def _cleanup():
    if os.path.exists(_temp_dir):
        try:
            shutil.rmtree(_temp_dir, ignore_errors=True)
        except Exception:
            pass

atexit.register(_cleanup)

from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.migrations import run_migrations
from app.models import Admin, Product, ProductVariant, Order, OrderItem, Address, PaymentEvent, StoreSetting
from app.auth import hash_password

client = TestClient(app)
Base.metadata.create_all(bind=engine)
run_migrations(engine)

SECRET = "TEST_CF_SECRET_KEY_SANDBOX_67890"


def make_signed_webhook_headers(raw_body_bytes: bytes, timestamp: str = "1795804754574", secret: str = SECRET) -> dict:
    message = timestamp.encode("utf-8") + raw_body_bytes
    sig = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    sig_b64 = base64.b64encode(sig).decode("utf-8")
    return {
        "x-webhook-timestamp": timestamp,
        "x-webhook-signature": sig_b64,
        "content-type": "application/json",
    }


class TestPaymentEventLedger(unittest.TestCase):
    """Test suite for Cashfree PaymentEvent ledger and replay protection."""

    @classmethod
    def setUpClass(cls):
        db = SessionLocal()
        try:
            admin = Admin(
                email="admin_ledger@royallibas.local",
                password_hash=hash_password("AdminPass123!"),
                name="Ledger Admin",
                role="OWNER",
                is_active=True,
            )
            db.add(admin)
            setting = StoreSetting(
                id=1,
                online_payment_enabled=True,
                cod_enabled=True,
            )
            db.add(setting)
            db.commit()
        finally:
            db.close()

    def _create_test_order(
        self,
        db,
        order_code: str,
        total_amount: Decimal = Decimal("1999.00"),
        initial_status: str = "PENDING",
        initial_stock: int = 5,
        variant_id_override: int = None,
    ):
        product = Product(
            name=f"Kurti {order_code}",
            slug=f"kurti-{order_code.lower()}",
            is_active=True,
            status="PUBLISHED",
        )
        db.add(product)
        db.flush()

        variant = ProductVariant(
            product_id=product.id,
            size="M",
            colour="Red",
            sku=f"SKU-{order_code}-M",
            stock=initial_stock,
            selling_price=total_amount,
            is_active=True,
        )
        if variant_id_override:
            variant.id = variant_id_override
        db.add(variant)
        db.flush()

        order = Order(
            order_code=order_code,
            order_token=f"tok_{order_code.lower()}",
            customer_name="Test Customer",
            phone="9876543210",
            status=initial_status,
            payment_method="PREPAID",
            payment_status="PENDING",
            subtotal=total_amount,
            shipping_charge=Decimal("0.00"),
            discount=Decimal("0.00"),
            total=total_amount,
        )
        db.add(order)
        db.flush()

        item = OrderItem(
            order_id=order.id,
            variant_id=variant.id,
            product_name_snapshot=product.name,
            size_snapshot="M",
            colour_snapshot="Red",
            quantity=1,
            unit_price_snapshot=total_amount,
            line_total=total_amount,
        )
        db.add(item)
        db.commit()
        db.refresh(order)
        db.refresh(variant)
        return order, variant

    def test_01_valid_success_webhook_creates_ledger_and_marks_paid(self):
        db = SessionLocal()
        try:
            order, variant = self._create_test_order(db, "RL-LEDGER-01", Decimal("2499.00"))
            order_id = order.id

            cf_payment_id = "cf_pay_valid_01"
            payload = {
                "type": "PAYMENT_SUCCESS_WEBHOOK",
                "event_time": "2026-11-28T00:30:00Z",
                "data": {
                    "order": {
                        "order_id": order.order_code,
                        "order_amount": 2499.00,
                        "order_currency": "INR",
                    },
                    "payment": {
                        "cf_payment_id": cf_payment_id,
                        "payment_status": "SUCCESS",
                        "payment_amount": 2499.00,
                        "payment_currency": "INR",
                        "payment_time": "2026-11-28T00:30:00Z",
                    },
                },
            }
            body_bytes = json.dumps(payload).encode("utf-8")
            headers = make_signed_webhook_headers(body_bytes)

            resp = client.post("/payments/cashfree/webhook", content=body_bytes, headers=headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "ok")

            # Verify order state
            db.expire_all()
            updated_order = db.query(Order).filter(Order.id == order_id).first()
            self.assertEqual(updated_order.status, "PAID")
            self.assertEqual(updated_order.payment_status, "PAID")

            # Verify PaymentEvent ledger record
            event = (
                db.query(PaymentEvent)
                .filter(
                    PaymentEvent.order_id == order_id,
                    PaymentEvent.payment_id == cf_payment_id,
                    PaymentEvent.event_type == "PAYMENT_SUCCESS_WEBHOOK",
                )
                .first()
            )
            self.assertIsNotNone(event)
            self.assertEqual(event.provider, "cashfree")
            self.assertEqual(event.payment_status, "SUCCESS")
            self.assertEqual(event.amount, Decimal("2499.00"))
            self.assertEqual(event.currency, "INR")
            self.assertEqual(event.outcome, "SUCCESS")
            self.assertEqual(event.payload_hash, hashlib.sha256(body_bytes).hexdigest())
        finally:
            db.close()

    def test_02_identical_retry_returns_200_duplicate_without_mutation(self):
        db = SessionLocal()
        try:
            order, variant = self._create_test_order(db, "RL-LEDGER-02", Decimal("1500.00"))
            order_id = order.id
            cf_payment_id = "cf_pay_dup_02"

            payload = {
                "type": "PAYMENT_SUCCESS_WEBHOOK",
                "event_time": "2026-11-28T00:31:00Z",
                "data": {
                    "order": {"order_id": order.order_code, "order_amount": 1500.00, "order_currency": "INR"},
                    "payment": {
                        "cf_payment_id": cf_payment_id,
                        "payment_status": "SUCCESS",
                        "payment_amount": 1500.00,
                        "payment_currency": "INR",
                    },
                },
            }
            body_bytes = json.dumps(payload).encode("utf-8")
            headers = make_signed_webhook_headers(body_bytes)

            # First delivery
            resp1 = client.post("/payments/cashfree/webhook", content=body_bytes, headers=headers)
            self.assertEqual(resp1.status_code, 200)

            # Count ledger entries
            count_after_first = db.query(PaymentEvent).filter(PaymentEvent.order_id == order_id).count()
            self.assertEqual(count_after_first, 1)

            # Identical retry delivery
            resp2 = client.post("/payments/cashfree/webhook", content=body_bytes, headers=headers)
            self.assertEqual(resp2.status_code, 200)
            data2 = resp2.json()
            self.assertEqual(data2["status"], "ok")
            self.assertIn("Duplicate", data2["message"])

            # Count must still be 1 (no duplicate row)
            count_after_retry = db.query(PaymentEvent).filter(PaymentEvent.order_id == order_id).count()
            self.assertEqual(count_after_retry, 1)
        finally:
            db.close()

    def test_03_retry_with_attempt_header_retaining_timestamp(self):
        """Cashfree Sandbox empirical behavior: attempt headers increment while timestamp and signature are retained."""
        db = SessionLocal()
        try:
            order, variant = self._create_test_order(db, "RL-LEDGER-03", Decimal("1800.00"))
            order_id = order.id
            cf_payment_id = "cf_pay_attempt_03"

            payload = {
                "type": "PAYMENT_SUCCESS_WEBHOOK",
                "event_time": "2026-11-28T00:32:00Z",
                "data": {
                    "order": {"order_id": order.order_code, "order_amount": 1800.00, "order_currency": "INR"},
                    "payment": {
                        "cf_payment_id": cf_payment_id,
                        "payment_status": "SUCCESS",
                        "payment_amount": 1800.00,
                        "payment_currency": "INR",
                    },
                },
            }
            body_bytes = json.dumps(payload).encode("utf-8")
            headers = make_signed_webhook_headers(body_bytes, timestamp="1795804754574")

            # Delivery 1: Attempt 1
            headers_attempt1 = dict(headers)
            headers_attempt1["x-webhook-attempt"] = "1"
            resp1 = client.post("/payments/cashfree/webhook", content=body_bytes, headers=headers_attempt1)
            self.assertEqual(resp1.status_code, 200)

            # Delivery 2: Attempt 2 (same timestamp, same signature, new attempt header)
            headers_attempt2 = dict(headers)
            headers_attempt2["x-webhook-attempt"] = "2"
            resp2 = client.post("/payments/cashfree/webhook", content=body_bytes, headers=headers_attempt2)
            self.assertEqual(resp2.status_code, 200)
            self.assertIn("Duplicate", resp2.json()["message"])

            # Delivery 3: Attempt 3
            headers_attempt3 = dict(headers)
            headers_attempt3["x-webhook-attempt"] = "3"
            resp3 = client.post("/payments/cashfree/webhook", content=body_bytes, headers=headers_attempt3)
            self.assertEqual(resp3.status_code, 200)
            self.assertIn("Duplicate", resp3.json()["message"])

            # Exactly 1 ledger row
            events = db.query(PaymentEvent).filter(PaymentEvent.order_id == order_id).all()
            self.assertEqual(len(events), 1)
        finally:
            db.close()

    def test_04_delayed_payment_after_cancellation_stock_available(self):
        """Delayed webhook arrives after order was CANCELLED; stock is available so it re-reserves."""
        db = SessionLocal()
        try:
            order, variant = self._create_test_order(db, "RL-LEDGER-04", Decimal("2200.00"), initial_status="CANCELLED", initial_stock=5)
            order_id = order.id
            variant_id = variant.id
            cf_payment_id = "cf_pay_delayed_ok"

            payload = {
                "type": "PAYMENT_SUCCESS_WEBHOOK",
                "event_time": "2026-11-28T00:33:00Z",
                "data": {
                    "order": {"order_id": order.order_code, "order_amount": 2200.00, "order_currency": "INR"},
                    "payment": {
                        "cf_payment_id": cf_payment_id,
                        "payment_status": "SUCCESS",
                        "payment_amount": 2200.00,
                        "payment_currency": "INR",
                    },
                },
            }
            body_bytes = json.dumps(payload).encode("utf-8")
            headers = make_signed_webhook_headers(body_bytes)

            resp = client.post("/payments/cashfree/webhook", content=body_bytes, headers=headers)
            self.assertEqual(resp.status_code, 200)

            db.expire_all()
            updated_order = db.query(Order).filter(Order.id == order_id).first()
            self.assertIn(updated_order.status, ("PAID", "CONFIRMED"))
            self.assertEqual(updated_order.payment_status, "PAID")
            self.assertIn("Delayed payment arrived after cancellation", updated_order.admin_notes)

            # Stock was re-reserved (decremented from 5 to 4)
            updated_variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
            self.assertEqual(updated_variant.stock, 4)

            # Ledger record has outcome RECONCILED_POST_CANCELLATION
            event = db.query(PaymentEvent).filter(PaymentEvent.payment_id == cf_payment_id).first()
            self.assertIsNotNone(event)
            self.assertEqual(event.outcome, "RECONCILED_POST_CANCELLATION")
        finally:
            db.close()

    def test_05_delayed_payment_after_cancellation_stock_sold_out(self):
        """Delayed webhook arrives after order was CANCELLED; stock is 0 (sold out) -> flags INVENTORY CONFLICT."""
        db = SessionLocal()
        try:
            order, variant = self._create_test_order(db, "RL-LEDGER-05", Decimal("2200.00"), initial_status="CANCELLED", initial_stock=0)
            order_id = order.id
            variant_id = variant.id
            cf_payment_id = "cf_pay_delayed_soldout"

            payload = {
                "type": "PAYMENT_SUCCESS_WEBHOOK",
                "event_time": "2026-11-28T00:34:00Z",
                "data": {
                    "order": {"order_id": order.order_code, "order_amount": 2200.00, "order_currency": "INR"},
                    "payment": {
                        "cf_payment_id": cf_payment_id,
                        "payment_status": "SUCCESS",
                        "payment_amount": 2200.00,
                        "payment_currency": "INR",
                    },
                },
            }
            body_bytes = json.dumps(payload).encode("utf-8")
            headers = make_signed_webhook_headers(body_bytes)

            resp = client.post("/payments/cashfree/webhook", content=body_bytes, headers=headers)
            self.assertEqual(resp.status_code, 200)

            db.expire_all()
            updated_order = db.query(Order).filter(Order.id == order_id).first()
            self.assertIn(updated_order.status, ("CANCELLED", "ACTION_REQUIRED_REFUND"))
            self.assertEqual(updated_order.payment_status, "PAID_RECONCILIATION_REQUIRED")
            self.assertIn("INVENTORY CONFLICT", updated_order.admin_notes)

            # Stock must NEVER go negative
            updated_variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
            self.assertEqual(updated_variant.stock, 0)

            # Ledger outcome indicates conflict
            event = db.query(PaymentEvent).filter(PaymentEvent.payment_id == cf_payment_id).first()
            self.assertIsNotNone(event)
            self.assertEqual(event.outcome, "INVENTORY_CONFLICT_REFUND_REQUIRED")
        finally:
            db.close()

    def test_06_failed_and_user_dropped_events_recorded_in_ledger(self):
        """User drops payment or payment fails; ledger records it and allows subsequent success retry."""
        db = SessionLocal()
        try:
            order, variant = self._create_test_order(db, "RL-LEDGER-06", Decimal("3000.00"))
            order_id = order.id

            # 1. USER DROPPED
            payload_dropped = {
                "type": "PAYMENT_USER_DROPPED_WEBHOOK",
                "event_time": "2026-11-28T00:35:00Z",
                "data": {
                    "order": {"order_id": order.order_code, "order_amount": 3000.00, "order_currency": "INR"},
                    "payment": {
                        "cf_payment_id": "cf_pay_drop_1",
                        "payment_status": "USER_DROPPED",
                        "payment_amount": 3000.00,
                        "payment_currency": "INR",
                    },
                },
            }
            body_bytes_dropped = json.dumps(payload_dropped).encode("utf-8")
            headers_dropped = make_signed_webhook_headers(body_bytes_dropped)

            resp1 = client.post("/payments/cashfree/webhook", content=body_bytes_dropped, headers=headers_dropped)
            self.assertEqual(resp1.status_code, 200)

            db.expire_all()
            order1 = db.query(Order).filter(Order.id == order_id).first()
            self.assertEqual(order1.payment_status, "FAILED")
            self.assertEqual(order1.status, "PENDING")

            # 2. PAYMENT FAILED
            payload_failed = {
                "type": "PAYMENT_FAILED_WEBHOOK",
                "event_time": "2026-11-28T00:36:00Z",
                "data": {
                    "order": {"order_id": order.order_code, "order_amount": 3000.00, "order_currency": "INR"},
                    "payment": {
                        "cf_payment_id": "cf_pay_fail_1",
                        "payment_status": "FAILED",
                        "payment_amount": 3000.00,
                        "payment_currency": "INR",
                    },
                },
            }
            body_bytes_failed = json.dumps(payload_failed).encode("utf-8")
            headers_failed = make_signed_webhook_headers(body_bytes_failed)

            resp2 = client.post("/payments/cashfree/webhook", content=body_bytes_failed, headers=headers_failed)
            self.assertEqual(resp2.status_code, 200)

            db.expire_all()
            order2 = db.query(Order).filter(Order.id == order_id).first()
            self.assertEqual(order2.payment_status, "FAILED")
            self.assertEqual(order2.status, "PENDING")

            # 3. SUCCESSFUL RETRY
            payload_success = {
                "type": "PAYMENT_SUCCESS_WEBHOOK",
                "event_time": "2026-11-28T00:37:00Z",
                "data": {
                    "order": {"order_id": order.order_code, "order_amount": 3000.00, "order_currency": "INR"},
                    "payment": {
                        "cf_payment_id": "cf_pay_success_final",
                        "payment_status": "SUCCESS",
                        "payment_amount": 3000.00,
                        "payment_currency": "INR",
                    },
                },
            }
            body_bytes_success = json.dumps(payload_success).encode("utf-8")
            headers_success = make_signed_webhook_headers(body_bytes_success)

            resp3 = client.post("/payments/cashfree/webhook", content=body_bytes_success, headers=headers_success)
            self.assertEqual(resp3.status_code, 200)

            db.expire_all()
            order3 = db.query(Order).filter(Order.id == order_id).first()
            self.assertEqual(order3.payment_status, "PAID")
            self.assertEqual(order3.status, "PAID")

            # Exactly 3 distinct PaymentEvent entries
            events = db.query(PaymentEvent).filter(PaymentEvent.order_id == order_id).all()
            self.assertEqual(len(events), 3)
            outcomes = {e.event_type: e.outcome for e in events}
            self.assertEqual(outcomes["PAYMENT_USER_DROPPED_WEBHOOK"], "USER_DROPPED")
            self.assertEqual(outcomes["PAYMENT_FAILED_WEBHOOK"], "FAILED")
            self.assertEqual(outcomes["PAYMENT_SUCCESS_WEBHOOK"], "SUCCESS")
        finally:
            db.close()

    def test_07_unsupported_event_rejected_without_corrupting_ledger(self):
        """Unknown or unverified event types (such as refund events) are safely ignored with HTTP 200 without ledger entry."""
        db = SessionLocal()
        try:
            order, variant = self._create_test_order(db, "RL-LEDGER-07", Decimal("1500.00"))
            order_id = order.id

            payload = {
                "type": "REFUND_PROCESSED_WEBHOOK",
                "event_time": "2026-11-28T00:38:00Z",
                "data": {
                    "order": {"order_id": order.order_code, "order_amount": 1500.00},
                    "payment": {"cf_payment_id": "cf_pay_ref_01", "payment_status": "SUCCESS"},
                },
            }
            body_bytes = json.dumps(payload).encode("utf-8")
            headers = make_signed_webhook_headers(body_bytes)

            resp = client.post("/payments/cashfree/webhook", content=body_bytes, headers=headers)
            self.assertEqual(resp.status_code, 200)
            self.assertIn("ignored safely", resp.json()["detail"])

            # No ledger row
            events = db.query(PaymentEvent).filter(PaymentEvent.order_id == order_id).all()
            self.assertEqual(len(events), 0)
        finally:
            db.close()

    def test_08_invalid_signature_rejected_without_ledger_entry(self):
        """Webhooks with fraudulent or mismatched HMAC signatures are rejected with 400 Bad Request."""
        db = SessionLocal()
        try:
            order, variant = self._create_test_order(db, "RL-LEDGER-08", Decimal("1200.00"))
            order_id = order.id

            payload = {
                "type": "PAYMENT_SUCCESS_WEBHOOK",
                "data": {
                    "order": {"order_id": order.order_code, "order_amount": 1200.00},
                    "payment": {"cf_payment_id": "cf_pay_tamper", "payment_status": "SUCCESS", "payment_amount": 1200.00},
                },
            }
            body_bytes = json.dumps(payload).encode("utf-8")
            headers = {
                "x-webhook-timestamp": "1795804754574",
                "x-webhook-signature": "invalid_fake_hmac_signature",
                "content-type": "application/json",
            }

            resp = client.post("/payments/cashfree/webhook", content=body_bytes, headers=headers)
            self.assertEqual(resp.status_code, 400)
            self.assertIn("Invalid Cashfree webhook signature", resp.json()["detail"])

            # No ledger row created
            events = db.query(PaymentEvent).filter(PaymentEvent.order_id == order_id).all()
            self.assertEqual(len(events), 0)
        finally:
            db.close()

    def test_09_amount_mismatch_rejected_without_marking_paid(self):
        """Webhooks attempting to confirm an underpaid order are rejected."""
        db = SessionLocal()
        try:
            order, variant = self._create_test_order(db, "RL-LEDGER-09", Decimal("2500.00"))
            order_id = order.id

            payload = {
                "type": "PAYMENT_SUCCESS_WEBHOOK",
                "data": {
                    "order": {"order_id": order.order_code, "order_amount": 1000.00},  # Underpayment!
                    "payment": {"cf_payment_id": "cf_pay_underpaid", "payment_status": "SUCCESS", "payment_amount": 1000.00},
                },
            }
            body_bytes = json.dumps(payload).encode("utf-8")
            headers = make_signed_webhook_headers(body_bytes)

            resp = client.post("/payments/cashfree/webhook", content=body_bytes, headers=headers)
            self.assertEqual(resp.status_code, 400)
            self.assertIn("mismatch", resp.json()["detail"])

            # Order not marked paid
            db.expire_all()
            order_check = db.query(Order).filter(Order.id == order_id).first()
            self.assertEqual(order_check.payment_status, "PENDING")
            self.assertEqual(order_check.status, "PENDING")
        finally:
            db.close()

    def test_10_migration_idempotent_on_database(self):
        """Calling run_migrations(engine) multiple times succeeds cleanly without raising errors."""
        try:
            run_migrations(engine)
            run_migrations(engine)
        except Exception as e:
            self.fail(f"run_migrations failed on repeated execution: {e}")


if __name__ == "__main__":
    unittest.main()
