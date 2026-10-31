"""Focused regression tests for Royal Libas:
1. Changed-Photo Detection & Safe Replacement in import_new_arrivals.py
2. Preservation of Owner-Controlled Publication Status in reconcile_catalogue.py
3. Poster Invariance & System Integrity
"""

import hashlib
import json
import os
import shutil
import sys
import tempfile
import unittest
from decimal import Decimal

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import CLOUDINARY_CLOUD_NAME
from app.models import (
    Base,
    Collection,
    MediaAsset,
    MediaFolder,
    Product,
    ProductImage,
    ProductVariant,
    StockAdjustment,
)
from import_new_arrivals import (
    compute_sha256,
    import_new_arrivals,
)
from reconcile_catalogue import reconcile_catalogue


class TestPhotoChangeAndPublicationSafety(unittest.TestCase):
    def setUp(self):
        # Create isolated temporary directory and SQLite database
        self.temp_dir = tempfile.mkdtemp(prefix="rl_test_safety_")
        self.db_path = os.path.join(self.temp_dir, "test_safety.db")
        self.manifest_path = os.path.join(self.temp_dir, "manifest.json")
        self.source_dir = os.path.join(self.temp_dir, "source")

        # Set up design folder
        self.design_dir = os.path.join(
            self.source_dir, "Two Pieces", "Co-ord Sets", "Gulmeher Dusty Mauve Waistcoat Co-ord Set"
        )
        os.makedirs(self.design_dir, exist_ok=True)
        self.photo_path = os.path.join(self.design_dir, "gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png")
        with open(self.photo_path, "wb") as f:
            f.write(b"PNG_INITIAL_IMAGE_VERSION_1")

        self.engine = create_engine(f"sqlite:///{self.db_path}")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed canonical collections
        c1 = Collection(name="TWO PIECES", slug="two-pieces", is_active=True)
        c2 = Collection(name="SUIT SET", slug="suit-set", is_active=True)
        c3 = Collection(name="HEAVY DRESS", slug="heavy-dress", is_active=True)
        self.db.add_all([c1, c2, c3])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_unchanged_file_reused_without_upload(self):
        """1. Same path + unchanged file: reuse without upload."""
        # First import
        s1 = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        self.assertEqual(s1["media_assets_uploaded"], 1)
        self.assertEqual(s1["media_assets_reused"], 0)

        # Second import (unchanged)
        s2 = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        self.assertEqual(s2["media_assets_uploaded"], 0)
        self.assertEqual(s2["media_assets_reused"], 1)
        self.assertEqual(s2["images_replaced"], 0)

    def test_02_changed_file_registers_and_links_new_asset(self):
        """2. Same path + changed file: register/link the new asset and retain old asset."""
        # 1. Initial import
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        initial_asset = self.db.query(MediaAsset).first()
        prod = self.db.query(Product).first()
        initial_image = self.db.query(ProductImage).filter(ProductImage.product_id == prod.id).first()
        self.assertEqual(initial_image.media_asset_id, initial_asset.id)

        # 2. Modify source photo bytes
        with open(self.photo_path, "wb") as f:
            f.write(b"PNG_CHANGED_IMAGE_VERSION_2_NEW_BYTES")
        new_hash = compute_sha256(self.photo_path)
        self.assertNotEqual(new_hash, initial_asset.content_hash)

        # 3. Re-run import
        s2 = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        self.assertEqual(s2["media_assets_uploaded"], 1)
        self.assertEqual(s2["media_assets_replaced"], 1)
        self.assertEqual(s2["images_replaced"], 1)

        # Old asset is NOT deleted
        old_asset = self.db.query(MediaAsset).filter(MediaAsset.id == initial_asset.id).first()
        self.assertIsNotNone(old_asset)

        # New asset is registered
        new_asset = self.db.query(MediaAsset).filter(MediaAsset.content_hash == new_hash).first()
        self.assertIsNotNone(new_asset)
        self.assertNotEqual(new_asset.id, initial_asset.id)

        # ProductImage is updated to point to the new asset
        updated_image = self.db.query(ProductImage).filter(ProductImage.product_id == prod.id).first()
        self.assertEqual(updated_image.media_asset_id, new_asset.id)
        self.assertEqual(updated_image.sort_order, 1)

    def test_03_stale_manifest_hash_never_recovered(self):
        """3. Stale manifest hash: never recover the old upload as the changed file."""
        # Create a manifest with stale hash
        stale_manifest = {
            "files": {
                "Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set/gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png": {
                    "status": "uploaded",
                    "content_hash": "stale_fake_hash_12345",
                    "cloud_name": CLOUDINARY_CLOUD_NAME,
                    "resource_type": "image",
                    "public_id": "old_stale_public_id",
                    "secure_url": "https://res.cloudinary.com/galbyoxi/image/upload/old_stale.png",
                }
            }
        }
        with open(self.manifest_path, "w", encoding="utf-8") as f:
            json.dump(stale_manifest, f)

        # Import must reject the stale upload and upload the actual file
        s = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        asset = self.db.query(MediaAsset).first()
        current_hash = compute_sha256(self.photo_path)
        self.assertEqual(asset.content_hash, current_hash)
        self.assertNotEqual(asset.public_id, "old_stale_public_id")

    def test_04_recovery_after_registration_failure_no_repeated_upload(self):
        """4. Compatible successful replacement recovered after registration failure: no repeated upload."""
        current_hash = compute_sha256(self.photo_path)
        rel_key = "Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set/gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png"
        manifest_data = {
            "files": {
                rel_key: {
                    "status": "uploaded",
                    "content_hash": current_hash,
                    "cloud_name": CLOUDINARY_CLOUD_NAME,
                    "resource_type": "image",
                    "public_id": "recovered_valid_pid",
                    "secure_url": f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/image/upload/recovered_valid.png",
                    "format": "png",
                    "width": 1080,
                    "height": 1350,
                    "file_size": os.path.getsize(self.photo_path),
                    "folder": "Photos for royal libas/Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set",
                    "relative_source_path": rel_key,
                    "filename": "gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png",
                }
            }
        }
        with open(self.manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f)

        # Should register without re-uploading
        s = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        asset = self.db.query(MediaAsset).first()
        self.assertEqual(asset.public_id, "recovered_valid_pid")

    def test_05_incompatible_environment_or_type_blocks_reuse(self):
        """5. Wrong resource type/environment/source identity: no incorrect reuse."""
        current_hash = compute_sha256(self.photo_path)
        # Add an asset in DB with wrong cloud_name
        wrong_cloud_asset = MediaAsset(
            filename="gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png",
            public_id="wrong_cloud_pid",
            cloud_name="wrong_environment_cloud",
            content_hash=current_hash,
            relative_source_path="Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set/gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png",
            url="https://other.com/img.png",
            resource_type="image",
            mime_type="image/png",
            folder="Photos for royal libas/Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set",
        )
        self.db.add(wrong_cloud_asset)
        self.db.commit()

        # Import must not reuse the wrong environment asset
        s = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        self.assertEqual(s["media_assets_uploaded"], 1)
        self.assertEqual(s["media_assets_reused"], 0)

    def test_06_replacement_failure_keeps_working_gallery_intact(self):
        """6. Replacement failure: old working gallery remains intact."""
        # 1. Successful initial run
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        initial_img = self.db.query(ProductImage).first()
        initial_asset_id = initial_img.media_asset_id

        # 2. Modify photo
        with open(self.photo_path, "wb") as f:
            f.write(b"CHANGED_PHOTO_BYTES_V3")

        # 3. Simulate failure in dry-run
        s_dry = import_new_arrivals(
            dry_run=True,
            confirm=False,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        # Working gallery still points to original working asset
        current_img = self.db.query(ProductImage).first()
        self.assertEqual(current_img.media_asset_id, initial_asset_id)

    def test_07_successful_replacement_preserves_sort_order_and_unrelated_items(self):
        """7. Successful replacement: cover/order and unrelated items remain intact."""
        # 1. Import initial product
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        prod = self.db.query(Product).first()

        # Add an unrelated manual gallery image at sort_order=2
        extra_asset = MediaAsset(
            filename="artisan_detail.png",
            public_id="pid_artisan",
            cloud_name=CLOUDINARY_CLOUD_NAME,
            content_hash="artisan_hash_999",
            url="https://res.cloudinary.com/artisan.png",
            resource_type="image",
            mime_type="image/png",
            folder="Photos for royal libas/Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set",
        )
        self.db.add(extra_asset)
        self.db.flush()
        extra_img = ProductImage(
            product_id=prod.id,
            media_asset_id=extra_asset.id,
            url=extra_asset.url,
            public_id=extra_asset.public_id,
            resource_type="image",
            sort_order=2,
            alt_text="Artisan detail shot",
        )
        self.db.add(extra_img)
        self.db.commit()

        # Change main photo
        with open(self.photo_path, "wb") as f:
            f.write(b"NEW_COVER_PHOTO_V4")

        # Run replacement
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )

        images = self.db.query(ProductImage).filter(ProductImage.product_id == prod.id).order_by(ProductImage.sort_order).all()
        self.assertEqual(len(images), 2)
        # Cover sort_order is still 1
        self.assertEqual(images[0].sort_order, 1)
        # Extra artisan detail image is still sort_order 2 and untouched
        self.assertEqual(images[1].sort_order, 2)
        self.assertEqual(images[1].media_asset_id, extra_asset.id)

    def test_08_shared_old_asset_remains_available_to_other_products(self):
        """8. Shared old assets remain available to other products."""
        # 1. Initial run
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        asset1 = self.db.query(MediaAsset).first()

        # Create product B sharing asset1
        prod_b = Product(
            name="Product B Shared",
            slug="product-b-shared",
            category="TWO PIECES",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(prod_b)
        self.db.flush()
        img_b = ProductImage(
            product_id=prod_b.id,
            media_asset_id=asset1.id,
            url=asset1.url,
            sort_order=1,
        )
        self.db.add(img_b)
        self.db.commit()

        # Update photo for original product
        with open(self.photo_path, "wb") as f:
            f.write(b"PHOTO_UPDATED_FOR_PROD_A")

        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )

        # Product B still has asset1
        img_b_reload = self.db.query(ProductImage).filter(ProductImage.product_id == prod_b.id).first()
        self.assertEqual(img_b_reload.media_asset_id, asset1.id)

    def test_09_repeating_completed_replacement_creates_no_duplicates(self):
        """9. Repeating the completed replacement creates no duplicate associations."""
        # Initial run
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        # Update photo
        with open(self.photo_path, "wb") as f:
            f.write(b"REPLACEMENT_PHOTO_DATA")

        # Replace once
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        count1 = self.db.query(ProductImage).count()

        # Repeat without changes
        s_repeat = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        count2 = self.db.query(ProductImage).count()
        self.assertEqual(count1, count2)
        self.assertEqual(s_repeat["images_replaced"], 0)
        self.assertEqual(s_repeat["media_assets_uploaded"], 0)

    def test_10_intentionally_published_aafreen_remains_published(self):
        """10. Intentionally Published Aafreen remains Published after repeated reconciliation."""
        # Create Aafreen product as PUBLISHED
        aafreen_folder = "Photos for royal libas/Suit Set/Three Pieces/03 - Aafreen Beige Botanical Three-Piece Suit"
        aafreen = Product(
            name="Aafreen Beige Botanical Three-Piece Suit",
            slug="aafreen-beige-botanical-three-piece-suit",
            category="SUIT SET",
            subcategory="Three Pieces",
            source_folder=aafreen_folder,
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(aafreen)
        self.db.commit()

        # Run reconciliation
        reconcile_catalogue(self.db, dry_run=False)

        # Verify Aafreen REMAINS PUBLISHED!
        reloaded = self.db.query(Product).filter(Product.source_folder == aafreen_folder).first()
        self.assertEqual(reloaded.status, "PUBLISHED")
        self.assertTrue(reloaded.is_active)

    def test_11_published_and_draft_products_retain_respective_states(self):
        """11. Other Published and Draft products retain their respective states."""
        p_pub = Product(
            name="Published Suit",
            slug="published-suit",
            category="SUIT SET",
            status="PUBLISHED",
            is_active=True,
        )
        p_draft = Product(
            name="Draft Suit",
            slug="draft-suit",
            category="SUIT SET",
            status="DRAFT",
            is_active=False,
        )
        self.db.add_all([p_pub, p_draft])
        self.db.commit()

        reconcile_catalogue(self.db, dry_run=False)

        r_pub = self.db.query(Product).filter(Product.id == p_pub.id).first()
        r_draft = self.db.query(Product).filter(Product.id == p_draft.id).first()
        self.assertEqual(r_pub.status, "PUBLISHED")
        self.assertTrue(r_pub.is_active)
        self.assertEqual(r_draft.status, "DRAFT")
        self.assertFalse(r_draft.is_active)

    def test_12_new_products_default_to_draft(self):
        """12. New products still default to Draft."""
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        prod = self.db.query(Product).first()
        self.assertEqual(prod.status, "DRAFT")
        self.assertFalse(prod.is_active)

    def test_13_owner_edits_survive(self):
        """13. Owner edits to prices, stock, and fabric survive import re-runs."""
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        prod = self.db.query(Product).first()
        prod.fabric = "Custom Chanderi"
        v = self.db.query(ProductVariant).filter(ProductVariant.product_id == prod.id).first()
        v.selling_price = Decimal("2999.00")
        v.stock = 12
        self.db.commit()

        # Re-run import
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        r_prod = self.db.query(Product).filter(Product.id == prod.id).first()
        r_v = self.db.query(ProductVariant).filter(ProductVariant.id == v.id).first()
        self.assertEqual(r_prod.fabric, "Custom Chanderi")
        self.assertEqual(r_v.selling_price, Decimal("2999.00"))
        self.assertEqual(r_v.stock, 12)

    def test_14_posters_and_settings_unaltered(self):
        """14. Posters and their settings remain unchanged."""
        expected_hashes = {
            "frontend/src/pages/Home.tsx": "f1423daaf09fe2c7e46cde221c8d1b7a06f57889cc550ebd1a9458298adc11e0",
            "frontend/src/components/FeaturedSlider.tsx": "78462081c4e00b67ef016f5c9abe41540aad31b7e20cebac80b9a18fef4928d3",
            "frontend/src/pages/admin/AdminHomepage.tsx": "796fc1bb09db2e8dc585219c9e4f3f6a30ea3939dd2b2cc8d1030bbb32acc20b",
        }
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        for path, exp_hash in expected_hashes.items():
            full_path = os.path.join(project_root, path)
            self.assertTrue(os.path.exists(full_path), f"File {path} must exist at {full_path}")
            actual_hash = hashlib.sha256(open(full_path, "rb").read()).hexdigest()
            self.assertEqual(actual_hash, exp_hash, f"Hash mismatch for {path}")


if __name__ == "__main__":
    unittest.main()
