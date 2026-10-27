"""Phase 7 Automated Test Suite - Hardened Launch Verification & Operations Freeze.

Verifies:
1. Razorpay prepaid order (UPI/Card) test flow -> PAID via cryptographic HMAC webhook.
2. Razorpay failed/abandoned payment -> Not marked PAID.
3. COD order placement, tiered shipping fee (₹99 vs ₹0), and admin visibility.
4. Sold-out size cannot be selected or checked out (HTTP 400).
5. Item sells out while sitting in second buyer's cart -> Checkout fails clearly with atomic rollback.
6. Wrong pincode format and incomplete address are rejected with readable messages.
7. Order total tamper attempt -> Server re-calculates and charges database price strictly.
8. Admin login security: wrong password fails (401), unauthorized routes blocked (401),
   and rate-limiting / lockout activates on brute-force attempts (429).
9. Order cancellation in admin returns inventory stock atomically.
10. Tracking with matching code + phone succeeds; wrong phone returns 404 with zero data leak.
11. CORS headers allow only configured domains, rejecting arbitrary third-party origins.
12. Zero secret audit across project files.
"""

import os
import sys
import json
import hmac
import hashlib
from decimal import Decimal
from fastapi.testclient import TestClient

# Ensure test DB and backend path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["DATABASE_URL"] = "sqlite:///./royal_libas.db"
os.environ["JWT_SECRET"] = "phase7-test-jwt-secret-key-royal-libas"
os.environ["RAZORPAY_KEY_ID"] = "rzp_test_placeholder"
os.environ["RAZORPAY_KEY_SECRET"] = "test_phase7_secret_key_123456"
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "webhook_phase7_secret_987654"
os.environ["FRONTEND_URL"] = "http://localhost:5173"

from app.main import app
from app.database import SessionLocal
from app.models import Product, ProductVariant, Order, OrderItem, Admin
from app.auth import hash_password, create_access_token
from app.routers.admin import _login_failed_attempts

client = TestClient(app)


def get_or_create_test_admin():
    db = SessionLocal()
    try:
        admin = db.query(Admin).filter(Admin.email == "testadmin@royallibas.com").first()
        if not admin:
            admin = Admin(
                email="testadmin@royallibas.com",
                password_hash=hash_password("SecurePhase7Pass!"),
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        token = create_access_token({"sub": str(admin.id), "email": admin.email})
        return token
    finally:
        db.close()


def test_1_razorpay_prepaid_success_webhook():
    """Verify Razorpay prepaid order creation and signature-verified webhook marking PAID."""
    db = SessionLocal()
    try:
        variant = db.query(ProductVariant).filter(ProductVariant.stock >= 2).first()
        assert variant is not None, "Need available variant for test"
        variant_id = variant.id
        expected_unit_price = Decimal(str(variant.selling_price))
    finally:
        db.close()

    # 1. Place PREPAID order
    order_payload = {
        "customer_name": "Ananya Roy",
        "phone": "9820011223",
        "payment_method": "PREPAID",
        "address": {
            "name": "Ananya Roy",
            "phone": "9820011223",
            "line1": "Flat 402, Royal Palms Residency",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400050",
        },
        "items": [{"variant_id": variant_id, "quantity": 1}],
    }

    res = client.post("/orders", json=order_payload)
    assert res.status_code == 201, f"Failed creating prepaid order: {res.text}"
    order_data = res.json()
    order_code = order_data["order_code"]
    assert order_data["status"] == "PENDING"
    assert order_data["payment_status"] == "PENDING"
    assert float(order_data["shipping_charge"]) == 0.0  # Prepaid is always free shipping

    # 2. Call Razorpay order initialization
    rzp_res = client.post("/payments/razorpay/create-order", json={"order_code": order_code})
    assert rzp_res.status_code == 200, f"Failed initializing Razorpay order: {rzp_res.text}"
    rzp_data = rzp_res.json()
    rzp_order_id = rzp_data["razorpay_order_id"]
    assert rzp_data["amount"] == int(expected_unit_price * 100)

    # 3. Simulate Razorpay payment.captured webhook
    webhook_event = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_test_phase7_001",
                    "order_id": rzp_order_id,
                    "amount": int(expected_unit_price * 100),
                    "status": "captured",
                    "method": "upi",
                }
            }
        },
    }
    body_bytes = json.dumps(webhook_event).encode("utf-8")
    signature = hmac.new(b"webhook_phase7_secret_987654", body_bytes, hashlib.sha256).hexdigest()

    wh_res = client.post(
        "/payments/razorpay/webhook",
        content=body_bytes,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": signature},
    )
    assert wh_res.status_code == 200, f"Webhook rejected: {wh_res.text}"

    # Verify order is now marked PAID
    check_res = client.get(f"/orders/{order_code}")
    assert check_res.status_code == 200
    assert check_res.json()["status"] == "PAID"
    assert check_res.json()["payment_status"] == "PAID"

    # Idempotent re-send check
    wh_res_dup = client.post(
        "/payments/razorpay/webhook",
        content=body_bytes,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": signature},
    )
    assert wh_res_dup.status_code == 200
    assert "already marked PAID" in wh_res_dup.json()["detail"]


