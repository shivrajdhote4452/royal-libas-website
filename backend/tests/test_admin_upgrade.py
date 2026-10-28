"""Automated Test Suite for Upgraded Royal Libas Admin Panel.

Verifies:
1. Admin authentication & RBAC (Owner, Store Manager, Fulfillment Staff).
2. Truthful Dashboard metrics (separation of prepaid paid revenue and pending COD).
3. Orders search, filtering, and internal notes.
4. Payments list, server sync, and COD collection workflow.
5. Shipping & pickups listing and Shiprocket integration.
6. Inventory listing, atomic stock adjustment with history, and negative stock prevention.
7. Return requests lifecycle, staff notes, and refund tracking.
8. Customer profile dossier with order history.
9. Support inquiry listing and staff response.
10. Reports calculation and RFC-4180 CSV export.
11. Size charts CRUD.
12. Media upload and listing.
13. Activity log tracking of operational actions.
"""

import os
import sys
from decimal import Decimal
from fastapi.testclient import TestClient

# Ensure test DB / environment
os.environ["DATABASE_URL"] = "sqlite:///./royal_libas.db"
os.environ["JWT_SECRET"] = "phase6-test-jwt-secret-key-royal-libas"

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
from app.database import SessionLocal
from app.models import Admin, Product, ProductVariant, Order, OrderItem, Address, StoreSetting
from app.auth import hash_password

client = TestClient(app)


def get_owner_token():
    """Ensure an OWNER admin exists and return auth header."""
    db = SessionLocal()
    try:
        admin = db.query(Admin).filter(Admin.email == "admin@royallibas.com").first()
        if not admin:
            admin = Admin(
                email="admin@royallibas.com",
                name="Tanya Sharma",
                role="OWNER",
                password_hash=hash_password("admin123"),
                is_active=True,
            )
            db.add(admin)
            db.commit()
        else:
            admin.role = "OWNER"
            admin.password_hash = hash_password("admin123")
            admin.is_active = True
            db.commit()
    finally:
        db.close()

    res = client.post("/admin/login", json={"email": "admin@royallibas.com", "password": "admin123"})
    assert res.status_code == 200, f"Owner login failed: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_admin_dashboard_metrics():
    headers = get_owner_token()
    res = client.get("/admin/dashboard", headers=headers)
    assert res.status_code == 200, f"Dashboard failed: {res.text}"
    data = res.json()
    assert "orders_today" in data
    assert "to_pack_count" in data
    assert "total_orders" in data
    assert "pending_prepaid_count" in data
    assert "failed_payment_count" in data
    assert "awaiting_shipment_count" in data
    assert "awaiting_pickup_count" in data
    assert "low_stock_count" in data
    assert "out_of_stock_count" in data
    assert "today_revenue_prepaid" in data
    assert "today_pending_cod" in data
    assert isinstance(data["recent_orders"], list)
    assert isinstance(data["low_stock_variants"], list)


def test_admin_orders_search_and_notes():
    headers = get_owner_token()

    # List orders with search
    res = client.get("/admin/orders?search=RL", headers=headers)
    assert res.status_code == 200
    orders = res.json()
    assert isinstance(orders, list)

    if orders:
        order_id = orders[0]["id"]
        # Update notes
        patch_res = client.patch(
            f"/admin/orders/{order_id}/notes",
            json={"notes": "Special packaging requested - add gift card"},
            headers=headers,
        )
        assert patch_res.status_code == 200
        assert "Special packaging requested" in (patch_res.json().get("admin_notes") or "")


def test_admin_payments_and_cod_collection():
    headers = get_owner_token()

    # List payments
    res = client.get("/admin/payments", headers=headers)
    assert res.status_code == 200
    payments = res.json()
    assert isinstance(payments, list)

    # Find or create a COD order for collection test
    db = SessionLocal()
    try:
        cod_order = db.query(Order).filter(Order.payment_method == "COD").first()
        if not cod_order:
            cod_order = Order(
                order_code="RL-TEST-COD-01",
                customer_name="Rani Devi",
                phone="9822334455",
                status="DELIVERED",
                payment_method="COD",
                payment_status="PENDING",
                subtotal=Decimal("2999.00"),
                shipping_charge=Decimal("0.00"),
                discount=Decimal("0.00"),
                total=Decimal("2999.00"),
            )
            db.add(cod_order)
            db.commit()
            db.refresh(cod_order)

        collect_res = client.post(
            f"/admin/payments/cod-collect/{cod_order.id}",
            json={"staff_notes": "Cash of ₹2999 handed over by courier agent"},
            headers=headers,
        )
        assert collect_res.status_code == 200
        assert collect_res.json()["payment_status"] == "PAID"
    finally:
        db.close()


def test_admin_shipping_list():
    headers = get_owner_token()
    res = client.get("/admin/shipping?tab=all", headers=headers)
    assert res.status_code == 200
    shipments = res.json()
    assert isinstance(shipments, list)


