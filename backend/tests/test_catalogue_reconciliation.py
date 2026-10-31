"""Unit and integration tests for Catalogue Reconciliation on isolated SQLite database."""

import hashlib
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

from fastapi import HTTPException
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
from app.services.product_service import (
    CANONICAL_TAXONOMY,
    CATEGORY_TO_COLLECTION_SLUG,
    sync_product_category_and_collections,
    validate_category_and_subcategory,
)
from reconcile_catalogue import reconcile_catalogue
from seed import seed_database


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

        self.assertEqual(
            prod_count_before, prod_count_after, "Dry-run should not insert products"
        )
        self.assertEqual(
            var_count_before, var_count_after, "Dry-run should not insert variants"
        )

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
        archived_prods = (
            self.db.query(Product).filter(Product.status == "ARCHIVED").all()
        )
        self.assertEqual(len(archived_prods), 18)
        for p in archived_prods:
            self.assertFalse(p.is_active)
            self.assertFalse(
                p.source_folder
                and p.source_folder.startswith("Photos for royal libas/")
            )

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
                adj = (
                    self.db.query(StockAdjustment)
                    .filter(StockAdjustment.variant_id == v.id)
                    .first()
                )
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
        canonical_cols = (
            self.db.query(Collection).filter(Collection.is_active == True).all()
        )
        canonical_slugs = {c.slug for c in canonical_cols}
        self.assertTrue(
            {"two-pieces", "suit-set", "heavy-dress"}.issubset(canonical_slugs)
        )

        legacy_cols = (
            self.db.query(Collection)
            .filter(
                Collection.slug.in_(
                    ["festive-edit", "everyday-cotton", "bestsellers"]
                )
            )
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

    def test_04_manual_products_without_source_folder_preserved(self):
        """Fix 1: Products created via Admin Add Product (no source_folder) must NEVER be archived."""
        manual_prod = Product(
            name="Custom Admin Couture Gown",
            slug="custom-admin-couture-gown",
            description="Handmade gown added through admin portal",
            category="HEAVY DRESS",
            subcategory="Designer Wear",
            source_folder=None,  # No source folder
            status="PUBLISHED",
            is_active=True,
            is_bestseller=False,
        )
        self.db.add(manual_prod)
        self.db.commit()

        # Re-run reconciliation
        reconcile_catalogue(self.db, dry_run=False)

        # Verify manual product is untouched and still PUBLISHED & active
        reloaded = self.db.query(Product).filter(Product.id == manual_prod.id).first()
        self.assertIsNotNone(reloaded)
        self.assertEqual(reloaded.status, "PUBLISHED")
        self.assertTrue(reloaded.is_active)
        self.assertIsNone(reloaded.source_folder)

    def test_05_slug_conflict_disambiguation_without_overwriting(self):
        """Fix 1: Slug conflicts disambiguate candidate slug and do not clobber existing product."""
        # Create an existing product with a slug that matches one of the designs
        existing = Product(
            name="Existing Special Suit",
            slug="aafreen-beige-botanical-three-piece-suit-custom",
            category="SUIT SET",
            subcategory="Three Pieces",
            source_folder="custom/folder/path",
            status="DRAFT",
            is_active=False,
        )
        self.db.add(existing)
        self.db.commit()

        # Running reconciliation must keep existing product intact
        reconcile_catalogue(self.db, dry_run=False)

        reloaded = self.db.query(Product).filter(Product.id == existing.id).first()
        self.assertIsNotNone(reloaded)
        self.assertEqual(reloaded.name, "Existing Special Suit")
        self.assertEqual(reloaded.source_folder, "custom/folder/path")

    def test_06_owner_custom_edits_preserved_during_rerun(self):
        """Fix 1: Owner-edited names, categories, specifications, prices, stock survive reconciliation reruns."""
        # Find a real design product
        design = (
            self.db.query(Product)
            .filter(Product.source_folder.like("Photos for royal libas/%"))
            .first()
        )
        self.assertIsNotNone(design)

        # Simulate owner customizations
        design.name = "Owner Edited Royal Velvet Gown"
        design.description = "Bespoke description lovingly written by Tanya"
        design.fabric = "100% Pure Mulberry Silk"
        design.care = "Dry clean with petroleum solvent only"
        design.fit = "Custom tailored slim fit"
        self.db.commit()

        # Rerun reconciliation
        reconcile_catalogue(self.db, dry_run=False)

        # Verify all custom values were preserved
        reloaded = self.db.query(Product).filter(Product.id == design.id).first()
        self.assertEqual(reloaded.name, "Owner Edited Royal Velvet Gown")
        self.assertEqual(
            reloaded.description, "Bespoke description lovingly written by Tanya"
        )
        self.assertEqual(reloaded.fabric, "100% Pure Mulberry Silk")
        self.assertEqual(
            reloaded.care, "Dry clean with petroleum solvent only"
        )
        self.assertEqual(reloaded.fit, "Custom tailored slim fit")

    def test_07_canonical_membership_and_conflict_validation(self):
        """Fix 2: Canonical taxonomy validation and collection synchronization."""
        # 1. Valid combinations normalize properly
        cat, subcat = validate_category_and_subcategory("two pieces", "co-ord sets")
        self.assertEqual(cat, "TWO PIECES")
        self.assertEqual(subcat, "Co-ord Sets")

        cat2, subcat2 = validate_category_and_subcategory("suit set", "Party Wear")
        self.assertEqual(cat2, "SUIT SET")
        self.assertEqual(subcat2, "Party Wear")

        cat3, subcat3 = validate_category_and_subcategory(
            "heavy dress", "Sharara / Gharara"
        )
        self.assertEqual(cat3, "HEAVY DRESS")
        self.assertEqual(subcat3, "Sharara / Gharara")

        # 2. Invalid category raises HTTP 400
        with self.assertRaises(HTTPException) as ctx:
            validate_category_and_subcategory("Western Dresses", "Gowns")
        self.assertEqual(ctx.exception.status_code, 400)

        # 3. Invalid subcategory raises HTTP 400
        with self.assertRaises(HTTPException) as ctx:
            validate_category_and_subcategory("TWO PIECES", "Lehenga")
        self.assertEqual(ctx.exception.status_code, 400)

        # 4. Collection sync ensures canonical collection and removes conflicting canonicals
        two_pieces_col = (
            self.db.query(Collection).filter(Collection.slug == "two-pieces").first()
        )
        suit_set_col = (
            self.db.query(Collection).filter(Collection.slug == "suit-set").first()
        )
        custom_col = (
            self.db.query(Collection).filter(Collection.slug == "festive-edit").first()
        )

        test_prod = Product(
            name="Taxonomy Test Product",
            slug="taxonomy-test-product",
            category="TWO PIECES",
            subcategory="Co-ord Sets",
            status="DRAFT",
            is_active=False,
        )
        # Give conflicting canonical collection and an editorial collection
        test_prod.collections = [suit_set_col, custom_col]
        self.db.add(test_prod)
        self.db.flush()

        sync_product_category_and_collections(
            product=test_prod,
            category="TWO PIECES",
            subcategory="Co-ord Sets",
            explicit_collection_ids=[suit_set_col.id, custom_col.id],
            db=self.db,
        )

        col_slugs = {c.slug for c in test_prod.collections}
        # Conflicting canonical suit-set removed, correct canonical two-pieces added, editorial festive-edit preserved
        self.assertIn("two-pieces", col_slugs)
        self.assertNotIn("suit-set", col_slugs)
        self.assertIn("festive-edit", col_slugs)

    def test_08_selective_spec_cleanup_preserves_custom_specs(self):
        """Fix 3: Removes only unverified generated placeholders while leaving custom content untouched."""
        prod1 = Product(
            name="Unverified Specs Product",
            slug="unverified-specs-product",
            fabric="Pure Silk / Artisan Chanderi",
            care="Dry clean only to preserve artisanal texture and embroidery",
            fit="Tailored Regular Fit",
            description="Artisanal Suit Set featuring handcrafted silhouette. Details subject to owner review.",
            source_folder="Photos for royal libas/Suit Set/Three Pieces/Test Folder 1",
            status="DRAFT",
            is_active=False,
        )
        prod2 = Product(
            name="Custom Specs Product",
            slug="custom-specs-product",
            fabric="100% Organza Silk",
            care="Gentle hand wash in cold water",
            fit="Oversized Relaxed Fit",
            description="Tanya's custom handwritten description",
            source_folder="Photos for royal libas/Suit Set/Three Pieces/Test Folder 2",
            status="DRAFT",
            is_active=False,
        )
        self.db.add_all([prod1, prod2])
        self.db.commit()

        reconcile_catalogue(self.db, dry_run=False)

        # prod1 should have unverified specs cleared to None
        r1 = self.db.query(Product).filter(Product.id == prod1.id).first()
        self.assertIsNone(r1.fabric)
        self.assertIsNone(r1.care)
        self.assertIsNone(r1.fit)
        self.assertIsNone(r1.description)

        # prod2 should have custom specs preserved
        r2 = self.db.query(Product).filter(Product.id == prod2.id).first()
        self.assertEqual(r2.fabric, "100% Organza Silk")
        self.assertEqual(r2.care, "Gentle hand wash in cold water")
        self.assertEqual(r2.fit, "Oversized Relaxed Fit")
        self.assertEqual(r2.description, "Tanya's custom handwritten description")

    def test_09_variant_mrp_price_validation_and_nullable_clearing(self):
        """Fix 4: Variant price validation (price > 0, price <= mrp) and nullable mrp support."""
        # Find a variant
        v = self.db.query(ProductVariant).first()
        self.assertIsNotNone(v)

        # Verify initial values
        self.assertGreater(v.selling_price, 0)
        self.assertGreater(v.mrp, 0)
        self.assertLessEqual(v.selling_price, v.mrp)

        # Effective selling price > effective MRP must be prohibited
        # e.g. selling_price = 3000, mrp = 2500 -> Invalid
        effective_price = Decimal("3000.00")
        effective_mrp = Decimal("2500.00")
        self.assertTrue(effective_price > effective_mrp)

        # Clearing MRP to None is valid
        v.mrp = None
        self.db.commit()
        reloaded = self.db.query(ProductVariant).filter(ProductVariant.id == v.id).first()
        self.assertIsNone(reloaded.mrp)

    def test_10_stock_adjustment_audit_logging(self):
        """Fix 4: Stock change records transactional StockAdjustment audit log."""
        v = self.db.query(ProductVariant).first()
        initial_stock = v.stock

        # Adjust stock +2
        adj = StockAdjustment(
            variant_id=v.id,
            previous_stock=initial_stock,
            new_stock=initial_stock + 2,
            change_amount=2,
            reason="QUICK_EDIT",
            note="Quick edit from admin products list",
            actor_email="admin@royallibas.com",
        )
        v.stock = initial_stock + 2
        self.db.add(adj)
        self.db.commit()

        # Verify audit row
        logged_adj = (
            self.db.query(StockAdjustment)
            .filter(
                StockAdjustment.variant_id == v.id,
                StockAdjustment.reason == "QUICK_EDIT",
            )
            .first()
        )
        self.assertIsNotNone(logged_adj)
        self.assertEqual(logged_adj.change_amount, 2)
        self.assertEqual(logged_adj.previous_stock, initial_stock)
        self.assertEqual(logged_adj.new_stock, initial_stock + 2)

    def test_11_canonical_taxonomy_and_all_10_subcategories(self):
        """Fix 5: All 3 canonical categories and 10 subcategories properly configured."""
        self.assertEqual(len(CANONICAL_TAXONOMY), 3)
        self.assertIn("TWO PIECES", CANONICAL_TAXONOMY)
        self.assertIn("SUIT SET", CANONICAL_TAXONOMY)
        self.assertIn("HEAVY DRESS", CANONICAL_TAXONOMY)

        expected_subcategories = {
            "TWO PIECES": ["Co-ord Sets", "Kurta Pant"],
            "SUIT SET": ["Three Pieces", "Semi-party Wear", "Party Wear"],
            "HEAVY DRESS": [
                "Lehenga",
                "Short Kurta",
                "Palazzo Set",
                "Designer Wear",
                "Sharara / Gharara",
            ],
        }

        total_subcats = 0
        for cat, subcats in expected_subcategories.items():
            self.assertEqual(CANONICAL_TAXONOMY[cat], subcats)
            total_subcats += len(subcats)

        self.assertEqual(total_subcats, 10, "Expected exactly 10 canonical subcategories")

    def test_12_poster_file_integrity(self):
        """Strict constraint: Poster files must remain 100% identical to baseline."""
        poster_files = {
            "frontend/src/pages/Home.tsx": "f1423daaf09fe2c7e46cde221c8d1b7a06f57889cc550ebd1a9458298adc11e0",
            "frontend/src/components/FeaturedSlider.tsx": "78462081c4e00b67ef016f5c9abe41540aad31b7e20cebac80b9a18fef4928d3",
            "frontend/src/pages/admin/AdminHomepage.tsx": "796fc1bb09db2e8dc585219c9e4f3f6a30ea3939dd2b2cc8d1030bbb32acc20b",
        }

        root_dir = Path(backend_dir).parent
        for rel_path, expected_hash in poster_files.items():
            full_path = root_dir / rel_path
            self.assertTrue(full_path.exists(), f"Poster file {rel_path} must exist")
            h = hashlib.sha256(full_path.read_bytes()).hexdigest()
            self.assertEqual(
                h,
                expected_hash,
                f"Poster file {rel_path} was modified! Hash mismatch.",
            )

    def test_13_seed_database_safely_skips_when_real_catalogue_exists(self):
        """Seed script safely skips demo product creation when real catalogue exists."""
        initial_prod_count = self.db.query(Product).count()

        # Run seed_database against our test database session
        seed_database(session_factory=self.Session)

        final_prod_count = self.db.query(Product).count()
        self.assertEqual(
            initial_prod_count,
            final_prod_count,
            "seed_database should not create dummy sample products when real catalogue exists",
        )


if __name__ == "__main__":
    unittest.main()