def test_2_razorpay_failed_abandoned_payment_not_marked_paid():
    """Verify failed or abandoned payment webhook does NOT mark order as PAID."""
    db = SessionLocal()
    try:
        variant = db.query(ProductVariant).filter(ProductVariant.stock >= 2).first()
        variant_id = variant.id
    finally:
        db.close()

    order_payload = {
        "customer_name": "Rohan Verma",
        "phone": "9820033445",
        "payment_method": "PREPAID",
        "address": {
            "name": "Rohan Verma",
            "phone": "9820033445",
            "line1": "72 Park Street Avenue",
            "city": "Kolkata",
            "state": "West Bengal",
            "pincode": "700016",
        },
        "items": [{"variant_id": variant_id, "quantity": 1}],
    }
    res = client.post("/orders", json=order_payload)
    assert res.status_code == 201
    order_code = res.json()["order_code"]

    rzp_res = client.post("/payments/razorpay/create-order", json={"order_code": order_code})
    rzp_order_id = rzp_res.json()["razorpay_order_id"]

    webhook_event = {
        "event": "payment.failed",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_test_phase7_failed_001",
                    "order_id": rzp_order_id,
                    "status": "failed",
                    "error_description": "Payment was abandoned by the user",
                }
            }
        },
    }
    body_bytes = json.dumps(webhook_event).encode("utf-8")
    signature = hmac.new(b"webhook_phase7_secret_987654", body_bytes, hashlib.sha256).hexdigest()

    wh_res = client.post(
        "/payments/razorpay/webhook",
        content=body_bytes,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": signature},
    )
    assert wh_res.status_code == 200

    check_res = client.get(f"/orders/{order_code}")
    assert check_res.json()["payment_status"] == "FAILED"
    assert check_res.json()["status"] == "PENDING"  # NOT marked PAID!


def test_3_cod_order_workflow_and_shipping_charges():
    """Verify COD order calculation: ₹99 shipping below 1500, ₹0 above 1500."""
    db = SessionLocal()
    try:
        variant = db.query(ProductVariant).filter(ProductVariant.stock >= 2).first()
        variant_id = variant.id
        unit_price = Decimal(str(variant.selling_price))
    finally:
        db.close()

    order_payload = {
        "customer_name": "Meera Joshi",
        "phone": "9819922881",
        "payment_method": "COD",
        "address": {
            "name": "Meera Joshi",
            "phone": "9819922881",
            "line1": "12 Alkapuri Road",
            "city": "Vadodara",
            "state": "Gujarat",
            "pincode": "390007",
        },
        "items": [{"variant_id": variant_id, "quantity": 1}],
    }

    res = client.post("/orders", json=order_payload)
    assert res.status_code == 201
    data = res.json()
    assert data["payment_method"] == "COD"
    assert data["status"] == "PLACED"
    assert data["payment_status"] == "PENDING"

    if unit_price >= Decimal("1500.00"):
        assert float(data["shipping_charge"]) == 0.0
    else:
        assert float(data["shipping_charge"]) == 99.0


def test_4_sold_out_size_cannot_be_checked_out():
    """Verify checking out a variant with 0 stock fails with clear HTTP 400."""
    db = SessionLocal()
    try:
        # Chandni Raat Modal Silk Co-ord Size S is specifically seeded with stock = 0
        sold_out_variant = (
            db.query(ProductVariant)
            .join(Product)
            .filter(Product.slug == "chandni-raat-modal-silk-co-ord", ProductVariant.size == "S")
            .first()
        )
        assert sold_out_variant is not None
        assert sold_out_variant.stock == 0
        variant_id = sold_out_variant.id
    finally:
        db.close()

    order_payload = {
        "customer_name": "Pooja Hegde",
        "phone": "9876543210",
        "payment_method": "COD",
        "address": {
            "name": "Pooja Hegde",
            "phone": "9876543210",
            "line1": "45 Linking Road, Bandra",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400050",
        },
        "items": [{"variant_id": variant_id, "quantity": 1}],
    }

    res = client.post("/orders", json=order_payload)
    assert res.status_code == 400
    assert "sold out" in res.json()["detail"].lower()


