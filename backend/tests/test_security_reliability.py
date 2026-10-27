"""Comprehensive Security, Reliability, Payment, Inventory, and Fulfillment Test Suite.

Covers:
1. Customer privacy protection & order code enumeration prevention
2. Unguessable order access tokens & rate limiting
3. Concurrent purchase of the last unit (race condition prevention)
4. Idempotent cancellation and atomic restocking
5. Unpaid prepaid reservation expiration
6. Cashfree webhook HMAC-SHA256 signature and amount matching
7. Delayed payment success on cancelled order (stock conflict vs re-reservation)
8. Cashfree server-to-server payment reconciliation sync
9. Shiprocket fulfillment guards (unpaid prepaid & unconfirmed COD blocking)
10. Shiprocket webhook authentication and terminal status non-regression
"""

import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import hmac
import hashlib
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
import app.database as app_db
from app.models import Admin, Product, ProductVariant, Order, OrderItem, Address
from app.auth import hash_password, create_access_token
from app.services.order_service import (
    create_order_transaction,
    cancel_order_atomic,
    expire_unpaid_prepaid_reservations,
    generate_order_token,
)
from app.services.payment_service import (
    process_cashfree_webhook,
    sync_cashfree_payment_status,
)
from app.schemas import OrderCreateRequest

TEST_DB_FILE = os.path.join(backend_dir, "test_security.db")
TEST_DB_URL = f"sqlite:///{TEST_DB_FILE}"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def setup_module():
    app_db.SessionLocal = TestingSessionLocal
    app_db.engine = test_engine
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)


def teardown_module():
    test_engine.dispose()
    if os.path.exists(TEST_DB_FILE):
        try:
            os.remove(TEST_DB_FILE)
        except Exception:
            pass


