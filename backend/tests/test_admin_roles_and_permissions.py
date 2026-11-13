"""Automated Isolated Test Suite for Admin Roles & Permissions (RBAC).

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
from unittest.mock import patch

# ==============================================================================
# STRICT PRODUCTION & BUSINESS DATABASE GUARD
# ==============================================================================
FORBIDDEN_DB_PATTERNS = ["postgres", "hostinger", "neon", "prod", "staging", "royal_libas.db"]
pre_existing_url = os.environ.get("DATABASE_URL", "").lower()
if any(p in pre_existing_url for p in FORBIDDEN_DB_PATTERNS):
    raise RuntimeError(
        f"CRITICAL SAFETY GUARD: Test refused to run against potential business/production database: {pre_existing_url}"
    )

TEMP_TEST_DIR = tempfile.mkdtemp(prefix="rl_rbac_test_isolated_")
TEMP_TEST_DB_PATH = os.path.join(TEMP_TEST_DIR, "isolated_test_rbac.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEMP_TEST_DB_PATH.replace(os.sep, '/')}"
os.environ["JWT_SECRET"] = "rbac-test-isolated-jwt-secret-royal-libas-32bytes!"

assert "isolated_test_rbac.db" in os.environ["DATABASE_URL"]

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, Base, engine
from app.models import (
    Admin,
    Order,
    OrderItem,
    Address,
    Product,
    ProductVariant,
    SizeChart,
    Coupon,
    ContactInquiry,
    StoreSetting,
    MediaFolder,
    MediaAsset,
    ReturnRequest,
)
from app.auth import hash_password

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


class TestAdminRolesAndPermissions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db = SessionLocal()
        try:
            # 1. Seed accounts for all 4 roles + 1 deactivated account
            cls.owner_email = "rbac_owner@royallibas.com"
            cls.owner_pwd = "OwnerTestPassword123!"
            cls.owner = Admin(
                email=cls.owner_email,
                name="Store Owner",
                role="OWNER",
                password_hash=hash_password(cls.owner_pwd),
                is_active=True,
            )
            db.add(cls.owner)

            cls.store_mgr_email = "rbac_store_mgr@royallibas.com"
            cls.store_mgr_pwd = "StoreMgrTestPassword123!"
            cls.store_mgr = Admin(
                email=cls.store_mgr_email,
                name="Store Manager",
                role="STORE_MANAGER",
                password_hash=hash_password(cls.store_mgr_pwd),
                is_active=True,
            )
            db.add(cls.store_mgr)

            cls.fulfillment_email = "rbac_fulfillment@royallibas.com"
            cls.fulfillment_pwd = "FulfillmentTestPass123!"
            cls.fulfillment_staff = Admin(
                email=cls.fulfillment_email,
                name="Fulfillment Staff",
                role="FULFILLMENT_STAFF",
                password_hash=hash_password(cls.fulfillment_pwd),
                is_active=True,
            )
            db.add(cls.fulfillment_staff)

            cls.legacy_mgr_email = "rbac_legacy_mgr@royallibas.com"
            cls.legacy_mgr_pwd = "LegacyMgrTestPass123!"
            cls.legacy_mgr = Admin(
                email=cls.legacy_mgr_email,
                name="Legacy Manager",
                role="MANAGER",
                password_hash=hash_password(cls.legacy_mgr_pwd),
                is_active=True,
            )
            db.add(cls.legacy_mgr)

            cls.deactivated_email = "rbac_deactivated@royallibas.com"
            cls.deactivated_pwd = "DeactivatedPass123!"
            cls.deactivated_staff = Admin(
                email=cls.deactivated_email,
                name="Deactivated Staff",
                role="FULFILLMENT_STAFF",
                password_hash=hash_password(cls.deactivated_pwd),
                is_active=False,
            )
            db.add(cls.deactivated_staff)

            # 2. Seed test Product and Variant
            cls.test_product = Product(
                name="Handcrafted Silk Kurta Set",
                slug="handcrafted-silk-kurta-set-rbac",
                description="Fine chanderi silk with zari work",
                category="SUIT SET",
                subcategory="Anarkali",
                status="PUBLISHED",
                is_active=True,
            )
            db.add(cls.test_product)
            db.flush()

            cls.test_variant = ProductVariant(
                product_id=cls.test_product.id,
                size="M",
                colour="Ruby Red",
                sku="RL-RBAC-001-M",
                mrp=Decimal("5999.00"),
                selling_price=Decimal("4999.00"),
                stock=15,
                is_active=True,
            )
            db.add(cls.test_variant)

            # 3. Seed test Order and Items
            cls.test_order = Order(
                order_code="RL-RBAC-ORD-1001",
                customer_name="Begum Salma",
                phone="9876543210",
                payment_method="PREPAID",
                payment_status="PAID",
                subtotal=Decimal("4999.00"),
                shipping_charge=Decimal("0.00"),
                discount=Decimal("0.00"),
                total=Decimal("4999.00"),
                status="CONFIRMED",
            )
            db.add(cls.test_order)
            db.flush()

            cls.test_address = Address(
                order_id=cls.test_order.id,
                name="Begum Salma",
                phone="9876543210",
                line1="14 Palace Road, Civil Lines",
                city="Indore",
                state="Madhya Pradesh",
                pincode="452001",
            )
            db.add(cls.test_address)

            cls.test_order_item = OrderItem(
                order_id=cls.test_order.id,
                variant_id=cls.test_variant.id,
                product_name_snapshot="Handcrafted Silk Kurta Set",
                size_snapshot="M",
                colour_snapshot="Ruby Red",
                unit_price_snapshot=Decimal("4999.00"),
                quantity=1,
                line_total=Decimal("4999.00"),
            )
            db.add(cls.test_order_item)

            # 4. Seed test Size Chart
            cls.test_size_chart = SizeChart(
                name="Anarkali Standard Chart",
                category="SUIT SET",
                measurements='{"M": {"bust": 38, "waist": 34, "hip": 40}}',
            )
            db.add(cls.test_size_chart)

            # 5. Seed test Coupon
            cls.test_coupon = Coupon(
                code="RBACWELCOME10",
                type="PERCENT",
                value=Decimal("10.00"),
                min_order_value=Decimal("1000.00"),
                is_active=True,
            )
            db.add(cls.test_coupon)

            # 6. Seed test Support Inquiry
            cls.test_inquiry = ContactInquiry(
                name="Begum Salma",
                email="salma@example.com",
                phone="9876543210",
                subject="Delivery timeline question",
                message="Will my kurta arrive before Eid?",
                status="PENDING",
            )
            db.add(cls.test_inquiry)

            # 7. Seed test Store Setting
            cls.test_setting = StoreSetting(
                standard_cod_free_threshold=Decimal("2000.00"),
                standard_shipping_fee=Decimal("100.00"),
                announcement_text="Festive collection online",
            )
            db.add(cls.test_setting)

            # 8. Seed test Media Folder & Asset
            cls.test_folder = MediaFolder(
                name="test_folder",
                path="royal_libas/test_folder",
            )
            db.add(cls.test_folder)

            cls.test_asset = MediaAsset(
                filename="test_silk_kurta.jpg",
                public_id="royal_libas/test_folder/test_silk_kurta",
                url="https://res.cloudinary.com/demo/image/upload/test_silk_kurta.jpg",
                resource_type="image",
                format="jpg",
                mime_type="image/jpeg",
            )
            db.add(cls.test_asset)

            # 9. Seed test Return Request
            cls.test_return = ReturnRequest(
                return_code="RET-TEST-001",
                order_id=cls.test_order.id,
                order_item_id=cls.test_order_item.id,
                request_type="RETURN",
                reason="Fitting issue",
                status="PENDING",
            )
            db.add(cls.test_return)

            db.commit()
            cls.product_id = cls.test_product.id
            cls.variant_id = cls.test_variant.id
            cls.order_id = cls.test_order.id
            cls.customer_phone = cls.test_order.phone
            cls.size_chart_id = cls.test_size_chart.id
            cls.coupon_id = cls.test_coupon.id
            cls.inquiry_id = cls.test_inquiry.id
            cls.folder_id = cls.test_folder.id
            cls.asset_id = cls.test_asset.id
            cls.return_id = cls.test_return.id

            cls.fulfillment_staff_id = cls.fulfillment_staff.id
        finally:
            db.close()

        # Log in each account to obtain real JWT access tokens
        cls.owner_headers = cls._login_and_get_headers(cls.owner_email, cls.owner_pwd)
        cls.store_mgr_headers = cls._login_and_get_headers(cls.store_mgr_email, cls.store_mgr_pwd)
        cls.fulfillment_headers = cls._login_and_get_headers(cls.fulfillment_email, cls.fulfillment_pwd)
        cls.legacy_mgr_headers = cls._login_and_get_headers(cls.legacy_mgr_email, cls.legacy_mgr_pwd)

    @classmethod
    def _login_and_get_headers(cls, email: str, password: str) -> dict:
        res = client.post("/admin/login", json={"email": email, "password": password})
        if res.status_code != 200:
            raise RuntimeError(f"Login failed for {email}: {res.status_code} {res.text}")
        token = res.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    # ==========================================================================
    # 1. PROFILE & AUTHENTICATION ENDPOINTS
    # ==========================================================================
    def test_01_all_active_roles_can_fetch_own_profile(self):
        """Every authenticated active admin can read /admin/me with their role."""
        for headers, expected_role in [
            (self.owner_headers, "OWNER"),
            (self.store_mgr_headers, "STORE_MANAGER"),
            (self.fulfillment_headers, "FULFILLMENT_STAFF"),
            (self.legacy_mgr_headers, "MANAGER"),
        ]:
            res = client.get("/admin/me", headers=headers)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["role"], expected_role)

    def test_02_deactivated_account_is_strictly_denied(self):
        """Deactivated account cannot log in or authenticate."""
        login_res = client.post("/admin/login", json={"email": self.deactivated_email, "password": self.deactivated_pwd})
        self.assertEqual(login_res.status_code, 403)
        self.assertIn("inactive", login_res.json()["detail"].lower())

    # ==========================================================================
    # 2. FULFILLMENT_STAFF: AUTHORIZED PACKING & SHIPPING WORKFLOWS
    # ==========================================================================
    def test_03_fulfillment_staff_can_list_and_view_orders(self):
        """Fulfillment staff can access GET /admin/orders and GET /admin/orders/{id}."""
        list_res = client.get("/admin/orders", headers=self.fulfillment_headers)
        self.assertEqual(list_res.status_code, 200)
        orders = list_res.json()
        self.assertGreaterEqual(len(orders), 1)

        detail_res = client.get(f"/admin/orders/{self.order_id}", headers=self.fulfillment_headers)
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(detail_res.json()["order_code"], "RL-RBAC-ORD-1001")

    def test_04_fulfillment_staff_can_update_order_status_and_notes(self):
        """Fulfillment staff can mark orders PACKED and update internal packing notes."""
        status_res = client.patch(
            f"/admin/orders/{self.order_id}/status",
            json={"status": "PACKED"},
            headers=self.fulfillment_headers,
        )
        self.assertEqual(status_res.status_code, 200)
        self.assertEqual(status_res.json()["status"], "PACKED")

        notes_res = client.patch(
            f"/admin/orders/{self.order_id}/notes",
            json={"notes": "Checked garment quality, packed in festive gift box with ribbon."},
            headers=self.fulfillment_headers,
        )
        self.assertEqual(notes_res.status_code, 200)
        self.assertEqual(notes_res.json()["admin_notes"], "Checked garment quality, packed in festive gift box with ribbon.")

    def test_05_fulfillment_staff_can_access_shipping_list_and_config(self):
        """Fulfillment staff can view shipment records and integration config."""
        ship_res = client.get("/admin/shipping", headers=self.fulfillment_headers)
        self.assertEqual(ship_res.status_code, 200)

        cfg_res = client.get("/admin/fulfillment/config", headers=self.fulfillment_headers)
        self.assertEqual(cfg_res.status_code, 200)
        self.assertIn("is_configured", cfg_res.json())

    @patch("app.routers.admin.is_shiprocket_configured", return_value=True)
    @patch("app.routers.admin.shiprocket")
    def test_06_fulfillment_staff_can_execute_shiprocket_fulfillment(self, mock_sr, mock_is_cfg):
        """Fulfillment staff can execute rate check, shipping, labels, and tracking refresh."""
        mock_sr.check_serviceability.return_value = {
            "available_courier_companies": [
                {"courier_company_id": 1, "courier_name": "BlueDart Express", "rate": 150.0, "etd": "2 days"}
            ],
            "recommended_courier_company_id": 1,
        }
        mock_sr.create_order.return_value = {"shiprocket_order_id": 999111, "shipment_id": 888222}
        mock_sr.assign_awb.return_value = {"awb_code": "BD-AWB-123456", "courier_name": "BlueDart Express"}
        mock_sr.generate_pickup.return_value = {"pickup_status": "SCHEDULED"}
        mock_sr.generate_label.return_value = {"label_url": "https://shiprocket.co/labels/dummy.pdf"}
        mock_sr.generate_manifest.return_value = {"manifest_url": "https://shiprocket.co/manifests/dummy.pdf"}
        mock_sr.generate_invoice.return_value = {"invoice_url": "https://shiprocket.co/invoices/dummy.pdf"}
        mock_sr.track.return_value = {"current_status": "PICKED UP"}

        # 1. Check Serviceability
        srv_res = client.post(
            f"/admin/orders/{self.order_id}/fulfillment/serviceability",
            json={"length": 10.0, "breadth": 10.0, "height": 5.0, "weight": 0.5},
            headers=self.fulfillment_headers,
        )
        self.assertEqual(srv_res.status_code, 200)
        self.assertEqual(len(srv_res.json()["available_couriers"]), 1)

        # 2. Ship Order
        ship_res = client.post(
            f"/admin/orders/{self.order_id}/fulfillment/ship",
            json={"courier_id": 1, "length": 10.0, "breadth": 10.0, "height": 5.0, "weight": 0.5},
            headers=self.fulfillment_headers,
        )
        self.assertEqual(ship_res.status_code, 200)
        self.assertEqual(ship_res.json()["awb_code"], "BD-AWB-123456")

        # 3. Refresh Tracking
        track_res = client.post(
            f"/admin/orders/{self.order_id}/fulfillment/refresh-tracking",
            headers=self.fulfillment_headers,
        )
        self.assertEqual(track_res.status_code, 200)
        self.assertEqual(track_res.json()["status"], "SHIPPED")

        # 4. Generate & Retrieve Invoice
        inv_gen_res = client.post(
            f"/admin/orders/{self.order_id}/fulfillment/invoice",
            headers=self.fulfillment_headers,
        )
        self.assertEqual(inv_gen_res.status_code, 200)
        self.assertEqual(inv_gen_res.json()["invoice_url"], "https://shiprocket.co/invoices/dummy.pdf")

        inv_get_res = client.get(
            f"/admin/orders/{self.order_id}/fulfillment/invoice",
            headers=self.fulfillment_headers,
        )
        self.assertEqual(inv_get_res.status_code, 200)
        self.assertEqual(inv_get_res.json()["invoice_url"], "https://shiprocket.co/invoices/dummy.pdf")

        # 5. Retry Label & Manifest
        lbl_res = client.post(f"/admin/orders/{self.order_id}/fulfillment/label", headers=self.fulfillment_headers)
        self.assertEqual(lbl_res.status_code, 200)
        self.assertEqual(lbl_res.json()["label_url"], "https://shiprocket.co/labels/dummy.pdf")

        man_res = client.post(f"/admin/orders/{self.order_id}/fulfillment/manifest", headers=self.fulfillment_headers)
        self.assertEqual(man_res.status_code, 200)
        self.assertEqual(man_res.json()["manifest_url"], "https://shiprocket.co/manifests/dummy.pdf")

    # ==========================================================================
    # 3. FULFILLMENT_STAFF: STRICTLY DENIED SENSITIVE OPERATIONS (403 FORBIDDEN)
    # ==========================================================================
    def test_07_fulfillment_staff_denied_financials_and_dashboard(self):
        """Fulfillment staff cannot view Dashboard or Payments or record COD collections."""
        res_dash = client.get("/admin/dashboard", headers=self.fulfillment_headers)
        self.assertEqual(res_dash.status_code, 403)

        res_pay = client.get("/admin/payments", headers=self.fulfillment_headers)
        self.assertEqual(res_pay.status_code, 403)

        res_sync = client.post("/admin/payments/sync/RL-RBAC-ORD-1001", headers=self.fulfillment_headers)
        self.assertEqual(res_sync.status_code, 403)

        res_cod = client.post(f"/admin/payments/cod-collect/{self.order_id}", headers=self.fulfillment_headers)
        self.assertEqual(res_cod.status_code, 403)

    def test_08_fulfillment_staff_denied_inventory_management(self):
        """Fulfillment staff cannot view or adjust inventory."""
        self.assertEqual(client.get("/admin/inventory", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/inventory/summary", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/inventory/adjustments", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(
            client.post("/admin/inventory/adjust", json={"variant_id": 1, "new_stock": 20, "reason": "RESTOCK"}, headers=self.fulfillment_headers).status_code,
            403,
        )

    def test_09_fulfillment_staff_denied_customer_directory_and_support(self):
        """Fulfillment staff cannot browse customer directories or concierge inquiries."""
        self.assertEqual(client.get("/admin/customers", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/customers/9876543210", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/inquiries", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.patch(f"/admin/inquiries/{self.inquiry_id}", json={"reply_text": "Not allowed"}, headers=self.fulfillment_headers).status_code, 403)

    def test_10_fulfillment_staff_denied_reports_and_csv_exports(self):
        """Fulfillment staff cannot view aggregate sales reports or export orders CSV."""
        self.assertEqual(client.get("/admin/reports", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/reports/export-orders-csv", headers=self.fulfillment_headers).status_code, 403)

    def test_11_fulfillment_staff_denied_catalogue_editing_and_media(self):
        """Fulfillment staff cannot manage products, size charts, or media library."""
        self.assertEqual(client.get("/admin/products", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get(f"/admin/products/{self.product_id}", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.post("/admin/products", json={"name": "x", "slug": "x", "category": "SUIT SET"}, headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.patch(f"/admin/products/{self.product_id}", json={"name": "x"}, headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.delete(f"/admin/products/{self.product_id}", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/size-charts", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/media", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/media/folders", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/media/status", headers=self.fulfillment_headers).status_code, 403)

    def test_12_fulfillment_staff_denied_store_settings_coupons_and_staff(self):
        """Fulfillment staff cannot access settings, coupons, staff directory, or activity logs."""
        self.assertEqual(client.get("/admin/settings", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.put("/admin/settings", json={"standard_shipping_fee": 50}, headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/staff", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.post("/admin/staff", json={"email": "hacker@test.com", "role": "OWNER", "password": "pass"}, headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/coupons", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get(f"/admin/coupons/{self.coupon_id}", headers=self.fulfillment_headers).status_code, 403)
        self.assertEqual(client.get("/admin/activity-logs", headers=self.fulfillment_headers).status_code, 403)

    # ==========================================================================
    # 4. STORE_MANAGER: PERMISSIONS & BOUNDARIES
    # ==========================================================================
    def test_13_store_manager_can_manage_products_inventory_and_catalogue(self):
        """Store Manager can view/edit products, stock, size charts, coupons, and support."""
        self.assertEqual(client.get("/admin/products", headers=self.store_mgr_headers).status_code, 200)
        self.assertEqual(client.get(f"/admin/products/{self.product_id}", headers=self.store_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/inventory", headers=self.store_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/inventory/summary", headers=self.store_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/size-charts", headers=self.store_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/coupons", headers=self.store_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/inquiries", headers=self.store_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/media", headers=self.store_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/activity-logs", headers=self.store_mgr_headers).status_code, 200)

    def test_14_store_manager_denied_staff_management(self):
        """Store Manager cannot enumerate or create staff accounts (OWNER only)."""
        self.assertEqual(client.get("/admin/staff", headers=self.store_mgr_headers).status_code, 403)
        self.assertEqual(
            client.post("/admin/staff", json={"email": "new_staff@test.com", "role": "STORE_MANAGER", "password": "pass"}, headers=self.store_mgr_headers).status_code,
            403,
        )
        self.assertEqual(
            client.patch(f"/admin/staff/{self.fulfillment_staff_id}", json={"role": "OWNER"}, headers=self.store_mgr_headers).status_code,
            403,
        )

    def test_15_store_manager_denied_permanent_deletions(self):
        """Store Manager cannot execute permanent DELETE operations (OWNER only)."""
        self.assertEqual(client.delete(f"/admin/products/{self.product_id}", headers=self.store_mgr_headers).status_code, 403)
        self.assertEqual(client.delete(f"/admin/coupons/{self.coupon_id}", headers=self.store_mgr_headers).status_code, 403)
        self.assertEqual(client.delete(f"/admin/size-charts/{self.size_chart_id}", headers=self.store_mgr_headers).status_code, 403)
        self.assertEqual(client.delete(f"/admin/media/folders/{self.folder_id}", headers=self.store_mgr_headers).status_code, 403)
        self.assertEqual(client.delete(f"/admin/media/{self.asset_id}", headers=self.store_mgr_headers).status_code, 403)

    # ==========================================================================
    # 5. LEGACY MANAGER: PRESERVED ACCESS & BOUNDARIES
    # ==========================================================================
    def test_16_legacy_manager_preserves_existing_operational_access(self):
        """Legacy MANAGER retains access to all endpoints previously available before RBAC hardening."""
        # 1. Operations
        self.assertEqual(client.get("/admin/dashboard", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/orders", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get(f"/admin/orders/{self.order_id}", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.patch(f"/admin/orders/{self.order_id}/notes", json={"notes": "Legacy note"}, headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/payments", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/shipping", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/fulfillment/config", headers=self.legacy_mgr_headers).status_code, 200)

        # 2. Customers & Support
        self.assertEqual(client.get("/admin/customers", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get(f"/admin/customers/{self.customer_phone}", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/inquiries", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(
            client.patch(f"/admin/inquiries/{self.inquiry_id}", json={"reply_text": "We will dispatch soon.", "status": "RESOLVED"}, headers=self.legacy_mgr_headers).status_code,
            200,
        )

        # 3. Reports & Settings
        self.assertEqual(client.get("/admin/reports", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/reports/export-orders-csv", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/settings", headers=self.legacy_mgr_headers).status_code, 200)

        # 4. Inventory & Returns
        self.assertEqual(client.get("/admin/inventory", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/inventory/summary", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/inventory/adjustments", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/returns", headers=self.legacy_mgr_headers).status_code, 200)

        # 5. Catalogue & Stock (Read endpoints)
        self.assertEqual(client.get("/admin/products", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get(f"/admin/products/{self.product_id}", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/size-charts", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/coupons", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get(f"/admin/coupons/{self.coupon_id}", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/media", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/media/folders", headers=self.legacy_mgr_headers).status_code, 200)
        self.assertEqual(client.get("/admin/media/status", headers=self.legacy_mgr_headers).status_code, 200)

    def test_17_legacy_manager_denied_store_manager_and_owner_endpoints(self):
        """Legacy MANAGER is not silently promoted and is strictly blocked on catalogue mutations and staff management."""
        # 1. Product mutations (requires OWNER, STORE_MANAGER)
        self.assertEqual(client.post("/admin/products", json={"name": "x", "slug": "x", "category": "SUIT SET"}, headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.patch(f"/admin/products/{self.product_id}", json={"name": "Updated x"}, headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.delete(f"/admin/products/{self.product_id}", headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.post(f"/admin/products/{self.product_id}/variants", json={"size": "XXL", "selling_price": 5000, "mrp": 6000, "stock": 10}, headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.patch(f"/admin/variants/{self.variant_id}", json={"stock": 20}, headers=self.legacy_mgr_headers).status_code, 403)

        # 2. Stock & Return Mutations (requires OWNER, STORE_MANAGER)
        self.assertEqual(client.post("/admin/inventory/adjust", json={"variant_id": self.variant_id, "new_stock": 10, "reason": "RESTOCK"}, headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.post("/admin/inventory/bulk-adjust", json={"product_id": self.product_id, "items": [{"variant_id": self.variant_id, "expected_stock": 10, "new_stock": 15}]}, headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.patch(f"/admin/returns/{self.return_id}/status", json={"status": "APPROVED"}, headers=self.legacy_mgr_headers).status_code, 403)

        # 3. Coupon Mutations (requires OWNER, STORE_MANAGER / OWNER)
        self.assertEqual(client.post("/admin/coupons", json={"code": "NEWCODE10", "type": "PERCENT", "value": 10, "min_order_value": 500}, headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.delete(f"/admin/coupons/{self.coupon_id}", headers=self.legacy_mgr_headers).status_code, 403)

        # 4. Media Mutations & Size Chart Mutations
        self.assertEqual(client.post("/admin/media/folders", json={"name": "new_folder"}, headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.delete(f"/admin/media/{self.asset_id}", headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.post("/admin/size-charts", json={"name": "New Chart", "category": "SUIT SET", "measurements": "{}"}, headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.delete(f"/admin/size-charts/{self.size_chart_id}", headers=self.legacy_mgr_headers).status_code, 403)

        # 5. Activity logs (requires OWNER, STORE_MANAGER)
        self.assertEqual(client.get("/admin/activity-logs", headers=self.legacy_mgr_headers).status_code, 403)

        # 6. Staff administration (requires OWNER only)
        self.assertEqual(client.get("/admin/staff", headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.post("/admin/staff", json={"email": "new_staff@test.com", "role": "STORE_MANAGER", "password": "pass"}, headers=self.legacy_mgr_headers).status_code, 403)
        self.assertEqual(client.patch(f"/admin/staff/{self.fulfillment_staff_id}", json={"role": "OWNER"}, headers=self.legacy_mgr_headers).status_code, 403)

    # ==========================================================================
    # 6. OWNER: UNRESTRICTED ACCESS
    # ==========================================================================
    def test_18_owner_has_full_unrestricted_access(self):
        """Owner can access all endpoints, including staff management and store settings."""
        self.assertEqual(client.get("/admin/dashboard", headers=self.owner_headers).status_code, 200)
        self.assertEqual(client.get("/admin/orders", headers=self.owner_headers).status_code, 200)
        self.assertEqual(client.get("/admin/payments", headers=self.owner_headers).status_code, 200)
        self.assertEqual(client.get("/admin/shipping", headers=self.owner_headers).status_code, 200)
        self.assertEqual(client.get("/admin/products", headers=self.owner_headers).status_code, 200)
        self.assertEqual(client.get("/admin/inventory", headers=self.owner_headers).status_code, 200)
        self.assertEqual(client.get("/admin/staff", headers=self.owner_headers).status_code, 200)
        self.assertEqual(client.get("/admin/settings", headers=self.owner_headers).status_code, 200)
        self.assertEqual(client.get("/admin/coupons", headers=self.owner_headers).status_code, 200)
        self.assertEqual(client.get("/admin/reports", headers=self.owner_headers).status_code, 200)
        self.assertEqual(client.get("/admin/activity-logs", headers=self.owner_headers).status_code, 200)

    # ==========================================================================
    # 7. DUPLICATE PRODUCT ROUTES CHECK
    # ==========================================================================
    def test_19_duplicate_product_route_removed_and_rbac_enforced(self):
        """Verifies product creation enforces require_roles('OWNER', 'STORE_MANAGER')."""
        new_prod_payload = {
            "name": "Artisanal Silk Sharara",
            "slug": "artisanal-silk-sharara-test",
            "description": "Handcrafted silk sharara set",
            "category": "SUIT SET",
            "subcategory": "Three Pieces",
            "status": "DRAFT",
            "variants": [
                {
                    "size": "L",
                    "selling_price": 5499.00,
                    "mrp": 6499.00,
                    "stock": 5,
                }
            ],
        }
        # Fulfillment staff rejected with 403
        denied_res = client.post("/admin/products", json=new_prod_payload, headers=self.fulfillment_headers)
        self.assertEqual(denied_res.status_code, 403)

        # Store manager accepted with 201
        created_res = client.post("/admin/products", json=new_prod_payload, headers=self.store_mgr_headers)
        self.assertEqual(created_res.status_code, 201)
        self.assertEqual(created_res.json()["name"], "Artisanal Silk Sharara")

    # ==========================================================================
    # 8. ORDER CANCELLATION PERMISSIONS ACROSS ROLES
    # ==========================================================================
    def test_20_order_cancellation_permissions_across_roles(self):
        """Verifies order status update and cancellation behavior across all roles without policy changes."""
        db = SessionLocal()
        orders_by_role = {}
        try:
            for role_name in ["OWNER", "STORE_MANAGER", "FULFILLMENT_STAFF", "MANAGER"]:
                ord_obj = Order(
                    order_code=f"RL-CANCEL-{role_name[:4]}",
                    customer_name="Test Customer",
                    phone="9876543210",
                    subtotal=Decimal("1999.00"),
                    total=Decimal("1999.00"),
                    payment_method="COD",
                    payment_status="PENDING",
                    status="CONFIRMED",
                )
                db.add(ord_obj)
                db.flush()
                addr = Address(order_id=ord_obj.id, name="Test", phone="9876543210", line1="Road", city="Indore", state="MP", pincode="452001")
                db.add(addr)
                item = OrderItem(order_id=ord_obj.id, variant_id=self.variant_id, product_name_snapshot="Item", size_snapshot="M", unit_price_snapshot=Decimal("1999.00"), quantity=1, line_total=Decimal("1999.00"))
                db.add(item)
                db.commit()
                orders_by_role[role_name] = ord_obj.id
        finally:
            db.close()

        # Each role currently has authorized access to PATCH /admin/orders/{id}/status to cancel
        headers_map = {
            "OWNER": self.owner_headers,
            "STORE_MANAGER": self.store_mgr_headers,
            "FULFILLMENT_STAFF": self.fulfillment_headers,
            "MANAGER": self.legacy_mgr_headers,
        }

        for role_name, o_id in orders_by_role.items():
            res = client.patch(
                f"/admin/orders/{o_id}/status",
                json={"status": "CANCELLED"},
                headers=headers_map[role_name],
            )
            self.assertEqual(res.status_code, 200, f"Role {role_name} failed to cancel order: {res.text}")
            self.assertEqual(res.json()["status"], "CANCELLED")

    # ==========================================================================
    # 9. BEFORE/AFTER REGRESSION SAFETY VERIFICATION
    # ==========================================================================
    def test_21_before_after_regression_safety_verification(self):
        """Verifies no unintended privilege regression or escalation across any role."""
        # 1. Fulfillment staff remains strictly quarantined from business/catalogue data
        for path in [
            "/admin/dashboard",
            "/admin/payments",
            "/admin/customers",
            "/admin/reports",
            "/admin/settings",
            "/admin/products",
            "/admin/inventory",
            "/admin/coupons",
            "/admin/media",
            "/admin/size-charts",
            "/admin/staff",
            "/admin/activity-logs",
        ]:
            res = client.get(path, headers=self.fulfillment_headers)
            self.assertEqual(res.status_code, 403, f"Fulfillment staff should be 403 on {path}, got {res.status_code}")

        # 2. Store Manager has access to catalogue/reports but blocked on staff administration & deletions
        self.assertEqual(client.get("/admin/staff", headers=self.store_mgr_headers).status_code, 403)
        self.assertEqual(client.delete(f"/admin/products/{self.product_id}", headers=self.store_mgr_headers).status_code, 403)


if __name__ == "__main__":
    unittest.main()