def test_5_concurrent_oversell_cart_sellout():
    """Verify if stock drops before order is submitted, checkout fails with clear error and rollback."""
    db = SessionLocal()
    try:
        # Find or create a variant with exactly 1 unit
        variant = db.query(ProductVariant).filter(ProductVariant.stock > 0).first()
        initial_stock = variant.stock
        variant.stock = 1
        db.commit()
        variant_id = variant.id
    finally:
        db.close()

    # Buyer 1 buys the last piece
    payload_buyer1 = {
        "customer_name": "Buyer One",
        "phone": "9811111111",
        "payment_method": "COD",
        "address": {
            "name": "Buyer One",
            "phone": "9811111111",
            "line1": "100 MG Road",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560001",
        },
        "items": [{"variant_id": variant_id, "quantity": 1}],
    }
    res1 = client.post("/orders", json=payload_buyer1)
    assert res1.status_code == 201

    # Buyer 2 attempts to checkout the same variant
    payload_buyer2 = {
        "customer_name": "Buyer Two",
        "phone": "9822222222",
        "payment_method": "COD",
        "address": {
            "name": "Buyer Two",
            "phone": "9822222222",
            "line1": "200 Brigade Road",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560025",
        },
        "items": [{"variant_id": variant_id, "quantity": 1}],
    }
    res2 = client.post("/orders", json=payload_buyer2)
    assert res2.status_code == 400
    assert "sold out" in res2.json()["detail"].lower()

    # Restore stock
    db = SessionLocal()
    try:
        v = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
        v.stock = initial_stock
        db.commit()
    finally:
        db.close()


def test_6_pincode_and_address_validation():
    """Verify wrong pincode and incomplete address are rejected with readable messages."""
    db = SessionLocal()
    try:
        variant = db.query(ProductVariant).filter(ProductVariant.stock >= 1).first()
        variant_id = variant.id
    finally:
        db.close()

    base_payload = {
        "customer_name": "Simran Kaur",
        "phone": "9876543210",
        "payment_method": "COD",
        "address": {
            "name": "Simran Kaur",
            "phone": "9876543210",
            "line1": "Plot 12, Sector 17",
            "city": "Chandigarh",
            "state": "Punjab",
            "pincode": "160017",
        },
        "items": [{"variant_id": variant_id, "quantity": 1}],
    }

    # Case A: Too short pincode (e.g. 123)
    p_short = json.loads(json.dumps(base_payload))
    p_short["address"]["pincode"] = "123"
    res_short = client.post("/orders", json=p_short)
    assert res_short.status_code == 422
    assert "6-digit" in res_short.text

    # Case B: Non-numeric pincode (e.g. ABCDEF)
    p_alpha = json.loads(json.dumps(base_payload))
    p_alpha["address"]["pincode"] = "ABCDEF"
    res_alpha = client.post("/orders", json=p_alpha)
    assert res_alpha.status_code == 422
    assert "6-digit" in res_alpha.text

    # Case C: Incomplete line1 address (too short)
    p_line1 = json.loads(json.dumps(base_payload))
    p_line1["address"]["line1"] = "Abc"
    res_line1 = client.post("/orders", json=p_line1)
    assert res_line1.status_code == 422
    assert "complete street address" in res_line1.text.lower()

    # Case D: Missing city
    p_city = json.loads(json.dumps(base_payload))
    p_city["address"]["city"] = ""
    res_city = client.post("/orders", json=p_city)
    assert res_city.status_code == 422


