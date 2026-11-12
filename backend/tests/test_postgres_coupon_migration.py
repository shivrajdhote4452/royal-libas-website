"""Disposable PostgreSQL Coupon Schema Migration & Rollback Test Suite.

Verifies:
1. Safe execution of `run_migrations(engine)` on PostgreSQL when `coupons` lacks `usage_limit`, `used_count`, `valid_from`, `valid_until`, `updated_at`.
2. Correct PostgreSQL data types (INTEGER, TIMESTAMP WITH TIME ZONE, etc.).
3. Pre-existing legacy coupons are safely preserved, normalized with used_count=0 and unlimited usage (usage_limit=NULL), remaining fully valid.
4. Historical order records and coupon discount calculations are unaffected.
5. Migration idempotency (running migrations multiple times is completely safe).
6. Rollback and recovery verification: rolling back column additions leaves pre-migration coupon data and historical orders completely intact.

SAFETY GUARDS:
- Requires an isolated disposable PostgreSQL database (e.g. GitHub Actions PostgreSQL service container or local ephemeral cluster).
- NEVER connects to or tests against the VPS, production database, or existing business database.
- Strictly guards against non-localhost or production URLs.
- Skips safely if disposable PostgreSQL is not available in the execution environment.
"""

import os
import sys
import unittest
from decimal import Decimal
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text, inspect
os.environ.setdefault("JWT_SECRET", "isolated-test-jwt-secret-pg-coupon-migration-32b")

from app.database import Base
from app.models import Coupon, Order, StoreSetting
from app.migrations import run_migrations
from app.services.order_service import calculate_coupon_discount
from tests.test_postgres_variant_migration import _find_or_create_disposable_postgres