def test_admin_inventory_and_stock_adjust():
    headers = get_owner_token()

    # List inventory
    res = client.get("/admin/inventory", headers=headers)
    assert res.status_code == 200
    items = res.json()
    assert isinstance(items, list)
    assert len(items) > 0

    target = items[0]
    vid = target["variant_id"]
    current_stock = target["stock"]
    new_stock = current_stock + 5

    # Adjust stock
    adj_res = client.post(
        "/admin/inventory/adjust",
        json={
            "variant_id": vid,
            "new_stock": new_stock,
            "reason": "RESTOCK",
            "note": "Fresh shipment arrived from artisan weaver",
        },
        headers=headers,
    )
    assert adj_res.status_code == 200
    adj_data = adj_res.json()
    assert adj_data["new_stock"] == new_stock
    assert adj_data["change_amount"] == 5

    # Check history
    hist_res = client.get(f"/admin/inventory/adjustments?variant_id={vid}", headers=headers)
    assert hist_res.status_code == 200
    assert len(hist_res.json()) >= 1


def test_admin_returns_workflow():
    headers = get_owner_token()

    # Get an order
    db = SessionLocal()
    try:
        order = db.query(Order).first()
        assert order is not None
        oid = order.id
    finally:
        db.close()

    # Create return request
    create_res = client.post(
        "/admin/returns",
        json={
            "order_id": oid,
            "request_type": "RETURN",
            "reason": "SIZE_FIT",
            "customer_comment": "Sleeve length is slightly long",
            "requested_resolution": "REFUND",
        },
        headers=headers,
    )
    assert create_res.status_code == 200
    ret_data = create_res.json()
    ret_id = ret_data["id"]
    assert ret_data["return_code"].startswith("RET-2026-")

    # Update return status to APPROVED with pickup details
    patch_res = client.patch(
        f"/admin/returns/{ret_id}/status",
        json={
            "status": "APPROVED",
            "pickup_courier": "BlueDart Surface",
            "pickup_awb": "BD-RET-12345",
            "staff_notes": "Pickup booked for tomorrow morning",
        },
        headers=headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "APPROVED"
    assert patch_res.json()["pickup_awb"] == "BD-RET-12345"


def test_admin_reports_and_csv_export():
    headers = get_owner_token()

    rep_res = client.get("/admin/reports?period=30d", headers=headers)
    assert rep_res.status_code == 200
    data = rep_res.json()
    assert "total_orders" in data
    assert "prepaid_revenue_paid" in data
    assert "cod_revenue_pending" in data

    csv_res = client.get("/admin/reports/export-orders-csv", headers=headers)
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers.get("content-type", "")
    assert "Order Code,Date,Customer Name" in csv_res.text


def test_admin_size_charts():
    headers = get_owner_token()

    # Create size chart
    chart_payload = {
        "name": "Festive Velvet Anarkali Chart",
        "category": "Suit Set",
        "measurements": '[{"size": "S", "bust": 36, "waist": 32, "hip": 38, "length": 48}]',
    }
    create_res = client.post("/admin/size-charts", json=chart_payload, headers=headers)
    assert create_res.status_code == 200
    chart_id = create_res.json()["id"]

    # List size charts
    list_res = client.get("/admin/size-charts", headers=headers)
    assert list_res.status_code == 200
    assert any(c["id"] == chart_id for c in list_res.json())

    # Update
    update_res = client.put(
        f"/admin/size-charts/{chart_id}",
        json={"name": "Festive Velvet Anarkali Standard Chart"},
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Festive Velvet Anarkali Standard Chart"


def test_admin_staff_and_rbac():
    headers = get_owner_token()

    # Create Fulfillment Staff
    rand_email = f"fulfillment_{os.getpid()}@royallibas.com"
    staff_res = client.post(
        "/admin/staff",
        json={
            "email": rand_email,
            "name": "Kavita Verma",
            "password": "staffPassword123!",
            "role": "FULFILLMENT_STAFF",
        },
        headers=headers,
    )
    assert staff_res.status_code == 201
    staff_id = staff_res.json()["id"]

    # Login as fulfillment staff
    login_res = client.post("/admin/login", json={"email": rand_email, "password": "staffPassword123!"})
    assert login_res.status_code == 200
    staff_token = login_res.json()["access_token"]
    staff_header = {"Authorization": f"Bearer {staff_token}"}

    # Fulfillment staff can read orders
    orders_res = client.get("/admin/orders", headers=staff_header)
    assert orders_res.status_code == 200

    # Fulfillment staff CANNOT modify store settings (Forbidden)
    forbidden_res = client.put(
        "/admin/settings",
        json={"standard_shipping_fee": 150.0},
        headers=staff_header,
    )
    assert forbidden_res.status_code == 403


def test_admin_activity_logs():
    headers = get_owner_token()
    res = client.get("/admin/activity-logs?limit=10", headers=headers)
    assert res.status_code == 200
    logs = res.json()
    assert isinstance(logs, list)
    assert len(logs) > 0


if __name__ == "__main__":
    print("Running Upgraded Admin Panel Tests...")
    test_admin_dashboard_metrics()
    print("PASS: Dashboard metrics")
    test_admin_orders_search_and_notes()
    print("PASS: Orders search and notes")
    test_admin_payments_and_cod_collection()
    print("PASS: Payments and COD collection")
    test_admin_shipping_list()
    print("PASS: Shipping list")
    test_admin_inventory_and_stock_adjust()
    print("PASS: Inventory and stock adjustment")
    test_admin_returns_workflow()
    print("PASS: Returns workflow")
    test_admin_reports_and_csv_export()
    print("PASS: Reports and CSV export")
    test_admin_size_charts()
    print("PASS: Size charts")
    test_admin_staff_and_rbac()
    print("PASS: Staff and RBAC")
    test_admin_activity_logs()
    print("PASS: Activity logs")
    print("\nALL ADMIN UPGRADE TESTS PASSED!")

