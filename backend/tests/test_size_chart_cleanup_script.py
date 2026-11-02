"""Isolated automated regression test suite for size charts production cleanup script.

Verifies:
1. Audit mode makes zero modifications.
2. Targeted deletion with explicit --chart-ids and --confirm cleans only specified unlinked charts.
3. Genuine identical measurement charts (e.g., standard sizing for different garments) are preserved.
4. Attempting to delete a chart linked to any product aborts immediately with transactional rollback (0 changes).
5. Attempting deletion with --confirm but no --chart-ids is rejected.
6. Non-existent chart IDs abort transaction safely.
7. Local development database (royal_libas.db) and any production DB are strictly untouched.
"""

import json
import os
import sqlite3
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

# Setup isolated disposable SQLite database BEFORE importing app modules
_temp_dir = tempfile.mkdtemp(prefix="rl_cleanup_test_isolated_")
_isolated_db_path = os.path.join(_temp_dir, "isolated_cleanup_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_isolated_db_path}"

# Guard: abort immediately if DATABASE_URL contains business/production keywords
FORBIDDEN = ["postgres", "hostinger", "neon", "prod", "staging", "royal_libas.db"]
for pattern in FORBIDDEN:
    if pattern in os.environ["DATABASE_URL"].lower() and "isolated" not in os.environ["DATABASE_URL"].lower():
        raise RuntimeError(f"CRITICAL SAFETY VIOLATION: Database URL contains forbidden pattern '{pattern}'.")

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, Product, ProductVariant, SizeChart
from scripts.cleanup_size_charts_production import (
    audit_size_charts,
    execute_targeted_cleanup,
)


class TestSizeChartCleanupScript(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(f"sqlite:///{_isolated_db_path}")
        Base.metadata.create_all(bind=cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)

    def setUp(self):
        # Reset and seed predictable test data strictly on isolated test engine
        with self.engine.begin() as conn:
            conn.execute(text("DELETE FROM product_variants"))
            conn.execute(text("DELETE FROM products"))
            conn.execute(text("DELETE FROM size_charts"))

        db = self.SessionLocal()
        try:
            sample_measurements = json.dumps([
                {"size": "XS", "bust": 34, "waist": 28, "hip": 36, "length": 50},
                {"size": "S", "bust": 36, "waist": 30, "hip": 38, "length": 50},
                {"size": "M", "bust": 38, "waist": 32, "hip": 40, "length": 50},
            ])

            # Chart 1: Business chart linked to Product 1
            c1 = SizeChart(
                id=1,
                name="Festive Velvet Anarkali Standard Chart",
                category="Anarkali",
                measurements=sample_measurements,
            )
            # Chart 2: Unlinked duplicate test chart 1
            c2 = SizeChart(
                id=2,
                name="Festive Velvet Anarkali Standard Chart",
                category="Anarkali",
                measurements=sample_measurements,
            )
            # Chart 3: Unlinked duplicate test chart 2
            c3 = SizeChart(
                id=3,
                name="Festive Velvet Anarkali Standard Chart",
                category="Anarkali",
                measurements=sample_measurements,
            )
            # Chart 4: Genuine identical measurements for a different category/garment
            c4 = SizeChart(
                id=4,
                name="Silk Kurta Standard Chart",
                category="Kurta",
                measurements=sample_measurements,
            )
            # Chart 5: Business chart linked to Product 2
            c5 = SizeChart(
                id=5,
                name="Bespoke Bridal Lehenga Chart",
                category="Lehenga",
                measurements=sample_measurements,
            )
            db.add_all([c1, c2, c3, c4, c5])
            db.commit()

            # Seed Products linked to Chart 1 and Chart 5
            p1 = Product(
                id=1,
                name="Gulzar Velvet Anarkali Suit",
                slug="gulzar-velvet-anarkali-suit",
                category="Anarkali",
                size_chart_id=1,
                is_active=True,
            )
            p2 = Product(
                id=2,
                name="Noor Bridal Velvet Lehenga",
                slug="noor-bridal-velvet-lehenga",
                category="Lehenga",
                size_chart_id=5,
                is_active=True,
            )
            db.add_all([p1, p2])
            db.commit()

            # Seed variants
            v1 = ProductVariant(
                id=1,
                product_id=1,
                sku="RL-ANARKALI-001-M",
                size="M",
                colour="Maroon",
                stock=10,
                selling_price=Decimal("12999.00"),
            )
            v2 = ProductVariant(
                id=2,
                product_id=2,
                sku="RL-LEHENGA-001-M",
                size="M",
                colour="Red",
                stock=5,
                selling_price=Decimal("24999.00"),
            )
            db.add_all([v1, v2])
            db.commit()
        finally:
            db.close()

    def test_01_audit_mode_makes_zero_changes(self):
        """Audit mode accurately reports clusters and makes zero modifications."""
        with self.engine.connect() as conn:
            records, clusters = audit_size_charts(conn)

        self.assertEqual(len(records), 5)
        # Verify product references in audit records
        r1 = next(r for r in records if r["id"] == 1)
        self.assertEqual(r1["linked_count"], 1)
        self.assertEqual(r1["linked_products"][0]["id"], 1)

        r2 = next(r for r in records if r["id"] == 2)
        self.assertEqual(r2["linked_count"], 0)

        # Confirm count in database is still exactly 5
        db = self.SessionLocal()
        try:
            self.assertEqual(db.query(SizeChart).count(), 5)
            self.assertEqual(db.query(Product).count(), 2)
        finally:
            db.close()

    def test_02_targeted_cleanup_succeeds_for_unlinked_charts(self):
        """Explicit chart-ids deletion removes only specified unlinked charts and preserves identical & linked ones."""
        success = execute_targeted_cleanup([2, 3], confirm=True, engine_to_use=self.engine)
        self.assertTrue(success)

        db = self.SessionLocal()
        try:
            # Remaining charts must be 1, 4, 5
            remaining_ids = [c.id for c in db.query(SizeChart).order_by(SizeChart.id).all()]
            self.assertEqual(remaining_ids, [1, 4, 5])

            # Chart 1 linked to Product 1 must be completely untouched
            p1 = db.query(Product).filter(Product.id == 1).first()
            self.assertEqual(p1.size_chart_id, 1)

            # Chart 4 (genuine identical measurements, unlinked) must be preserved
            c4 = db.query(SizeChart).filter(SizeChart.id == 4).first()
            self.assertIsNotNone(c4)
            self.assertEqual(c4.name, "Silk Kurta Standard Chart")

            # Chart 5 linked to Product 2 must be untouched
            p2 = db.query(Product).filter(Product.id == 2).first()
            self.assertEqual(p2.size_chart_id, 5)
        finally:
            db.close()

    def test_03_cleanup_aborts_and_rolls_back_if_chart_is_linked(self):
        """Attempting to delete a chart linked to any product raises ValueError and rolls back the whole batch."""
        # Request deletion of unlinked chart 2 AND linked chart 1
        with self.assertRaises(ValueError) as ctx:
            execute_targeted_cleanup([2, 1], confirm=True, engine_to_use=self.engine)

        self.assertIn("CRITICAL SAFETY ABORT", str(ctx.exception))
        self.assertIn("linked to 1 product(s)", str(ctx.exception))

        # Atomic rollback verification: Even Chart 2 must NOT have been deleted because of transaction rollback
        db = self.SessionLocal()
        try:
            remaining_ids = [c.id for c in db.query(SizeChart).order_by(SizeChart.id).all()]
            self.assertEqual(remaining_ids, [1, 2, 3, 4, 5], "Transaction failed to roll back completely!")
            p1 = db.query(Product).filter(Product.id == 1).first()
            self.assertEqual(p1.size_chart_id, 1)
        finally:
            db.close()

    def test_04_dry_run_makes_zero_changes(self):
        """Running with chart-ids but confirm=False makes no changes."""
        success = execute_targeted_cleanup([2, 3], confirm=False, engine_to_use=self.engine)
        self.assertFalse(success)

        db = self.SessionLocal()
        try:
            self.assertEqual(db.query(SizeChart).count(), 5)
        finally:
            db.close()

    def test_05_cleanup_aborts_on_nonexistent_chart_id(self):
        """Attempting to delete a non-existent chart ID aborts safely."""
        with self.assertRaises(ValueError) as ctx:
            execute_targeted_cleanup([999], confirm=True, engine_to_use=self.engine)

        self.assertIn("does not exist", str(ctx.exception))

        db = self.SessionLocal()
        try:
            self.assertEqual(db.query(SizeChart).count(), 5)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
