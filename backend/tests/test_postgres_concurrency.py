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
        pg_url = os.environ.get("TEST_POSTGRES_URL")
        if not pg_url:
            raise unittest.SkipTest("Disposable PostgreSQL not configured (TEST_POSTGRES_URL not set).")

        # Strict Safety Guards
        lower_url = pg_url.lower()
        if not ("localhost" in lower_url or "127.0.0.1" in lower_url):
            raise unittest.SkipTest(f"Safety guard: TEST_POSTGRES_URL must be localhost/127.0.0.1, got: {lower_url}")

        for forbidden in ["hostinger", "neon", "prod", "vps", "royal_libas_prod"]:
            if forbidden in lower_url:
                raise unittest.SkipTest(f"Safety guard: Forbidden keyword '{forbidden}' detected in TEST_POSTGRES_URL.")

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


if __name__ == "__main__":
    unittest.main(verbosity=2)

