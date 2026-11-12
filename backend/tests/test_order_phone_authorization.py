"""Isolated regression tests for short-phone authorization bypass fix in GET /orders/{order_code}.

ISOLATION & SAFETY GUARANTEES:
1. Configures an ephemeral temporary SQLite database BEFORE importing app/database modules.
2. Enforces strict guard refusing execution against Postgres/Neon/Hostinger/prod/royal_libas.db.
3. Seeds all test products, variants, and orders exclusively into the disposable database.
4. Automatically disposes connections and deletes temporary files on exit.
"""

import atexit
import os
import shutil
import sys
import tempfile
import unittest
from decimal import Decimal

# ==============================================================================
# STRICT PRODUCTION & BUSINESS DATABASE GUARD
# ==============================================================================
FORBIDDEN_DB_PATTERNS = ["postgres", "hostinger", "neon", "prod", "staging", "royal_libas.db"]
pre_existing_url = os.environ.get("DATABASE_URL", "").lower()
if any(p in pre_existing_url for p in FORBIDDEN_DB_PATTERNS):
    raise RuntimeError(
        f"CRITICAL SAFETY GUARD: Test refused to run against potential business/production database: {pre_existing_url}"
    )

TEMP_TEST_DIR = tempfile.mkdtemp(prefix="rl_order_phone_auth_")
TEMP_TEST_DB_PATH = os.path.join(TEMP_TEST_DIR, "isolated_order_phone_auth.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEMP_TEST_DB_PATH.replace(os.sep, '/')}"
os.environ["JWT_SECRET"] = "isolated-order-phone-auth-test-jwt-secret-key"

assert "isolated_order_phone_auth.db" in os.environ["DATABASE_URL"]

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models import Product, ProductVariant, Order, Address  # noqa: E402
from app.routers.orders import _order_lookup_attempts  # noqa: E402
from app.services.order_service import normalize_indian_phone, phones_match  # noqa: E402

client = TestClient(app)
Base.metadata.create_all(bind=engine)


def cleanup_temp_db():
    try:
        engine.dispose()
    except Exception:
        pass
    if os.path.exists(TEMP_TEST_DIR):
        shutil.rmtree(TEMP_TEST_DIR, ignore_errors=True)


atexit.register(cleanup_temp_db)


def seed_product_and_variant(stock: int = 5) -> int:
    db = SessionLocal()
    try:
        import uuid
        suffix = uuid.uuid4().hex[:8]
        product = Product(
            name=f"Test Silk Anarkali {suffix}",
            slug=f"test-silk-anarkali-{suffix}",
            description="Isolated test garment",
            category="SUIT SET",
            status="PUBLISHED",
            is_active=True,
        )
        db.add(product)
        db.flush()

        variant = ProductVariant(
            product_id=product.id,
            sku=f"RL-TEST-{suffix}",
            size="M",
            colour="Maroon",
            selling_price=Decimal("2499.00"),
            stock=stock,
            is_active=True,
        )
        db.add(variant)
        db.commit()
        db.refresh(variant)
        return variant.id
    finally:
        db.close()


def create_isolated_order(variant_id: int, phone: str = "9876543210") -> dict:
    payload = {
        "customer_name": "Priya Verma",
        "phone": phone,
        "payment_method": "PREPAID",
        "shipping_method": "STANDARD",
        "address": {
            "name": "Priya Verma",
            "phone": phone,
            "pincode": "284001",
            "line1": "42 Palace Road, Civil Lines",
            "line2": "Near Clock Tower",
            "city": "Jhansi",
            "state": "Uttar Pradesh",
        },
        "items": [{"variant_id": variant_id, "quantity": 1}],
    }
    res = client.post("/orders", json=payload)
    assert res.status_code == 201, f"Order creation failed: {res.status_code} {res.text}"
    data = res.json()

    # Populate internal operational fields in isolated DB to assert unverified stripping
    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.order_code == data["order_code"]).first()
        order.admin_notes = "VIP fragile gift wrap"
        order.cashfree_order_id = "cf_order_secret_999"
        order.shiprocket_order_id = 776655
        order.shipment_id = 887766
        order.label_url = "https://shiprocket.example/internal-label.pdf"
        order.manifest_url = "https://shiprocket.example/internal-manifest.pdf"
        order.invoice_url = "https://shiprocket.example/internal-invoice.pdf"
        order.pickup_status = "SCHEDULED"
        db.commit()
    finally:
        db.close()

    return data


