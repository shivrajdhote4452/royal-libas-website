"""Disposable PostgreSQL Variant Availability Migration Test Suite.

Verifies:
1. Safe execution of `run_migrations(engine)` on PostgreSQL when `product_variants` lacks `is_active`.
2. PostgreSQL-appropriate BOOLEAN literal usage (`BOOLEAN DEFAULT TRUE` and `SET is_active = TRUE`).
3. Existing pre-migration variants are enabled (`is_active = True`) by default without altering stock, price, SKU, or orders.
4. Idempotency: rerunning `run_migrations(engine)` is safe, does not error, and preserves data.
5. Dialect compatibility: both PostgreSQL and SQLite migration flows are validated.

SAFETY GUARDS:
- Requires an isolated disposable PostgreSQL database (e.g. GitHub Actions PostgreSQL service container or local ephemeral cluster).
- NEVER connects to or tests against the VPS, production database, or existing business database.
- Strictly guards against non-localhost or production URLs.
- Skips safely if disposable PostgreSQL is not available in the execution environment.
"""

import atexit
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from decimal import Decimal
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text, inspect
from app.database import Base
from app.models import Product, ProductVariant
from app.migrations import run_migrations


def _find_or_create_disposable_postgres():
    """Returns a connection URL to a disposable PostgreSQL database or None."""
    env_url = os.environ.get("TEST_POSTGRES_URL")
    if env_url:
        return env_url, None

    # Check for local PostgreSQL binaries to spin up an ephemeral cluster
    possible_bins = [
        r"C:\Program Files\PostgreSQL\18\bin",
        r"C:\Program Files\PostgreSQL\17\bin",
        r"C:\Program Files\PostgreSQL\16\bin",
        r"C:\Program Files\PostgreSQL\15\bin",
    ]
    pg_bin = None
    for b in possible_bins:
        if os.path.exists(os.path.join(b, "initdb.exe")) and os.path.exists(os.path.join(b, "postgres.exe")):
            pg_bin = b
            break

    if not pg_bin:
        return None, None

    # Provision ephemeral cluster on an unprivileged high port
    temp_dir = tempfile.mkdtemp(prefix="rl_ephemeral_pg_")
    initdb = os.path.join(pg_bin, "initdb.exe")
    postgres = os.path.join(pg_bin, "postgres.exe")

    res = subprocess.run([initdb, "-U", "test_user", "-A", "trust", "-D", temp_dir], capture_output=True, text=True)
    if res.returncode != 0:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return None, None

    ephemeral_port = "5439"
    proc = subprocess.Popen(
        [postgres, "-D", temp_dir, "-p", ephemeral_port],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(2)

    def cleanup():
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        time.sleep(1)
        shutil.rmtree(temp_dir, ignore_errors=True)

    atexit.register(cleanup)
    url = f"postgresql+psycopg2://test_user@127.0.0.1:{ephemeral_port}/postgres"
    return url, cleanup


class TestPostgresVariantMigration(unittest.TestCase):
    """Verifies schema migration on disposable PostgreSQL with an existing product_variants table lacking is_active."""

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

        # Ensure connection works
        with cls.engine.connect() as conn:
            conn.execute(text("SELECT 1;"))

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "engine"):
            try:
                # Ensure tables and migrations are fully restored for any subsequent test suites
                Base.metadata.create_all(bind=cls.engine)
                run_migrations(cls.engine)
            except Exception:
                pass
            cls.engine.dispose()
        if hasattr(cls, "cleanup_fn") and cls.cleanup_fn:
            cls.cleanup_fn()

    def setUp(self):
        """Prepare fresh tables in disposable PostgreSQL before each test, ensuring is_active is stripped."""
        # Ensure full model tables exist so all standard columns (description, fabric, care, etc.) are present
        Base.metadata.create_all(bind=self.engine)

        with self.engine.begin() as conn:
            # Clean existing test data from product_variants and products
            conn.execute(text("DELETE FROM product_variants;"))
            conn.execute(text("DELETE FROM products;"))

            # Strip the is_active column from product_variants to simulate pre-migration state
            conn.execute(text("ALTER TABLE product_variants DROP COLUMN IF EXISTS is_active;"))

            # Seed pre-migration products and variants without is_active
            conn.execute(text("""
                INSERT INTO products (id, name, slug, category, subcategory, status, is_bestseller, is_active)
                VALUES (1, 'Test Anarkali Set', 'test-anarkali-set', 'SUIT SET', 'Three Pieces', 'PUBLISHED', FALSE, TRUE);
            """))

            conn.execute(text("""
                INSERT INTO product_variants (id, product_id, size, colour, sku, selling_price, stock)
                VALUES
                    (10, 1, 'S', 'Ruby Red', 'RL-TEST-S', 3499.00, 12),
                    (11, 1, 'M', 'Ruby Red', 'RL-TEST-M', 3499.00, 8),
                    (12, 1, 'L', 'Ruby Red', 'RL-TEST-L', 3499.00, 0);
            """))

    def test_01_migration_adds_boolean_column_and_enables_existing_variants(self):
        """Verify run_migrations adds is_active as BOOLEAN without integer coercion error and defaults existing rows to TRUE."""
        # Confirm is_active does NOT exist before migration
        inspector = inspect(self.engine)
        col_names = {c["name"] for c in inspector.get_columns("product_variants")}
        self.assertNotIn("is_active", col_names)

        # Run migration - MUST NOT throw psycopg2.errors.DatatypeMismatch
        run_migrations(self.engine)

        # Verify is_active column now exists and has BOOLEAN type
        inspector = inspect(self.engine)
        cols = {c["name"]: c for c in inspector.get_columns("product_variants")}
        self.assertIn("is_active", cols)
        col_type_str = str(cols["is_active"]["type"]).upper()
        self.assertIn("BOOL", col_type_str)

        # Verify all existing variants are enabled (is_active = True) and data is preserved
        with self.engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT id, size, sku, selling_price, stock, is_active
                FROM product_variants
                ORDER BY id ASC;
            """)).mappings().all()

        self.assertEqual(len(rows), 3)

        # Variant S: stock=12, price=3499.00, is_active=True
        self.assertEqual(rows[0]["id"], 10)
        self.assertEqual(rows[0]["size"], "S")
        self.assertEqual(rows[0]["sku"], "RL-TEST-S")
        self.assertEqual(Decimal(str(rows[0]["selling_price"])), Decimal("3499.00"))
        self.assertEqual(rows[0]["stock"], 12)
        self.assertIs(rows[0]["is_active"], True)

        # Variant M: stock=8, price=3499.00, is_active=True
        self.assertEqual(rows[1]["id"], 11)
        self.assertEqual(rows[1]["size"], "M")
        self.assertEqual(rows[1]["sku"], "RL-TEST-M")
        self.assertEqual(Decimal(str(rows[1]["selling_price"])), Decimal("3499.00"))
        self.assertEqual(rows[1]["stock"], 8)
        self.assertIs(rows[1]["is_active"], True)

        # Variant L: stock=0, price=3499.00, is_active=True
        self.assertEqual(rows[2]["id"], 12)
        self.assertEqual(rows[2]["size"], "L")
        self.assertEqual(rows[2]["sku"], "RL-TEST-L")
        self.assertEqual(Decimal(str(rows[2]["selling_price"])), Decimal("3499.00"))
        self.assertEqual(rows[2]["stock"], 0)
        self.assertIs(rows[2]["is_active"], True)

    def test_02_migration_is_idempotent_and_preserves_admin_toggles(self):
        """Verify re-running migrations does not error and does not overwrite explicitly toggled values."""
        # Initial migration
        run_migrations(self.engine)

        # Simulate admin toggling size 'S' to OFF (is_active = False)
        with self.engine.begin() as conn:
            conn.execute(text("UPDATE product_variants SET is_active = FALSE WHERE id = 10;"))

        # Re-run migration (as happens on next deploy/server restart)
        run_migrations(self.engine)

        # Verify: S is still False (not overwritten), M and L are still True
        with self.engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT id, is_active FROM product_variants ORDER BY id ASC;
            """)).mappings().all()

        self.assertIs(rows[0]["is_active"], False)
        self.assertIs(rows[1]["is_active"], True)
        self.assertIs(rows[2]["is_active"], True)

    def test_03_null_variant_is_active_repaired_to_true(self):
        """Verify that any pre-existing or imported rows with NULL is_active are safely updated to True."""
        # Initial migration
        run_migrations(self.engine)

        # Insert a row with NULL is_active (e.g. via raw insert or partial seed)
        with self.engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO product_variants (id, product_id, size, colour, sku, selling_price, stock, is_active)
                VALUES (13, 1, 'XL', 'Ruby Red', 'RL-TEST-XL', 3799.00, 5, NULL);
            """))

        # Run migration - should repair NULL to True without type error
        run_migrations(self.engine)

        with self.engine.connect() as conn:
            row = conn.execute(text("SELECT is_active FROM product_variants WHERE id = 13;")).mappings().first()

        self.assertIsNotNone(row)
        self.assertIs(row["is_active"], True)


class TestSQLiteVariantMigration(unittest.TestCase):
    """Validates the migration logic on SQLite to ensure dialect isolation."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        with self.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(255) UNIQUE NOT NULL,
                    category VARCHAR(100) NOT NULL,
                    subcategory VARCHAR(100),
                    status VARCHAR(50) DEFAULT 'DRAFT',
                    is_bestseller BOOLEAN DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1
                );
            """))
            conn.execute(text("""
                CREATE TABLE product_variants (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER REFERENCES products(id),
                    size VARCHAR(20) NOT NULL,
                    colour VARCHAR(100),
                    sku VARCHAR(100) UNIQUE NOT NULL,
                    selling_price NUMERIC(10, 2) NOT NULL,
                    stock INTEGER DEFAULT 0 NOT NULL
                );
            """))
            conn.execute(text("""
                INSERT INTO products (id, name, slug, category, subcategory, status, is_bestseller, is_active)
                VALUES (1, 'SQLite Product', 'sqlite-product', 'SUIT SET', 'Party Wear', 'PUBLISHED', 0, 1);
            """))
            conn.execute(text("""
                INSERT INTO product_variants (id, product_id, size, colour, sku, selling_price, stock)
                VALUES (1, 1, 'M', 'Green', 'RL-SQLITE-M', 1999.00, 5);
            """))

    def tearDown(self):
        self.engine.dispose()

    def test_sqlite_migration_adds_column_and_preserves_values(self):
        run_migrations(self.engine)

        inspector = inspect(self.engine)
        cols = {c["name"] for c in inspector.get_columns("product_variants")}
        self.assertIn("is_active", cols)

        with self.engine.connect() as conn:
            row = conn.execute(text("SELECT id, size, sku, selling_price, stock, is_active FROM product_variants WHERE id = 1;")).mappings().first()

        self.assertEqual(row["size"], "M")
        self.assertEqual(row["sku"], "RL-SQLITE-M")
        self.assertEqual(Decimal(str(row["selling_price"])), Decimal("1999.00"))
        self.assertEqual(row["stock"], 5)
        # SQLite booleans evaluate to 1 / True
        self.assertTrue(bool(row["is_active"]))


if __name__ == "__main__":
    unittest.main()
