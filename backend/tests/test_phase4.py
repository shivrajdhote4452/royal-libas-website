import os
import sys
import json
import hmac
import hashlib
import base64
import unittest.mock
from decimal import Decimal
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Ensure test credentials
os.environ["CASHFREE_CLIENT_ID"] = "cf_test_app_id_phase4"
os.environ["CASHFREE_CLIENT_SECRET"] = "cf_test_secret_key_phase4_987654"
os.environ["CASHFREE_ENVIRONMENT"] = "sandbox"
os.environ["CASHFREE_API_VERSION"] = "2023-08-01"

from app.main import app
from app.database import Base, get_db
import app.database as app_db
from app.models import Product, ProductVariant, Order, OrderItem, Address, Coupon
from app.config import CASHFREE_CLIENT_SECRET
from seed import seed_database

# Use isolated test SQLite database file
TEST_DB_FILE = Path(backend_dir) / "test_phase4.db"
TEST_DB_URL = f"sqlite:///{TEST_DB_FILE.as_posix()}"

test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def test_coupon_validation():
    """Verify coupon validation rules."""
    print("Testing Coupon Validation...")

    # Valid WELCOME10 with subtotal >= 1500 (10% off)
    res = client.post("/coupons/validate", json={"code": "WELCOME10", "subtotal": 2000.0})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert Decimal(str(data["discount"])) == Decimal("200.00")
    print("  [OK] WELCOME10 on 2000 gave 200 discount")

    # Invalid WELCOME10 with subtotal < 1500
    res = client.post("/coupons/validate", json={"code": "WELCOME10", "subtotal": 1200.0})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is False
    assert Decimal(str(data["discount"])) == Decimal("0.00")
    print("  [OK] WELCOME10 rejected when subtotal < min_order_value")

    # Valid FESTIVE100 with subtotal >= 1000 (Flat 100 off)
    res = client.post("/coupons/validate", json={"code": "FESTIVE100", "subtotal": 1500.0})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert Decimal(str(data["discount"])) == Decimal("100.00")
    print("  [OK] FESTIVE100 on 1500 gave 100 flat discount")

    # Non-existent coupon
    res = client.post("/coupons/validate", json={"code": "FAKECODE", "subtotal": 5000.0})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is False
    print("  [OK] Non-existent coupon correctly rejected")


