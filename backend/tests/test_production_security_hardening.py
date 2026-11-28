"""Production Security Hardening Test Suite (PR #39).

Verifies:
1. Production API documentation restriction:
   - In production mode, /docs, /redoc, and /openapi.json return 404 Not Found.
   - In development/test mode, /docs, /redoc, and /openapi.json remain active (200 OK).
   - ENABLE_API_DOCS override allows explicit activation if configured.
2. Cashfree create-order authorization:
   - Valid customer order_token allows payment session initiation.
   - Missing, empty, or mismatched token returns 403 Forbidden without calling Cashfree.
   - Nonexistent order returns generic 403 Forbidden (prevents order-code enumeration).
   - Verifies no outbound network request occurs prior to valid authorization.
   - Verifies duplicate valid initiation succeeds idempotently.
3. Contact inquiry message validation:
   - Messages under 2,000 characters are accepted and saved to database.
   - Oversized messages (> 2,000 characters) are rejected with HTTP 422.
   - Messages under 5 characters are rejected with HTTP 422.
"""

import os
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "isolated-test-jwt-secret-hardening-32chars")
os.environ.setdefault("CASHFREE_CLIENT_ID", "TEST_CF_CLIENT_ID_12345")
os.environ.setdefault("CASHFREE_CLIENT_SECRET", "TEST_CF_CLIENT_SECRET_67890")
os.environ.setdefault("CASHFREE_ENVIRONMENT", "sandbox")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import Order, OrderItem, Product, ProductVariant, ContactInquiry, StoreSetting
from app.main import app, resolve_api_docs_routes


