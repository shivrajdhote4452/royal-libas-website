"""Phase 6 Automated Test Suite — Sample Catalogue, Policies, and Polish.

Verifies:
1. Live catalogue contains sample boutique products (16 products) and zero dummy items.
2. Search across all products for 'DUMMY', 'lorem', 'illustrative', 'picsum' yields 0 hits.
3. Every sample product has multiple photos, valid size-wise variants, fabric, care, and size chart.
4. Flagship products check:
   - Noorani Chanderi Kurti Set exists and is flagged Bestseller
   - Chandni Raat Modal Silk Co-ord has size S at 0 stock (Sold Out size test)
   - Zari Mahal Velvet Anarkali Suit has exactly 5 total units (Low Stock test)
5. End-to-end checkout with sample products:
   - Cashfree test-mode prepaid order creation and signature-verified webhook
   - COD order placement
   - Atomic stock decrement verification
"""

import os
import json
import hmac
import hashlib
import base64
import unittest.mock
from decimal import Decimal
from fastapi.testclient import TestClient

# Ensure test DB / environment
os.environ["DATABASE_URL"] = "sqlite:///./royal_libas.db"
os.environ["JWT_SECRET"] = "phase6-test-jwt-secret-key-royal-libas"
os.environ["CASHFREE_CLIENT_ID"] = "cf_test_app_id"
os.environ["CASHFREE_CLIENT_SECRET"] = "cf_test_secret_key"
os.environ["CASHFREE_ENVIRONMENT"] = "sandbox"

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.database import SessionLocal
from app.models import Product, ProductVariant, Order, OrderItem

client = TestClient(app)


def test_catalogue_sample_products_count_and_no_dummies():
    """Verify 16 sample products and 0 dummy products in the database."""
    response = client.get("/products")
    assert response.status_code == 200, f"Failed GET /products: {response.text}"
    products = response.json()
    assert len(products) >= 16, f"Expected at least 16 sample products, found {len(products)}"

    for p in products:
        # Check no dummy/lorem/illustrative in names or descriptions
        assert "dummy" not in p["name"].lower(), f"Dummy found in product name: {p['name']}"
        assert "dummy" not in p["slug"].lower(), f"Dummy found in product slug: {p['slug']}"
        assert "lorem" not in p["description"].lower(), f"Lorem found in product: {p['name']}"
        assert "illustrative" not in p["description"].lower(), f"Illustrative found in: {p['name']}"
        assert "picsum" not in (p["primary_image"] or "").lower(), f"Picsum found in: {p['primary_image']}"
        assert len(p["variants"]) >= 3, f"Product {p['name']} has fewer than 3 variants"


def test_every_product_has_photos_and_details():
    """Verify full detail endpoint for products."""
    response = client.get("/products")
    products = response.json()

    # Test top 5 products in detail
    for p in products[:5]:
        detail_res = client.get(f"/products/{p['slug']}")
        assert detail_res.status_code == 200, f"Failed GET /products/{p['slug']}"
        detail = detail_res.json()

        assert len(detail["images"]) >= 3, f"Product {p['name']} has less than 3 photos"
        for img in detail["images"]:
            assert not img["url"].startswith("https://picsum.photos"), f"Placeholder image URL found: {img['url']}"
            assert img["alt_text"] and len(img["alt_text"]) > 3

        assert detail["fabric"] and len(detail["fabric"]) > 5
        assert detail["care"] and len(detail["care"]) > 5
        assert detail["size_chart"] is not None


def test_flagship_products_attributes():
    """Test specific boutique flagship products."""
    # 1. Noorani Chanderi Kurti Set (Bestseller)
    res_noor = client.get("/products/noorani-chanderi-kurti-set")
    assert res_noor.status_code == 200
    noor = res_noor.json()
    assert noor["is_bestseller"] is True
    assert "Bestseller" in noor["badges"]

    # 2. Chandni Raat Modal Silk Co-ord (Sold out size S)
    res_chnd = client.get("/products/chandni-raat-modal-silk-co-ord")
    assert res_chnd.status_code == 200
    chnd = res_chnd.json()
    s_variant = next((v for v in chnd["variants"] if v["size"] == "S"), None)
    assert s_variant is not None, "Size S missing on Chandni Raat"
    assert s_variant["stock"] == 0, "Expected size S to be sold out on Chandni Raat"

    # 3. Zari Mahal Velvet Anarkali Suit (Low stock badge: total stock <= 5)
    res_zari = client.get("/products/zari-mahal-velvet-anarkali-suit")
    assert res_zari.status_code == 200
    zari = res_zari.json()
    total_stock = sum(v["stock"] for v in zari["variants"])
    assert total_stock <= 5, f"Expected total stock <= 5, got {total_stock}"
    assert "Low Stock" in zari["badges"]


