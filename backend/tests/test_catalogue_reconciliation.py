"""Unit and integration tests for Catalogue Reconciliation on isolated SQLite database."""

import os
import shutil
import sys
import unittest
from decimal import Decimal
from pathlib import Path

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    Collection,
    MediaAsset,
    Product,
    ProductImage,
    ProductVariant,
    StockAdjustment,
)
from reconcile_catalogue import reconcile_catalogue


class TestCatalogueReconciliation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_db_path = Path(backend_dir) / "test_reconcile_isolated.db"
        # Source from verified backup to have real media asset registry & sample products
        backup_path = Path(backend_dir) / "royal_libas.db.backup_20261031_catalogue"
        shutil.copyfile(backup_path, cls.test_db_path)

        cls.engine = create_engine(
            f"sqlite:///{cls.test_db_path.as_posix()}",
            connect_args={"check_same_thread": False},
        )
        from app.migrations import run_migrations
        run_migrations(cls.engine)
        cls.Session = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        if cls.test_db_path.exists():
            try:
                cls.test_db_path.unlink()
            except Exception:
                pass

    def setUp(self):
        self.db = self.Session()

    def tearDown(self):
        self.db.close()

    def test_01_dry_run_simulation(self):
        """Dry-run must not modify database state."""
        prod_count_before = self.db.query(Product).count()
        var_count_before = self.db.query(ProductVariant).count()

        summary = reconcile_catalogue(self.db, dry_run=True)

        self.assertTrue(summary["dry_run"])
        self.assertEqual(summary["designs_discovered"], 22)
        self.assertEqual(summary["products_created"], 22)
        self.assertEqual(summary["variants_created"], 110)

        prod_count_after = self.db.query(Product).count()
        var_count_after = self.db.query(ProductVariant).count()

        self.assertEqual(prod_count_before, prod_count_after, "Dry-run should not insert products")
        self.assertEqual(var_count_before, var_count_after, "Dry-run should not insert variants")

    def test_02_confirm_reconciliation(self):
        """Confirm execution must archive 18 legacy products, create 22 designs with 110 variants, and attach media."""
        # Check initial state
        initial_prods = self.db.query(Product).count()
        self.assertEqual(initial_prods, 18, "Expected 18 initial sample products")

        summary = reconcile_catalogue(self.db, dry_run=False)

        self.assertFalse(summary["dry_run"])
        self.assertEqual(summary["designs_discovered"], 22)
        self.assertEqual(summary["products_created"], 22)
        self.assertEqual(summary["variants_created"], 110)
        self.assertEqual(summary["legacy_products_archived"], 18)

        # Verify Legacy Products
        archived_prods = self.db.query(Product).filter(Product.status == "ARCHIVED").all()
        self.assertEqual(len(archived_prods), 18)
        for p in archived_prods:
            self.assertFalse(p.is_active)
            self.assertFalse(p.source_folder and p.source_folder.startswith("Photos for royal libas/"))

        # Verify New Real Designs
        new_prods = (
            self.db.query(Product)
            .filter(Product.source_folder.like("Photos for royal libas/%"))
            .all()
        )
        self.assertEqual(len(new_prods), 22)

        for p in new_prods:
            self.assertEqual(p.status, "DRAFT")
            self.assertFalse(p.is_active)
            self.assertIn(p.category, ["TWO PIECES", "SUIT SET", "HEAVY DRESS"])
            self.assertTrue(bool(p.subcategory))
            self.assertGreaterEqual(len(p.images), 1)

            # Check Canonical Collection
            self.assertEqual(len(p.collections), 1)
            self.assertEqual(p.collections[0].name, p.category)

            # Check Variants (5 sizes: S, M, L, XL, XXL)
            self.assertEqual(len(p.variants), 5)
            sizes = {v.size for v in p.variants}
            self.assertEqual(sizes, {"S", "M", "L", "XL", "XXL"})
            for v in p.variants:
                self.assertEqual(v.stock, 5)
                self.assertEqual(v.selling_price, Decimal("1999.00"))
                self.assertEqual(v.mrp, Decimal("2499.00"))
                self.assertTrue(v.sku.startswith("RL-"))

                # Check Stock Adjustment record
                adj = self.db.query(StockAdjustment).filter(StockAdjustment.variant_id == v.id).first()
                self.assertIsNotNone(adj)
                self.assertEqual(adj.reason, "INITIAL_SETUP")
                self.assertEqual(adj.change_amount, 5)

            # Check Images
            self.assertGreaterEqual(len(p.images), 1)
            for idx, img in enumerate(p.images):
                self.assertEqual(img.sort_order, idx + 1)
                self.assertIsNotNone(img.media_asset_id)
                self.assertTrue(img.url.startswith("http"))
                if idx == 0:
                    self.assertEqual(img.resource_type, "image")

        # Verify Collections Status
        canonical_cols = self.db.query(Collection).filter(Collection.is_active == True).all()
        canonical_slugs = {c.slug for c in canonical_cols}
        self.assertTrue({"two-pieces", "suit-set", "heavy-dress"}.issubset(canonical_slugs))

        legacy_cols = (
            self.db.query(Collection)
            .filter(Collection.slug.in_(["festive-edit", "everyday-cotton", "bestsellers"]))
            .all()
        )
        for c in legacy_cols:
            self.assertFalse(c.is_active)

    def test_03_idempotency(self):
        """Subsequent run should be completely idempotent and not duplicate data."""
        prod_count_before = self.db.query(Product).count()
        var_count_before = self.db.query(ProductVariant).count()
        img_count_before = self.db.query(ProductImage).count()

        summary = reconcile_catalogue(self.db, dry_run=False)

        self.assertEqual(summary["products_created"], 0)
        self.assertEqual(summary["products_already_existing"], 22)
        self.assertEqual(summary["variants_created"], 0)
        self.assertEqual(summary["legacy_products_archived"], 0)

        prod_count_after = self.db.query(Product).count()
        var_count_after = self.db.query(ProductVariant).count()
        img_count_after = self.db.query(ProductImage).count()

        self.assertEqual(prod_count_before, prod_count_after)
        self.assertEqual(var_count_before, var_count_after)
        self.assertEqual(img_count_before, img_count_after)


if __name__ == "__main__":
    unittest.main()