def test_cart_validation():
    """Verify /cart/validate re-checks live stock and server prices."""
    print("Testing Cart Validation...")
    db = TestingSessionLocal()

    # Find in-stock variant and sold-out variant
    in_stock_v = db.query(ProductVariant).filter(ProductVariant.stock > 5).first()
    assert in_stock_v is not None

    sold_out_v = db.query(ProductVariant).filter(ProductVariant.stock == 0).first()
    assert sold_out_v is not None

    # 1. Cart with valid item
    res = client.post(
        "/cart/validate",
        json={"items": [{"variant_id": in_stock_v.id, "quantity": 1}]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_valid"] is True
    assert Decimal(str(data["subtotal"])) == in_stock_v.selling_price
    assert data["items"][0]["is_available"] is True
    print("  [OK] Cart with valid item validated successfully")

    # 2. Cart with sold-out item
    res = client.post(
        "/cart/validate",
        json={"items": [{"variant_id": sold_out_v.id, "quantity": 1}]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_valid"] is False
    assert len(data["unavailable_lines"]) > 0
    assert data["items"][0]["is_available"] is False
    print("  [OK] Cart correctly flagged sold-out variant")
    db.close()


def test_tamper_test_and_atomic_stock_decrement():
    """TAMPER TEST: Server must calculate all totals from DB prices.
    Never trust client total or price. Stock decrements atomically.
    """
    print("Testing Tamper Test & Atomic Stock Decrement...")
    db = TestingSessionLocal()

    v = (
        db.query(ProductVariant)
        .filter(ProductVariant.stock > 5)
        .first()
    )
    assert v is not None
    initial_stock = v.stock
    unit_price = Decimal(str(v.selling_price))
    qty = 2
    expected_subtotal = unit_price * Decimal(qty)
    # COD with subtotal >= 1500 gives 0 shipping, < 1500 gives 99 shipping
    expected_shipping = Decimal("0.00") if expected_subtotal >= Decimal("1500.00") else Decimal("99.00")
    expected_total = expected_subtotal + expected_shipping

    # Attempt to order with tampered client data (injecting malicious extra fields)
    payload = {
        "customer_name": "Tamper Test User",
        "phone": "9876543210",
        "payment_method": "COD",
        "items": [{"variant_id": v.id, "quantity": qty, "price": 1.0, "line_total": 2.0}],
        "total": 5.0,  # Client tries to pay Rs. 5 instead of real price!
        "subtotal": 2.0,
        "address": {
            "name": "Tamper Test User",
            "phone": "9876543210",
            "pincode": "400001",
            "line1": "Flat 101, Test Residency",
            "city": "Mumbai",
            "state": "Maharashtra",
        },
    }

    res = client.post("/orders", json=payload)
    assert res.status_code == 201, f"Order creation failed: {res.text}"
    order_data = res.json()

    # TAMPER TEST VERIFICATION:
    # Server completely IGNORED client total=5.0 and computed authoritative price from DB!
    assert Decimal(str(order_data["subtotal"])) == expected_subtotal, "Subtotal was not computed from DB price!"
    assert Decimal(str(order_data["total"])) == expected_total, "Total was tampered or incorrect!"
    assert Decimal(str(order_data["total"])) != Decimal("5.00"), "SECURITY CRITICAL: Server accepted client tampered total!"
    print(f"  [OK] Tamper Test Passed: client total 5.0 was ignored; server enforced DB total {expected_total}")

    # ATOMIC STOCK DECREMENT VERIFICATION:
    db.refresh(v)
    assert v.stock == initial_stock - qty, f"Stock mismatch! Initial: {initial_stock}, now: {v.stock}, expected: {initial_stock - qty}"
    print(f"  [OK] Stock decremented atomically: {initial_stock} -> {v.stock}")
    db.close()


def test_sold_out_race_condition():
    """Verify ordering a variant with insufficient stock fails with HTTP 400."""
    print("Testing Sold-Out / Race Condition Handling...")
    db = TestingSessionLocal()

    sold_out_v = db.query(ProductVariant).filter(ProductVariant.stock == 0).first()
    assert sold_out_v is not None

    payload = {
        "customer_name": "Test Race Condition",
        "phone": "9998887776",
        "payment_method": "COD",
        "items": [{"variant_id": sold_out_v.id, "quantity": 1}],
        "address": {
            "name": "Test Race Condition",
            "phone": "9998887776",
            "pincode": "110001",
            "line1": "Connaught Place",
            "city": "New Delhi",
            "state": "Delhi",
        },
    }

    res = client.post("/orders", json=payload)
    assert res.status_code == 400
    assert "sold out" in res.json()["detail"].lower()
    print("  [OK] HTTP 400 returned when purchasing sold-out variant")
    db.close()


def test_cashfree_unconfigured_gateway_returns_503():
    """Verify unconfigured gateway returns 503 and frontend config flags unconfigured."""
    print("Testing Cashfree Unconfigured Gateway State...")
    db = TestingSessionLocal()

    in_stock_v = db.query(ProductVariant).filter(ProductVariant.stock >= 2).first()
    assert in_stock_v is not None

    payload = {
        "customer_name": "Unconfigured Test Customer",
        "phone": "9123456789",
        "payment_method": "PREPAID",
        "items": [{"variant_id": in_stock_v.id, "quantity": 1}],
        "address": {
            "name": "Unconfigured Test Customer",
            "phone": "9123456789",
            "pincode": "560001",
            "line1": "Brigade Road",
            "city": "Bengaluru",
            "state": "Karnataka",
        },
    }
    res = client.post("/orders", json=payload)
    assert res.status_code == 201
    order_code = res.json()["order_code"]

    # Temporarily simulate unconfigured gateway
    with unittest.mock.patch("app.services.payment_service.is_cashfree_configured", return_value=False):
        # 1. Check create-order returns 503
        cf_res = client.post("/payments/cashfree/create-order", json={"order_code": order_code})
        assert cf_res.status_code == 503, f"Expected 503, got {cf_res.status_code}"
        assert "not configured" in cf_res.json()["detail"].lower()
        print("  [OK] Unconfigured gateway rejected create-order with HTTP 503")

    with unittest.mock.patch("app.routers.payments.is_cashfree_configured", return_value=False):
        # 2. Check config endpoint returns configured: false
        cfg_res = client.get("/payments/cashfree/config")
        assert cfg_res.status_code == 200
        assert cfg_res.json()["configured"] is False
        print("  [OK] Config endpoint returns configured: false")
    db.close()


def test_prepaid_cashfree_flow_and_webhook():
    """Verify prepaid order creation, Cashfree order generation, and HMAC-SHA256 Base64 webhook verification."""
    print("Testing Prepaid Order, Cashfree Order ID, & HMAC-SHA256 Webhook...")
    db = TestingSessionLocal()

    in_stock_v = db.query(ProductVariant).filter(ProductVariant.stock >= 2).first()
    assert in_stock_v is not None

    # 1. Create PREPAID order with coupon WELCOME10
    payload = {
        "customer_name": "Prepaid Cashfree Customer",
        "phone": "9123456789",
        "payment_method": "PREPAID",
        "coupon_code": "WELCOME10",
        "items": [{"variant_id": in_stock_v.id, "quantity": 1}],
        "address": {
            "name": "Prepaid Cashfree Customer",
            "phone": "9123456789",
            "pincode": "560001",
            "line1": "Brigade Road",
            "city": "Bengaluru",
            "state": "Karnataka",
        },
    }

    res = client.post("/orders", json=payload)
    assert res.status_code == 201
    order_data = res.json()
    order_code = order_data["order_code"]
    order_total = Decimal(str(order_data["total"]))
    assert order_data["status"] == "PENDING"
    assert order_data["payment_method"] == "PREPAID"
    assert order_data["payment_status"] == "PENDING"
    assert Decimal(str(order_data["shipping_charge"])) == Decimal("0.00")
    print(f"  [OK] Prepaid order created with code {order_code} and PENDING status")

    # 2. Call POST /payments/cashfree/create-order with mocked Cashfree API call
    with unittest.mock.patch("app.services.payment_service.httpx.Client") as mock_client_cls:
        mock_client = mock_client_cls.return_value.__enter__.return_value
        mock_resp = unittest.mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "cf_order_id": "cf_order_998877",
            "payment_session_id": "session_cf_test_123456",
            "order_status": "ACTIVE",
            "order_amount": float(order_total),
        }
        mock_client.post.return_value = mock_resp

        cf_res = client.post("/payments/cashfree/create-order", json={"order_code": order_code})
        assert cf_res.status_code == 200, f"Cashfree order creation failed: {cf_res.text}"
        cf_data = cf_res.json()
        assert cf_data["payment_session_id"] == "session_cf_test_123456"
        assert cf_data["order_id"] == order_code
        assert Decimal(str(cf_data["amount"])) == order_total
        print(f"  [OK] Cashfree order created: session {cf_data['payment_session_id']} for INR {order_total}")

        # Verify DB order has cashfree_order_id
        db_order = db.query(Order).filter(Order.order_code == order_code).first()
        assert db_order.cashfree_order_id == "cf_order_998877"

    # 3. Simulate Cashfree Webhook with INVALID signature -> expect 400
    timestamp = "1729000000"
    webhook_payload = {
        "type": "PAYMENT_SUCCESS_WEBHOOK",
        "data": {
            "order": {
                "order_id": order_code,
                "order_amount": float(order_total),
                "order_currency": "INR",
            },
            "payment": {
                "cf_payment_id": "cf_pay_112233",
                "payment_status": "SUCCESS",
                "payment_amount": float(order_total),
            },
        },
    }
    raw_body = json.dumps(webhook_payload).encode("utf-8")

    bad_sig_res = client.post(
        "/payments/cashfree/webhook",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "x-webhook-signature": "tampered_invalid_signature_base64",
            "x-webhook-timestamp": timestamp,
        },
    )
    assert bad_sig_res.status_code == 400
    print("  [OK] Tampered / invalid webhook signature rejected with HTTP 400")

    # 4. Simulate Cashfree Webhook with missing headers -> expect 400
    missing_hdr_res = client.post(
        "/payments/cashfree/webhook",
        content=raw_body,
        headers={"Content-Type": "application/json"},
    )
    assert missing_hdr_res.status_code == 400
    print("  [OK] Missing webhook headers rejected with HTTP 400")

    # 5. Simulate Cashfree Webhook with VALID cryptographic HMAC SHA256 Base64 signature
    secret = CASHFREE_CLIENT_SECRET.encode("utf-8")
    signed_payload = timestamp.encode("utf-8") + raw_body
    valid_sig = base64.b64encode(hmac.new(secret, signed_payload, hashlib.sha256).digest()).decode("utf-8")

    good_sig_res = client.post(
        "/payments/cashfree/webhook",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "x-webhook-signature": valid_sig,
            "x-webhook-timestamp": timestamp,
        },
    )
    assert good_sig_res.status_code == 200, f"Valid webhook failed: {good_sig_res.text}"
    assert good_sig_res.json()["status"] == "ok"
    print("  [OK] Valid Cashfree webhook signature accepted")

    # Verify Order in DB is now PAID
    db.refresh(db_order)
    assert db_order.status == "PAID"
    assert db_order.payment_status == "PAID"
    print(f"  [OK] Verified webhook transitioned order {order_code} to PAID status")

    # 6. IDEMPOTENCY TEST: Send the exact same webhook event again
    dup_sig_res = client.post(
        "/payments/cashfree/webhook",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "x-webhook-signature": valid_sig,
            "x-webhook-timestamp": timestamp,
        },
    )
    assert dup_sig_res.status_code == 200
    dup_data = dup_sig_res.json()
    assert dup_data["status"] == "ok"
    assert "already marked PAID" in dup_data["detail"]
    print("  [OK] Webhook idempotency verified: duplicate webhook handled gracefully without double change")

    db.close()


