"""Isolated Disposable Test Suite for Admin Product-Wise Bulk Inventory Adjustments.

TEST ISOLATION & COLLECTION ARCHITECTURE:
1. Collected under normal test runners:
   - pytest backend/tests/test_bulk_inventory_adjustment.py
   - python -m unittest discover backend/tests -p "test_bulk_inventory_adjustment.py"
   - python backend/tests/test_bulk_inventory_adjustment.py
2. Uses a dedicated disposable temporary SQLite database file created dynamically in setUpClass.
3. Injects DATABASE_URL and patches app engine/sessions so tests run exclusively against the temp DB,
   even if other test suites have already imported application modules.
4. Preserves and restores environment state in tearDownClass to prevent state leakage into unrelated tests.
5. Strict safety guards: immediately aborts if any production, VPS, or existing business database is detected.
6. Tests both pre-commit atomic rollback and post-commit failure resiliency.
"""

import os
import sys
import unittest
import tempfile
from decimal import Decimal
from unittest.mock import patch

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)


class TestBulkInventoryAdjustment(unittest.TestCase):
    """Isolated integration tests for product-wise stock adjustments."""

    @classmethod
    def setUpClass(cls):
        # 1. Preserve original environment to prevent state leakage into other tests
        cls._orig_env_db_url = os.environ.get("DATABASE_URL")
        cls._orig_env_jwt = os.environ.get("JWT_SECRET")

        # 2. Create a dedicated temporary database file
        cls.temp_fd, cls.temp_db_path = tempfile.mkstemp(prefix="royal_libas_disposable_test_", suffix=".db")
        os.close(cls.temp_fd)

        cls.test_db_url = f"sqlite:///{cls.temp_db_path}"
        os.environ["DATABASE_URL"] = cls.test_db_url
        os.environ["JWT_SECRET"] = "phase6-isolated-test-jwt-secret-royal-libas"

        # 3. Strict Safety Guard
        resolved_url = os.environ.get("DATABASE_URL", "").lower()
        assert "royal_libas_disposable_test_" in resolved_url, (
            f"Safety guard triggered: unexpected test DB URL '{resolved_url}'"
        )
        for forbidden in ["postgres", "postgresql", "royal_libas.db", "neon", "hostinger"]:
            assert forbidden not in resolved_url, (
                f"CRITICAL SAFETY ABORT: Forbidden target keyword '{forbidden}' detected in DATABASE_URL!"
            )

        # 4. Import app modules and configure test engine
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from fastapi.testclient import TestClient

        from app.database import Base, get_db
        import app.database as app_db
        from app.models import Admin, Product, ProductVariant
        from app.auth import hash_password, create_access_token
        from app.main import app

        cls.test_engine = create_engine(
            cls.test_db_url,
            connect_args={"check_same_thread": False},
        )
        cls.TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.test_engine)

        # Create schema and run migrations in isolated test database
        Base.metadata.create_all(bind=cls.test_engine)
        from app.migrations import run_migrations
        run_migrations(cls.test_engine)

        # Patch app database references so even previously loaded modules use the test DB
        cls._orig_app_engine = getattr(app_db, "engine", None)
        cls._orig_app_sessionlocal = getattr(app_db, "SessionLocal", None)
        app_db.engine = cls.test_engine
        app_db.SessionLocal = cls.TestSessionLocal

        def override_get_db():
            db = cls.TestSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.app = app
        cls.client = TestClient(app)

        # 5. Seed isolated test fixtures
        db = cls.TestSessionLocal()
        try:
            owner = Admin(
                email="owner@royallibas.com",
                name="Store Owner",
                role="OWNER",
                password_hash=hash_password("ownerpass123"),
                is_active=True,
            )
            staff = Admin(
                email="staff@royallibas.com",
                name="Fulfillment Staff",
                role="FULFILLMENT_STAFF",
                password_hash=hash_password("staffpass123"),
                is_active=True,
            )
            db.add_all([owner, staff])
            db.commit()

            cls.owner_token = create_access_token({"sub": str(owner.id), "role": "OWNER"})
            cls.staff_token = create_access_token({"sub": str(staff.id), "role": "FULFILLMENT_STAFF"})
            cls.owner_headers = {"Authorization": f"Bearer {cls.owner_token}"}
            cls.staff_headers = {"Authorization": f"Bearer {cls.staff_token}"}

            # Product 1: Published Live (3 sizes: S=8, M=2 (low stock), L=0 (sold out))
            p1 = Product(
                name="Festive Chanderi Kurti Set",
                slug="festive-chanderi-kurti-set",
                category="SUIT SET",
                subcategory="Three Pieces",
                status="PUBLISHED",
                is_active=True,
                description="Luxurious festive set",
            )
            db.add(p1)
            db.commit()

            v1_s = ProductVariant(
                product_id=p1.id,
                size="S",
                colour="Emerald Green",
                sku="RL-FCS-S",
                selling_price=Decimal("4999.00"),
                stock=8,
            )
            v1_m = ProductVariant(
                product_id=p1.id,
                size="M",
                colour="Emerald Green",
                sku="RL-FCS-M",
                selling_price=Decimal("4999.00"),
                stock=2,
            )
            v1_l = ProductVariant(
                product_id=p1.id,
                size="L",
                colour="Emerald Green",
                sku="RL-FCS-L",
                selling_price=Decimal("4999.00"),
                stock=0,
            )

            # Product 2: Draft Setup (1 size: M=15)
            p2 = Product(
                name="Summer Cotton Co-ord",
                slug="summer-cotton-co-ord",
                category="TWO PIECES",
                subcategory="Co-ord Sets",
                status="DRAFT",
                is_active=True,
                description="Draft co-ord set",
            )
            db.add(p2)
            db.commit()

            v2_m = ProductVariant(
                product_id=p2.id,
                size="M",
                colour="Ivory Pearl",
                sku="RL-SCC-M",
                selling_price=Decimal("2499.00"),
                stock=15,
            )
            db.add_all([v1_s, v1_m, v1_l, v2_m])
            db.commit()

            cls.p1_id = p1.id
            cls.p2_id = p2.id
            cls.v1_s_id = v1_s.id
            cls.v1_m_id = v1_m.id
            cls.v1_l_id = v1_l.id
            cls.v2_m_id = v2_m.id
        finally:
            db.close()

    @classmethod
    def tearDownClass(cls):
        # 1. Clear app dependency overrides
        from app.database import get_db
        import app.database as app_db

        cls.app.dependency_overrides.pop(get_db, None)

        # 2. Restore patched app database objects
        if cls._orig_app_engine is not None:
            app_db.engine = cls._orig_app_engine
        if cls._orig_app_sessionlocal is not None:
            app_db.SessionLocal = cls._orig_app_sessionlocal

        # 3. Dispose test engine and unlink temporary file
        cls.test_engine.dispose()
        try:
            if os.path.exists(cls.temp_db_path):
                os.remove(cls.temp_db_path)
        except Exception:
            pass

        # 4. Restore original environment to prevent state leakage
        if cls._orig_env_db_url is not None:
            os.environ["DATABASE_URL"] = cls._orig_env_db_url
        else:
            os.environ.pop("DATABASE_URL", None)

        if cls._orig_env_jwt is not None:
            os.environ["JWT_SECRET"] = cls._orig_env_jwt
        else:
            os.environ.pop("JWT_SECRET", None)

    def test_01_disposable_database_isolation_guard(self):
        """Verify the test runner is strictly bound to the disposable temporary database."""
        self.assertIn("royal_libas_disposable_test_", str(self.test_engine.url))
        self.assertTrue(os.path.exists(self.temp_db_path))

    def test_02_stable_inventory_summary_endpoint(self):
        """Verify GET /admin/inventory/summary returns accurate boutique-wide baseline metrics."""
        res = self.client.get("/admin/inventory/summary", headers=self.owner_headers)
        self.assertEqual(res.status_code, 200, res.text)
        summary = res.json()
        self.assertEqual(summary["published_products"], 1)
        self.assertEqual(summary["published_units"], 10)  # 8 + 2 + 0
        self.assertEqual(summary["published_variants"], 3)
        self.assertEqual(summary["draft_products"], 1)
        self.assertEqual(summary["draft_units"], 15)
        self.assertEqual(summary["low_stock_products"], 1)
        self.assertEqual(summary["low_stock_variants"], 1)  # v1_m (stock=2)
        self.assertEqual(summary["out_of_stock_products"], 1)
        self.assertEqual(summary["out_of_stock_variants"], 1)  # v1_l (stock=0)
        self.assertEqual(summary["total_working_products"], 2)
        self.assertEqual(summary["total_working_units"], 25)

    def test_03_filtered_inventory_returns_full_variant_matrix(self):
        """Verify filtered queries (e.g. low_stock) return complete product groups for matrix display."""
        res_low = self.client.get("/admin/inventory?filter=low_stock", headers=self.owner_headers)
        self.assertEqual(res_low.status_code, 200)
        items_low = res_low.json()
        p1_variants = [it for it in items_low if it["product_id"] == self.p1_id]
        self.assertEqual(len(p1_variants), 3, "Expected all 3 variants for complete matrix rendering")

    def test_04_strict_rbac_unauthorized_role_rejected(self):
        """Verify non-manager roles (FULFILLMENT_STAFF) are rejected with HTTP 403."""
        payload = {
            "product_id": self.p1_id,
            "reason": "RESTOCK",
            "items": [{"variant_id": self.v1_s_id, "new_stock": 10, "expected_stock": 8}],
        }
        res = self.client.post("/admin/inventory/bulk-adjust", json=payload, headers=self.staff_headers)
        self.assertEqual(res.status_code, 403)

    def test_05_schema_validation_negative_and_decimal_stock_rejected(self):
        """Verify negative numbers and decimals are rejected at schema validation layer with 422."""
        # Negative value
        res_neg = self.client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": self.p1_id,
                "reason": "CORRECTION",
                "items": [{"variant_id": self.v1_s_id, "new_stock": -4, "expected_stock": 8}],
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res_neg.status_code, 422)

        # Decimal value
        res_dec = self.client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": self.p1_id,
                "reason": "CORRECTION",
                "items": [{"variant_id": self.v1_s_id, "new_stock": 4.5, "expected_stock": 8}],
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res_dec.status_code, 422)

    def test_06_schema_validation_missing_expected_stock_rejected(self):
        """Verify expected_stock is mandatory to prevent blind overwrites."""
        res = self.client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": self.p1_id,
                "reason": "RESTOCK",
                "items": [{"variant_id": self.v1_s_id, "new_stock": 10}],
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res.status_code, 422)

    def test_07_duplicate_variant_ids_rejected(self):
        """Verify duplicate variant IDs in the same request are rejected."""
        res = self.client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": self.p1_id,
                "reason": "RESTOCK",
                "items": [
                    {"variant_id": self.v1_s_id, "new_stock": 10, "expected_stock": 8},
                    {"variant_id": self.v1_s_id, "new_stock": 12, "expected_stock": 8},
                ],
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res.status_code, 422)

    def test_08_foreign_variant_ids_rejected(self):
        """Verify variant IDs belonging to other products are rejected with HTTP 400."""
        res = self.client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": self.p1_id,
                "reason": "RESTOCK",
                "items": [
                    {"variant_id": self.v2_m_id, "new_stock": 20, "expected_stock": 15},
                ],
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not belong to product", res.json()["detail"])

    def test_09_stale_stock_conflict_detected_409(self):
        """Verify stale stock is detected and returned as HTTP 409 Conflict without lost updates."""
        # Admin 1 updates stock from 8 to 12
        res1 = self.client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": self.p1_id,
                "reason": "RESTOCK",
                "items": [{"variant_id": self.v1_s_id, "new_stock": 12, "expected_stock": 8}],
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res1.status_code, 200)

        # Admin 2 attempts update with old stock (8)
        res2 = self.client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": self.p1_id,
                "reason": "RESTOCK",
                "items": [{"variant_id": self.v1_s_id, "new_stock": 10, "expected_stock": 8}],
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res2.status_code, 409)
        self.assertIn("conflict detected", res2.json()["detail"].lower())

    def test_10_deliberate_zero_stock_saved_atomically(self):
        """Verify intentionally setting stock to zero is permitted and recorded atomically."""
        from app.models import ProductVariant, StockAdjustment, ActivityLog

        res = self.client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": self.p1_id,
                "reason": "DAMAGED",
                "note": "Damaged pieces removed after boutique inspection",
                "items": [
                    {"variant_id": self.v1_s_id, "new_stock": 0, "expected_stock": 12},
                    {"variant_id": self.v1_m_id, "new_stock": 6, "expected_stock": 2},
                ],
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_stock"], 6)  # 0 + 6 + 0
        self.assertEqual(len(data["updated_variants"]), 2)

        # Check DB directly
        db = self.TestSessionLocal()
        try:
            v_s = db.query(ProductVariant).filter(ProductVariant.id == self.v1_s_id).first()
            self.assertEqual(v_s.stock, 0)
            v_m = db.query(ProductVariant).filter(ProductVariant.id == self.v1_m_id).first()
            self.assertEqual(v_m.stock, 6)

            # Verify audit record
            s_adj = (
                db.query(StockAdjustment)
                .filter(StockAdjustment.variant_id == self.v1_s_id)
                .order_by(StockAdjustment.id.desc())
                .first()
            )
            self.assertEqual(s_adj.previous_stock, 12)
            self.assertEqual(s_adj.new_stock, 0)
            self.assertEqual(s_adj.change_amount, -12)
            self.assertEqual(s_adj.reason, "DAMAGED")

            # Verify activity log
            log = (
                db.query(ActivityLog)
                .filter(ActivityLog.target_id == str(self.p1_id), ActivityLog.action == "BULK_STOCK_ADJUSTMENT")
                .first()
            )
            self.assertIsNotNone(log)
        finally:
            db.close()

    def test_11_pre_commit_failure_atomic_rollback_verification(self):
        """Verify that an unhandled exception before commit triggers a clean rollback with zero partial writes."""
        from app.models import ProductVariant, StockAdjustment, ActivityLog

        db = self.TestSessionLocal()
        try:
            stock_before = db.query(ProductVariant).filter(ProductVariant.id == self.v1_m_id).first().stock
            adj_count_before = db.query(StockAdjustment).count()
            log_count_before = db.query(ActivityLog).count()
        finally:
            db.close()

        # Injected failure on commit
        with patch("sqlalchemy.orm.Session.commit", side_effect=RuntimeError("Simulated pre-commit database crash")):
            res = self.client.post(
                "/admin/inventory/bulk-adjust",
                json={
                    "product_id": self.p1_id,
                    "reason": "RESTOCK",
                    "items": [{"variant_id": self.v1_m_id, "new_stock": 50, "expected_stock": stock_before}],
                },
                headers=self.owner_headers,
            )
            self.assertEqual(res.status_code, 500)
            self.assertIn("The transaction was rolled back", res.json()["detail"])

        # Confirm zero partial writes occurred
        db_after = self.TestSessionLocal()
        try:
            stock_after = db_after.query(ProductVariant).filter(ProductVariant.id == self.v1_m_id).first().stock
            adj_count_after = db_after.query(StockAdjustment).count()
            log_count_after = db_after.query(ActivityLog).count()
            self.assertEqual(stock_after, stock_before, "Stock changed despite pre-commit failure!")
            self.assertEqual(adj_count_after, adj_count_before, "StockAdjustment created despite rollback!")
            self.assertEqual(log_count_after, log_count_before, "ActivityLog created despite rollback!")
        finally:
            db_after.close()

    def test_12_post_commit_failure_does_not_falsely_report_rollback(self):
        """Verify that a post-commit failure (e.g. during db.refresh) does not misleadingly report a rolled-back failure."""
        from app.models import ProductVariant

        db = self.TestSessionLocal()
        try:
            stock_before = db.query(ProductVariant).filter(ProductVariant.id == self.v1_m_id).first().stock
        finally:
            db.close()

        new_target_stock = stock_before + 5

        # Simulate a post-commit refresh error (e.g. connection dropped right after successful commit)
        with patch("sqlalchemy.orm.Session.refresh", side_effect=RuntimeError("Simulated post-commit refresh error")):
            res = self.client.post(
                "/admin/inventory/bulk-adjust",
                json={
                    "product_id": self.p1_id,
                    "reason": "RESTOCK",
                    "items": [{"variant_id": self.v1_m_id, "new_stock": new_target_stock, "expected_stock": stock_before}],
                },
                headers=self.owner_headers,
            )
            # The endpoint must NOT return an HTTP 500 error claiming the transaction was rolled back
            self.assertEqual(res.status_code, 200, f"Expected 200 despite post-commit refresh error, got {res.status_code}")
            data = res.json()
            self.assertEqual(data["product_id"], self.p1_id)

        # Confirm stock actually was committed
        db_after = self.TestSessionLocal()
        try:
            stock_after = db_after.query(ProductVariant).filter(ProductVariant.id == self.v1_m_id).first().stock
            self.assertEqual(stock_after, new_target_stock, "Committed stock should match target stock")
        finally:
            db_after.close()

    def test_13_product_audit_history_query(self):
        """Verify GET /admin/inventory/adjustments?product_id=... returns product audit records."""
        res = self.client.get(f"/admin/inventory/adjustments?product_id={self.p1_id}", headers=self.owner_headers)
        self.assertEqual(res.status_code, 200)
        history = res.json()
        self.assertGreaterEqual(len(history), 2)
        self.assertTrue(all(h["product_name"] == "Festive Chanderi Kurti Set" for h in history))


if __name__ == "__main__":
    unittest.main(verbosity=2)