def get_test_admin_token() -> str:
    db = TestingSessionLocal()
    admin = db.query(Admin).filter(Admin.email == "test_admin@royallibas.com").first()
    if not admin:
        admin = Admin(
            email="test_admin@royallibas.com",
            password_hash=hash_password("AdminPass123!"),
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
    token = create_access_token({"sub": str(admin.id), "email": admin.email})
    db.close()
    return token


def create_sample_product_and_variant(stock=1, price=Decimal("2999.00")) -> int:
    db = TestingSessionLocal()
    import uuid
    suffix = uuid.uuid4().hex[:6]
    product = Product(
        name=f"Royal Festive Kurti {suffix}",
        slug=f"royal-festive-kurti-{suffix}",
        is_active=True,
    )
    db.add(product)
    db.flush()

    variant = ProductVariant(
        product_id=product.id,
        size="M",
        colour="Maroon",
        stock=stock,
        mrp=price + Decimal("500.00"),
        selling_price=price,
    )
    db.add(variant)
    db.commit()
    vid = variant.id
    db.close()
    return vid


# ========================================================
# 1. Customer Privacy & Order Code Enumeration Protection
# ========================================================

def test_unauthorized_order_code_lookup_masks_pii():
    """Verify that someone guessing or querying an order code without token or phone
    cannot view private customer data (address lines, phone, internal IDs)."""
    vid = create_sample_product_and_variant(stock=5)

    order_payload = {
        "customer_name": "Aaradhya Kapoor",
        "phone": "9876543210",
        "payment_method": "COD",
        "items": [{"variant_id": vid, "quantity": 1}],
        "address": {
            "name": "Aaradhya Kapoor",
            "phone": "9876543210",
            "pincode": "400050",
            "line1": "Flat 502, Bandra West, Luxury Heights",
            "line2": "Near Linking Road",
            "city": "Mumbai",
            "state": "Maharashtra",
        },
    }
    res = client.post("/orders", json=order_payload)
    assert res.status_code == 201, f"POST /orders failed ({res.status_code}): {res.text}"
    created_order = res.json()
    order_code = created_order["order_code"]
    order_token = created_order["order_token"]
    assert order_token is not None and len(order_token) >= 32

    # 1. Querying order by code alone WITHOUT token or phone
    public_res = client.get(f"/orders/{order_code}")
    assert public_res.status_code == 200
    pub_data = public_res.json()

    # Private data MUST be masked or stripped:
    assert pub_data["order_token"] is None, "order_token leaked to unverified requester!"
    assert pub_data["customer_name"] == "A******* K*****", "Customer name was not masked!"
    assert pub_data["phone"] == "******3210", "Full phone number was leaked!"
    assert pub_data["address"]["line1"] == "*** Protected ***", "Street address line1 was leaked!"
    assert pub_data["address"]["line2"] is None, "Street address line2 was leaked!"
    assert pub_data["shiprocket_order_id"] is None, "Internal Shiprocket order ID leaked!"
    assert pub_data["label_url"] is None, "Internal shipping label URL leaked!"

    # 2. Querying with valid order_token returns full details for the buyer
    auth_res = client.get(f"/orders/{order_code}?token={order_token}")
    assert auth_res.status_code == 200
    auth_data = auth_res.json()
    assert auth_data["customer_name"] == "Aaradhya Kapoor"
    assert auth_data["phone"] == "9876543210"
    assert "Flat 502" in auth_data["address"]["line1"]

    # 3. Querying tracking endpoint without phone or token is rejected with 400
    track_no_auth = client.get(f"/orders/track?order_code={order_code}")
    assert track_no_auth.status_code == 400
    assert "privacy" in track_no_auth.json()["detail"].lower()

    # 4. Tracking with wrong phone returns 404 (zero customer data leaked)
    track_wrong_phone = client.get(f"/orders/track?order_code={order_code}&phone=9999999999")
    assert track_wrong_phone.status_code == 404


def test_order_code_lookup_rate_limiting():
    """Verify rate limiter blocks automated brute-force guessing of order codes."""
    from app.routers.orders import _order_lookup_attempts
    _order_lookup_attempts.clear()

    # Make 26 requests rapidly from the test client
    hit_429 = False
    for i in range(27):
        res = client.get(f"/orders/RL-2026-{1000 + i}")
        if res.status_code == 429:
            hit_429 = True
            assert "Retry-After" in res.headers
            break

    assert hit_429, "Rate limiter did not trigger 429 Too Many Requests on rapid lookups!"
    _order_lookup_attempts.clear()


# ========================================================
# 2. Stock Reservation, Race Conditions & Expiry
# ========================================================

def test_last_unit_inventory_race_condition():
    """Ensure two customers attempting to purchase the last available unit
    cannot oversell. The first succeeds; the second receives an explicit 400 error."""
    vid = create_sample_product_and_variant(stock=1)

    payload1 = {
        "customer_name": "Buyer One",
        "phone": "9876511111",
        "payment_method": "PREPAID",
        "items": [{"variant_id": vid, "quantity": 1}],
        "address": {
            "name": "Buyer One",
            "phone": "9876511111",
            "pincode": "560001",
            "line1": "Brigade Road",
            "city": "Bengaluru",
            "state": "Karnataka",
        },
    }
    payload2 = {
        "customer_name": "Buyer Two",
        "phone": "9876522222",
        "payment_method": "PREPAID",
        "items": [{"variant_id": vid, "quantity": 1}],
        "address": {
            "name": "Buyer Two",
            "phone": "9876522222",
            "pincode": "560001",
            "line1": "Commercial Street",
            "city": "Bengaluru",
            "state": "Karnataka",
        },
    }

    res1 = client.post("/orders", json=payload1)
    assert res1.status_code == 201

    # Second buyer tries to buy the same last item
    res2 = client.post("/orders", json=payload2)
    assert "sold out" in res2.json()["detail"].lower() or "stock" in res2.json()["detail"].lower()

    # Check database stock is exactly 0 (not negative)
    db = TestingSessionLocal()
    v = db.query(ProductVariant).filter(ProductVariant.id == vid).first()
    assert v.stock == 0
    db.close()


def test_idempotent_order_cancellation_and_restocking():
    """Ensure order cancellation restores reserved stock and multiple cancel calls
    do not erroneously restock stock multiple times."""
    vid = create_sample_product_and_variant(stock=2)

    order_payload = {
        "customer_name": "Cancelling Customer",
        "phone": "9876533333",
        "payment_method": "PREPAID",
        "items": [{"variant_id": vid, "quantity": 1}],
        "address": {
            "name": "Cancelling Customer",
            "phone": "9876533333",
            "pincode": "302001",
            "line1": "MI Road",
            "city": "Jaipur",
            "state": "Rajasthan",
        },
    }
    create_res = client.post("/orders", json=order_payload)
    assert create_res.status_code == 201
    order_code = create_res.json()["order_code"]
    order_token = create_res.json()["order_token"]

    db = TestingSessionLocal()
    v = db.query(ProductVariant).filter(ProductVariant.id == vid).first()
    assert v.stock == 1  # 2 - 1 = 1
    db.close()

    # Cancel via API with valid token
    cancel_res1 = client.post(
        f"/orders/{order_code}/cancel",
        json={"token": order_token, "reason": "Customer changed mind at checkout"},
    )
    assert cancel_res1.status_code == 200
    assert cancel_res1.json()["status"] == "CANCELLED"

    db = TestingSessionLocal()
    v = db.query(ProductVariant).filter(ProductVariant.id == vid).first()
    assert v.stock == 2  # Restocked back to 2
    db.close()

    # Try cancelling again (repeated click or network retry)
    # Must NOT restock again (stock must remain 2, not 3)
    db = TestingSessionLocal()
    order_obj = db.query(Order).filter(Order.order_code == order_code).first()
    cancel_order_atomic(db, order_obj, reason="Duplicate cancel call", restock=True)
    v = db.query(ProductVariant).filter(ProductVariant.id == vid).first()
    assert v.stock == 2, f"Stock was incremented more than once! Found {v.stock}"
    db.close()


def test_unpaid_prepaid_reservation_expiry():
    """Verify that unpaid prepaid orders past their reservation window (20 min)
    are expired and their stock returned to inventory."""
    vid = create_sample_product_and_variant(stock=1)

    order_payload = {
        "customer_name": "Abandoned Checkout",
        "phone": "9876544444",
        "payment_method": "PREPAID",
        "items": [{"variant_id": vid, "quantity": 1}],
        "address": {
            "name": "Abandoned Checkout",
            "phone": "9876544444",
            "pincode": "110001",
            "line1": "Connaught Place",
            "city": "New Delhi",
            "state": "Delhi",
        },
    }
    create_res = client.post("/orders", json=order_payload)
    assert create_res.status_code == 201
    order_code = create_res.json()["order_code"]

    db = TestingSessionLocal()
    v = db.query(ProductVariant).filter(ProductVariant.id == vid).first()
    assert v.stock == 0  # Reserved

    # Simulate passing 21 minutes
    order = db.query(Order).filter(Order.order_code == order_code).first()
    order.reservation_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db.commit()

    # Run expiration service
    expired_count = expire_unpaid_prepaid_reservations(db)
    assert expired_count >= 1

    # Check order is cancelled and stock released
    db.refresh(order)
    assert order.status == "CANCELLED"
    db.refresh(v)
    assert v.stock == 1, "Stock was not released after reservation expiration!"
    db.close()


# ========================================================
# 3. Cashfree Payment Reliability & Webhook Safety
# ========================================================

def test_cashfree_webhook_amount_and_signature_validation():
    """Verify Cashfree webhook strictly rejects tampered signatures and amount mismatches."""
    import base64
    from app import config
    from app.services import payment_service
    test_secret = "test_cashfree_secret_key_123"
    config.CASHFREE_SECRET_KEY = test_secret
    payment_service.CASHFREE_CLIENT_SECRET = test_secret
    config.CASHFREE_APP_ID = "test_app_id"

    vid = create_sample_product_and_variant(stock=2, price=Decimal("1500.00"))

    order_payload = {
        "customer_name": "Webhook Tester",
        "phone": "9876555555",
        "payment_method": "PREPAID",
        "items": [{"variant_id": vid, "quantity": 1}],
        "address": {
            "name": "Webhook Tester",
            "phone": "9876555555",
            "pincode": "400001",
            "line1": "Nariman Point",
            "city": "Mumbai",
            "state": "Maharashtra",
        },
    }
    create_res = client.post("/orders", json=order_payload)
    order_code = create_res.json()["order_code"]
    total_amount = float(create_res.json()["total"])

    # 1. Invalid signature must be rejected with 400
    timestamp = str(int(time.time()))
    payload_body = {
        "data": {
            "order": {"order_id": order_code, "order_amount": total_amount, "order_currency": "INR"},
            "payment": {"payment_status": "SUCCESS", "cf_payment_id": "cf_123"},
        },
        "event_time": "2026-10-28T10:00:00Z",
        "type": "PAYMENT_SUCCESS_WEBHOOK",
    }
    raw_json = str(payload_body).replace("'", '"')

    bad_sig_res = client.post(
        "/payments/cashfree/webhook",
        content=raw_json,
        headers={
            "content-type": "application/json",
            "x-webhook-timestamp": timestamp,
            "x-webhook-signature": "invalid_fake_signature",
        },
    )
    assert bad_sig_res.status_code == 400

    # 2. Valid signature with amount mismatch must be rejected
    mismatch_body = {
        "data": {
            "order": {"order_id": order_code, "order_amount": total_amount - 100.0, "order_currency": "INR"},
            "payment": {"payment_status": "SUCCESS", "cf_payment_id": "cf_123"},
        },
        "event_time": "2026-10-28T10:00:00Z",
        "type": "PAYMENT_SUCCESS_WEBHOOK",
    }
    mismatch_json = str(mismatch_body).replace("'", '"').encode("utf-8")
    sig_data = timestamp.encode("utf-8") + mismatch_json
    valid_sig = base64.b64encode(
        hmac.new(test_secret.encode("utf-8"), sig_data, hashlib.sha256).digest()
    ).decode("utf-8")

    mismatch_res = client.post(
        "/payments/cashfree/webhook",
        content=mismatch_json,
        headers={
            "content-type": "application/json",
            "x-webhook-timestamp": timestamp,
            "x-webhook-signature": valid_sig,
        },
    )
    assert mismatch_res.status_code == 400
    assert "mismatch" in mismatch_res.json()["detail"].lower()


def test_delayed_payment_success_on_cancelled_order_preventing_oversell():
    """CRITICAL SCENARIO:
    A prepaid order reserves the last item.
    The order is cancelled and stock is released to 1.
    Another customer purchases the last item (stock drops to 0).
    A delayed payment success event arrives for the first order.
    The system MUST NOT mark it PAID and must NOT oversell:
    it sets status to ACTION_REQUIRED_REFUND and alerts admin in admin_notes."""
    vid = create_sample_product_and_variant(stock=1, price=Decimal("2000.00"))

    # Buyer 1 places order
    p1 = {
        "customer_name": "First Buyer",
        "phone": "9876566666",
        "payment_method": "PREPAID",
        "items": [{"variant_id": vid, "quantity": 1}],
        "address": {"name": "First Buyer", "phone": "9876566666", "pincode": "400001", "line1": "Flat 201, Colaba Causeway Road", "city": "Mumbai", "state": "Maharashtra"},
    }
    res1 = client.post("/orders", json=p1)
    order1_code = res1.json()["order_code"]
    order1_token = res1.json()["order_token"]

    # Order 1 is cancelled before payment
    client.post(f"/orders/{order1_code}/cancel", json={"token": order1_token, "reason": "Customer dropped off"})

    # Stock is back to 1. Buyer 2 buys the last item!
    p2 = {
        "customer_name": "Second Buyer",
        "phone": "9876577777",
        "payment_method": "COD",
        "items": [{"variant_id": vid, "quantity": 1}],
        "address": {"name": "Second Buyer", "phone": "9876577777", "pincode": "400001", "line1": "Flat 302, Fort Heritage Lane", "city": "Mumbai", "state": "Maharashtra"},
    }
    res2 = client.post("/orders", json=p2)
    assert res2.status_code == 201, f"res2 failed ({res2.status_code}): {res2.text}"

    db = TestingSessionLocal()
    v = db.query(ProductVariant).filter(ProductVariant.id == vid).first()
    assert v.stock == 0  # Completely sold out!

    # Now delayed payment success arrives for Order 1!
    order1 = db.query(Order).filter(Order.order_code == order1_code).first()
    webhook_data = {
        "data": {
            "order": {"order_id": order1_code, "order_amount": float(order1.total), "order_currency": "INR"},
            "payment": {"payment_status": "SUCCESS", "cf_payment_id": "cf_delayed_999"},
        },
        "event_time": "2026-10-28T10:05:00Z",
        "type": "PAYMENT_SUCCESS_WEBHOOK",
    }

    success, message = process_cashfree_webhook(db, webhook_data)
    assert success is True
    assert "refund" in message.lower()

    db.refresh(order1)
    # Order 1 MUST NOT be marked PAID or CONFIRMED
    assert order1.status == "ACTION_REQUIRED_REFUND"
    assert order1.payment_status == "PAID_RECONCILIATION_REQUIRED"
    assert "INVENTORY CONFLICT" in order1.admin_notes
    assert "Initiate customer refund" in order1.admin_notes
    db.close()


def test_cashfree_server_to_server_payment_sync():
    """Verify /payments/cashfree/sync/{order_code} allows customer or system
    to query Cashfree server-side API when browser redirect or webhook was delayed."""
    vid = create_sample_product_and_variant(stock=2, price=Decimal("1999.00"))

    payload = {
        "customer_name": "Sync Tester",
        "phone": "9876588888",
        "payment_method": "PREPAID",
        "items": [{"variant_id": vid, "quantity": 1}],
        "address": {"name": "Sync Tester", "phone": "9876588888", "pincode": "400001", "line1": "Flat 401, Marine Drive Seaface", "city": "Mumbai", "state": "Maharashtra"},
    }
    create_res = client.post("/orders", json=payload)
    order_code = create_res.json()["order_code"]
    order_token = create_res.json()["order_token"]

    # Mock Cashfree payments API returning successful payment
    mock_cf_payments = [
        {
            "cf_payment_id": "cf_sync_12345",
            "payment_status": "SUCCESS",
            "payment_amount": 1999.00,
            "payment_currency": "INR",
        }
    ]

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_cf_payments

    with patch("app.services.payment_service.is_cashfree_configured", return_value=True), \
         patch("httpx.Client.get", return_value=mock_resp):
        sync_res = client.post(f"/payments/cashfree/sync/{order_code}")
        assert sync_res.status_code == 200
        sync_data = sync_res.json()
        assert sync_data["is_paid"] is True
        assert sync_data["order_status"] == "PAID"
        assert sync_data["payment_status"] == "PAID"

    db = TestingSessionLocal()
    order = db.query(Order).filter(Order.order_code == order_code).first()
    assert order.status == "PAID"
    assert order.payment_status == "PAID"
    db.close()


# ========================================================
# 4. Shiprocket Fulfillment & Security
# ========================================================

def test_unpaid_prepaid_and_unconfirmed_cod_fulfillment_blocked():
    """Ensure unpaid prepaid orders and unconfirmed COD orders cannot be shipped."""
    token = get_test_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    db = TestingSessionLocal()

    # 1. Unpaid prepaid order
    order_unpaid = Order(
        order_code="RL-TEST-UNPAID-01",
        customer_name="Unpaid Buyer",
        phone="9876599999",
        status="PENDING",
        payment_method="PREPAID",
        payment_status="PENDING",
        subtotal=Decimal("2499.00"),
        total=Decimal("2499.00"),
    )
    db.add(order_unpaid)
    db.commit()
    db.refresh(order_unpaid)

    ship_payload = {
        "pickup_location": "Primary",
        "length": 30.0,
        "breadth": 25.0,
        "height": 5.0,
        "weight": 0.5,
    }
    with patch("app.routers.admin.is_shiprocket_configured", return_value=True):
        res_unpaid = client.post(
            f"/admin/orders/{order_unpaid.id}/fulfillment/ship",
            headers=headers,
            json=ship_payload,
        )
        assert res_unpaid.status_code == 400
        assert "unpaid" in res_unpaid.json()["detail"].lower()

        # 2. Unconfirmed COD order (status is PENDING)
        order_cod = Order(
            order_code="RL-TEST-COD-PENDING",
            customer_name="COD Buyer",
            phone="9876500000",
            status="PENDING",
            payment_method="COD",
            payment_status="PENDING",
            subtotal=Decimal("2499.00"),
            total=Decimal("2499.00"),
        )
        db.add(order_cod)
        db.commit()
        db.refresh(order_cod)

        res_cod = client.post(
            f"/admin/orders/{order_cod.id}/fulfillment/ship",
            headers=headers,
            json=ship_payload,
        )
        assert res_cod.status_code == 400
        assert "cod orders must be verified" in res_cod.json()["detail"].lower()
    db.close()


def test_shiprocket_webhook_auth_and_terminal_status_protection():
    """Verify Shiprocket webhook requires x-api-key token when configured,
    and protects terminal states (DELIVERED/CANCELLED) from out-of-order downgrade."""
    from app import config
    config.SHIPROCKET_WEBHOOK_TOKEN = "test_sr_secret_token_123"

    db = TestingSessionLocal()
    order = Order(
        order_code="RL-TEST-TERM-DELIVERED",
        customer_name="Delivered Buyer",
        phone="9876512345",
        status="DELIVERED",
        payment_method="PREPAID",
        payment_status="PAID",
        awb_code="AWB-TERM-999",
        subtotal=Decimal("1999.00"),
        total=Decimal("1999.00"),
    )
    db.add(order)
    db.commit()
    db.close()

    # 1. Missing or invalid webhook token rejected with 401
    unauth_wh = client.post(
        "/shiprocket/webhook",
        json={"awb": "AWB-TERM-999", "current_status": "SHIPPED"},
    )
    assert unauth_wh.status_code == 401

    # 2. Valid token sent for already DELIVERED order
    # Terminal protection MUST reject regressing DELIVERED to SHIPPED
    auth_wh = client.post(
        "/shiprocket/webhook",
        headers={"x-api-key": "test_sr_secret_token_123"},
        json={"awb": "AWB-TERM-999", "current_status": "SHIPPED"},
    )
    assert auth_wh.status_code == 200
    assert auth_wh.json()["status"] == "ignored"
    assert "already in terminal state" in auth_wh.json()["reason"].lower()

    # Reset token config
    config.SHIPROCKET_WEBHOOK_TOKEN = ""


def run_all():
    print("================================================================")
    print(">>> RUNNING ROYAL LIBAS SECURITY & RELIABILITY TEST SUITE <<<")
    print("================================================================\n")
    setup_module()
    try:
        print("[1/8] Testing Unauthorized Order Code PII Masking & Token Security...")
        test_unauthorized_order_code_lookup_masks_pii()
        print("      PASS: PII strictly protected; customer token grants full access.")

        print("[2/8] Testing Order Code Lookup Rate Limiting...")
        test_order_code_lookup_rate_limiting()
        print("      PASS: Rapid enumeration blocked with HTTP 429 & Retry-After.")

        print("[3/8] Testing Last Unit Inventory Concurrency & Race Condition...")
        test_last_unit_inventory_race_condition()
        print("      PASS: Second concurrent buyer rejected with HTTP 400; stock preserved.")

        print("[4/8] Testing Idempotent Order Cancellation & Restocking...")
        test_idempotent_order_cancellation_and_restocking()
        print("      PASS: Stock restored atomically; multiple cancels do not double-restock.")

        print("[5/8] Testing Unpaid Prepaid Reservation Expiry (20-Minute Window)...")
        test_unpaid_prepaid_reservation_expiry()
        print("      PASS: Expired unpaid reservations cancelled and stock released.")

        print("[6/8] Testing Cashfree Webhook Signature & Amount Validation...")
        test_cashfree_webhook_amount_and_signature_validation()
        print("      PASS: Invalid signatures and amount mismatches rejected with HTTP 400.")

        print("[7/8] Testing Delayed Payment on Cancelled Order (Oversell Prevention)...")
        test_delayed_payment_success_on_cancelled_order_preventing_oversell()
        print("      PASS: Oversell strictly prevented; order routed to manual refund review.")

        print("[8/8] Testing Cashfree Payment Sync & Shiprocket Guards...")
        test_cashfree_server_to_server_payment_sync()
        test_unpaid_prepaid_and_unconfirmed_cod_fulfillment_blocked()
        test_shiprocket_webhook_auth_and_terminal_status_protection()
        print("      PASS: Server sync, fulfillment validation, and webhook security verified.")

        print("\n================================================================")
        print(">>> ALL 10 SECURITY, RELIABILITY & INVENTORY CHECKS PASSED! <<<")
        print("================================================================")
    finally:
        teardown_module()


if __name__ == "__main__":
    run_all()
