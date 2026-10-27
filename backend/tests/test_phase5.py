import os
import sys
from decimal import Decimal
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
from app.database import Base, get_db
import app.database as app_db
from app.models import Admin, Product, ProductVariant, Order
from app.auth import hash_password, create_access_token
from seed import seed_database

# Use isolated test SQLite database file
TEST_DB_FILE = Path(backend_dir) / "test_phase5.db"
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


def get_admin_token() -> str:
    """Helper to generate a valid test admin token."""
    db = TestingSessionLocal()
    admin = db.query(Admin).first()
    if not admin:
        admin = Admin(
            email="owner@royallibas.com",
            password_hash=hash_password("TanyaSecurePass123!"),
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
    token = create_access_token({"sub": str(admin.id), "email": admin.email})
    db.close()
    return token


def test_public_order_tracking_security():
    """Verify customer tracking endpoint and phone mismatch privacy protections."""
    print("Testing Public Order Tracking & Privacy Security...")
    db = TestingSessionLocal()

    variant = db.query(ProductVariant).filter(ProductVariant.stock > 2).first()
    assert variant is not None

    # Place an order with known phone
    order_payload = {
        "customer_name": "Priya Sharma",
        "phone": "9876543210",
        "payment_method": "COD",
        "items": [{"variant_id": variant.id, "quantity": 1}],
        "address": {
            "name": "Priya Sharma",
            "phone": "9876543210",
            "pincode": "400050",
            "line1": "Flat 101, Bandra West",
            "city": "Mumbai",
            "state": "Maharashtra",
        },
    }
    create_res = client.post("/orders", json=order_payload)
    assert create_res.status_code == 201
    order_code = create_res.json()["order_code"]

    # 1. Successful tracking with exact order_code and matching phone
    track_res = client.get(f"/orders/track?order_code={order_code}&phone=9876543210")
    assert track_res.status_code == 200
    data = track_res.json()
    assert data["order_code"] == order_code
    assert data["status"] == "PLACED"
    assert data["customer_name"] == "Priya Sharma"
    assert len(data["items"]) == 1
    assert data["address"]["city"] == "Mumbai"
    print("  [OK] Tracking succeeds with matching order_code and phone")

    # 2. Tracking with +91 prefix works cleanly
    track_res2 = client.get(f"/orders/track?order_code={order_code}&phone=+919876543210")
    assert track_res2.status_code == 200
    print("  [OK] Tracking handles +91 phone formatting cleanly")

    # 3. PRIVACY SECURITY: Wrong phone number MUST NEVER return order data!
    wrong_phone_res = client.get(f"/orders/track?order_code={order_code}&phone=9999999999")
    assert wrong_phone_res.status_code == 404
    assert "not found" in wrong_phone_res.json()["detail"].lower()
    print("  [OK] Phone mismatch rejected with 404 (zero customer data leaked)")

    # 4. Invalid order code rejected with 404
    bad_code_res = client.get("/orders/track?order_code=RL-2026-0000&phone=9876543210")
    assert bad_code_res.status_code == 404
    print("  [OK] Non-existent order rejected with 404")

    # 5. Missing phone or code rejected with 400
    missing_res = client.get(f"/orders/track?order_code={order_code}&phone=123")
    assert missing_res.status_code == 400
    print("  [OK] Invalid phone format rejected with 400")
    db.close()


def test_admin_authentication_guards():
    """Verify all admin routes strictly reject unauthenticated requests."""
    print("Testing Admin Authentication Guards...")

    endpoints = [
        ("GET", "/admin/dashboard"),
        ("GET", "/admin/orders"),
        ("GET", "/admin/orders/1"),
        ("PATCH", "/admin/orders/1/status"),
        ("GET", "/admin/customers"),
        ("GET", "/admin/products"),
    ]

    for method, path in endpoints:
        if method == "GET":
            res = client.get(path)
        else:
            res = client.patch(path, json={"status": "CONFIRMED"})
        assert res.status_code == 401, f"{path} did not reject unauthenticated access!"

    print(f"  [OK] All {len(endpoints)} admin routes rejected unauthenticated requests with 401")


def test_admin_dashboard_and_low_stock():
    """Verify /admin/dashboard returns today's orders, to-pack count, and low-stock variants."""
    print("Testing Admin Dashboard & Live Low-Stock Detection...")
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/admin/dashboard", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "orders_today" in data
    assert "to_pack_count" in data
    assert "total_orders" in data
    assert "low_stock_variants" in data

    # Verify low-stock variants list
    low_stock = data["low_stock_variants"]
    assert len(low_stock) > 0, "Expected seeded low-stock variants to appear on dashboard"
    for item in low_stock:
        assert item["stock"] <= 5
        assert item["product_name"] != ""
    print(f"  [OK] Dashboard loaded: {data['orders_today']} orders today, {data['to_pack_count']} to pack, {len(low_stock)} low-stock variants")


def test_admin_order_fulfillment_workflow():
    """Verify order listing, detail, and status updates (Packed -> Shipped -> Delivered)."""
    print("Testing Admin Order Fulfillment Workflow...")
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    db = TestingSessionLocal()

    # Find the order created earlier
    order = db.query(Order).order_by(Order.id.desc()).first()
    assert order is not None

    # 1. Admin order detail
    detail_res = client.get(f"/admin/orders/{order.id}", headers=headers)
    assert detail_res.status_code == 200
    assert detail_res.json()["order_code"] == order.order_code
    print("  [OK] GET /admin/orders/{id} returned full order details")

    # 2. Update status to PACKED
    pack_res = client.patch(
        f"/admin/orders/{order.id}/status",
        headers=headers,
        json={"status": "PACKED"},
    )
    assert pack_res.status_code == 200
    assert pack_res.json()["status"] == "PACKED"
    print("  [OK] Status transitioned: PLACED -> PACKED")

    # 3. Disallow SHIPPED without courier tracking URL
    bad_ship_res = client.patch(
        f"/admin/orders/{order.id}/status",
        headers=headers,
        json={"status": "SHIPPED", "courier_name": "BlueDart"},
    )
    assert bad_ship_res.status_code == 400
    assert "tracking link is required" in bad_ship_res.json()["detail"].lower()
    print("  [OK] Shipped without tracking URL correctly rejected with 400")

    # 4. Successful transition to SHIPPED with tracking link
    ship_res = client.patch(
        f"/admin/orders/{order.id}/status",
        headers=headers,
        json={
            "status": "SHIPPED",
            "courier_name": "Delhivery Express",
            "tracking_url": "https://www.delhivery.com/track/package/DEL123456789",
        },
    )
    assert ship_res.status_code == 200
    ship_data = ship_res.json()
    assert ship_data["status"] == "SHIPPED"
    assert ship_data["courier_name"] == "Delhivery Express"
    assert "delhivery.com" in ship_data["tracking_url"]
    print("  [OK] Status transitioned: PACKED -> SHIPPED with courier and tracking URL")

    # 5. Customer tracking endpoint now reflects Shipped and shows tracking URL!
    cust_track = client.get(f"/orders/track?order_code={order.order_code}&phone={order.phone}")
    assert cust_track.status_code == 200
    cust_data = cust_track.json()
    assert cust_data["status"] == "SHIPPED"
    assert cust_data["courier_name"] == "Delhivery Express"
    assert cust_data["tracking_url"] == "https://www.delhivery.com/track/package/DEL123456789"
    print("  [OK] Customer tracking page reflects Shipped status and courier link live")

    # 6. Admin marks as DELIVERED
    deliv_res = client.patch(
        f"/admin/orders/{order.id}/status",
        headers=headers,
        json={"status": "DELIVERED"},
    )
    assert deliv_res.status_code == 200
    assert deliv_res.json()["status"] == "DELIVERED"
    print("  [OK] Status transitioned: SHIPPED -> DELIVERED")
    db.close()


def test_admin_customers_and_products_list():
    """Verify read-only customer list and all-products list."""
    print("Testing Admin Customers & Products List...")
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Customers list
    cust_res = client.get("/admin/customers", headers=headers)
    assert cust_res.status_code == 200
    customers = cust_res.json()
    assert len(customers) >= 1
    assert "phone" in customers[0]
    assert "order_count" in customers[0]
    assert "total_spent" in customers[0]
    print(f"  [OK] Customer summary generated: {len(customers)} unique customer profiles")

    # Products list (includes inactive and active products)
    prod_res = client.get("/admin/products", headers=headers)
    assert prod_res.status_code == 200
    products = prod_res.json()
    assert len(products) == 5
    for p in products:
        assert len(p["variants"]) >= 3
    print(f"  [OK] Admin products list returned all {len(products)} products with full variants")


def run_all():
    print("===========================================")
    print(">>> RUNNING PHASE 5 AUTOMATED TEST SUITE <<<")
    print("===========================================\n")

    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    orig_session = app_db.SessionLocal
    orig_engine = app_db.engine
    app_db.SessionLocal = TestingSessionLocal
    app_db.engine = test_engine

    try:
        print("Seeding test database...")
        seed_database(session_factory=TestingSessionLocal)

        test_public_order_tracking_security()
        test_admin_authentication_guards()
        test_admin_dashboard_and_low_stock()
        test_admin_order_fulfillment_workflow()
        test_admin_customers_and_products_list()

        print("\n===========================================")
        print(">>> ALL PHASE 5 VERIFICATION CHECKS PASSED!")
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