def test_cashfree_webhook_amount_mismatch_rejected():
    """Verify webhook with amount mismatch does NOT mark order PAID and returns 400."""
    print("Testing Cashfree Webhook Amount Mismatch Rejection...")
    db = TestingSessionLocal()

    in_stock_v = db.query(ProductVariant).filter(ProductVariant.stock >= 2).first()
    assert in_stock_v is not None

    payload = {
        "customer_name": "Mismatch Test Customer",
        "phone": "9123456789",
        "payment_method": "PREPAID",
        "items": [{"variant_id": in_stock_v.id, "quantity": 1}],
        "address": {
            "name": "Mismatch Test Customer",
            "phone": "9123456789",
            "pincode": "560001",
            "line1": "Brigade Road",
            "city": "Bengaluru",
            "state": "Karnataka",
        },
    }
    res = client.post("/orders", json=payload)
    assert res.status_code == 201
    order_code = res.json()["order_code"]
    real_total = Decimal(str(res.json()["total"]))

    # Prepare webhook with forged/tampered amount (e.g. Rs 100 instead of real total)
    tampered_amount = float(real_total) - 500.0
    timestamp = "1729000000"
    webhook_payload = {
        "type": "PAYMENT_SUCCESS_WEBHOOK",
        "data": {
            "order": {
                "order_id": order_code,
                "order_amount": tampered_amount,
                "order_currency": "INR",
            },
            "payment": {
                "cf_payment_id": "cf_pay_tampered_001",
                "payment_status": "SUCCESS",
                "payment_amount": tampered_amount,
            },
        },
    }
    raw_body = json.dumps(webhook_payload).encode("utf-8")
    signed_payload = timestamp.encode("utf-8") + raw_body
    secret = CASHFREE_CLIENT_SECRET.encode("utf-8")
    valid_sig = base64.b64encode(hmac.new(secret, signed_payload, hashlib.sha256).digest()).decode("utf-8")

    wh_res = client.post(
        "/payments/cashfree/webhook",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "x-webhook-signature": valid_sig,
            "x-webhook-timestamp": timestamp,
        },
    )
    assert wh_res.status_code == 400
    assert "mismatch" in wh_res.json()["detail"].lower()
    print("  [OK] Amount mismatch webhook rejected with HTTP 400")

    # Confirm order was NOT marked PAID in database
    db_order = db.query(Order).filter(Order.order_code == order_code).first()
    assert db_order.status == "PENDING"
    assert db_order.payment_status == "PENDING"
    print(f"  [OK] Order {order_code} remained PENDING (not marked PAID)")
    db.close()


