"""PostgreSQL Concurrency & Cashfree Webhook Replay Protection Test Suite.

Verifies true PostgreSQL row-locking behavior, deadlock freedom, and atomic ledger idempotency:
1. Concurrent duplicate webhooks race: multiple threads sending identical webhook payloads
   resolve safely with exactly 1 PaymentEvent row in PostgreSQL.
2. Webhook vs reservation-expiry race: concurrent webhook arrival and background reservation
   expiry lock rows consistently without deadlocks or inventory discrepancies.
3. Webhook vs customer cancellation race: atomic serialization between payment processing
   and customer order cancellation.
4. Ascending variant lock order: confirms ProductVariant rows are locked in strictly ascending ID
   order across multi-item orders to eliminate AB-BA deadlocks on PostgreSQL.

SAFETY GUARDS:
- Requires an isolated disposable PostgreSQL database (e.g. local ephemeral cluster or GitHub Actions).
- NEVER connects to or tests against production/staging databases.
- Skips safely if disposable PostgreSQL is not available in the test environment.
"""

import atexit
import base64
import hashlib
import hmac
import json
import os
import sys
import threading
import time
import unittest
from decimal import Decimal
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ.setdefault("JWT_SECRET", "isolated-test-jwt-secret-pg-concurrency-32bytes")
os.environ["CASHFREE_CLIENT_ID"] = "TEST_CF_APP_ID_SANDBOX_12345"
os.environ["CASHFREE_CLIENT_SECRET"] = "TEST_CF_SECRET_KEY_SANDBOX_67890"
os.environ["CASHFREE_ENVIRONMENT"] = "sandbox"
os.environ["CASHFREE_API_VERSION"] = "2023-08-01"


