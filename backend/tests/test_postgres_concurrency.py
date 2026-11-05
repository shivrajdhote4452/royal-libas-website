"""Disposable PostgreSQL Concurrency & Row-Locking Test Suite.

Verifies:
1. Real PostgreSQL `with_for_update()` row-level locking behavior.
2. Concurrent admin stock updates against conflicting stock updates/orders.
3. Accurate detection and rejection of stale `expected_stock` (HTTP 409 Conflict).
4. Prevention of lost updates under concurrent access on PostgreSQL.
5. Atomic audit logging in PostgreSQL.

SAFETY GUARDS:
- Requires an isolated disposable PostgreSQL database (e.g. GitHub Actions PostgreSQL service container).
- NEVER connects to or tests against the VPS, production database, or existing business database.
- Strictly guards against non-localhost or production URLs.
- Skips safely if disposable PostgreSQL is not available in the local execution environment.
"""

import os
import sys
import unittest
import threading
from decimal import Decimal

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)


class TestPostgresConcurrency(unittest.TestCase):
    """PostgreSQL concurrency tests using an isolated disposable database."""

    @classmethod
    def setUpClass(cls):
        try:
            from tests.test_postgres_variant_migration import _find_or_create_disposable_postgres
            pg_url, cleanup_fn = _find_or_create_disposable_postgres()
        except Exception:
            pg_url = os.environ.get("TEST_POSTGRES_URL")
            cleanup_fn = None

        if not pg_url:
            raise unittest.SkipTest("Disposable PostgreSQL not configured and no local postgres binaries found.")

        cls.cleanup_fn = cleanup_fn

        # Strict Safety Guards
        lower_url = pg_url.lower()
        if not ("localhost" in lower_url or "127.0.0.1" in lower_url):
            raise unittest.SkipTest(f"Safety guard: TEST_POSTGRES_URL must be localhost/127.0.0.1, got: {lower_url}")

        for forbidden in ["hostinger", "neon", "prod", "vps", "royal_libas_prod"]:
            if forbidden in lower_url:
                raise unittest.SkipTest(f"Safety guard: Forbidden keyword '{forbidden}' detected in TEST_POSTGRES_URL.")

        # Ensure psycopg2 driver is used (psycopg2-binary is in requirements.txt)
        if pg_url.startswith("postgresql://") and not pg_url.startswith("postgresql+"):
            pg_url = pg_url.replace("postgresql://", "postgresql+psycopg2://", 1)

        try:
            from sqlalchemy import create_engine
            from sqlalchemy.orm import sessionmaker
            from fastapi.testclient import TestClient

            cls.engine = create_engine(pg_url, pool_pre_ping=True)
            # Test connection
            with cls.engine.connect() as conn:
                pass
            cls.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)

            # Create tables and migrations on disposable PostgreSQL
            import app.config as app_cfg
            import app.database as app_db
            cls._orig_config_url = getattr(app_cfg, "DATABASE_URL", None)
            cls._orig_db_engine = getattr(app_db, "engine", None)
            cls._orig_db_sessionlocal = getattr(app_db, "SessionLocal", None)

            app_cfg.DATABASE_URL = pg_url
            app_db.engine = cls.engine
            app_db.SessionLocal = cls.SessionLocal

            from app.database import Base, get_db
            Base.metadata.create_all(bind=cls.engine)
            from app.migrations import run_migrations
            run_migrations(cls.engine)

            import app.main as app_main
            from app.main import app
            app_main.engine = cls.engine

            def override_get_db():
                db = cls.SessionLocal()
                try:
                    yield db
                finally:
                    db.close()

            app.dependency_overrides[get_db] = override_get_db
            cls.app = app
            cls.client = TestClient(app)

            # Seed isolated test fixtures
            from app.models import Admin, Product, ProductVariant
            from app.auth import hash_password, create_access_token

            db = cls.SessionLocal()
            try:
                # Clean up any residual test records from prior runs
                db.query(ProductVariant).delete()
                db.query(Product).delete()
                db.query(Admin).filter(Admin.email == "pg_owner@royallibas.com").delete()
                db.commit()

                owner = Admin(
                    email="pg_owner@royallibas.com",
                    name="PG Store Owner",
                    role="OWNER",
                    password_hash=hash_password("ownerpass123"),
                    is_active=True,
                )
                db.add(owner)
                db.commit()

                cls.owner_token = create_access_token({"sub": str(owner.id), "role": "OWNER"})
                cls.owner_headers = {"Authorization": f"Bearer {cls.owner_token}"}

                product = Product(
                    name="Postgres Silk Anarkali",
                    slug="postgres-silk-anarkali",
                    category="SUIT SET",
                    subcategory="Party Wear",
                    status="PUBLISHED",
                    is_active=True,
                )
                db.add(product)
                db.commit()

                variant = ProductVariant(
                    product_id=product.id,
                    size="M",
                    colour="Royal Navy",
                    sku="PG-PSA-M",
                    selling_price=Decimal("5999.00"),
                    stock=10,
                )
                db.add(variant)
                db.commit()

                cls.product_id = product.id
                cls.variant_id = variant.id
            finally:
                db.close()

        except Exception as e:
            cls._cleanup()
            print(f"PostgreSQL disposable test setup failed: {type(e).__name__}: {e}", file=sys.stderr)
            raise

    @classmethod
    def _cleanup(cls):
        try:
            if hasattr(cls, "app") and cls.app:
                from app.database import get_db
                cls.app.dependency_overrides.pop(get_db, None)
        except Exception:
            pass

        try:
            import app.database as app_db
            if hasattr(cls, "_orig_db_engine") and cls._orig_db_engine:
                app_db.engine = cls._orig_db_engine
            if hasattr(cls, "_orig_db_sessionlocal") and cls._orig_db_sessionlocal:
                app_db.SessionLocal = cls._orig_db_sessionlocal
        except Exception:
            pass

        try:
            import app.config as app_cfg
            if hasattr(cls, "_orig_config_url") and cls._orig_config_url:
                app_cfg.DATABASE_URL = cls._orig_config_url
        except Exception:
            pass

        try:
            if hasattr(cls, "engine") and cls.engine:
                from app.database import Base
                Base.metadata.drop_all(bind=cls.engine)
                cls.engine.dispose()
        except Exception:
            pass

    @classmethod
    def tearDownClass(cls):
        cls._cleanup()
        if hasattr(cls, "cleanup_fn") and cls.cleanup_fn:
            try:
                cls.cleanup_fn()
            except Exception:
                pass

    def test_postgres_concurrent_stock_adjustment_conflict_resolution(self):
        """Verify two concurrent sessions on PostgreSQL: one succeeds, one gets 409 Conflict.

        Both start from initial stock 10 with expected_stock=10.
        Due to with_for_update() row locking, one transaction serializes before the other.
        The first commits new_stock=15.
        The second wakes up, inspects live stock, sees 15 != expected 10, and raises 409 Conflict.
        No lost update occurs.
        """
        from fastapi.testclient import TestClient
        from app.models import ProductVariant, StockAdjustment

        # Ensure isolated clean state with stock=10
        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            v.stock = 10
            db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).delete()
            db.commit()
        finally:
            db.close()

        results = []
        barrier = threading.Barrier(2)

        def session_a():
            c = TestClient(self.app)
            barrier.wait()
            res = c.post(
                "/admin/inventory/bulk-adjust",
                json={
                    "product_id": self.product_id,
                    "reason": "RESTOCK",
                    "items": [{"variant_id": self.variant_id, "new_stock": 15, "expected_stock": 10}],
                },
                headers=self.owner_headers,
            )
            results.append(("session_a", res.status_code, res.json()))

        def session_b():
            c = TestClient(self.app)
            barrier.wait()
            res = c.post(
                "/admin/inventory/bulk-adjust",
                json={
                    "product_id": self.product_id,
                    "reason": "RESTOCK",
                    "items": [{"variant_id": self.variant_id, "new_stock": 20, "expected_stock": 10}],
                },
                headers=self.owner_headers,
            )
            results.append(("session_b", res.status_code, res.json()))

        t1 = threading.Thread(target=session_a)
        t2 = threading.Thread(target=session_b)

        t1.start()
        t2.start()

        t1.join()
        t2.join()

        status_codes = sorted([r[1] for r in results])
        self.assertEqual(status_codes, [200, 409], f"Expected one 200 and one 409, got: {status_codes}")

        # Verify final stock in PostgreSQL matches the winner's new_stock
        winner = [r for r in results if r[1] == 200][0]
        expected_final_stock = 15 if winner[0] == "session_a" else 20

        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            self.assertEqual(v.stock, expected_final_stock, "PostgreSQL stock must match winner update without lost updates!")

            # Verify only 1 StockAdjustment audit entry was committed
            adjustments = db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).all()
            self.assertEqual(len(adjustments), 1, "Only the winning concurrent transaction should commit an audit entry!")
            self.assertEqual(adjustments[0].new_stock, expected_final_stock)
            self.assertEqual(adjustments[0].previous_stock, 10)
        finally:
            db.close()


    def test_postgres_concurrent_order_and_admin_stock_update(self):
        """Verify concurrency between customer order placement and admin stock update.

        Initial stock = 5.
        Thread A: Customer order places order for 2 units (stock 5 -> 3).
        Thread B: Admin adjusts stock with expected_stock=5 (to 6 units).
        Because row-level locking (with_for_update) is held, one transaction serializes before the other.
        - If customer order commits first: variant stock becomes 3. Admin attempt detects stock changed (3 != 5) and raises 409 Conflict. The order is preserved.
        - If admin commits first: stock becomes 6. Customer order sees 6 >= 2, deducts 2 -> final stock is 4.
        In NEITHER case is customer stock reservation lost or overwritten by admin!
        """
        from fastapi.testclient import TestClient
        from app.models import ProductVariant, StockAdjustment

        # Reset variant stock to 5
        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            v.stock = 5
            # Clean adjustments for fresh test
            db.query(StockAdjustment).filter(StockAdjustment.variant_id == self.variant_id).delete()
            db.commit()
        finally:
            db.close()

        results = []
        barrier = threading.Barrier(2)

        def customer_order():
            c = TestClient(self.app)
            barrier.wait()
            res = c.post(
                "/orders/checkout",
                json={
                    "customer_name": "PG Concurrency Shopper",
                    "customer_email": "shopper@example.com",
                    "customer_phone": "+919876543210",
                    "delivery_address": {
                        "address_line1": "123 Boutique St",
                        "city": "Mumbai",
                        "state": "Maharashtra",
                        "pincode": "400001",
                    },
                    "items": [{"variant_id": self.variant_id, "quantity": 2}],
                },
            )
            results.append(("order", res.status_code, res.json() if res.status_code < 500 else None))

        def admin_adjust():
            c = TestClient(self.app)
            barrier.wait()
            # Uses patch with expected_stock=5
            res = c.patch(
                f"/admin/variants/{self.variant_id}",
                json={
                    "stock": 6,
                    "expected_stock": 5,
                },
                headers=self.owner_headers,
            )
            results.append(("admin", res.status_code, res.json() if res.status_code < 500 else None))

        t1 = threading.Thread(target=customer_order)
        t2 = threading.Thread(target=admin_adjust)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        admin_res = [r for r in results if r[0] == "admin"][0]
        order_res = [r for r in results if r[0] == "order"][0]

        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            if order_res[1] == 200 or order_res[1] == 201:
                # Order succeeded.
                if admin_res[1] == 409:
                    # Order won race, admin was rejected with 409 Conflict: stock is 5 - 2 = 3
                    self.assertEqual(v.stock, 3, "Customer reservation of 2 units must be preserved!")
                else:
                    # Admin won race (5 -> 6), then order placed (6 -> 4): stock is 4
                    self.assertEqual(admin_res[1], 200)
                    self.assertEqual(v.stock, 4, "Admin 6 minus order 2 units must equal 4!")
            else:
                # If order somehow got serialized after admin or failed, admin must be 200
                self.assertEqual(admin_res[1], 200)

            # In no case can stock be negative or stale overwritten
            self.assertGreaterEqual(v.stock, 0)
        finally:
            db.close()

    def test_postgres_relative_stock_delta_and_negative_prevention(self):
        """Verify relative stock delta and negative stock prevention under row lock."""
        from fastapi.testclient import TestClient
        from app.models import ProductVariant

        c = TestClient(self.app)

        # Set stock to 1
        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            v.stock = 1
            db.commit()
        finally:
            db.close()

        # Step +1 via stock_delta
        res_plus = c.patch(
            f"/admin/variants/{self.variant_id}",
            json={"stock_delta": 1},
            headers=self.owner_headers,
        )
        self.assertEqual(res_plus.status_code, 200)
        self.assertEqual(res_plus.json()["stock"], 2)

        # Step -5 should be rejected with 400 because 2 - 5 < 0
        res_neg = c.patch(
            f"/admin/variants/{self.variant_id}",
            json={"stock_delta": -5},
            headers=self.owner_headers,
        )
        self.assertEqual(res_neg.status_code, 400)
        self.assertIn("negative", res_neg.json()["detail"].lower())

        # Verify stock in DB remains 2
        db = self.SessionLocal()
        try:
            v = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            self.assertEqual(v.stock, 2)
        finally:
            db.close()

    def test_postgres_atomic_bulk_variant_update(self):
        """Verify atomic bulk variant price, MRP, and SKU update on PostgreSQL."""
        from fastapi.testclient import TestClient
        from app.models import ProductVariant
        from decimal import Decimal

        c = TestClient(self.app)

        # Create a second variant on same product
        db = self.SessionLocal()
        try:
            v2 = ProductVariant(
                product_id=self.product_id,
                size="L",
                colour="Royal Navy",
                sku="PG-PSA-L",
                selling_price=Decimal("5999.00"),
                mrp=Decimal("7999.00"),
                stock=5,
            )
            db.add(v2)
            db.commit()
            v2_id = v2.id
        finally:
            db.close()

        # 1. Successful atomic update for both variants
        res = c.patch(
            f"/admin/products/{self.product_id}/variants/bulk-update",
            json={
                "items": [
                    {"variant_id": self.variant_id, "selling_price": "6499.00", "mrp": "8999.00", "sku": "PG-PSA-M-NEW"},
                    {"variant_id": v2_id, "selling_price": "6499.00", "mrp": "8999.00", "sku": "PG-PSA-L-NEW"},
                ]
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(len(data["updated_variants"]), 2)

        # 2. Rejection test: if variant 2 has invalid price > mrp, entire transaction rolls back
        res_fail = c.patch(
            f"/admin/products/{self.product_id}/variants/bulk-update",
            json={
                "items": [
                    {"variant_id": self.variant_id, "selling_price": "7000.00", "mrp": "9999.00"},
                    {"variant_id": v2_id, "selling_price": "10000.00", "mrp": "5000.00"},  # Invalid: price > mrp
                ]
            },
            headers=self.owner_headers,
        )
        self.assertEqual(res_fail.status_code, 400)
        self.assertIn("cannot exceed mrp", res_fail.json()["detail"].lower())

        # Verify variant 1 selling_price was NOT updated to 7000 (atomic rollback preserved 6499)
        db = self.SessionLocal()
        try:
            v1 = db.query(ProductVariant).filter(ProductVariant.id == self.variant_id).first()
            self.assertEqual(float(v1.selling_price), 6499.0)
        finally:
            db.close()

if __name__ == "__main__":
    unittest.main(verbosity=2)

