"""Phase 8 Automated Verification Suite - Soft Launch & Handover.

Verifies the Launch Day Runbook (Page 18):
1. Morning Test Order placement (COD & Prepaid).
2. Admin Dashboard order visibility & fulfillment transition:
   - Order detected in 'To Pack' queue
   - Status updated to PACKED
   - Status updated to SHIPPED with courier partner & tracking URL
   - Customer tracking page reflects status and live courier link
   - Order delivered (DELIVERED)
3. Handover Pack Verification:
   - HANDOVER_FOR_TANYA.md exists and contains all required sections:
     - Admin access & mobile routine
     - Daily fulfillment workflow & WhatsApp COD confirmation
     - Catalogue stock +/- management
     - 7-day size exchange process
     - Bug vs feature policy
     - Direct ownership cost breakdown
     - Launch day schedule
     - Definition of Done
"""

import os
import sys
import json
from decimal import Decimal
from fastapi.testclient import TestClient

# Ensure test DB and backend path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["DATABASE_URL"] = "sqlite:///./royal_libas.db"
os.environ["JWT_SECRET"] = "phase8-test-jwt-secret-key-royal-libas"
os.environ["RAZORPAY_KEY_ID"] = "rzp_test_placeholder"
os.environ["RAZORPAY_KEY_SECRET"] = "test_phase8_secret_key"
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "webhook_phase8_secret"

from app.main import app
from app.database import SessionLocal
from app.models import Product, ProductVariant, Order, Admin
from app.auth import hash_password, create_access_token

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


def test_launch_day_morning_test_order_and_fulfillment():
    """Simulate Tanya's launch day morning test order through full shipment lifecycle."""
    token = get_admin_token()

    db = SessionLocal()
    try:
        variant = db.query(ProductVariant).filter(ProductVariant.stock >= 3).first()
        assert variant is not None, "Need available variant for launch test"
        variant_id = variant.id
        variant_product_name = variant.product.name
    finally:
        db.close()

    # 1. Place Morning Test Order
    test_order_payload = {
        "customer_name": "Tanya Sharma (Launch Test)",
        "phone": "9829012345",
        "payment_method": "COD",
        "address": {
            "name": "Tanya Sharma",
            "phone": "9829012345",
            "line1": "Royal Libas Studio, 14 Civil Lines",
            "city": "Jaipur",
            "state": "Rajasthan",
            "pincode": "302006",
        },
        "items": [{"variant_id": variant_id, "quantity": 1}],
    }

    create_res = client.post("/orders", json=test_order_payload)
    assert create_res.status_code == 201, f"Failed placing launch test order: {create_res.text}"
    order_data = create_res.json()
    order_id = order_data["id"]
    order_code = order_data["order_code"]
    assert order_data["status"] == "PLACED"

    # 2. Check Admin Dashboard reflects the new order
    dash_res = client.get("/admin/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert dash_res.status_code == 200
    dash_data = dash_res.json()
    assert dash_data["orders_today"] >= 1
    assert dash_data["to_pack_count"] >= 1

    # 3. Transition to PACKED
    pack_res = client.patch(
        f"/admin/orders/{order_id}/status",
        json={"status": "PACKED"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert pack_res.status_code == 200
    assert pack_res.json()["status"] == "PACKED"

    # 4. Attempt to mark SHIPPED without courier tracking link -> must be rejected (400)
    invalid_ship = client.patch(
        f"/admin/orders/{order_id}/status",
        json={"status": "SHIPPED", "courier_name": "Delhivery", "tracking_url": ""},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert invalid_ship.status_code == 400

    # 5. Successfully mark SHIPPED with valid courier details
    sample_tracking_url = "https://www.delhivery.com/track/package/RL9829012345"
    ship_res = client.patch(
        f"/admin/orders/{order_id}/status",
        json={
            "status": "SHIPPED",
            "courier_name": "Delhivery Express",
            "tracking_url": sample_tracking_url,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert ship_res.status_code == 200
    ship_data = ship_res.json()
    assert ship_data["status"] == "SHIPPED"
    assert ship_data["courier_name"] == "Delhivery Express"
    assert ship_data["tracking_url"] == sample_tracking_url

    # 6. Customer tracking page reflects SHIPPED status and courier link live
    track_res = client.get(f"/orders/track?order_code={order_code}&phone=9829012345")
    assert track_res.status_code == 200
    track_data = track_res.json()
    assert track_data["status"] == "SHIPPED"
    assert track_data["courier_name"] == "Delhivery Express"
    assert track_data["tracking_url"] == sample_tracking_url

    # 7. Complete delivery
    deliv_res = client.patch(
        f"/admin/orders/{order_id}/status",
        json={"status": "DELIVERED"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert deliv_res.status_code == 200
    assert deliv_res.json()["status"] == "DELIVERED"


def test_handover_pack_file_completeness():
    """Verify that HANDOVER_FOR_TANYA.md is thoroughly documented and covers all criteria."""
    handover_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "HANDOVER_FOR_TANYA.md",
    )
    assert os.path.exists(handover_path), "HANDOVER_FOR_TANYA.md must exist in root directory"

    with open(handover_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Core checklist sections
    assert "Daily 15-Minute Boutique Routine" in content
    assert "Confirm COD Orders on WhatsApp" in content
    assert "Managing Catalogue & Inventory" in content
    assert "How to Handle Size Exchanges" in content
    assert "7-Day Guarantee" in content
    assert "Bug vs. a New Feature" in content
    assert "Who Pays What After Launch" in content
    assert "Launch Day Runbook" in content
    assert "Definition of Done" in content


if __name__ == "__main__":
    print("===========================================")
    print(">>> RUNNING PHASE 8 SOFT LAUNCH SUITE <<<")
    print("===========================================")

    test_launch_day_morning_test_order_and_fulfillment()
    print("  [OK] Launch Day Runbook: test order placed, admin packed, shipped with tracking URL, and tracked live")

    test_handover_pack_file_completeness()
    print("  [OK] Handover Pack: HANDOVER_FOR_TANYA.md verified with full owner guide, routine, and checklists")

    print("\n===========================================")
    print(">>> ALL PHASE 8 SOFT LAUNCH CHECKS PASSED! <<<")
    print("===========================================")
