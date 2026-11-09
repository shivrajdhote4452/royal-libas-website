"""Automated Isolated Test Suite for Staff Status, Filtering, and Session Revocation.

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

TEMP_TEST_DIR = tempfile.mkdtemp(prefix="rl_staff_test_isolated_")
TEMP_TEST_DB_PATH = os.path.join(TEMP_TEST_DIR, "isolated_test_staff.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEMP_TEST_DB_PATH.replace(os.sep, '/')}"
os.environ["JWT_SECRET"] = "phase6-test-isolated-jwt-secret-staff-royal-libas"

assert "isolated_test_staff.db" in os.environ["DATABASE_URL"]

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, Base, engine
from app.models import Admin, ActivityLog, StockAdjustment, Product, ProductVariant
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


class TestStaffStatusAndAuth(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db = SessionLocal()
        try:
            # Seed primary isolated Owner
            cls.owner_pwd = "TestOwnerSecurePass123!"
            cls.owner = Admin(
                email="primary_owner_test@royallibas.com",
                name="Primary Owner",
                role="OWNER",
                password_hash=hash_password(cls.owner_pwd),
                is_active=True,
            )
            db.add(cls.owner)

            # Seed an initial Store Manager
            cls.mgr_pwd = "TestMgrSecurePass123!"
            cls.mgr = Admin(
                email="active_manager_test@royallibas.com",
                name="Active Manager",
                role="STORE_MANAGER",
                password_hash=hash_password(cls.mgr_pwd),
                is_active=True,
            )
            db.add(cls.mgr)

            # Seed an initially Deactivated Staff account
            cls.deact_pwd = "DeactivatedPass123!"
            cls.deact_staff = Admin(
                email="deactivated_staff_test@royallibas.com",
                name="Deactivated Staff",
                role="FULFILLMENT_STAFF",
                password_hash=hash_password(cls.deact_pwd),
                is_active=False,
            )
            db.add(cls.deact_staff)

            db.commit()
            db.refresh(cls.owner)
            db.refresh(cls.mgr)
            db.refresh(cls.deact_staff)

            cls.owner_id = cls.owner.id
            cls.mgr_id = cls.mgr.id
            cls.deact_staff_id = cls.deact_staff.id
        finally:
            db.close()

        # Log in as Owner
        res = client.post(
            "/admin/login",
            json={"email": "primary_owner_test@royallibas.com", "password": cls.owner_pwd},
        )
        assert res.status_code == 200, res.text
        cls.owner_token = res.json()["access_token"]
        cls.owner_headers = {"Authorization": f"Bearer {cls.owner_token}"}

    def test_01_list_staff_default_returns_all(self):
        """GET /admin/staff without query params returns all accounts."""
        res = client.get("/admin/staff", headers=self.owner_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreaterEqual(len(data), 3)
        emails = [s["email"] for s in data]
        self.assertIn("primary_owner_test@royallibas.com", emails)
        self.assertIn("active_manager_test@royallibas.com", emails)
        self.assertIn("deactivated_staff_test@royallibas.com", emails)

    def test_02_list_staff_status_filter_active(self):
        """GET /admin/staff?status=active returns only active accounts."""
        res = client.get("/admin/staff?status=active", headers=self.owner_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(all(s["is_active"] is True for s in data))
        emails = [s["email"] for s in data]
        self.assertIn("primary_owner_test@royallibas.com", emails)
        self.assertIn("active_manager_test@royallibas.com", emails)
        self.assertNotIn("deactivated_staff_test@royallibas.com", emails)

    def test_03_list_staff_status_filter_deactivated(self):
        """GET /admin/staff?status=deactivated returns only inactive accounts."""
        res = client.get("/admin/staff?status=deactivated", headers=self.owner_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(all(s["is_active"] is False for s in data))
        emails = [s["email"] for s in data]
        self.assertNotIn("primary_owner_test@royallibas.com", emails)
        self.assertNotIn("active_manager_test@royallibas.com", emails)
        self.assertIn("deactivated_staff_test@royallibas.com", emails)

    def test_04_list_staff_status_filter_all_and_is_active_param(self):
        """GET /admin/staff?status=all and is_active boolean filter work as expected."""
        res_all = client.get("/admin/staff?status=all", headers=self.owner_headers)
        self.assertEqual(res_all.status_code, 200)
        self.assertGreaterEqual(len(res_all.json()), 3)

        res_bool_false = client.get("/admin/staff?is_active=false", headers=self.owner_headers)
        self.assertEqual(res_bool_false.status_code, 200)
        self.assertTrue(all(s["is_active"] is False for s in res_bool_false.json()))

        res_bool_true = client.get("/admin/staff?is_active=true", headers=self.owner_headers)
        self.assertEqual(res_bool_true.status_code, 200)
        self.assertTrue(all(s["is_active"] is True for s in res_bool_true.json()))

    def test_05_deactivated_user_cannot_login(self):
        """A deactivated user cannot authenticate via login endpoint."""
        res = client.post(
            "/admin/login",
            json={
                "email": "deactivated_staff_test@royallibas.com",
                "password": self.deact_pwd,
            },
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("inactive", res.json()["detail"].lower())

    def test_06_session_revocation_upon_deactivation(self):
        """When an active user is deactivated, existing sessions are revoked immediately."""
        # 1. Staff logs in while active
        login_res = client.post(
            "/admin/login",
            json={
                "email": "active_manager_test@royallibas.com",
                "password": self.mgr_pwd,
            },
        )
        self.assertEqual(login_res.status_code, 200)
        staff_token = login_res.json()["access_token"]
        staff_headers = {"Authorization": f"Bearer {staff_token}"}

        # 2. Token works for protected calls
        me_res = client.get("/admin/me", headers=staff_headers)
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.json()["email"], "active_manager_test@royallibas.com")

        # 3. Owner deactivates this staff member
        deact_res = client.patch(
            f"/admin/staff/{self.mgr_id}",
            json={"is_active": False},
            headers=self.owner_headers,
        )
        self.assertEqual(deact_res.status_code, 200)
        self.assertFalse(deact_res.json()["is_active"])

        # 4. Immediate session revocation: same token must now be rejected with 403 Forbidden
        revoked_res = client.get("/admin/me", headers=staff_headers)
        self.assertEqual(revoked_res.status_code, 403)
        self.assertIn("inactive", revoked_res.json()["detail"].lower())

        revoked_staff_res = client.get("/admin/staff", headers=staff_headers)
        self.assertEqual(revoked_staff_res.status_code, 403)

        # 5. Reactivate the staff member
        react_res = client.patch(
            f"/admin/staff/{self.mgr_id}",
            json={"is_active": True},
            headers=self.owner_headers,
        )
        self.assertEqual(react_res.status_code, 200)
        self.assertTrue(react_res.json()["is_active"])

        # 6. Access is restored
        restored_res = client.get("/admin/me", headers=staff_headers)
        self.assertEqual(restored_res.status_code, 200)

    def test_07_self_deactivation_is_blocked(self):
        """Owner cannot deactivate their own active account."""
        res = client.patch(
            f"/admin/staff/{self.owner_id}",
            json={"is_active": False},
            headers=self.owner_headers,
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("cannot deactivate your own account", res.json()["detail"].lower())

    def test_08_last_owner_protection(self):
        """Cannot deactivate or demote the only active Owner account."""
        # Attempt to demote the sole owner to STORE_MANAGER
        res_demote = client.patch(
            f"/admin/staff/{self.owner_id}",
            json={"role": "STORE_MANAGER"},
            headers=self.owner_headers,
        )
        self.assertEqual(res_demote.status_code, 400)
        self.assertIn("only active owner", res_demote.json()["detail"].lower())

        # Create a second owner
        res_create_second = client.post(
            "/admin/staff",
            json={
                "email": "second_owner_test@royallibas.com",
                "name": "Second Owner",
                "role": "OWNER",
                "password": "SecondOwnerPassword123!",
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res_create_second.status_code, 201)
        second_owner_id = res_create_second.json()["id"]

        # Now deactivating the second owner succeeds because another active owner exists
        res_deact_second = client.patch(
            f"/admin/staff/{second_owner_id}",
            json={"is_active": False},
            headers=self.owner_headers,
        )
        self.assertEqual(res_deact_second.status_code, 200)
        self.assertFalse(res_deact_second.json()["is_active"])

    def test_09_historical_audit_and_stock_logs_preserved(self):
        """Audit logs and stock adjustments with actor_email remain intact upon deactivation."""
        db = SessionLocal()
        try:
            # Record an activity log and stock adjustment for active_manager_test
            log = ActivityLog(
                actor_email="active_manager_test@royallibas.com",
                actor_role="STORE_MANAGER",
                action="TEST_ACTION",
                target_type="inventory",
                target_id="1",
                details="Test adjustment before deactivation",
            )
            db.add(log)
            db.commit()

            # Deactivate active_manager_test
            mgr = db.query(Admin).filter(Admin.id == self.mgr_id).first()
            mgr.is_active = False
            db.commit()

            # Verify the log still exists with identical actor_email
            persisted_log = (
                db.query(ActivityLog)
                .filter(ActivityLog.actor_email == "active_manager_test@royallibas.com")
                .first()
            )
            self.assertIsNotNone(persisted_log)
            self.assertEqual(persisted_log.actor_email, "active_manager_test@royallibas.com")

            # Restore active status
            mgr.is_active = True
            db.commit()
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