def assert_unverified_masked_order_response(data: dict, expected_code: str):
    assert data["order_code"] == expected_code
    assert data["order_token"] is None, "order_token MUST NOT leak to unverified callers!"
    assert data["customer_name"] == "P**** V****"
    assert data["phone"] == "******3210"
    assert data["admin_notes"] is None
    assert data["razorpay_order_id"] is None
    assert data["cashfree_order_id"] is None
    assert data["shiprocket_order_id"] is None
    assert data["shipment_id"] is None
    assert data["label_url"] is None
    assert data["manifest_url"] is None
    assert data["invoice_url"] is None
    assert data["pickup_status"] is None
    assert data["address"] is not None
    assert data["address"]["name"] == "P**** V****"
    assert data["address"]["phone"] == "******3210"
    assert data["address"]["line1"] == "*** Protected ***"
    assert data["address"]["line2"] is None


class TestOrderPhoneNormalization(unittest.TestCase):
    def test_valid_indian_phone_formats(self):
        expected = "9876543210"
        valid_inputs = [
            "9876543210",
            " 9876543210 ",
            "98765 43210",
            "98765-43210",
            "(987) 654-3210",
            "+919876543210",
            "+91 98765 43210",
            "+91-98765-43210",
            "919876543210",
            "91 9876543210",
            "00919876543210",
            "0091 98765 43210",
            "09876543210",
            "098765 43210",
        ]
        for raw in valid_inputs:
            with self.subTest(raw=raw):
                self.assertEqual(normalize_indian_phone(raw), expected)
                self.assertTrue(phones_match(raw, "9876543210"))
                self.assertTrue(phones_match(raw, "+919876543210"))

    def test_short_empty_and_malformed_inputs_rejected(self):
        invalid_inputs = [
            None,
            "",
            "   ",
            "0",
            "1",
            "9",
            "10",
            "3210",
            "6543210",
            "987654321",
            "+91",
            "+910",
            "+913210",
            "+91987654321",
            "+",
            "abc",
            "abc9876543210",
            "9876543210a",
            "98765;43210",
            "91+9876543210",
            "+19876543210",
            "+449876543210",
            "+00919876543210",
            "+09876543210",
            "819876543210",
            "98765432101",
            "009198765432109",
        ]
        for raw in invalid_inputs:
            with self.subTest(raw=raw):
                self.assertIsNone(normalize_indian_phone(raw))
                self.assertFalse(phones_match(raw, "9876543210"))

    def test_corrupted_short_stored_phone_never_matches(self):
        self.assertFalse(phones_match("123", "123"))
        self.assertFalse(phones_match("0", "0"))
        self.assertFalse(phones_match("", ""))