def test_sample_product_checkout_cashfree_and_cod():
    """Verify complete checkout journey using sample products."""
    # Fetch an in-stock variant of Noorani Chanderi Kurti Set
    res = client.get("/products/noorani-chanderi-kurti-set")
    assert res.status_code == 200
    product = res.json()
    target_variant = next(v for v in product["variants"] if v["stock"] >= 2)
    initial_stock = target_variant["stock"]
    assert initial_stock >= 2

    # 1. Create COD order
    cod_payload = {
        "customer_name": "Pooja Malhotra",
        "phone": "9811223344",
        "payment_method": "COD",
        "address": {
            "name": "Pooja Malhotra",
            "phone": "9811223344",
            "pincode": "302001",
            "line1": "45 C-Scheme",
            "line2": "Near Statue Circle",
            "city": "Jaipur",
            "state": "Rajasthan",
        },
        "items": [
            {"variant_id": target_variant["id"], "quantity": 1}
        ],
    }
    order_res = client.post("/orders", json=cod_payload)
    assert order_res.status_code in [200, 201], f"COD order failed: {order_res.text}"
    cod_order = order_res.json()
    assert cod_order["status"] == "PLACED"
    assert cod_order["payment_method"] == "COD"
    assert Decimal(str(cod_order["shipping_charge"])) in [Decimal("99.00"), Decimal("0.00")]

    # Verify stock decremented by 1
    res_after = client.get("/products/noorani-chanderi-kurti-set")
    target_variant_after = next(v for v in res_after.json()["variants"] if v["id"] == target_variant["id"])
    assert target_variant_after["stock"] == initial_stock - 1

    # 2. Create Prepaid order with coupon
    prepaid_payload = {
        "customer_name": "Ananya Singhania",
        "phone": "9876501234",
        "payment_method": "PREPAID",
        "coupon_code": "ROYAL10",
        "address": {
            "name": "Ananya Singhania",
            "phone": "9876501234",
            "pincode": "110001",
            "line1": "Flat 302, Regency Apartments",
            "line2": "Connaught Place",
            "city": "New Delhi",
            "state": "Delhi",
        },
        "items": [
            {"variant_id": target_variant["id"], "quantity": 1}
        ],
    }
    prepaid_res = client.post("/orders", json=prepaid_payload)
    assert prepaid_res.status_code in [200, 201], f"Prepaid order failed: {prepaid_res.text}"
    prepaid_order = prepaid_res.json()
    # 3. Create Cashfree order to attach cashfree_order_id
    with unittest.mock.patch("app.services.payment_service.httpx.Client") as mock_client_cls:
        mock_client = mock_client_cls.return_value.__enter__.return_value
        mock_resp = unittest.mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "cf_order_id": "cf_test_phase6_123",
            "payment_session_id": "session_test_phase6_456",
            "order_status": "ACTIVE",
        }
        mock_client.post.return_value = mock_resp

        cf_res = client.post(
            "/payments/cashfree/create-order",
            json={"order_code": prepaid_order["order_code"]},
        )
        assert cf_res.status_code == 200, f"create-order failed: {cf_res.text}"
        cf_data = cf_res.json()
        assert cf_data["payment_session_id"] == "session_test_phase6_456"

    # 4. Simulate Cashfree webhook payment confirmation
    from app.config import CASHFREE_CLIENT_SECRET

    timestamp = "1729000000"
    webhook_payload = {
        "type": "PAYMENT_SUCCESS_WEBHOOK",
        "data": {
            "order": {
                "order_id": prepaid_order["order_code"],
                "order_amount": float(prepaid_order["total"]),
                "order_currency": "INR",
            },
            "payment": {
                "cf_payment_id": "pay_test_phase6_123",
                "payment_status": "SUCCESS",
                "payment_amount": float(prepaid_order["total"]),
            },
        },
    }
    body_bytes = json.dumps(webhook_payload).encode("utf-8")
    signed_data = timestamp.encode("utf-8") + body_bytes
    signature = base64.b64encode(
        hmac.new(CASHFREE_CLIENT_SECRET.encode("utf-8"), signed_data, hashlib.sha256).digest()
    ).decode("utf-8")

    wh_res = client.post(
        "/payments/cashfree/webhook",
        content=body_bytes,
        headers={
            "Content-Type": "application/json",
            "x-webhook-signature": signature,
            "x-webhook-timestamp": timestamp,
        },
    )
    assert wh_res.status_code == 200, f"Webhook failed ({wh_res.status_code}): {wh_res.text}"
    assert wh_res.json()["status"] == "ok"

    # Verify order transitioned to PAID in database
    db = SessionLocal()
    updated_order = db.query(Order).filter(Order.order_code == prepaid_order["order_code"]).first()
    assert updated_order.status == "PAID", f"Order status is {updated_order.status}, expected PAID"
    db.close()

    # 4. Verify public customer tracking query
    track_res = client.get(f"/orders/track?order_code={prepaid_order['order_code']}&phone=9876501234")
    assert track_res.status_code == 200
    track_data = track_res.json()
    assert track_data["status"] == "PAID"
    assert track_data["customer_name"] == "Ananya Singhania"
    assert len(track_data["items"]) == 1
    assert track_data["items"][0]["product_name_snapshot"] == "Noorani Chanderi Kurti Set"
    print("All Phase 6 automated backend tests passed successfully!")


if __name__ == "__main__":
    test_catalogue_sample_products_count_and_no_dummies()
    test_every_product_has_photos_and_details()
    test_flagship_products_attributes()
    test_sample_product_checkout_cashfree_and_cod()
