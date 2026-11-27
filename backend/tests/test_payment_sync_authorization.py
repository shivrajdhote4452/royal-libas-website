"""Isolated Tests for Customer Payment Sync Authorization.

Verifies:
1. Valid customer order_token in JSON request body permits sync and returns normal sync result.
2. Missing token (no body, empty JSON, or token=None) is rejected with HTTP 403 before any Cashfree call.
3. Invalid/tampered token is rejected with HTTP 403 before any Cashfree call.
4. Token from Order A cannot sync Order B (HTTP 403).
5. Response to an unauthorised caller is generic and contains no payment status, order details, or enumeration assistance.
6. Existing protected admin sync (/admin/payments/sync/{order_code}) continues to work for permitted admin roles with Bearer JWT.
7. Outbound Cashfree API is never called when authorization fails.
"""

import os
import sys
from pathlib import Path
import unittest
from decimal import Decimal
from unittest.mock import patch, MagicMock

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ.setdefault("CASHFREE_CLIENT_ID", "TEST_CLIENT_ID")
os.environ.setdefault("CASHFREE_CLIENT_SECRET", "TEST_CLIENT_SECRET")
os.environ.setdefault("CASHFREE_ENVIRONMENT", "sandbox")
os.environ.setdefault("JWT_SECRET", "isolated-test-jwt-secret-sync-auth-32bytes")

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import Order, ProductVariant, Admin
from app.auth import create_access_token, hash_password

client = TestClient(app)