class TestOrderPhoneAuthorizationEndpoints(unittest.TestCase):
    def setUp(self):
        _order_lookup_attempts.clear()
        self.variant_id = seed_product_and_variant(stock=5)
        self.order = create_isolated_order(self.variant_id, phone="9876543210")
        self.order_code = self.order["order_code"]
        self.order_token = self.order["order_token"]

    def test_one_digit_and_short_suffix_inputs_blocked_on_get_order_and_track(self):
        short_probes = [str(d) for d in range(10)] + [
            "10",
            "3210",
            "543210",
            "987654321",
            "+910",
            "+913210",
            "+91987654321",
            "00913210",
        ]
        for probe in short_probes:
            _order_lookup_attempts.clear()
            with self.subTest(probe=probe):
                res = client.get(f"/orders/{self.order_code}", params={"phone": probe})
                self.assertEqual(res.status_code, 200)
                assert_unverified_masked_order_response(res.json(), self.order_code)

                track_res = client.get(
                    "/orders/track",
                    params={"order_code": self.order_code, "phone": probe},
                )
                self.assertEqual(track_res.status_code, 400)

    def test_empty_and_malformed_phone_inputs_never_authorize(self):
        malformed_probes = [
            "",
            "   ",
            "abc",
            "abc9876543210",
            "9876543210a",
            "+91-abc-3210",
            "98765;43210",
            "91+9876543210",
            "+19876543210",
            "+449876543210",
            "+00919876543210",
            "819876543210",
            "98765432101",
        ]
        for probe in malformed_probes:
            _order_lookup_attempts.clear()
            with self.subTest(probe=probe):
                res = client.get(f"/orders/{self.order_code}", params={"phone": probe})
                self.assertEqual(res.status_code, 200)
                assert_unverified_masked_order_response(res.json(), self.order_code)

                track_res = client.get(
                    "/orders/track",
                    params={"order_code": self.order_code, "phone": probe},
                )
                self.assertEqual(track_res.status_code, 400)

    def test_complete_wrong_phone_returns_masked_order_and_404_tracking(self):
        for wrong in ("9999999999", "+919999999999", "09999999999"):
            _order_lookup_attempts.clear()
            res = client.get(f"/orders/{self.order_code}", params={"phone": wrong})
            self.assertEqual(res.status_code, 200)
            assert_unverified_masked_order_response(res.json(), self.order_code)

            track_res = client.get(
                "/orders/track",
                params={"order_code": self.order_code, "phone": wrong},
            )
            self.assertEqual(track_res.status_code, 404)

    def test_valid_complete_phone_and_country_code_variants_succeed_consistently(self):
        valid_variants = [
            "9876543210",
            "+919876543210",
            "+91 98765 43210",
            "+91-98765-43210",
            "919876543210",
            "00919876543210",
            "09876543210",
        ]
        for variant in valid_variants:
            _order_lookup_attempts.clear()
            with self.subTest(variant=variant):
                res = client.get(f"/orders/{self.order_code}", params={"phone": variant})
                self.assertEqual(res.status_code, 200)
                data = res.json()
                self.assertEqual(data["customer_name"], "Priya Verma")
                self.assertEqual(data["phone"], "9876543210")
                self.assertEqual(data["address"]["line1"], "42 Palace Road, Civil Lines")
                self.assertEqual(data["address"]["line2"], "Near Clock Tower")
                self.assertEqual(data["order_token"], self.order_token)

                track_res = client.get(
                    "/orders/track",
                    params={"order_code": self.order_code, "phone": variant},
                )
                self.assertEqual(track_res.status_code, 200)
                track_data = track_res.json()
                self.assertEqual(track_data["order_code"], self.order_code)
                self.assertEqual(track_data["phone_masked"], "******3210")
                self.assertEqual(track_data["address"]["line1"], "*** Protected Address ***")

    def test_token_access_and_wrong_token_behavior(self):
        # Valid token grants full order confirmation and tracking
        res = client.get(f"/orders/{self.order_code}", params={"token": self.order_token})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["customer_name"], "Priya Verma")
        self.assertEqual(data["phone"], "9876543210")
        self.assertEqual(data["address"]["line1"], "42 Palace Road, Civil Lines")

        track_res = client.get(
            "/orders/track",
            params={"order_code": self.order_code, "token": self.order_token},
        )
        self.assertEqual(track_res.status_code, 200)

        # Wrong token NEVER leaks PII or order_token
        bad_res = client.get(f"/orders/{self.order_code}", params={"token": "invalid_token"})
        self.assertEqual(bad_res.status_code, 200)
        assert_unverified_masked_order_response(bad_res.json(), self.order_code)

        bad_track = client.get(
            "/orders/track",
            params={"order_code": self.order_code, "token": "invalid_token"},
        )
        self.assertEqual(bad_track.status_code, 404)

        # Non-ASCII token must fail closed cleanly (no 500 TypeError)
        unicode_res = client.get(f"/orders/{self.order_code}", params={"token": "tökén-é"})
        self.assertEqual(unicode_res.status_code, 200)
        assert_unverified_masked_order_response(unicode_res.json(), self.order_code)

        unicode_track = client.get(
            "/orders/track",
            params={"order_code": self.order_code, "token": "tökén-é"},
        )
        self.assertEqual(unicode_track.status_code, 404)

    def test_legacy_stored_country_code_and_corrupted_db_phone(self):
        # Legacy DB row storing '+91 9876543210' matches complete 10-digit phone, rejects short suffix
        db = SessionLocal()
        try:
            order = db.query(Order).filter(Order.order_code == self.order_code).first()
            order.phone = "+91 9876543210"
            db.commit()
        finally:
            db.close()

        _order_lookup_attempts.clear()
        short_res = client.get(f"/orders/{self.order_code}", params={"phone": "0"})
        self.assertIsNone(short_res.json()["order_token"])

        ok_res = client.get(f"/orders/{self.order_code}", params={"phone": "9876543210"})
        self.assertEqual(ok_res.json()["order_token"], self.order_token)

        # Corrupted short DB phone '123' must never allow matching with '?phone=123'
        db = SessionLocal()
        try:
            order = db.query(Order).filter(Order.order_code == self.order_code).first()
            order.phone = "123"
            db.commit()
        finally:
            db.close()

        _order_lookup_attempts.clear()
        corrupted_res = client.get(f"/orders/{self.order_code}", params={"phone": "123"})
        self.assertIsNone(corrupted_res.json()["order_token"])
        self.assertEqual(corrupted_res.json()["address"]["line1"], "*** Protected ***")

    def test_cancellation_remains_strictly_token_protected(self):
        # Attacker probing ?phone=0 receives order_token=None and cannot cancel
        probe_data = client.get(f"/orders/{self.order_code}", params={"phone": "0"}).json()
        self.assertIsNone(probe_data["order_token"])

        for bad_payload in (
            {},
            {"token": None},
            {"token": ""},
            {"token": "wrong-token"},
            {"phone": "9876543210"},
        ):
            cancel_bad = client.post(f"/orders/{self.order_code}/cancel", json=bad_payload)
            self.assertEqual(cancel_bad.status_code, 403)

        # Verify stock remained decremented (5 - 1 = 4) and order stays PENDING
        db = SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            o = db.query(Order).filter(Order.order_code == self.order_code).first()
            self.assertEqual(v.stock, 4)
            self.assertEqual(o.status, "PENDING")

            # Null order_token in DB must fail closed rather than allowing unauthenticated cancellation
            o.order_token = None
            db.commit()
        finally:
            db.close()

        null_tok_cancel = client.post(
            f"/orders/{self.order_code}/cancel",
            json={"token": ""},
        )
        self.assertEqual(null_tok_cancel.status_code, 403)

        # Restore token and verify legitimate cancellation still works and restocks
        db = SessionLocal()
        try:
            o = db.query(Order).filter(Order.order_code == self.order_code).first()
            o.order_token = self.order_token
            db.commit()
        finally:
            db.close()

        ok_cancel = client.post(
            f"/orders/{self.order_code}/cancel",
            json={"token": self.order_token, "reason": "Customer cancelled"},
        )
        self.assertEqual(ok_cancel.status_code, 200)
        self.assertEqual(ok_cancel.json()["status"], "CANCELLED")

        db = SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            self.assertEqual(v.stock, 5)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