class TestProductionSecurityHardening(unittest.TestCase):
    """Test suite for PR #39 security hardening changes."""

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

        def override_get_db():
            db = cls.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=cls.engine)

    def setUp(self):
        # Ensure StoreSetting exists with online payments enabled
        db = self.SessionLocal()
        setting = db.query(StoreSetting).first()
        if not setting:
            setting = StoreSetting(online_payment_enabled=True)
            db.add(setting)
            db.commit()
        elif not setting.online_payment_enabled:
            setting.online_payment_enabled = True
            db.commit()
        db.close()

    # =========================================================================
    # 1. API Documentation Restriction Tests
    # =========================================================================

    def test_01_docs_routes_resolver_production_mode(self):
        """In production mode without explicit override, docs routes must be None."""
        docs_url, redoc_url, openapi_url = resolve_api_docs_routes(
            env_mode="production",
            enable_docs_override=False,
        )
        self.assertIsNone(docs_url)
        self.assertIsNone(redoc_url)
        self.assertIsNone(openapi_url)

    def test_02_docs_routes_resolver_development_mode(self):
        """In development/test mode, docs routes must be enabled."""
        docs_url, redoc_url, openapi_url = resolve_api_docs_routes(
            env_mode="development",
            enable_docs_override=False,
        )
        self.assertEqual(docs_url, "/docs")
        self.assertEqual(redoc_url, "/redoc")
        self.assertEqual(openapi_url, "/openapi.json")

    def test_03_docs_routes_resolver_production_with_explicit_override(self):
        """In production mode with explicit enable_docs_override=True, docs routes are available."""
        docs_url, redoc_url, openapi_url = resolve_api_docs_routes(
            env_mode="production",
            enable_docs_override=True,
        )
        self.assertEqual(docs_url, "/docs")
        self.assertEqual(redoc_url, "/redoc")
        self.assertEqual(openapi_url, "/openapi.json")

    def test_04_production_app_returns_404_on_docs_endpoints(self):
        """A FastAPI application configured for production returns 404 on /docs, /redoc, /openapi.json."""
        d_url, r_url, o_url = resolve_api_docs_routes("production", False)
        prod_app = FastAPI(
            title="Prod Test App",
            docs_url=d_url,
            redoc_url=r_url,
            openapi_url=o_url,
        )

        @prod_app.get("/health")
        def health():
            return {"status": "ok"}

        prod_client = TestClient(prod_app)

        # In production mode: all docs endpoints return 404
        self.assertEqual(prod_client.get("/docs").status_code, 404)
        self.assertEqual(prod_client.get("/redoc").status_code, 404)
        self.assertEqual(prod_client.get("/openapi.json").status_code, 404)
        # Normal application route still functions
        self.assertEqual(prod_client.get("/health").status_code, 200)

    def test_05_development_app_returns_200_on_docs_endpoints(self):
        """A FastAPI application configured for development returns 200 on /docs and /openapi.json."""
        d_url, r_url, o_url = resolve_api_docs_routes("development", False)
        dev_app = FastAPI(
            title="Dev Test App",
            docs_url=d_url,
            redoc_url=r_url,
            openapi_url=o_url,
        )
        dev_client = TestClient(dev_app)

        self.assertEqual(dev_client.get("/docs").status_code, 200)
        self.assertEqual(dev_client.get("/openapi.json").status_code, 200)

    # =========================================================================
    # 2. Cashfree create-order Authorization Tests
    # =========================================================================

    def _create_sample_prepaid_order(self, order_code: str, order_token: str) -> Order:
        db = self.SessionLocal()
        order = Order(
            order_code=order_code,
            order_token=order_token,
            customer_name="Test Customer",
            phone="9876543210",
            status="PENDING",
            payment_method="PREPAID",
            payment_status="PENDING",
            subtotal=Decimal("1999.00"),
            shipping_charge=Decimal("0.00"),
            discount=Decimal("0.00"),
            total=Decimal("1999.00"),
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        db.close()
        return order

    def test_06_create_cashfree_order_with_valid_token_success(self):
        """Legitimate customer with valid order_code and matching order_token initiates payment session."""
        order_code = "RL-HARDEN-01"
        order_token = "tok_valid_customer_secret_12345"
        self._create_sample_prepaid_order(order_code, order_token)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "payment_session_id": "session_cf_success_abc123",
            "cf_order_id": "cf_ord_98765",
            "order_status": "ACTIVE",
        }

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.post.return_value = mock_resp

        with patch("app.services.payment_service.httpx.Client", return_value=mock_client):
            resp = self.client.post(
                "/payments/cashfree/create-order",
                json={"order_code": order_code, "token": order_token},
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["payment_session_id"], "session_cf_success_abc123")
            self.assertEqual(data["order_code"], order_code)
            self.assertEqual(Decimal(str(data["amount"])), Decimal("1999.00"))

            # Verify outbound request was made once to Cashfree
            mock_client.post.assert_called_once()

    def test_07_create_cashfree_order_missing_token_denied_no_network_call(self):
        """Request without token is denied with 403; zero outbound requests are made to Cashfree."""
        order_code = "RL-HARDEN-02"
        order_token = "tok_secret_guard_02"
        self._create_sample_prepaid_order(order_code, order_token)

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client

        with patch("app.services.payment_service.httpx.Client", return_value=mock_client):
            resp = self.client.post(
                "/payments/cashfree/create-order",
                json={"order_code": order_code},
            )
            self.assertEqual(resp.status_code, 403)
            self.assertIn("Access denied", resp.json()["detail"])

            # Outbound Cashfree network request MUST NOT occur
            mock_client.post.assert_not_called()

    def test_08_create_cashfree_order_empty_or_whitespace_token_denied(self):
        """Request with empty or whitespace-only token is rejected with 403."""
        order_code = "RL-HARDEN-03"
        order_token = "tok_secret_guard_03"
        self._create_sample_prepaid_order(order_code, order_token)

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client

        with patch("app.services.payment_service.httpx.Client", return_value=mock_client):
            for bad_token in ["", "   ", None]:
                resp = self.client.post(
                    "/payments/cashfree/create-order",
                    json={"order_code": order_code, "token": bad_token},
                )
                self.assertEqual(resp.status_code, 403)
                self.assertIn("Access denied", resp.json()["detail"])
                mock_client.post.assert_not_called()

    def test_09_create_cashfree_order_wrong_token_denied(self):
        """Attacker supplying wrong token for existing order is denied with 403."""
        order_code = "RL-HARDEN-04"
        order_token = "tok_secret_guard_04_real"
        self._create_sample_prepaid_order(order_code, order_token)

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client

        with patch("app.services.payment_service.httpx.Client", return_value=mock_client):
            resp = self.client.post(
                "/payments/cashfree/create-order",
                json={"order_code": order_code, "token": "tok_attacker_fake_token"},
            )
            self.assertEqual(resp.status_code, 403)
            self.assertIn("Access denied", resp.json()["detail"])
            mock_client.post.assert_not_called()

    def test_10_create_cashfree_order_nonexistent_order_denied_generic(self):
        """Querying a nonexistent order code returns the identical generic 403 to prevent enumeration."""
        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client

        with patch("app.services.payment_service.httpx.Client", return_value=mock_client):
            resp = self.client.post(
                "/payments/cashfree/create-order",
                json={"order_code": "RL-9999-DOESNT-EXIST", "token": "any_token"},
            )
            self.assertEqual(resp.status_code, 403)
            self.assertIn("Access denied: valid customer order token required.", resp.json()["detail"])
            mock_client.post.assert_not_called()

    def test_11_create_cashfree_order_duplicate_valid_initiation_success(self):
        """Duplicate initiation with valid token succeeds idempotently."""
        order_code = "RL-HARDEN-05"
        order_token = "tok_secret_guard_05"
        self._create_sample_prepaid_order(order_code, order_token)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "payment_session_id": "session_cf_dup_123",
            "cf_order_id": "cf_ord_dup_456",
            "order_status": "ACTIVE",
        }

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.post.return_value = mock_resp

        with patch("app.services.payment_service.httpx.Client", return_value=mock_client):
            # First call
            r1 = self.client.post(
                "/payments/cashfree/create-order",
                json={"order_code": order_code, "token": order_token},
            )
            self.assertEqual(r1.status_code, 200)
            self.assertEqual(r1.json()["payment_session_id"], "session_cf_dup_123")

            # Duplicate call (e.g. customer page refresh or retried payment launch)
            r2 = self.client.post(
                "/payments/cashfree/create-order",
                json={"order_code": order_code, "token": order_token},
            )
            self.assertEqual(r2.status_code, 200)
            self.assertEqual(r2.json()["payment_session_id"], "session_cf_dup_123")

            self.assertEqual(mock_client.post.call_count, 2)

    # =========================================================================
    # 3. Contact Inquiry Validation Tests
    # =========================================================================

    def test_12_contact_inquiry_valid_message_accepted(self):
        """Valid contact inquiry with message <= 2000 chars is accepted (201 Created) and persisted."""
        normal_msg = "Hello Royal Libas, I would like to inquire about custom measurements for a festive anarkali."
        payload = {
            "name": "Pooja Verma",
            "email": "pooja.verma@example.com",
            "message": normal_msg,
        }
        resp = self.client.post("/contact", json=payload)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["status"], "success")

        # Verify saved in database
        db = self.SessionLocal()
        inquiry = (
            db.query(ContactInquiry)
            .filter(ContactInquiry.email == "pooja.verma@example.com")
            .order_by(ContactInquiry.id.desc())
            .first()
        )
        self.assertIsNotNone(inquiry)
        self.assertEqual(inquiry.name, "Pooja Verma")
        self.assertEqual(inquiry.message, normal_msg)
        db.close()

    def test_13_contact_inquiry_boundary_2000_chars_accepted(self):
        """Exact 2,000-character boundary message is accepted."""
        boundary_msg = "A" * 2000
        payload = {
            "name": "Boundary Tester",
            "email": "boundary@example.com",
            "message": boundary_msg,
        }
        resp = self.client.post("/contact", json=payload)
        self.assertEqual(resp.status_code, 201)

    def test_14_contact_inquiry_oversized_message_rejected(self):
        """Oversized message (2,001 characters) is rejected with HTTP 422 validation error."""
        oversized_msg = "X" * 2001
        payload = {
            "name": "Spam Bot",
            "email": "spambot@example.com",
            "message": oversized_msg,
        }
        resp = self.client.post("/contact", json=payload)
        self.assertEqual(resp.status_code, 422)
        err_detail = str(resp.json())
        self.assertIn("2,000 characters", err_detail)

        # Verify NOT saved in database
        db = self.SessionLocal()
        inquiry = db.query(ContactInquiry).filter(ContactInquiry.email == "spambot@example.com").first()
        self.assertIsNone(inquiry)
        db.close()

    def test_15_contact_inquiry_too_short_message_rejected(self):
        """Message under 5 characters is rejected with HTTP 422."""
        payload = {
            "name": "Shorty",
            "email": "short@example.com",
            "message": "Hi",
        }
        resp = self.client.post("/contact", json=payload)
        self.assertEqual(resp.status_code, 422)


if __name__ == "__main__":
    unittest.main()