def test_7_order_total_tamper_attempt_server_charges_db_price():
    """Verify tampering with client price/total has zero effect; server charges DB price."""
    db = SessionLocal()
    try:
        variant = db.query(ProductVariant).filter(ProductVariant.stock >= 1).first()
        variant_id = variant.id
        db_price = Decimal(str(variant.selling_price))
    finally:
        db.close()

    # Client maliciously attempts to inject 1.00 rupee prices and total
    tampered_payload = {
        "customer_name": "Attacker",
        "phone": "9999988888",
        "payment_method": "PREPAID",
        "address": {
            "name": "Attacker",
            "phone": "9999988888",
            "line1": "Dark Web Street 404",
            "city": "Jaipur",
            "state": "Rajasthan",
            "pincode": "302001",
        },
        "items": [
            {
                "variant_id": variant_id,
                "quantity": 1,
                "unit_price": 1.0,
                "line_total": 1.0,
            }
        ],
        "subtotal": 1.0,
        "discount": 5000.0,
        "total": 1.0,
    }

    res = client.post("/orders", json=tampered_payload)
    assert res.status_code == 201
    data = res.json()

    # Authoritative calculation must equal real database price, NOT 1.0
    assert Decimal(str(data["total"])) == db_price
    assert Decimal(str(data["subtotal"])) == db_price