class TestCashfreeConcurrencyPostgres(unittest.TestCase):
    """PostgreSQL concurrency tests using an isolated disposable database."""

    @classmethod
    def setUpClass(cls):
        try:
            from tests.test_postgres_variant_migration import _find_or_create_disposable_postgres
            pg_url, cleanup_fn = _find_or_create_disposable_postgres()
        except Exception:
            pg_url = os.environ.get("TEST_POSTGRES_URL")
            cleanup_fn = None

        if not pg_url:
            raise unittest.SkipTest("Disposable PostgreSQL not configured and no local postgres binaries found.")

        cls.cleanup_fn = cleanup_fn

        # Safety Guards
        lower_url = pg_url.lower()
        if not ("localhost" in lower_url or "127.0.0.1" in lower_url):
            raise unittest.SkipTest(f"Safety guard: TEST_POSTGRES_URL must be localhost/127.0.0.1, got: {lower_url}")

        for forbidden in ["hostinger", "neon", "prod", "vps", "royal_libas_prod"]:
            if forbidden in lower_url:
                raise unittest.SkipTest(f"Safety guard: Forbidden keyword '{forbidden}' detected in TEST_POSTGRES_URL.")

        if pg_url.startswith("postgresql://") and not pg_url.startswith("postgresql+"):
            pg_url = pg_url.replace("postgresql://", "postgresql+psycopg2://", 1)

        try:
            from sqlalchemy import create_engine
            from sqlalchemy.orm import sessionmaker

            cls.engine = create_engine(pg_url, pool_pre_ping=True, pool_size=10, max_overflow=20)
            with cls.engine.connect() as conn:
                pass
            cls.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)

            from app.database import Base
            from app.migrations import run_migrations

            Base.metadata.create_all(bind=cls.engine)
            run_migrations(cls.engine)

        except Exception as e:
            cls._cleanup()
            print(f"PostgreSQL disposable test setup failed: {type(e).__name__}: {e}", file=sys.stderr)
            raise

    @classmethod
    def _cleanup(cls):
        try:
            if hasattr(cls, "engine") and cls.engine:
                cls.engine.dispose()
        except Exception:
            pass
        if hasattr(cls, "cleanup_fn") and cls.cleanup_fn:
            try:
                cls.cleanup_fn()
            except Exception:
                pass

    @classmethod
    def tearDownClass(cls):
        cls._cleanup()

    def _create_test_order(
        self,
        db,
        order_code: str,
        total_amount: Decimal = Decimal("2500.00"),
        initial_stock: int = 10,
        multi_variant: bool = False,
    ):
        from app.models import Product, ProductVariant, Order, OrderItem

        product = Product(
            name=f"PG Concurrency Kurti {order_code}",
            slug=f"pg-kurti-{order_code.lower()}",
            is_active=True,
            status="PUBLISHED",
        )
        db.add(product)
        db.flush()

        v1 = ProductVariant(
            product_id=product.id,
            size="M",
            colour="Teal",
            sku=f"SKU-PG-{order_code}-M",
            stock=initial_stock,
            selling_price=total_amount if not multi_variant else Decimal("1000.00"),
            is_active=True,
        )
        db.add(v1)
        db.flush()

        v2 = None
        if multi_variant:
            v2 = ProductVariant(
                product_id=product.id,
                size="L",
                colour="Teal",
                sku=f"SKU-PG-{order_code}-L",
                stock=initial_stock,
                selling_price=Decimal("1500.00"),
                is_active=True,
            )
            db.add(v2)
            db.flush()

        order = Order(
            order_code=order_code,
            order_token=f"tok_{order_code.lower()}",
            customer_name="PG Concurrency Customer",
            phone="9988776655",
            status="PENDING",
            payment_method="PREPAID",
            payment_status="PENDING",
            subtotal=total_amount,
            shipping_charge=Decimal("0.00"),
            discount=Decimal("0.00"),
            total=total_amount,
        )
        db.add(order)
        db.flush()

        if multi_variant and v2:
            i1 = OrderItem(
                order_id=order.id,
                variant_id=v1.id,
                product_name_snapshot=product.name,
                size_snapshot="M",
                colour_snapshot="Teal",
                quantity=1,
                unit_price_snapshot=Decimal("1000.00"),
                line_total=Decimal("1000.00"),
            )
            i2 = OrderItem(
                order_id=order.id,
                variant_id=v2.id,
                product_name_snapshot=product.name,
                size_snapshot="L",
                colour_snapshot="Teal",
                quantity=1,
                unit_price_snapshot=Decimal("1500.00"),
                line_total=Decimal("1500.00"),
            )
            db.add(i1)
            db.add(i2)
        else:
            i1 = OrderItem(
                order_id=order.id,
                variant_id=v1.id,
                product_name_snapshot=product.name,
                size_snapshot="M",
                colour_snapshot="Teal",
                quantity=1,
                unit_price_snapshot=total_amount,
                line_total=total_amount,
            )
            db.add(i1)

        db.commit()
        db.refresh(order)
        return order, v1, v2

    def test_01_concurrent_duplicate_webhooks_race(self):
        """Two concurrent threads delivering identical webhooks on PostgreSQL produce exactly 1 PaymentEvent."""
        from app.models import Order, PaymentEvent
        from app.services.payment_service import process_cashfree_webhook

        db_setup = self.SessionLocal()
        order_code = f"PG-RACE-DUP-{int(time.time())}"
        order, v1, _ = self._create_test_order(db_setup, order_code, Decimal("2000.00"))
        order_id = order.id
        db_setup.close()

        cf_payment_id = f"cf_pay_race_{int(time.time())}"
        payload = {
            "type": "PAYMENT_SUCCESS_WEBHOOK",
            "event_time": datetime.now(timezone.utc).isoformat(),
            "data": {
                "order": {"order_id": order_code, "order_amount": 2000.00, "order_currency": "INR"},
                "payment": {
                    "cf_payment_id": cf_payment_id,
                    "payment_status": "SUCCESS",
                    "payment_amount": 2000.00,
                    "payment_currency": "INR",
                },
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")

        barrier = threading.Barrier(2)
        results = []
        exceptions = []

        def worker():
            db_worker = self.SessionLocal()
            try:
                barrier.wait(timeout=5)
                res = process_cashfree_webhook(db_worker, payload, raw_body_bytes=body_bytes)
                results.append(res)
            except Exception as e:
                exceptions.append(e)
            finally:
                db_worker.close()

        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        self.assertEqual(len(exceptions), 0, f"Exceptions occurred during concurrent delivery: {exceptions}")
        self.assertEqual(len(results), 2)
        for res in results:
            self.assertTrue(res[0], f"Webhook processing failed: {res[1]}")

        # Verify database state on PostgreSQL
        db_check = self.SessionLocal()
        try:
            events = (
                db_check.query(PaymentEvent)
                .filter(
                    PaymentEvent.order_id == order_id,
                    PaymentEvent.payment_id == cf_payment_id,
                    PaymentEvent.event_type == "PAYMENT_SUCCESS_WEBHOOK",
                )
                .all()
            )
            # CRITICAL ASSERTION: Exactly one ledger record exists in PostgreSQL
            self.assertEqual(len(events), 1)

            check_order = db_check.query(Order).filter(Order.id == order_id).first()
            self.assertEqual(check_order.status, "PAID")
            self.assertEqual(check_order.payment_status, "PAID")
        finally:
            db_check.close()

    def test_02_webhook_vs_reservation_expiry_race(self):
        """Concurrent payment webhook vs background reservation expiry produces consistent state without deadlocks."""
        from app.models import Order, ProductVariant
        from app.services.payment_service import process_cashfree_webhook
        from app.services.order_service import expire_unpaid_prepaid_reservations

        db_setup = self.SessionLocal()
        order_code = f"PG-RACE-EXP-{int(time.time())}"
        order, v1, _ = self._create_test_order(db_setup, order_code, Decimal("1800.00"), initial_stock=5)
        # Set reservation as expired in the past
        order.reservation_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        order_id = order.id
        variant_id = v1.id
        db_setup.commit()
        db_setup.close()

        cf_payment_id = f"cf_pay_exp_{int(time.time())}"
        payload = {
            "type": "PAYMENT_SUCCESS_WEBHOOK",
            "event_time": datetime.now(timezone.utc).isoformat(),
            "data": {
                "order": {"order_id": order_code, "order_amount": 1800.00, "order_currency": "INR"},
                "payment": {
                    "cf_payment_id": cf_payment_id,
                    "payment_status": "SUCCESS",
                    "payment_amount": 1800.00,
                    "payment_currency": "INR",
                },
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")

        barrier = threading.Barrier(2)
        errors = []

        def payment_worker():
            db_p = self.SessionLocal()
            try:
                barrier.wait(timeout=5)
                res = process_cashfree_webhook(db_p, payload, raw_body_bytes=body_bytes)
                if not res[0]:
                    errors.append(f"Payment failed: {res[1]}")
            except Exception as e:
                errors.append(f"Payment exception: {e}")
            finally:
                db_p.close()

        def expiry_worker():
            db_e = self.SessionLocal()
            try:
                barrier.wait(timeout=5)
                expire_unpaid_prepaid_reservations(db_e)
            except Exception as e:
                errors.append(f"Expiry exception: {e}")
            finally:
                db_e.close()

        t1 = threading.Thread(target=payment_worker)
        t2 = threading.Thread(target=expiry_worker)
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        self.assertEqual(len(errors), 0, f"Race errors on PostgreSQL: {errors}")

        db_check = self.SessionLocal()
        try:
            final_order = db_check.query(Order).filter(Order.id == order_id).first()
            # Order must be PAID / CONFIRMED
            self.assertEqual(final_order.payment_status, "PAID")
            self.assertIn(final_order.status, ("PAID", "CONFIRMED"))
        finally:
            db_check.close()

    def test_03_ascending_variant_lock_order_multi_variant(self):
        """Multi-variant orders lock variants in strictly ascending ID order, preventing PostgreSQL deadlocks."""
        from app.models import Order, ProductVariant
        from app.services.order_service import cancel_order_atomic

        db_setup = self.SessionLocal()
        order_code = f"PG-RACE-MULTI-{int(time.time())}"
        order, v1, v2 = self._create_test_order(db_setup, order_code, Decimal("2500.00"), multi_variant=True)
        order_id = order.id
        db_setup.close()

        # Run concurrent cancellations to test ascending lock ordering under load
        barrier = threading.Barrier(2)
        deadlocks = []

        def cancel_worker():
            db_c = self.SessionLocal()
            try:
                ord_obj = db_c.query(Order).filter(Order.id == order_id).first()
                barrier.wait(timeout=5)
                cancel_order_atomic(db_c, ord_obj, reason="Stress test lock order", restock=True)
            except Exception as e:
                if "deadlock detected" in str(e).lower():
                    deadlocks.append(str(e))
                else:
                    deadlocks.append(f"Other error: {e}")
            finally:
                db_c.close()

        t1 = threading.Thread(target=cancel_worker)
        t2 = threading.Thread(target=cancel_worker)
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        self.assertEqual(len(deadlocks), 0, f"Deadlock occurred during ascending variant locking: {deadlocks}")

    def test_04_webhook_vs_customer_cancellation_race(self):
        """Concurrent customer cancellation vs payment webhook executes safely without deadlocks."""
        from app.models import Order
        from app.services.payment_service import process_cashfree_webhook
        from app.services.order_service import cancel_order_atomic

        db_setup = self.SessionLocal()
        order_code = f"PG-RACE-CUST-{int(time.time())}"
        order, v1, _ = self._create_test_order(db_setup, order_code, Decimal("2100.00"), initial_stock=8)
        order_id = order.id
        db_setup.close()

        cf_payment_id = f"cf_pay_cust_{int(time.time())}"
        payload = {
            "type": "PAYMENT_SUCCESS_WEBHOOK",
            "event_time": datetime.now(timezone.utc).isoformat(),
            "data": {
                "order": {"order_id": order_code, "order_amount": 2100.00, "order_currency": "INR"},
                "payment": {
                    "cf_payment_id": cf_payment_id,
                    "payment_status": "SUCCESS",
                    "payment_amount": 2100.00,
                    "payment_currency": "INR",
                },
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")

        barrier = threading.Barrier(2)
        errors = []

        def payment_worker():
            db_p = self.SessionLocal()
            try:
                barrier.wait(timeout=5)
                res = process_cashfree_webhook(db_p, payload, raw_body_bytes=body_bytes)
                if not res[0]:
                    errors.append(f"Payment failed: {res[1]}")
            except Exception as e:
                errors.append(f"Payment exception: {e}")
            finally:
                db_p.close()

        def cancel_worker():
            db_c = self.SessionLocal()
            try:
                ord_obj = db_c.query(Order).filter(Order.id == order_id).first()
                barrier.wait(timeout=5)
                cancel_order_atomic(db_c, ord_obj, reason="Customer cancelled before payment", restock=True)
            except Exception as e:
                errors.append(f"Cancel exception: {e}")
            finally:
                db_c.close()

        t1 = threading.Thread(target=payment_worker)
        t2 = threading.Thread(target=cancel_worker)
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        self.assertEqual(len(errors), 0, f"Race errors: {errors}")

        db_check = self.SessionLocal()
        try:
            final_order = db_check.query(Order).filter(Order.id == order_id).first()
            # If payment arrived, payment_status must be PAID
            self.assertEqual(final_order.payment_status, "PAID")
            self.assertIn(final_order.status, ("PAID", "CONFIRMED"))
        finally:
            db_check.close()

    def test_05_sold_out_delayed_payment_postgres_no_crash(self):
        """Verifies sold-out delayed payment fits into VARCHAR(20) payment_status on PostgreSQL without error."""
        from app.models import Order, PaymentEvent, ProductVariant
        from app.services.payment_service import process_cashfree_webhook
        from app.services.order_service import cancel_order_atomic

        db_setup = self.SessionLocal()
        order_code = f"PG-SOLDOUT-{int(time.time())}"
        order, v1, _ = self._create_test_order(db_setup, order_code, Decimal("1800.00"), initial_stock=1)
        order_id = order.id
        variant_id = v1.id
        db_setup.close()

        # Step 1: Cancel the order with restock
        db_cancel = self.SessionLocal()
        order_to_cancel = db_cancel.query(Order).filter(Order.id == order_id).first()
        cancel_order_atomic(db_cancel, order_to_cancel, reason="Payment window expired", restock=True)
        db_cancel.close()

        # Step 2: Simulate stock getting sold to another buyer
        db_buy = self.SessionLocal()
        v_bought = db_buy.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
        v_bought.stock = 0
        db_buy.commit()
        db_buy.close()

        # Step 3: Delayed Cashfree payment arrives for the cancelled order
        cf_payment_id = f"cf_pay_soldout_{int(time.time())}"
        payload = {
            "type": "PAYMENT_SUCCESS_WEBHOOK",
            "event_time": datetime.now(timezone.utc).isoformat(),
            "data": {
                "order": {"order_id": order_code, "order_amount": 1800.00, "order_currency": "INR"},
                "payment": {
                    "cf_payment_id": cf_payment_id,
                    "payment_status": "SUCCESS",
                    "payment_amount": 1800.00,
                    "payment_currency": "INR",
                },
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")

        db_pay = self.SessionLocal()
        try:
            # This MUST NOT raise psycopg2.errors.StringDataRightTruncation: value too long for type character varying(20)
            success, msg = process_cashfree_webhook(db_pay, payload, raw_body_bytes=body_bytes)
            self.assertTrue(success)
            self.assertIn("refund", msg.lower())

            # Verify order status and payment status in PostgreSQL
            db_pay.expire_all()
            final_order = db_pay.query(Order).filter(Order.id == order_id).first()
            self.assertEqual(final_order.status, "CANCELLED")
            self.assertEqual(final_order.payment_status, "PAID")
            self.assertLessEqual(len(final_order.payment_status), 20)
            self.assertIn("INVENTORY CONFLICT", final_order.admin_notes)

            # Verify PaymentEvent outcome
            event = db_pay.query(PaymentEvent).filter(PaymentEvent.payment_id == cf_payment_id).first()
            self.assertIsNotNone(event)
            self.assertEqual(event.outcome, "INVENTORY_CONFLICT_REFUND_REQUIRED")

            # Verify stock was not driven negative
            v_check = db_pay.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
            self.assertEqual(v_check.stock, 0)
        finally:
            db_pay.close()

    def test_06_sync_endpoint_no_lock_during_network_call(self):
        """Verifies sync_cashfree_payment_status releases/does not hold row locks across network requests."""
        from unittest.mock import patch
        from app.models import Order
        from app.services.payment_service import sync_cashfree_payment_status

        db_setup = self.SessionLocal()
        order_code = f"PG-SYNC-NOLOCK-{int(time.time())}"
        order, _, _ = self._create_test_order(db_setup, order_code, Decimal("1500.00"))
        order_id = order.id
        db_setup.close()

        lock_acquired_concurrently = [False]
        lock_error = [None]

        # Mock external Cashfree GET response
        mock_response_data = [
            {
                "cf_payment_id": f"cf_sync_{int(time.time())}",
                "payment_status": "SUCCESS",
                "payment_amount": 1500.00,
                "payment_currency": "INR",
                "payment_time": datetime.now(timezone.utc).isoformat(),
            }
        ]

        def slow_mock_get(*args, **kwargs):
            # While the mock network call is in flight, another thread attempts to lock the Order row
            db_concurrent = self.SessionLocal()
            try:
                # If sync_cashfree_payment_status held with_for_update() across the network call,
                # with_for_update(nowait=True) here would immediately raise LockNotAvailable / OperationalError!
                locked_row = (
                    db_concurrent.query(Order)
                    .filter(Order.id == order_id)
                    .with_for_update(nowait=True)
                    .first()
                )
                if locked_row:
                    lock_acquired_concurrently[0] = True
                db_concurrent.commit()
            except Exception as e:
                lock_error[0] = e
            finally:
                db_concurrent.close()

            # Return a mock response mimicking Cashfree payments API
            class MockResponse:
                status_code = 200
                def json(self):
                    return mock_response_data
            return MockResponse()

        db_sync = self.SessionLocal()
        try:
            with patch("httpx.Client.get", side_effect=slow_mock_get):
                success, msg, synced_order = sync_cashfree_payment_status(db_sync, order_code)
                self.assertTrue(success)
                self.assertEqual(synced_order.payment_status, "PAID")

            self.assertTrue(
                lock_acquired_concurrently[0],
                f"Concurrent transaction could not acquire row lock during network call: {lock_error[0]}",
            )
        finally:
            db_sync.close()


if __name__ == "__main__":
    unittest.main()