class TestPostgresCouponMigration(unittest.TestCase):
    """Verifies coupon schema migration and backward compatibility on disposable PostgreSQL."""

    @classmethod
    def setUpClass(cls):
        pg_url, cleanup_fn = _find_or_create_disposable_postgres()
        if not pg_url:
            raise unittest.SkipTest("Disposable PostgreSQL not configured and no local postgres binaries found.")

        cls.cleanup_fn = cleanup_fn

        # Strict safety guards
        lower_url = pg_url.lower()
        if not ("localhost" in lower_url or "127.0.0.1" in lower_url):
            raise unittest.SkipTest(f"Safety guard: TEST_POSTGRES_URL must be localhost/127.0.0.1, got: {lower_url}")

        for forbidden in ["hostinger", "neon", "prod", "vps", "royal_libas_prod"]:
            if forbidden in lower_url:
                raise unittest.SkipTest(f"Safety guard: Forbidden keyword '{forbidden}' detected in URL.")

        if pg_url.startswith("postgresql://") and not pg_url.startswith("postgresql+"):
            pg_url = pg_url.replace("postgresql://", "postgresql+psycopg2://", 1)

        cls.pg_url = pg_url
        cls.engine = create_engine(pg_url, pool_pre_ping=True)

        with cls.engine.connect() as conn:
            conn.execute(text("SELECT 1;"))

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "engine"):
            try:
                with cls.engine.begin() as conn:
                    conn.execute(text("DELETE FROM orders;"))
                    conn.execute(text("DELETE FROM coupons;"))
                Base.metadata.create_all(bind=cls.engine)
                run_migrations(cls.engine)
            except Exception:
                pass
            cls.engine.dispose()
        if hasattr(cls, "cleanup_fn") and cls.cleanup_fn:
            cls.cleanup_fn()

    def setUp(self):
        """Prepare tables in disposable PostgreSQL before each test, stripping new coupon columns."""
        Base.metadata.create_all(bind=self.engine)

        with self.engine.begin() as conn:
            conn.execute(text("DELETE FROM orders;"))
            conn.execute(text("DELETE FROM coupons;"))

            # Strip the columns from coupons to simulate pre-migration state
            conn.execute(text("ALTER TABLE coupons DROP COLUMN IF EXISTS usage_limit;"))
            conn.execute(text("ALTER TABLE coupons DROP COLUMN IF EXISTS used_count;"))
            conn.execute(text("ALTER TABLE coupons DROP COLUMN IF EXISTS valid_from;"))
            conn.execute(text("ALTER TABLE coupons DROP COLUMN IF EXISTS valid_until;"))
            conn.execute(text("ALTER TABLE coupons DROP COLUMN IF EXISTS updated_at;"))
            conn.execute(text("ALTER TABLE coupons DROP COLUMN IF EXISTS is_public;"))

            # Seed representative pre-migration coupons (legacy schema)
            conn.execute(text("""
                INSERT INTO coupons (code, type, value, min_order_value, is_active)
                VALUES
                    ('LEGACY10', 'PERCENT', 10.00, 1000.00, TRUE),
                    ('FLAT100', 'FLAT', 100.00, 1500.00, TRUE),
                    ('INACTIVE20', 'PERCENT', 20.00, 500.00, FALSE);
            """))

            # Seed representative historical orders (which used coupons and discounts)
            conn.execute(text("""
                INSERT INTO orders (order_code, customer_name, phone, status, payment_method, payment_status, subtotal, shipping_charge, discount, total)
                VALUES
                    ('RL-HIST-001', 'Historical Buyer 1', '9811122233', 'DELIVERED', 'COD', 'PAID', 2000.00, 0.00, 200.00, 1800.00),
                    ('RL-HIST-002', 'Historical Buyer 2', '9811122244', 'DELIVERED', 'PREPAID', 'PAID', 1500.00, 0.00, 100.00, 1400.00);
            """))

    def tearDown(self):
        with self.engine.begin() as conn:
            conn.execute(text("DELETE FROM orders;"))
            conn.execute(text("DELETE FROM coupons;"))

    def test_01_migration_adds_coupon_columns_with_correct_types(self):
        """Verify run_migrations adds usage_limit, used_count, valid_from, valid_until, updated_at, is_public to coupons table."""
        inspector = inspect(self.engine)
        cols_before = {c["name"] for c in inspector.get_columns("coupons")}
        for col in ["usage_limit", "used_count", "valid_from", "valid_until", "updated_at", "is_public"]:
            self.assertNotIn(col, cols_before)

        # Run migration
        run_migrations(self.engine)

        # Inspect after migration
        inspector_after = inspect(self.engine)
        cols_after = {c["name"]: c for c in inspector_after.get_columns("coupons")}
        for col in ["usage_limit", "used_count", "valid_from", "valid_until", "updated_at", "is_public"]:
            self.assertIn(col, cols_after)

        # Check types
        self.assertIn("INTEGER", str(cols_after["usage_limit"]["type"]).upper())
        self.assertIn("INTEGER", str(cols_after["used_count"]["type"]).upper())
        self.assertIn("TIMESTAMP", str(cols_after["valid_from"]["type"]).upper())
        self.assertIn("TIMESTAMP", str(cols_after["valid_until"]["type"]).upper())
        self.assertIn("TIMESTAMP", str(cols_after["updated_at"]["type"]).upper())
        self.assertIn("BOOLEAN", str(cols_after["is_public"]["type"]).upper())

    def test_02_pre_existing_coupons_default_handling_and_validity(self):
        """Verify pre-existing legacy coupons have used_count=0, usage_limit=NULL (unlimited),

        and calculate discount accurately without breaking.
        """
        run_migrations(self.engine)

        with self.engine.connect() as conn:
            rows = conn.execute(text("SELECT code, usage_limit, used_count, valid_from, valid_until, is_active FROM coupons ORDER BY code;")).fetchall()
            coupon_dict = {r[0]: r for r in rows}

            # LEGACY10
            leg = coupon_dict["LEGACY10"]
            self.assertIsNone(leg[1])  # usage_limit is NULL (unlimited)
            self.assertEqual(leg[2], 0)  # used_count is normalized to 0
            self.assertIsNone(leg[3])  # valid_from is NULL (immediately active)
            self.assertIsNone(leg[4])  # valid_until is NULL (does not expire)
            self.assertTrue(leg[5])

            # FLAT100
            flat = coupon_dict["FLAT100"]
            self.assertIsNone(flat[1])
            self.assertEqual(flat[2], 0)
            self.assertTrue(flat[5])

        # Test application of legacy coupon using Session
        from sqlalchemy.orm import sessionmaker
        Session = sessionmaker(bind=self.engine)
        db = Session()
        try:
            leg_coupon = db.query(Coupon).filter(Coupon.code == "LEGACY10").first()
            self.assertIsNotNone(leg_coupon)
            discount = calculate_coupon_discount(leg_coupon, Decimal("2000.00"))
            self.assertEqual(discount, Decimal("200.00"))  # 10% of 2000

            flat_coupon = db.query(Coupon).filter(Coupon.code == "FLAT100").first()
            flat_discount = calculate_coupon_discount(flat_coupon, Decimal("1500.00"))
            self.assertEqual(flat_discount, Decimal("100.00"))
        finally:
            db.close()

    def test_03_migration_idempotency(self):
        """Verify that running run_migrations multiple times is completely idempotent."""
        run_migrations(self.engine)
        # Run second and third time
        run_migrations(self.engine)
        run_migrations(self.engine)

        inspector = inspect(self.engine)
        col_names = [c["name"] for c in inspector.get_columns("coupons")]
        # Column names must be unique
        self.assertEqual(len(col_names), len(set(col_names)))

    def test_04_rollback_and_recovery(self):
        """Verify rollback procedure: safely dropping the 5 added columns leaves original

        coupons and historical orders completely intact.
        """
        run_migrations(self.engine)

        # Simulate rollback: drop the added columns
        with self.engine.begin() as conn:
            conn.execute(text("""
                ALTER TABLE coupons DROP COLUMN IF EXISTS usage_limit;
                ALTER TABLE coupons DROP COLUMN IF EXISTS used_count;
                ALTER TABLE coupons DROP COLUMN IF EXISTS valid_from;
                ALTER TABLE coupons DROP COLUMN IF EXISTS valid_until;
                ALTER TABLE coupons DROP COLUMN IF EXISTS updated_at;
            """))

        # Verify coupons still contain original codes and configurations
        with self.engine.connect() as conn:
            coupons = conn.execute(text("SELECT code, type, value, min_order_value FROM coupons ORDER BY code;")).fetchall()
            self.assertEqual(len(coupons), 3)
            self.assertEqual(coupons[0][0], "FLAT100")
            self.assertEqual(float(coupons[0][2]), 100.0)

            # Verify historical orders remain untouched
            orders = conn.execute(text("SELECT order_code, discount, total FROM orders ORDER BY order_code;")).fetchall()
            self.assertEqual(len(orders), 2)
            self.assertEqual(orders[0][0], "RL-HIST-001")
            self.assertEqual(float(orders[0][1]), 200.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