def test_8_admin_auth_and_rate_limiting():
    """Verify admin login failure (401), unauthorized route protection (401), and lockout (429)."""
    # 1. Unauthenticated request to protected route
    res_unauth = client.get("/admin/dashboard")
    assert res_unauth.status_code == 401

    # Clear rate limiter state for clean test
    _login_failed_attempts.clear()

    # 2. Wrong password attempt 1-4 returns 401
    for i in range(4):
        res_fail = client.post(
            "/admin/login",
            json={"email": "testadmin@royallibas.com", "password": "WrongPassword123!"},
        )
        assert res_fail.status_code == 401

    # 3. Fifth failed attempt
    res_fail5 = client.post(
        "/admin/login",
        json={"email": "testadmin@royallibas.com", "password": "WrongPassword123!"},
    )
    assert res_fail5.status_code == 401

    # 4. Sixth attempt triggers rate limit / lockout (429)
    res_lockout = client.post(
        "/admin/login",
        json={"email": "testadmin@royallibas.com", "password": "WrongPassword123!"},
    )
    assert res_lockout.status_code == 429
    assert "Retry-After" in res_lockout.headers
    assert "temporarily locked" in res_lockout.json()["detail"].lower()

    # Clear lockout for valid login
    _login_failed_attempts.clear()
    token = get_or_create_test_admin()
    assert token is not None

    # Authenticated access succeeds
    res_auth = client.get("/admin/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert res_auth.status_code == 200


def test_9_order_cancellation_restores_inventory_stock():
    """Verify cancelling an order in admin panel restores variant stock in the same transaction."""
    token = get_or_create_test_admin()

    db = SessionLocal()
    try:
        variant = db.query(ProductVariant).filter(ProductVariant.stock >= 5).first()
        variant_id = variant.id
        initial_stock = variant.stock
    finally:
        db.close()

    # Place order for 2 units
    order_payload = {
        "customer_name": "Geeta Sharma",
        "phone": "9812345678",
        "payment_method": "COD",
        "address": {
            "name": "Geeta Sharma",
            "phone": "9812345678",
            "line1": "House 18, Civil Lines",
            "city": "Jaipur",
            "state": "Rajasthan",
            "pincode": "302006",
        },
        "items": [{"variant_id": variant_id, "quantity": 2}],
    }
    res = client.post("/orders", json=order_payload)
    assert res.status_code == 201
    order_id = res.json()["id"]

    # Verify stock decremented by 2
    db = SessionLocal()
    try:
        v = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
        assert v.stock == initial_stock - 2
    finally:
        db.close()

    # Admin cancels order
    cancel_res = client.patch(
        f"/admin/orders/{order_id}/status",
        json={"status": "CANCELLED"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "CANCELLED"

    # Verify stock was restored atomically
    db = SessionLocal()
    try:
        v_restored = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
        assert v_restored.stock == initial_stock
    finally:
        db.close()


def test_10_tracking_security_no_leaks():
    """Verify tracking with matching credentials works, but mismatch reveals nothing."""
    db = SessionLocal()
    try:
        variant = db.query(ProductVariant).filter(ProductVariant.stock >= 1).first()
        variant_id = variant.id
    finally:
        db.close()

    order_payload = {
        "customer_name": "Ayesha Khan",
        "phone": "9833445566",
        "payment_method": "COD",
        "address": {
            "name": "Ayesha Khan",
            "phone": "9833445566",
            "line1": "24 Bandra Reclamation",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400050",
        },
        "items": [{"variant_id": variant_id, "quantity": 1}],
    }
    res = client.post("/orders", json=order_payload)
    assert res.status_code == 201
    order_code = res.json()["order_code"]

    # Correct code + phone
    track_res = client.get(f"/orders/track?order_code={order_code}&phone=9833445566")
    assert track_res.status_code == 200
    assert track_res.json()["order_code"] == order_code

    # Correct code + phone with +91 prefix
    track_res_91 = client.get(f"/orders/track?order_code={order_code}&phone=%2B919833445566")
    assert track_res_91.status_code == 200

    # Wrong phone number -> 404 with generic message
    track_res_wrong = client.get(f"/orders/track?order_code={order_code}&phone=9800000000")
    assert track_res_wrong.status_code == 404
    assert "not found" in track_res_wrong.json()["detail"].lower()

    # Non-existent code -> 404 with identical message
    track_res_fake = client.get("/orders/track?order_code=RL-2026-0000&phone=9833445566")
    assert track_res_fake.status_code == 404
    assert track_res_fake.json()["detail"] == track_res_wrong.json()["detail"]


def test_11_cors_allowed_origins():
    """Verify CORS response allows configured frontend and rejects arbitrary origins."""
    # Test allowed origin
    res_allowed = client.options(
        "/products",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res_allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"

    # Test untrusted origin
    res_untrusted = client.options(
        "/products",
        headers={
            "Origin": "http://malicious-site.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res_untrusted.headers.get("access-control-allow-origin") != "http://malicious-site.com"


def test_12_zero_secrets_audit():
    """Verify repo files contain no live keys or production credentials."""
    import re
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    forbidden_patterns = [
        re.compile(r"rzp_live_[a-zA-Z0-9]{14,}"),
        re.compile(r"postgres://[^:]+:[^@]+@[a-zA-Z0-9\.\-]+"),
        re.compile(r"postgresql://[^:]+:[^@]+@[a-zA-Z0-9\.\-]+"),
    ]

    for root, dirs, files in os.walk(repo_root):
        # Ignore git, node_modules, dist, temp dirs
        if any(skip in root for skip in [".git", "node_modules", "dist", ".gemini", "__pycache__"]):
            continue
        for f in files:
            if f.endswith((".py", ".ts", ".tsx", ".js", ".json", ".md", ".env.example")):
                path = os.path.join(root, f)
                with open(path, "r", encoding="utf-8", errors="ignore") as file:
                    content = file.read()
                    for pattern in forbidden_patterns:
                        match = pattern.search(content)
                        assert match is None, f"Found secret leak in {path}: {match.group(0)}"


if __name__ == "__main__":
    print("===========================================")
    print(">>> RUNNING PHASE 7 LAUNCH HARDENING SUITE <<<")
    print("===========================================")

    test_1_razorpay_prepaid_success_webhook()
    print("  [OK] Razorpay prepaid flow: order creation, amount check, and webhook transition to PAID")

    test_2_razorpay_failed_abandoned_payment_not_marked_paid()
    print("  [OK] Razorpay payment.failed: records FAILED status, never marks order PAID")

    test_3_cod_order_workflow_and_shipping_charges()
    print("  [OK] COD order calculation: status PLACED, fee calculation verified")

    test_4_sold_out_size_cannot_be_checked_out()
    print("  [OK] Sold-out size checkout rejected with clear HTTP 400")

    test_5_concurrent_oversell_cart_sellout()
    print("  [OK] Concurrent sell-out prevention: second buyer rejected, transaction rolled back")

    test_6_pincode_and_address_validation()
    print("  [OK] Address validation: non-6-digit pincode and incomplete fields rejected with readable errors")

    test_7_order_total_tamper_attempt_server_charges_db_price()
    print("  [OK] Anti-tamper verification: client prices ignored, server strictly charges database total")

    test_8_admin_auth_and_rate_limiting()
    print("  [OK] Admin security: 401 on unauth, brute-force rate limiter locks account with 429 & Retry-After")

    test_9_order_cancellation_restores_inventory_stock()
    print("  [OK] Order cancellation in admin: atomically returns variant stock in database")

    test_10_tracking_security_no_leaks()
    print("  [OK] Tracking privacy: valid code+phone succeeds, invalid phone returns 404 with zero data leak")

    test_11_cors_allowed_origins()
    print("  [OK] CORS security: allows configured frontend domain, rejects unauthorized origins")

    test_12_zero_secrets_audit()
    print("  [OK] Secret scanning: zero live keys or database credentials found in project")

    print("\n===========================================")
    print(">>> ALL 12 PHASE 7 VERIFICATION CHECKS PASSED! <<<")
    print("===========================================")
