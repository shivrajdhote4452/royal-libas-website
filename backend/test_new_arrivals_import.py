"""Unit and regression tests for Royal Libas New Arrivals Import.

Validates:
- Folder scanning and canonical taxonomy mapping.
- Video + cover image pair attached to a single product with correct sort_order.
- Execution on isolated test database copy with mock Cloudinary upload.
- Preservation of existing real products, variants, orders, and legacy archived products.
- Idempotency on repeated execution and preservation of owner edits.
"""

import os
import shutil
import sys
import unittest
from decimal import Decimal

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    Base,
    Collection,
    MediaAsset,
    MediaFolder,
    Order,
    OrderItem,
    Product,
    ProductImage,
    ProductVariant,
    StockAdjustment,
)
from import_new_arrivals import (
    DEFAULT_SOURCE_DIR,
    import_new_arrivals,
    scan_new_arrivals,
)


class TestNewArrivalsImport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_dir = DEFAULT_SOURCE_DIR
        cls.test_db_path = os.path.abspath("backend/test_new_arrivals_isolated.db")
        cls.test_manifest_path = os.path.abspath("backend/test_new_arrivals_manifest.json")
        cls.pre_import_backup_path = os.path.abspath("backend/royal_libas.db.backup_new_arrivals_20261031_221249")
        cls.live_db_path = os.path.abspath("backend/royal_libas.db")

    def setUp(self):
        # Create fresh isolated database copy from pre-import backup (or live db if no backup)
        source_base = self.pre_import_backup_path if os.path.exists(self.pre_import_backup_path) else self.live_db_path
        if os.path.exists(source_base):
            shutil.copy2(source_base, self.test_db_path)
        if os.path.exists(self.test_manifest_path):
            os.remove(self.test_manifest_path)

        self.engine = create_engine(f"sqlite:///{self.test_db_path}")
        self.Session = sessionmaker(bind=self.engine)

    def tearDown(self):
        if os.path.exists(self.test_db_path):
            try:
                os.remove(self.test_db_path)
            except Exception:
                pass
        if os.path.exists(self.test_manifest_path):
            try:
                os.remove(self.test_manifest_path)
            except Exception:
                pass

    def test_01_discovery_and_taxonomy(self):
        """Verify Cleaned_Products discovery, folder grouping, and file detection."""
        designs = scan_new_arrivals(self.source_dir)
        self.assertEqual(len(designs), 10, f"Expected 10 designs, got {len(designs)}")

        total_files = sum(len(d["files"]) for d in designs)
        self.assertEqual(total_files, 11, f"Expected 11 media files, got {total_files}")

        # Check distribution by main group
        cat_counts = {}
        for d in designs:
            cat_counts[d["category"]] = cat_counts.get(d["category"], 0) + 1

        self.assertEqual(cat_counts.get("TWO PIECES"), 4)
        self.assertEqual(cat_counts.get("SUIT SET"), 3)
        self.assertEqual(cat_counts.get("HEAVY DRESS"), 3)

        # Verify Naqsh Ivory Mocha Three-Piece Suit has 1 video and 1 cover image
        naqsh = next((d for d in designs if "Naqsh" in d["design_name"]), None)
        self.assertIsNotNone(naqsh)
        self.assertEqual(len(naqsh["files"]), 2)
        # First file must be cover image
        self.assertTrue(naqsh["files"][0]["is_cover"])
        self.assertEqual(naqsh["files"][0]["resource_type"], "image")
        # Second file must be video
        self.assertEqual(naqsh["files"][1]["resource_type"], "video")

    def test_02_isolated_import_execution(self):
        """Execute full import on isolated DB and verify products, variants, assets, and orders."""
        db = self.Session()
        initial_prods = db.query(Product).count()
        initial_orders = db.query(Order).count()
        initial_order_items = db.query(OrderItem).count()

        summary = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.test_manifest_path,
            db_session=db,
        )

        self.assertEqual(summary["products_created"], 10)
        self.assertEqual(summary["variants_created"], 50)
        self.assertEqual(summary["media_assets_uploaded"], 11)
        self.assertEqual(summary["stock_adjustments_recorded"], 50)

        # Verify DB counts
        real_prods = db.query(Product).filter(Product.status != "ARCHIVED").all()
        self.assertEqual(len(real_prods), 32, f"Expected 32 real products, got {len(real_prods)}")

        archived_prods = db.query(Product).filter(Product.status == "ARCHIVED").all()
        self.assertEqual(len(archived_prods), 18, "Legacy archived products must be preserved")

        # Category distribution of real products
        dist = {}
        for p in real_prods:
            dist[p.category] = dist.get(p.category, 0) + 1
        self.assertEqual(dist.get("TWO PIECES"), 4)
        self.assertEqual(dist.get("SUIT SET"), 14)
        self.assertEqual(dist.get("HEAVY DRESS"), 14)

        # Check all new products are DRAFT and is_active=False
        new_prods = db.query(Product).filter(Product.id > initial_prods).all()
        self.assertEqual(len(new_prods), 10)
        for np in new_prods:
            self.assertEqual(np.status, "DRAFT")
            self.assertFalse(np.is_active)
            self.assertIsNone(np.description)
            self.assertIsNone(np.fabric)
            self.assertIsNone(np.care)
            self.assertIsNone(np.fit)

            # Check variants
            variants = db.query(ProductVariant).filter(ProductVariant.product_id == np.id).all()
            self.assertEqual(len(variants), 5)
            for v in variants:
                self.assertEqual(v.selling_price, Decimal("1999.00"))
                self.assertEqual(v.mrp, Decimal("2499.00"))
                self.assertEqual(v.stock, 5)
                self.assertTrue(v.sku.startswith("RL-"))

            # Check collection membership
            col_slugs = [c.slug for c in np.collections]
            if np.category == "TWO PIECES":
                self.assertIn("two-pieces", col_slugs)
            elif np.category == "SUIT SET":
                self.assertIn("suit-set", col_slugs)
            elif np.category == "HEAVY DRESS":
                self.assertIn("heavy-dress", col_slugs)

        # Verify Naqsh Ivory Mocha Three-Piece Suit media attachment order
        naqsh_prod = db.query(Product).filter(Product.name.ilike("%Naqsh%")).first()
        self.assertIsNotNone(naqsh_prod)
        images = (
            db.query(ProductImage)
            .filter(ProductImage.product_id == naqsh_prod.id)
            .order_by(ProductImage.sort_order.asc())
            .all()
        )
        self.assertEqual(len(images), 2)
        self.assertEqual(images[0].sort_order, 1)
        self.assertEqual(images[0].resource_type, "image")
        cover_asset = db.query(MediaAsset).filter(MediaAsset.id == images[0].media_asset_id).first()
        self.assertIsNotNone(cover_asset)
        self.assertIn("video-cover", cover_asset.filename)
        self.assertEqual(images[1].sort_order, 2)
        self.assertEqual(images[1].resource_type, "video")
        video_asset = db.query(MediaAsset).filter(MediaAsset.id == images[1].media_asset_id).first()
        self.assertIsNotNone(video_asset)
        self.assertIn(".mp4", video_asset.filename)

        # Verify total variants and stock
        real_variants = (
            db.query(ProductVariant)
            .join(Product)
            .filter(Product.status != "ARCHIVED")
            .all()
        )
        self.assertEqual(len(real_variants), 160)
        total_stock = sum(v.stock for v in real_variants)
        self.assertEqual(total_stock, 800)

        # Verify orders and items intact
        self.assertEqual(db.query(Order).count(), initial_orders)
        self.assertEqual(db.query(OrderItem).count(), initial_order_items)
        db.close()

    def test_03_idempotency_and_owner_edit_preservation(self):
        """Verify re-running import creates 0 duplicates and preserves owner edits."""
        db = self.Session()
        # 1st run
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.test_manifest_path,
            db_session=db,
        )

        # Owner edits one product
        test_prod = db.query(Product).filter(Product.name.ilike("%Raag Wine%")).first()
        test_prod.name = "Raag Wine Purple Jacket Gown (Owner Edited)"
        test_prod.status = "PUBLISHED"
        test_prod.is_active = True
        test_prod.fabric = "Georgette with Zari"
        db.commit()

        # 2nd run
        summary2 = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.test_manifest_path,
            db_session=db,
        )

        self.assertEqual(summary2["products_created"], 0)
        self.assertEqual(summary2["products_reused"], 10)
        self.assertEqual(summary2["variants_created"], 0)
        self.assertEqual(summary2["media_assets_uploaded"], 0)

        # Check owner edit preserved
        edited_prod = db.query(Product).filter(Product.id == test_prod.id).first()
        self.assertEqual(edited_prod.name, "Raag Wine Purple Jacket Gown (Owner Edited)")
        self.assertEqual(edited_prod.status, "PUBLISHED")
        self.assertTrue(edited_prod.is_active)
        self.assertEqual(edited_prod.fabric, "Georgette with Zari")

        # Counts must still be exactly 32 and 160
        real_prods = db.query(Product).filter(Product.status != "ARCHIVED").count()
        self.assertEqual(real_prods, 32)
        real_vars = db.query(ProductVariant).join(Product).filter(Product.status != "ARCHIVED").count()
        self.assertEqual(real_vars, 160)
        db.close()


if __name__ == "__main__":
    unittest.main()
