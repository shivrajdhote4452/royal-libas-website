"""Automated Test Suite for Upgraded Royal Libas Admin Panel.

ISOLATION & SAFETY GUARANTEES:
1. Configures an isolated temporary SQLite database BEFORE importing the application or database modules.
2. Contains a strict guard that immediately halts execution if DATABASE_URL matches any business,
   staging, or production database pattern (PostgreSQL, Hostinger, Neon, royal_libas.db).
3. Seeds all required test fixtures exclusively into the disposable database.
4. Uses dedicated isolated test accounts; never resets or modifies existing admin credentials.
5. Automatically unlinks and removes all temporary database files upon exit.
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

# Force isolated temporary SQLite database before importing application
TEMP_TEST_DIR = tempfile.mkdtemp(prefix="rl_admin_upgrade_isolated_")
TEMP_TEST_DB_PATH = os.path.join(TEMP_TEST_DIR, "isolated_test_admin_upgrade.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEMP_TEST_DB_PATH.replace(os.sep, '/')}"
os.environ["JWT_SECRET"] = "phase6-test-isolated-jwt-secret-key-royal-libas"

# Verify strict isolation
assert "isolated_test_admin_upgrade.db" in os.environ["DATABASE_URL"]

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, Base, engine
from app.models import Admin, Product, ProductVariant, Order, OrderItem, Address, StoreSetting
from app.auth import hash_password

client = TestClient(app)

# Ensure schema is created in the isolated test database
Base.metadata.create_all(bind=engine)


def cleanup_temp_db():
    try:
        engine.dispose()
    except Exception:
        pass
    if os.path.exists(TEMP_TEST_DIR):
        shutil.rmtree(TEMP_TEST_DIR, ignore_errors=True)


atexit.register(cleanup_temp_db)

# Isolated Test Account Constants
TEST_OWNER_EMAIL = "isolated_test_owner@test.local"
TEST_OWNER_PASSWORD = "isolated_test_secret_pw_123"


def seed_isolated_fixtures():
    """Seed initial records strictly inside the disposable test database."""
    db = SessionLocal()
    try:
        # Isolated test admin
        if not db.query(Admin).filter(Admin.email == TEST_OWNER_EMAIL).first():
            owner = Admin(
                email=TEST_OWNER_EMAIL,
                name="Isolated Test Owner",
                role="OWNER",
                password_hash=hash_password(TEST_OWNER_PASSWORD),
                is_active=True,
            )
            db.add(owner)

        # Isolated test product & variant for inventory test
        if not db.query(Product).filter(Product.id == 1).first():
            p = Product(
                id=1,
                name="Isolated Test Garment",
                slug="isolated-test-garment",
                category="Suit Set",
                is_active=True,
            )
            db.add(p)
            db.flush()

            v = ProductVariant(
                id=1,
                product_id=p.id,
                size="M",
                sku="RL-ISO-TEST-M",
                stock=20,
                selling_price=Decimal("2499.00"),
            )
            db.add(v)

        # Isolated test order for returns test
        if not db.query(Order).filter(Order.id == 1).first():
            o = Order(
                id=1,
                order_code="RL-ISO-ORD-01",
                customer_name="Test Customer",
                phone="9876543210",
                status="DELIVERED",
                payment_method="PREPAID",
                payment_status="PAID",
                subtotal=Decimal("2499.00"),
                shipping_charge=Decimal("0.00"),
                discount=Decimal("0.00"),
                total=Decimal("2499.00"),
            )
            db.add(o)

        # Isolated store setting
        if not db.query(StoreSetting).filter(StoreSetting.id == 1).first():
            s = StoreSetting(
                id=1,
                standard_shipping_fee=Decimal("99.00"),
            )
            db.add(s)

        db.commit()
    finally:
        db.close()


seed_isolated_fixtures()


def get_owner_token():
    """Return auth header using the isolated test owner account."""
    res = client.post(
        "/admin/login",
        json={"email": TEST_OWNER_EMAIL, "password": TEST_OWNER_PASSWORD},
    )
    assert res.status_code == 200, f"Owner login failed: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


class TestAdminUpgradeIsolated(unittest.TestCase):
    def test_database_isolation_guard(self):
        """Verify tests run strictly against the disposable database and not real databases."""
        current_db = os.environ.get("DATABASE_URL", "")
        self.assertIn("isolated_test_admin_upgrade.db", current_db)
        self.assertNotIn("royal_libas.db", current_db)

    def test_admin_dashboard_metrics(self):
        headers = get_owner_token()
        res = client.get("/admin/dashboard", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("orders_today", data)
        self.assertIn("to_pack_count", data)
        self.assertIn("total_orders", data)
        self.assertIn("pending_prepaid_count", data)
        self.assertIn("failed_payment_count", data)
        self.assertIn("awaiting_shipment_count", data)
        self.assertIn("awaiting_pickup_count", data)
        self.assertIn("low_stock_count", data)
        self.assertIn("out_of_stock_count", data)
        self.assertIn("today_revenue_prepaid", data)
        self.assertIn("today_pending_cod", data)
        self.assertIsInstance(data["recent_orders"], list)
        self.assertIsInstance(data["low_stock_variants"], list)

    def test_admin_orders_search_and_notes(self):
        headers = get_owner_token()
        res = client.get("/admin/orders?search=RL", headers=headers)
        self.assertEqual(res.status_code, 200)
        orders = res.json()
        self.assertIsInstance(orders, list)
        self.assertGreater(len(orders), 0)

        order_id = orders[0]["id"]
        patch_res = client.patch(
            f"/admin/orders/{order_id}/notes",
            json={"notes": "Special packaging requested - add gift card"},
            headers=headers,
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertIn("Special packaging requested", patch_res.json().get("admin_notes") or "")

    def test_admin_payments_and_cod_collection(self):
        headers = get_owner_token()
        res = client.get("/admin/payments", headers=headers)
        self.assertEqual(res.status_code, 200)

        # Create an isolated COD order for collection test
        db = SessionLocal()
        try:
            cod_order = Order(
                order_code=f"RL-TEST-COD-{os.getpid()}",
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
            cod_id = cod_order.id
        finally:
            db.close()

        collect_res = client.post(
            f"/admin/payments/cod-collect/{cod_id}",
            json={"staff_notes": "Cash of ₹2999 handed over by courier agent"},
            headers=headers,
        )
        self.assertEqual(collect_res.status_code, 200)
        self.assertEqual(collect_res.json()["payment_status"], "PAID")

    def test_admin_shipping_list(self):
        headers = get_owner_token()
        res = client.get("/admin/shipping?tab=all", headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.json(), list)

    def test_admin_inventory_and_stock_adjust(self):
        headers = get_owner_token()
        res = client.get("/admin/inventory", headers=headers)
        self.assertEqual(res.status_code, 200)
        items = res.json()
        self.assertGreater(len(items), 0)

        target = items[0]
        vid = target["variant_id"]
        current_stock = target["stock"]
        new_stock = current_stock + 5

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
        self.assertEqual(adj_res.status_code, 200)
        self.assertEqual(adj_res.json()["new_stock"], new_stock)
        self.assertEqual(adj_res.json()["change_amount"], 5)

        hist_res = client.get(f"/admin/inventory/adjustments?variant_id={vid}", headers=headers)
        self.assertEqual(hist_res.status_code, 200)
        self.assertGreaterEqual(len(hist_res.json()), 1)

    def test_admin_returns_workflow(self):
        headers = get_owner_token()
        db = SessionLocal()
        try:
            order = db.query(Order).first()
            self.assertIsNotNone(order)
            oid = order.id
        finally:
            db.close()

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
        self.assertEqual(create_res.status_code, 200)
        ret_id = create_res.json()["id"]

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
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["status"], "APPROVED")

    def test_admin_reports_and_csv_export(self):
        headers = get_owner_token()
        rep_res = client.get("/admin/reports?period=30d", headers=headers)
        self.assertEqual(rep_res.status_code, 200)
        data = rep_res.json()
        self.assertIn("total_orders", data)
        self.assertIn("prepaid_revenue_paid", data)
        self.assertIn("cod_revenue_pending", data)

        csv_res = client.get("/admin/reports/export-orders-csv", headers=headers)
        self.assertEqual(csv_res.status_code, 200)
        self.assertIn("text/csv", csv_res.headers.get("content-type", ""))

    def test_admin_size_charts_lifecycle_and_cleanup(self):
        headers = get_owner_token()
        chart_payload = {
            "name": "Isolated Test Anarkali Chart",
            "category": "Suit Set",
            "measurements": '[{"size": "S", "bust": 36, "waist": 32, "hip": 38, "length": 48}]',
        }
        create_res = client.post("/admin/size-charts", json=chart_payload, headers=headers)
        self.assertEqual(create_res.status_code, 200)
        chart_id = create_res.json()["id"]

        try:
            list_res = client.get("/admin/size-charts", headers=headers)
            self.assertEqual(list_res.status_code, 200)
            self.assertTrue(any(c["id"] == chart_id for c in list_res.json()))

            update_res = client.put(
                f"/admin/size-charts/{chart_id}",
                json={"name": "Isolated Test Anarkali Standard Chart"},
                headers=headers,
            )
            self.assertEqual(update_res.status_code, 200)
            self.assertEqual(update_res.json()["name"], "Isolated Test Anarkali Standard Chart")
        finally:
            del_res = client.delete(f"/admin/size-charts/{chart_id}", headers=headers)
            self.assertEqual(del_res.status_code, 200)

    def test_admin_staff_and_rbac(self):
        headers = get_owner_token()
        rand_email = f"fulfillment_isolated_{os.getpid()}@royallibas.local"
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
        self.assertEqual(staff_res.status_code, 201)
        staff_id = staff_res.json()["id"]

        try:
            login_res = client.post("/admin/login", json={"email": rand_email, "password": "staffPassword123!"})
            self.assertEqual(login_res.status_code, 200)
            staff_token = login_res.json()["access_token"]
            staff_header = {"Authorization": f"Bearer {staff_token}"}

            orders_res = client.get("/admin/orders", headers=staff_header)
            self.assertEqual(orders_res.status_code, 200)

            forbidden_res = client.put(
                "/admin/settings",
                json={"standard_shipping_fee": 150.0},
                headers=staff_header,
            )
            self.assertEqual(forbidden_res.status_code, 403)
        finally:
            db = SessionLocal()
            try:
                db.query(Admin).filter(Admin.id == staff_id).delete()
                db.commit()
            finally:
                db.close()

    def test_admin_activity_logs(self):
        headers = get_owner_token()
        res = client.get("/admin/activity-logs?limit=10", headers=headers)
        self.assertEqual(res.status_code, 200)
        logs = res.json()
        self.assertIsInstance(logs, list)
        self.assertGreater(len(logs), 0)


if __name__ == "__main__":
    unittest.main()
