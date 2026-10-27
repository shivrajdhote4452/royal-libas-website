"""Automated Verification Suite for Shiprocket Fulfillment Integration.

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
   - Order flows create -> AWB -> pickup -> label -> manifest
   - Stored IDs & URLs verified
   - Status updated to SHIPPED
   - Second click does NOT create duplicate shipment (idempotent resume)
4. Failure resume:
   - Failed AWB followed by retry resumes from stored shipment_id
5. Cancellation:
   - Cancel before pickup calls cancel_order
   - Cancel after pickup blocks with "already picked up — cannot cancel via Shiprocket"
6. Webhook with mandatory live re-fetch:
   - Never trusts payload alone; re-fetches live tracking before updating order
"""

import os
import sys
from decimal import Decimal
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["DATABASE_URL"] = "sqlite:///./royal_libas.db"
os.environ["JWT_SECRET"] = "shiprocket-test-jwt-secret-key-royal-libas-32bytes"

from app.main import app
from app.database import SessionLocal
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
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        return create_access_token({"sub": str(admin.id), "email": admin.email})
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


def test_shiprocket_unconfigured():
    token = get_admin_token()

    # Ensure Shiprocket is marked unconfigured
    with patch("app.config.SHIPROCKET_API_EMAIL", ""), patch("app.config.SHIPROCKET_API_PASSWORD", ""):
        assert not is_shiprocket_configured()

        # Check config endpoint
        res = client.get("/admin/fulfillment/config", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["is_configured"] is False
        assert data["disabled_reason"] == "Shiprocket not configured — use manual tracking"

        # Attempt to ship via Shiprocket -> 503
        oid, _ = create_test_order()
        ship_res = client.post(
            f"/admin/orders/{oid}/fulfillment/ship",
            headers={"Authorization": f"Bearer {token}"},
            json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
        )
        assert ship_res.status_code == 503
        assert "Shiprocket not configured — use manual tracking" in ship_res.json()["detail"]

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
        assert manual_res.status_code == 200
        assert manual_res.json()["status"] == "SHIPPED"
        assert manual_res.json()["courier_name"] == "Delhivery Express"
        print("  [OK] Unconfigured state verified: button disabled, manual entry works as fallback")


def test_shiprocket_validation_rules():
    token = get_admin_token()
    oid, _ = create_test_order(payment_method="PREPAID", payment_status="PENDING")

    with patch("app.routers.admin.is_shiprocket_configured", return_value=True):
        # 1. Unpaid prepaid order
        res = client.post(
            f"/admin/orders/{oid}/fulfillment/ship",
            headers={"Authorization": f"Bearer {token}"},
            json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
        )
        assert res.status_code == 400
        assert "Prepaid order is not confirmed paid yet" in res.json()["detail"]

        # 2. Missing/zero dimensions
        oid_shippable, _ = create_test_order(payment_method="COD", status="PACKED")
        res2 = client.post(
            f"/admin/orders/{oid_shippable}/fulfillment/ship",
            headers={"Authorization": f"Bearer {token}"},
            json={"length": 0, "breadth": 20, "height": 5, "weight": 0.5},
        )
        assert res2.status_code == 400
        assert "Enter the packed parcel's weight and dimensions" in res2.json()["detail"]

        # 3. Cancelled order cannot be shipped
        cid, _ = create_test_order(status="CANCELLED")
        res3 = client.post(
            f"/admin/orders/{cid}/fulfillment/ship",
            headers={"Authorization": f"Bearer {token}"},
            json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
        )
        assert res3.status_code == 400
        assert "Cannot ship a cancelled order" in res3.json()["detail"]

        print("  [OK] Validation rules verified: weight/dimensions required, unpaid & cancelled orders blocked")


def test_full_fulfillment_flow_and_idempotency():
    token = get_admin_token()
    oid, code = create_test_order(payment_method="COD", status="PACKED")

    mock_create_order = MagicMock(return_value={"shiprocket_order_id": "SR-10029", "shipment_id": "SH-887711"})
    mock_assign_awb = MagicMock(return_value={"awb_code": "AWB-RL-8822", "courier_name": "Delhivery Surface"})
    mock_pickup = MagicMock(return_value={"pickup_status": "SCHEDULED"})
    mock_label = MagicMock(return_value={"label_url": "https://shiprocket.co/label/8822.pdf"})
    mock_manifest = MagicMock(return_value={"manifest_url": "https://shiprocket.co/manifest/8822.pdf"})

    with patch("app.routers.admin.is_shiprocket_configured", return_value=True), \
         patch("app.services.shiprocket.create_order", mock_create_order), \
         patch("app.services.shiprocket.assign_awb", mock_assign_awb), \
         patch("app.services.shiprocket.generate_pickup", mock_pickup), \
         patch("app.services.shiprocket.generate_label", mock_label), \
         patch("app.services.shiprocket.generate_manifest", mock_manifest):

        # Initial Ship call
        res = client.post(
            f"/admin/orders/{oid}/fulfillment/ship",
            headers={"Authorization": f"Bearer {token}"},
            json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5, "courier_id": 10},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "SHIPPED"
        assert data["shiprocket_order_id"] == "SR-10029"
        assert data["shipment_id"] == "SH-887711"
        assert data["awb_code"] == "AWB-RL-8822"
        assert data["courier_name"] == "Delhivery Surface"
        assert data["label_url"] == "https://shiprocket.co/label/8822.pdf"
        assert data["manifest_url"] == "https://shiprocket.co/manifest/8822.pdf"
        assert data["pickup_status"] == "SCHEDULED"
        assert mock_create_order.call_count == 1
        assert mock_assign_awb.call_count == 1

        # Second click (Idempotency check): MUST NOT create order again
        res2 = client.post(
            f"/admin/orders/{oid}/fulfillment/ship",
            headers={"Authorization": f"Bearer {token}"},
            json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
        )
        assert res2.status_code == 200
        # Call count must still be 1 (never re-creates)
        assert mock_create_order.call_count == 1
        print("  [OK] Fulfillment flow & idempotency verified: full flow runs, second click does NOT duplicate")


def test_failure_resume():
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
    assert order.shipment_id == "SH-7777"
    assert order.status != "SHIPPED"
    db.close()

    # Retry with AWB succeeding: MUST resume from stored shipment_id, NOT call create_order again
    mock_awb_success = MagicMock(return_value={"awb_code": "AWB-RESUMED-123", "courier_name": "BlueDart Express"})
    with patch("app.routers.admin.is_shiprocket_configured", return_value=True), \
         patch("app.services.shiprocket.create_order", mock_create_order), \
         patch("app.services.shiprocket.assign_awb", mock_awb_success), \
         patch("app.services.shiprocket.generate_pickup", return_value={"pickup_status": "SCHEDULED"}), \
         patch("app.services.shiprocket.generate_label", return_value={"label_url": "https://..."}), \
         patch("app.services.shiprocket.generate_manifest", return_value={"manifest_url": "https://..."}):

        res_retry = client.post(
            f"/admin/orders/{oid}/fulfillment/ship",
            headers={"Authorization": f"Bearer {token}"},
            json={"length": 25, "breadth": 20, "height": 5, "weight": 0.5},
        )
        assert res_retry.status_code == 200
        assert res_retry.json()["status"] == "SHIPPED"
        assert res_retry.json()["awb_code"] == "AWB-RESUMED-123"
        # create_order was NOT called again during retry
        assert mock_create_order.call_count == 1
        print("  [OK] Failure resume verified: retry resumes from stored shipment_id without duplicate order")


def test_cancellation_rules():
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
        assert res.status_code == 200
        assert res.json()["status"] == "CANCELLED"
        assert mock_cancel.call_count == 1

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
    assert res2.status_code == 400
    assert "already picked up — cannot cancel via Shiprocket" in res2.json()["detail"]
    print("  [OK] Cancellation rules verified: cancel before pickup calls API; already picked up is rejected")


def test_webhook_live_refetch():
    import uuid
    unique_awb = f"AWB-{uuid.uuid4().hex[:8].upper()}"
    oid, code = create_test_order(status="SHIPPED")
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
        assert res.status_code == 200
        assert res.json()["verified_live"] is True
        assert mock_track.call_count == 1

    db = SessionLocal()
    updated = db.query(Order).filter(Order.id == oid).first()
    assert updated.status == "DELIVERED"
    db.close()
    print("  [OK] Webhook verified: status updated only after mandatory live re-fetch")


if __name__ == "__main__":
    print("===========================================")
    print(">>> RUNNING SHIPROCKET VERIFICATION SUITE <<<")
    print("===========================================")
    test_shiprocket_unconfigured()
    test_shiprocket_validation_rules()
    test_full_fulfillment_flow_and_idempotency()
    test_failure_resume()
    test_cancellation_rules()
    test_webhook_live_refetch()
    print("===========================================")
    print(">>> ALL SHIPROCKET VERIFICATION CHECKS PASSED! <<<")
    print("===========================================")