def test_cashfree_failed_webhook_marks_failed():
    """Verify PAYMENT_FAILED_WEBHOOK marks payment_status FAILED and does not mark order PAID."""
    print("Testing Cashfree Failed Webhook...")
    db = TestingSessionLocal()

    in_stock_v = db.query(ProductVariant).filter(ProductVariant.stock >= 2).first()
    assert in_stock_v is not None

    payload = {
        "customer_name": "Failed Payment Customer",
        "phone": "9123456789",
        "payment_method": "PREPAID",
        "items": [{"variant_id": in_stock_v.id, "quantity": 1}],
        "address": {
            "name": "Failed Payment Customer",
            "phone": "9123456789",
            "pincode": "560001",
            "line1": "Brigade Road",
            "city": "Bengaluru",
            "state": "Karnataka",
        },
    }
    res = client.post("/orders", json=payload)
    assert res.status_code == 201
    order_code = res.json()["order_code"]
    total = float(res.json()["total"])

    timestamp = "1729000000"
    webhook_payload = {
        "type": "PAYMENT_FAILED_WEBHOOK",
        "data": {
            "order": {
                "order_id": order_code,
                "order_amount": total,
                "order_currency": "INR",
            },
            "payment": {
                "cf_payment_id": "cf_pay_failed_001",
                "payment_status": "FAILED",
                "payment_amount": total,
            },
        },
    }
    raw_body = json.dumps(webhook_payload).encode("utf-8")
    signed_payload = timestamp.encode("utf-8") + raw_body
    secret = CASHFREE_CLIENT_SECRET.encode("utf-8")
    valid_sig = base64.b64encode(hmac.new(secret, signed_payload, hashlib.sha256).digest()).decode("utf-8")

    wh_res = client.post(
        "/payments/cashfree/webhook",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "x-webhook-signature": valid_sig,
            "x-webhook-timestamp": timestamp,
        },
    )
    assert wh_res.status_code == 200

    db_order = db.query(Order).filter(Order.order_code == order_code).first()
    assert db_order.payment_status == "FAILED"
    assert db_order.status == "PENDING"
    print(f"  [OK] Order {order_code} recorded as FAILED and never marked PAID")
    db.close()


def run_all():
    print("===========================================")
    print(">>> RUNNING PHASE 4 CASHFREE TEST SUITE <<<")
    print("===========================================\n")

    # Re-create database schema
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    orig_session = app_db.SessionLocal
    orig_engine = app_db.engine
    app_db.SessionLocal = TestingSessionLocal
    app_db.engine = test_engine

    try:
        # Seed test database
        print("Seeding test database...")
        seed_database(session_factory=TestingSessionLocal)

        test_coupon_validation()
        test_cart_validation()
        test_tamper_test_and_atomic_stock_decrement()
        test_sold_out_race_condition()
        test_cashfree_unconfigured_gateway_returns_503()
        test_prepaid_cashfree_flow_and_webhook()
        test_cashfree_webhook_amount_mismatch_rejected()
        test_cashfree_failed_webhook_marks_failed()

        print("\n===========================================")
        print(">>> ALL PHASE 4 CASHFREE CHECKS PASSED! <<<")
        print("===========================================")
    finally:
        app_db.SessionLocal = orig_session
        app_db.engine = orig_engine
        test_engine.dispose()
        if TEST_DB_FILE.exists():
            try:
                TEST_DB_FILE.unlink()
            except Exception:
                pass


if __name__ == "__main__":
    run_all()
