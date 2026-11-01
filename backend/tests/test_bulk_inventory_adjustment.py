"""Isolated Disposable Test Suite for Admin Product-Wise Bulk Inventory Adjustments.

TEST ISOLATION & COLLECTION ARCHITECTURE:
1. Collected under normal test runners:
   - pytest backend/tests/test_bulk_inventory_adjustment.py
   - python -m unittest discover backend/tests -p "test_bulk_inventory_adjustment.py"
   - python backend/tests/test_bulk_inventory_adjustment.py
2. Uses a dedicated disposable temporary SQLite database file created dynamically in setUpClass.
3. Pre-emptively patches app.config and app.database BEFORE importing app.main so that
   table creation and startup migrations run EXCLUSIVELY on the disposable test database,
   even if database modules were previously imported by another test suite.
4. Preserves and safely restores original environment and module state in tearDownClass to
   prevent state leakage into other tests.
5. Strict safety guards: immediately aborts if any production, VPS, or existing business database is detected.
6. Tests pre-commit rollback, mid-commit honest uncertainty, and post-commit response resiliency with real IDs.
7. Includes regression test verifying pre-existing engines are protected from migrations.
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
    def _safe_cleanup(cls):
        """Safely restore all patched modules, engines, files, and environment variables."""
        # 1. Clear app dependency overrides
        try:
            if hasattr(cls, "app") and cls.app:
                from app.database import get_db
                cls.app.dependency_overrides.pop(get_db, None)
        except Exception:
            pass

        # 2. Restore patched app.database objects
        try:
            import app.database as app_db
            if hasattr(cls, "_orig_app_engine") and cls._orig_app_engine is not None:
                app_db.engine = cls._orig_app_engine
            if hasattr(cls, "_orig_app_sessionlocal") and cls._orig_app_sessionlocal is not None:
                app_db.SessionLocal = cls._orig_app_sessionlocal
        except Exception:
            pass

        # 3. Restore patched app.config objects
        try:
            import app.config as app_cfg
            if hasattr(cls, "_orig_config_db_url") and cls._orig_config_db_url is not None:
                app_cfg.DATABASE_URL = cls._orig_config_db_url
        except Exception:
            pass

        # 4. Dispose test engine
        try:
            if hasattr(cls, "test_engine") and cls.test_engine is not None:
                cls.test_engine.dispose()
        except Exception:
            pass

        # 5. Unlink temporary test database file
        try:
            if hasattr(cls, "temp_db_path") and cls.temp_db_path and os.path.exists(cls.temp_db_path):
                os.remove(cls.temp_db_path)
        except Exception:
            pass

        # 6. Restore original environment variables
        if hasattr(cls, "_orig_env_db_url") and cls._orig_env_db_url is not None:
            os.environ["DATABASE_URL"] = cls._orig_env_db_url
        else:
            os.environ.pop("DATABASE_URL", None)

        if hasattr(cls, "_orig_env_jwt") and cls._orig_env_jwt is not None:
            os.environ["JWT_SECRET"] = cls._orig_env_jwt
        else:
            os.environ.pop("JWT_SECRET", None)

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

        # 3. Strict Safety Guard: Never allow non-disposable target
        resolved_url = os.environ.get("DATABASE_URL", "").lower()
        assert "royal_libas_disposable_test_" in resolved_url, (
            f"Safety guard triggered: unexpected test DB URL '{resolved_url}'"
        )
        for forbidden in ["postgres", "postgresql", "royal_libas.db", "neon", "hostinger"]:
            assert forbidden not in resolved_url, (
                f"CRITICAL SAFETY ABORT: Forbidden target keyword '{forbidden}' detected in DATABASE_URL!"
            )

        try:
            from sqlalchemy import create_engine
            from sqlalchemy.orm import sessionmaker
            from fastapi.testclient import TestClient

            cls.test_engine = create_engine(
                cls.test_db_url,
                connect_args={"check_same_thread": False},
            )
            cls.TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.test_engine)

            # 4. Patch app.config and app.database BEFORE importing app.main
            import app.config as app_cfg
            cls._orig_config_db_url = getattr(app_cfg, "DATABASE_URL", None)
            app_cfg.DATABASE_URL = cls.test_db_url

            import app.database as app_db
            cls._orig_app_engine = getattr(app_db, "engine", None)
            cls._orig_app_sessionlocal = getattr(app_db, "SessionLocal", None)
            # Patch app_db references immediately so app.main gets the disposable engine on import
            app_db.engine = cls.test_engine
            app_db.SessionLocal = cls.TestSessionLocal

            # Create schema and run migrations in isolated test database
            from app.database import Base, get_db
            Base.metadata.create_all(bind=cls.test_engine)
            from app.migrations import run_migrations
            run_migrations(cls.test_engine)

            # 5. Now import app.main safely
            import app.main as app_main
            from app.main import app
            app_main.engine = cls.test_engine

            def override_get_db():
                db = cls.TestSessionLocal()
                try:
                    yield db
                finally:
                    db.close()

            app.dependency_overrides[get_db] = override_get_db
            cls.app = app
            cls.client = TestClient(app)

            # 6. Seed isolated test fixtures
            from app.models import Admin, Product, ProductVariant
            from app.auth import hash_password, create_access_token

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

        except Exception:
            cls._safe_cleanup()
            raise

    @classmethod
    def tearDownClass(cls):
        cls._safe_cleanup()

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
        # Must return all 3 variants (S, M, L) so UI matrix is not presented as partial product
        self.assertEqual(len(p1_variants), 3)
        sizes = {v["size"] for v in p1_variants}
        self.assertEqual(sizes, {"S", "M", "L"})

    def test_04_strict_rbac_unauthorized_role_rejected(self):
        """Verify non-manager roles (FULFILLMENT_STAFF) are rejected with HTTP 403."""
        payload = {
            "product_id": self.p1_id,
            "reason": "RESTOCK",
            "items": [{"variant_id": self.v1_s_id, "new_stock": 10, "expected_stock": 8}],
        }
        res = self.client.post("/admin/inventory/bulk-adjust", json=payload, headers=self.staff_headers)
        self.assertEqual(res.status_code, 403)

    def test_05_strict_rbac_authorized_roles_accepted(self):
        """Verify STORE_MANAGER and OWNER roles are authorized."""
        from app.models import Admin
        from app.auth import hash_password, create_access_token

        db = self.TestSessionLocal()
        try:
            manager = Admin(
                email="manager@royallibas.com",
                name="Store Manager",
                role="STORE_MANAGER",
                password_hash=hash_password("mgrpass123"),
                is_active=True,
            )
            db.add(manager)
            db.commit()
            mgr_token = create_access_token({"sub": str(manager.id), "role": "STORE_MANAGER"})
            mgr_headers = {"Authorization": f"Bearer {mgr_token}"}
        finally:
            db.close()

        payload = {
            "product_id": self.p1_id,
            "reason": "CORRECTION",
            "items": [{"variant_id": self.v1_s_id, "new_stock": 9, "expected_stock": 8}],
        }
        res = self.client.post("/admin/inventory/bulk-adjust", json=payload, headers=mgr_headers)
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(data["updated_variants"][0]["new_stock"], 9)

        # Restore stock for subsequent tests
        db2 = self.TestSessionLocal()
        try:
            from app.models import ProductVariant
            v = db2.query(ProductVariant).filter(ProductVariant.id == self.v1_s_id).first()
            v.stock = 8
            db2.commit()
        finally:
            db2.close()

    def test_06_validation_negative_decimal_blank_rejected(self):
        """Verify negative stock values and non-integers are rejected."""
        # Negative stock
        payload_neg = {
            "product_id": self.p1_id,
            "reason": "RESTOCK",
            "items": [{"variant_id": self.v1_s_id, "new_stock": -5, "expected_stock": 8}],
        }
        res_neg = self.client.post("/admin/inventory/bulk-adjust", json=payload_neg, headers=self.owner_headers)
        self.assertEqual(res_neg.status_code, 422)

        # Non-integer / string
        payload_invalid = {
            "product_id": self.p1_id,
            "reason": "RESTOCK",
            "items": [{"variant_id": self.v1_s_id, "new_stock": "five", "expected_stock": 8}],
        }
        res_invalid = self.client.post("/admin/inventory/bulk-adjust", json=payload_invalid, headers=self.owner_headers)
        self.assertEqual(res_invalid.status_code, 422)

    def test_07_mandatory_expected_stock_and_duplicate_variants_rejected(self):
        """Verify expected_stock is required and duplicate variant IDs are rejected."""
        # Missing expected_stock
        payload_no_exp = {
            "product_id": self.p1_id,
            "reason": "RESTOCK",
            "items": [{"variant_id": self.v1_s_id, "new_stock": 10}],
        }
        res_no_exp = self.client.post("/admin/inventory/bulk-adjust", json=payload_no_exp, headers=self.owner_headers)
        self.assertEqual(res_no_exp.status_code, 422)

        # Duplicate variant IDs in request
        payload_dup = {
            "product_id": self.p1_id,
            "reason": "RESTOCK",
            "items": [
                {"variant_id": self.v1_s_id, "new_stock": 10, "expected_stock": 8},
                {"variant_id": self.v1_s_id, "new_stock": 12, "expected_stock": 8},
            ],
        }
        res_dup = self.client.post("/admin/inventory/bulk-adjust", json=payload_dup, headers=self.owner_headers)
        self.assertEqual(res_dup.status_code, 422)

    def test_08_foreign_variant_ids_rejected(self):
        """Verify variant IDs belonging to other products are rejected with HTTP 400."""
        payload_foreign = {
            "product_id": self.p1_id,  # Product 1
            "reason": "RESTOCK",
            "items": [{"variant_id": self.v2_m_id, "new_stock": 20, "expected_stock": 15}],  # Variant belongs to Product 2
        }
        res = self.client.post("/admin/inventory/bulk-adjust", json=payload_foreign, headers=self.owner_headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not belong to product", res.json()["detail"])

    def test_09_stale_stock_conflict_detected_409(self):
        """Verify stale stock is detected and returned as HTTP 409 Conflict without lost updates."""
        # Client believes current stock is 5, but database is 8
        payload = {
            "product_id": self.p1_id,
            "reason": "RESTOCK",
            "items": [{"variant_id": self.v1_s_id, "new_stock": 10, "expected_stock": 5}],
        }
        res = self.client.post("/admin/inventory/bulk-adjust", json=payload, headers=self.owner_headers)
        self.assertEqual(res.status_code, 409)
        self.assertIn("Stock conflict detected", res.json()["detail"])

    def test_10_deliberate_zero_stock_saved_atomically(self):
        """Verify intentionally setting stock to zero is permitted and recorded atomically."""
        from app.models import ProductVariant, StockAdjustment, ActivityLog

        # Set S (was 8) to 12 (+4), and M (was 2) to 6 (+4)
        prep_payload = {
            "product_id": self.p1_id,
            "reason": "RESTOCK",
            "items": [
                {"variant_id": self.v1_s_id, "new_stock": 12, "expected_stock": 8},
                {"variant_id": self.v1_m_id, "new_stock": 6, "expected_stock": 2},
            ],
        }
        prep_res = self.client.post("/admin/inventory/bulk-adjust", json=prep_payload, headers=self.owner_headers)
        self.assertEqual(prep_res.status_code, 200)

        # Now deliberately mark S as sold out (stock = 0)
        zero_payload = {
            "product_id": self.p1_id,
            "reason": "DAMAGED",
            "note": "Damaged in store display, writing off remaining 12 units",
            "items": [
                {"variant_id": self.v1_s_id, "new_stock": 0, "expected_stock": 12},
                {"variant_id": self.v1_m_id, "new_stock": 6, "expected_stock": 6},  # Unchanged
            ],
        }
        res = self.client.post("/admin/inventory/bulk-adjust", json=zero_payload, headers=self.owner_headers)
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(data["total_stock"], 6)  # 0 + 6 + 0

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

        # Injected failure before commit (e.g. during flush or data prep)
        with patch("sqlalchemy.orm.Session.flush", side_effect=RuntimeError("Simulated pre-commit database crash")):
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
            self.assertIn("The transaction was rolled back and no stock changes were committed", res.json()["detail"])

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

    def test_12_mid_commit_failure_honest_uncertainty(self):
        """Verify that an error during commit does not falsely claim 'no changes were committed'."""
        from app.models import ProductVariant

        db = self.TestSessionLocal()
        try:
            stock_before = db.query(ProductVariant).filter(ProductVariant.id == self.v1_m_id).first().stock
        finally:
            db.close()

        # Simulate connection crash during db.commit()
        with patch("sqlalchemy.orm.Session.commit", side_effect=RuntimeError("Simulated connection crash during commit")):
            res = self.client.post(
                "/admin/inventory/bulk-adjust",
                json={
                    "product_id": self.p1_id,
                    "reason": "RESTOCK",
                    "items": [{"variant_id": self.v1_m_id, "new_stock": stock_before + 3, "expected_stock": stock_before}],
                },
                headers=self.owner_headers,
            )
            self.assertEqual(res.status_code, 500)
            detail = res.json()["detail"]
            self.assertIn("The final commit status could not be verified", detail)
            self.assertNotIn("no stock changes were committed", detail)

    def test_13_post_commit_response_resiliency_and_real_ids(self):
        """Verify that stock adjustments succeed with real primary key IDs and resilient response construction."""
        from app.models import ProductVariant

        db = self.TestSessionLocal()
        try:
            stock_before = db.query(ProductVariant).filter(ProductVariant.id == self.v1_m_id).first().stock
        finally:
            db.close()

        target_stock = stock_before + 4
        res = self.client.post(
            "/admin/inventory/bulk-adjust",
            json={
                "product_id": self.p1_id,
                "reason": "RESTOCK",
                "items": [{"variant_id": self.v1_m_id, "new_stock": target_stock, "expected_stock": stock_before}],
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(data["product_id"], self.p1_id)
        self.assertEqual(len(data["updated_variants"]), 1)

        variant_res = data["updated_variants"][0]
        self.assertGreater(variant_res["id"], 0, "Audit ID must be a genuine positive database integer, not 0")
        self.assertEqual(variant_res["variant_id"], self.v1_m_id)
        self.assertEqual(variant_res["new_stock"], target_stock)
        self.assertEqual(variant_res["previous_stock"], stock_before)
        self.assertEqual(variant_res["change_amount"], 4)
        self.assertTrue(variant_res["created_at"])

    def test_14_product_audit_history_query(self):
        """Verify GET /admin/inventory/adjustments?product_id=... returns product audit records."""
        res = self.client.get(f"/admin/inventory/adjustments?product_id={self.p1_id}", headers=self.owner_headers)
        self.assertEqual(res.status_code, 200)
        history = res.json()
        self.assertGreaterEqual(len(history), 2)
        self.assertTrue(all(h["product_name"] == "Festive Chanderi Kurti Set" for h in history))

    def test_15_isolation_regression_pre_imported_database_engine(self):
        """Regression test verifying that if app.database was already imported with a pre-existing engine,
        no create_all or run_migrations is ever run against that pre-existing engine.
        """
        from sqlalchemy import inspect, create_engine
        canary_fd, canary_path = tempfile.mkstemp(prefix="royal_libas_canary_test_", suffix=".db")
        os.close(canary_fd)
        try:
            canary_url = f"sqlite:///{canary_path}"
            canary_engine = create_engine(canary_url, connect_args={"check_same_thread": False})
            try:
                # Pre-condition: Canary engine has NO tables
                tables_initial = inspect(canary_engine).get_table_names()
                self.assertEqual(tables_initial, [])

                # Simulate a pre-existing engine in app.database
                import app.database as app_db
                orig_engine = app_db.engine
                app_db.engine = canary_engine

                # Now simulate the isolation setup logic with a separate disposable engine
                temp_fd2, temp_path2 = tempfile.mkstemp(prefix="royal_libas_disposable_test_sub_", suffix=".db")
                os.close(temp_fd2)
                try:
                    disposable_sub_engine = create_engine(f"sqlite:///{temp_path2}", connect_args={"check_same_thread": False})
                    try:
                        # The isolation contract: replace app_db.engine BEFORE app.main imports or creates tables
                        app_db.engine = disposable_sub_engine

                        # Perform schema creation and migrations on disposable engine
                        from app.database import Base
                        Base.metadata.create_all(bind=app_db.engine)
                        from app.migrations import run_migrations
                        run_migrations(app_db.engine)

                        # Verify: Canary engine was NEVER touched
                        canary_tables_after = inspect(canary_engine).get_table_names()
                        self.assertEqual(
                            canary_tables_after,
                            [],
                            "CRITICAL ISOLATION FAILURE: Canary engine was modified by table creation or migrations!",
                        )

                        # Verify: Disposable engine received the schema
                        sub_tables = inspect(disposable_sub_engine).get_table_names()
                        self.assertIn("products", sub_tables)
                        self.assertIn("product_variants", sub_tables)
                    finally:
                        disposable_sub_engine.dispose()
                finally:
                    if os.path.exists(temp_path2):
                        os.remove(temp_path2)

                # Restore engine to self.test_engine
                app_db.engine = orig_engine
            finally:
                canary_engine.dispose()
        finally:
            if os.path.exists(canary_path):
                os.remove(canary_path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