class TestPaymentSyncAuthorization(unittest.TestCase):
    """Test suite ensuring /payments/cashfree/sync/{order_code} is strictly protected."""

    @classmethod
    def setUpClass(cls):
        db = SessionLocal()
        try:
            from app.models import StoreSetting, Product
            # Ensure store setting permits online prepaid checkout
            setting = db.query(StoreSetting).first()
            if not setting:
                setting = StoreSetting(
                    online_payment_enabled=True,
                    cod_enabled=True,
                    standard_shipping_fee=Decimal("0.00"),
                )
                db.add(setting)
                db.commit()
            elif not setting.online_payment_enabled:
                setting.online_payment_enabled = True
                db.commit()

            # Create or update a published test product and variant with available stock
            prod = db.query(Product).filter(Product.slug == "sync-auth-test-ensemble").first()
            if not prod:
                prod = Product(
                    name="Sync Auth Test Ensemble",
                    slug="sync-auth-test-ensemble",
                    category="Kurti Sets",
                    status="PUBLISHED",
                    is_active=True,
                )
                db.add(prod)
                db.commit()
                db.refresh(prod)
            else:
                prod.status = "PUBLISHED"
                prod.is_active = True
                db.commit()

            variant = db.query(ProductVariant).filter(ProductVariant.product_id == prod.id).first()
            if not variant:
                variant = ProductVariant(
                    product_id=prod.id,
                    size="M",
                    colour="Gold",
                    selling_price=Decimal("1999.00"),
                    stock=50,
                    is_active=True,
                )
                db.add(variant)
                db.commit()
                db.refresh(variant)
            else:
                variant.stock = 50
                variant.is_active = True
                variant.selling_price = Decimal("1999.00")
                db.commit()
                db.refresh(variant)
            cls.variant_id = variant.id

            # Ensure an admin account exists for admin sync tests
            admin_user = db.query(Admin).filter(Admin.email == "admin_sync@example.com").first()
            if not admin_user:
                admin_user = Admin(
                    email="admin_sync@example.com",
                    name="Admin Sync Tester",
                    password_hash=hash_password("AdminPass123!"),
                    role="OWNER",
                    is_active=True,
                )
                db.add(admin_user)
                db.commit()
                db.refresh(admin_user)
            cls.admin_token = create_access_token({"sub": str(admin_user.id), "role": admin_user.role})
        finally:
            db.close()

    def _create_order(self, customer_name="Customer A", phone="9811223344"):
        res = client.post("/orders", json={
            "customer_name": customer_name,
            "phone": phone,
            "payment_method": "PREPAID",
            "items": [{"variant_id": self.variant_id, "quantity": 1}],
            "address": {
                "name": customer_name,
                "phone": phone,
                "pincode": "284003",
                "line1": "Civil Lines",
                "city": "Jhansi",
                "state": "Uttar Pradesh",
            },
        })
        self.assertEqual(res.status_code, 201)
        data = res.json()
        return data["order_code"], data["order_token"]

    @patch("httpx.Client.get")
    @patch("app.services.payment_service.is_cashfree_configured", return_value=True)
    def test_01_valid_token_permits_sync_and_receives_normal_result(self, mock_cfg, mock_get):
        """A valid customer token in the POST JSON body permits sync and returns sync response."""
        order_code, order_token = self._create_order("Valid Token Customer", "9811221101")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {
                "cf_payment_id": "cf_sync_valid_01",
                "payment_status": "SUCCESS",
                "payment_amount": 1999.00,
                "payment_currency": "INR",
            }
        ]
        mock_get.return_value = mock_resp

        res = client.post(
            f"/payments/cashfree/sync/{order_code}",
            json={"token": order_token},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["order_code"], order_code)
        self.assertEqual(data["payment_status"], "PAID")
        self.assertTrue(data["is_paid"])
        # Cashfree was queried
        self.assertTrue(mock_get.called)

    @patch("httpx.Client.get")
    def test_02_missing_token_rejected_before_cashfree_call(self, mock_get):
        """Missing token (no body, empty JSON, or token=None) returns 403 without calling Cashfree."""
        order_code, _ = self._create_order("No Token Customer", "9811221102")

        # 1. No body at all
        res1 = client.post(f"/payments/cashfree/sync/{order_code}")
        self.assertEqual(res1.status_code, 403)
        self.assertIn("Access denied", res1.json()["detail"])
        mock_get.assert_not_called()

        # 2. Empty JSON object
        res2 = client.post(f"/payments/cashfree/sync/{order_code}", json={})
        self.assertEqual(res2.status_code, 403)
        self.assertIn("Access denied", res2.json()["detail"])
        mock_get.assert_not_called()

        # 3. token is None
        res3 = client.post(f"/payments/cashfree/sync/{order_code}", json={"token": None})
        self.assertEqual(res3.status_code, 403)
        self.assertIn("Access denied", res3.json()["detail"])
        mock_get.assert_not_called()

        # 4. token is empty string or whitespace
        res4 = client.post(f"/payments/cashfree/sync/{order_code}", json={"token": "   "})
        self.assertEqual(res4.status_code, 403)
        self.assertIn("Access denied", res4.json()["detail"])
        mock_get.assert_not_called()

    @patch("httpx.Client.get")
    def test_03_invalid_token_rejected_before_cashfree_call(self, mock_get):
        """Invalid or tampered token returns 403 without querying Cashfree."""
        order_code, _ = self._create_order("Tampered Token Customer", "9811221103")

        res = client.post(
            f"/payments/cashfree/sync/{order_code}",
            json={"token": "invalid_forged_token_xyz_12345"},
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("Access denied", res.json()["detail"])
        mock_get.assert_not_called()

    @patch("httpx.Client.get")
    def test_04_token_from_order_a_cannot_sync_order_b(self, mock_get):
        """A valid token belonging to Order A cannot be used to sync Order B."""
        order_code_a, token_a = self._create_order("Customer A", "9811221104")
        order_code_b, token_b = self._create_order("Customer B", "9811221105")
        self.assertNotEqual(token_a, token_b)

        # Attempt to sync Order B using Token A
        res = client.post(
            f"/payments/cashfree/sync/{order_code_b}",
            json={"token": token_a},
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("Access denied", res.json()["detail"])
        mock_get.assert_not_called()

    @patch("httpx.Client.get")
    def test_05_unauthorised_response_contains_no_payment_or_order_details(self, mock_get):
        """The 403 response contains only a generic error message, with no order or payment details."""
        order_code, _ = self._create_order("Enumeration Probe", "9811221106")

        # Probe with non-existent order code vs real order code
        res_real = client.post(
            f"/payments/cashfree/sync/{order_code}",
            json={"token": "bad_token"},
        )
        res_fake = client.post(
            "/payments/cashfree/sync/RL-2026-9999",
            json={"token": "bad_token"},
        )

        self.assertEqual(res_real.status_code, 403)
        self.assertEqual(res_fake.status_code, 403)
        # Exactly identical error detail prevents order enumeration
        self.assertEqual(res_real.json()["detail"], res_fake.json()["detail"])

        # No order status, payment status, customer name, or items leaked in response
        body_str = res_real.text
        self.assertNotIn("payment_status", body_str)
        self.assertNotIn("order_status", body_str)
        self.assertNotIn("is_paid", body_str)
        mock_get.assert_not_called()

    @patch("httpx.Client.get")
    @patch("app.services.payment_service.is_cashfree_configured", return_value=True)
    def test_06_protected_admin_sync_route_preserves_bearer_auth(self, mock_cfg, mock_get):
        """Admin sync route (/admin/payments/sync/{order_code}) functions with Bearer JWT header."""
        order_code, _ = self._create_order("Admin Sync Customer", "9811221107")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {
                "cf_payment_id": "cf_admin_sync_99",
                "payment_status": "SUCCESS",
                "payment_amount": 1999.00,
                "payment_currency": "INR",
            }
        ]
        mock_get.return_value = mock_resp

        # 1. Unauthenticated admin call fails with 401
        res_unauth = client.post(f"/admin/payments/sync/{order_code}")
        self.assertEqual(res_unauth.status_code, 401)

        # 2. Authenticated admin call with Bearer header succeeds
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        res_auth = client.post(f"/admin/payments/sync/{order_code}", headers=headers)
        self.assertEqual(res_auth.status_code, 200)
        data = res_auth.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["payment_status"], "PAID")
        self.assertTrue(data["is_paid"])


if __name__ == "__main__":
    unittest.main()
