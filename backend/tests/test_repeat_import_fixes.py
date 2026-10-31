"""Comprehensive regression tests for Royal Libas repeat-import fixes:
1. Preserve owner-selected product images, custom covers, gallery order, and owner removals.
2. Preserve owner-edited category, subcategory, and collections on routine reruns.
3. Validate manifest recovery against intended source identity, folder, and environment.
4. Two-phase commit safety for manifest state.
5. Idempotency without duplicate products or associations.
6. Aafreen publication preservation.
"""

import copy
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
    normalize_path,
    validate_manifest_recovery_entry,
)
from reconcile_catalogue import reconcile_catalogue


class TestRepeatImportFixes(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="rl_repeat_fixes_")
        self.db_path = os.path.join(self.temp_dir, "test_repeat.db")
        self.manifest_path = os.path.join(self.temp_dir, "manifest.json")
        self.source_dir = os.path.join(self.temp_dir, "source")

        # Set up a canonical design folder
        self.design_dir = os.path.join(
            self.source_dir, "Two Pieces", "Co-ord Sets", "Gulmeher Dusty Mauve Waistcoat Co-ord Set"
        )
        os.makedirs(self.design_dir, exist_ok=True)
        self.photo_filename = "gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png"
        self.photo_path = os.path.join(self.design_dir, self.photo_filename)
        with open(self.photo_path, "wb") as f:
            f.write(b"PNG_INITIAL_SOURCE_BYTES_FIXES_V1")

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

    def test_01_unchanged_source_preserves_owner_selected_custom_cover_and_gallery_order(self):
        """1. Unchanged source preserves an owner-selected custom cover and gallery order."""
        # Step A: Initial import creates product and links imported asset
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        prod = self.db.query(Product).first()
        imported_img = self.db.query(ProductImage).filter(ProductImage.product_id == prod.id).first()
        self.assertEqual(imported_img.sort_order, 1)

        # Step B: Owner replaces cover with a custom Media Library asset
        custom_asset = MediaAsset(
            filename="owner-custom-cover.jpg",
            display_name="Owner Custom Cover",
            public_id="custom_cover_pid_123",
            cloud_name=CLOUDINARY_CLOUD_NAME,
            delivery_type="upload",
            content_hash="custom_hash_9999",
            relative_source_path="Custom/owner-custom-cover.jpg",
            url=f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/image/upload/custom_cover_pid_123.jpg",
            secure_url=f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/image/upload/custom_cover_pid_123.jpg",
            resource_type="image",
            format="jpg",
            mime_type="image/jpeg",
            folder="Photos for royal libas/Custom",
        )
        self.db.add(custom_asset)
        self.db.flush()

        # Owner moves imported photo to slot 2 and sets custom asset at slot 1 (cover)
        imported_img.sort_order = 2
        custom_img = ProductImage(
            product_id=prod.id,
            media_asset_id=custom_asset.id,
            url=custom_asset.secure_url,
            public_id=custom_asset.public_id,
            resource_type="image",
            sort_order=1,
            alt_text="Custom Cover Selected By Owner",
        )
        self.db.add(custom_img)
        self.db.commit()

        # Step C: Re-run import with unchanged source photos
        s2 = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        self.assertEqual(s2["images_replaced"], 0)

        # Step D: Verify custom cover and gallery order are strictly preserved
        images = (
            self.db.query(ProductImage)
            .filter(ProductImage.product_id == prod.id)
            .order_by(ProductImage.sort_order.asc())
            .all()
        )
        self.assertEqual(len(images), 2)
        # Slot 1 is STILL the owner's custom cover
        self.assertEqual(images[0].sort_order, 1)
        self.assertEqual(images[0].media_asset_id, custom_asset.id)
        # Slot 2 is the imported photo
        self.assertEqual(images[1].sort_order, 2)
        self.assertEqual(images[1].media_asset_id, imported_img.media_asset_id)

    def test_02_owner_added_media_and_intentionally_removed_associations_survive_reruns(self):
        """2. Owner-added media and intentionally removed associations survive reruns."""
        # Initial import
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        prod = self.db.query(Product).first()

        # Owner adds a custom video to the product
        owner_video_asset = MediaAsset(
            filename="product_story.mp4",
            display_name="Product Story Video",
            public_id="custom_video_pid_456",
            cloud_name=CLOUDINARY_CLOUD_NAME,
            delivery_type="upload",
            content_hash="video_hash_8888",
            relative_source_path="Custom/product_story.mp4",
            url=f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/video/upload/custom_video_pid_456.mp4",
            secure_url=f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/video/upload/custom_video_pid_456.mp4",
            resource_type="video",
            format="mp4",
            mime_type="video/mp4",
            folder="Photos for royal libas/Custom",
        )
        self.db.add(owner_video_asset)
        self.db.flush()

        owner_video_img = ProductImage(
            product_id=prod.id,
            media_asset_id=owner_video_asset.id,
            url=owner_video_asset.secure_url,
            public_id=owner_video_asset.public_id,
            resource_type="video",
            sort_order=2,
            alt_text="Owner Added Video",
        )
        self.db.add(owner_video_img)

        # Owner intentionally removes the original imported image association
        imported_img = self.db.query(ProductImage).filter(ProductImage.product_id == prod.id, ProductImage.sort_order == 1).first()
        self.db.delete(imported_img)
        self.db.commit()

        # Re-run import
        s2 = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        self.assertEqual(s2["images_attached"], 0)
        self.assertEqual(s2["images_replaced"], 0)

        # Verify owner-added media survives and deleted association is NOT restored
        images = self.db.query(ProductImage).filter(ProductImage.product_id == prod.id).all()
        self.assertEqual(len(images), 1)
        self.assertEqual(images[0].media_asset_id, owner_video_asset.id)
        self.assertEqual(images[0].resource_type, "video")

    def test_03_genuinely_changed_source_updates_importer_managed_association(self):
        """3. A genuinely changed source updates its importer-managed association."""
        # Initial import
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        prod = self.db.query(Product).first()
        old_asset = self.db.query(MediaAsset).first()
        img = self.db.query(ProductImage).filter(ProductImage.product_id == prod.id).first()
        self.assertEqual(img.media_asset_id, old_asset.id)

        # Modify source file
        with open(self.photo_path, "wb") as f:
            f.write(b"PNG_CHANGED_BYTES_FOR_TEST_03")
        new_hash = compute_sha256(self.photo_path)
        self.assertNotEqual(new_hash, old_asset.content_hash)

        # Re-run import
        s2 = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        self.assertEqual(s2["images_replaced"], 1)

        # Importer-managed association updated to new asset while preserving sort_order
        updated_img = self.db.query(ProductImage).filter(ProductImage.product_id == prod.id).first()
        self.assertNotEqual(updated_img.media_asset_id, old_asset.id)
        self.assertEqual(updated_img.sort_order, 1)

        new_asset = self.db.query(MediaAsset).filter(MediaAsset.id == updated_img.media_asset_id).first()
        self.assertEqual(new_asset.content_hash, new_hash)

        # Old asset still exists in library
        old_still_exists = self.db.query(MediaAsset).filter(MediaAsset.id == old_asset.id).first()
        self.assertIsNotNone(old_still_exists)

    def test_04_shared_assets_and_unrelated_product_associations_remain_intact(self):
        """4. Shared assets and unrelated product associations remain intact when one source changes."""
        # Initial import
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        imported_asset = self.db.query(MediaAsset).first()

        # Create an unrelated second product that shares imported_asset
        prod2 = Product(
            name="Unrelated Curated Look",
            slug="unrelated-curated-look",
            category="TWO PIECES",
            subcategory="Co-ord Sets",
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(prod2)
        self.db.flush()

        prod2_img = ProductImage(
            product_id=prod2.id,
            media_asset_id=imported_asset.id,
            url=imported_asset.secure_url,
            public_id=imported_asset.public_id,
            resource_type="image",
            sort_order=1,
            alt_text="Look 2",
        )
        self.db.add(prod2_img)
        self.db.commit()

        # Now change source file for the first product
        with open(self.photo_path, "wb") as f:
            f.write(b"PNG_CHANGED_BYTES_FOR_PRODUCT_1_ONLY")

        # Re-run import
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )

        # Product 2's association is 100% untouched and still points to imported_asset
        prod2_img_after = self.db.query(ProductImage).filter(ProductImage.product_id == prod2.id).first()
        self.assertEqual(prod2_img_after.media_asset_id, imported_asset.id)
        self.assertEqual(prod2_img_after.public_id, imported_asset.public_id)

    def test_05_owner_edited_taxonomy_survives_routine_rerun_and_opt_in_reconciles(self):
        """5. Owner-edited category/subcategory/collections survive routine rerun; opt-in reconciles."""
        # Initial import (created under TWO PIECES / Co-ord Sets)
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        prod = self.db.query(Product).first()
        self.assertEqual(prod.category, "TWO PIECES")
        self.assertEqual(prod.subcategory, "Co-ord Sets")
        self.assertIn("two-pieces", [c.slug for c in prod.collections])

        # Owner re-classifies product in boutique admin: moves to SUIT SET / Semi-party Wear
        prod.category = "SUIT SET"
        prod.subcategory = "Semi-party Wear"
        suit_col = self.db.query(Collection).filter(Collection.slug == "suit-set").first()
        two_col = self.db.query(Collection).filter(Collection.slug == "two-pieces").first()
        prod.collections.remove(two_col)
        prod.collections.append(suit_col)
        self.db.commit()

        # Routine rerun (reconcile_taxonomy=False by default)
        s_routine = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
            reconcile_taxonomy=False,
        )

        # Verify owner taxonomy and collection are PRESERVED
        self.db.refresh(prod)
        self.assertEqual(prod.category, "SUIT SET")
        self.assertEqual(prod.subcategory, "Semi-party Wear")
        self.assertIn("suit-set", [c.slug for c in prod.collections])
        self.assertNotIn("two-pieces", [c.slug for c in prod.collections])

        # Opt-in rerun (reconcile_taxonomy=True)
        s_opt_in = import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
            reconcile_taxonomy=True,
        )

        # Verify folder taxonomy is restored under opt-in
        self.db.refresh(prod)
        self.assertEqual(prod.category, "TWO PIECES")
        self.assertEqual(prod.subcategory, "Co-ord Sets")
        self.assertIn("two-pieces", [c.slug for c in prod.collections])
        self.assertNotIn("suit-set", [c.slug for c in prod.collections])

    def test_06_new_products_receive_correct_initial_folder_classification(self):
        """6. New products receive the correct initial folder classification."""
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        prod = self.db.query(Product).first()
        self.assertEqual(prod.category, "TWO PIECES")
        self.assertEqual(prod.subcategory, "Co-ord Sets")
        self.assertEqual(prod.status, "DRAFT")
        self.assertFalse(prod.is_active)
        self.assertIn("two-pieces", [c.slug for c in prod.collections])

    def test_07_wrong_folder_or_wrong_design_manifest_entries_are_rejected(self):
        """7. Wrong-folder or wrong-design manifest entries are rejected."""
        content_hash = compute_sha256(self.photo_path)
        valid_entry = {
            "status": "uploaded",
            "content_hash": content_hash,
            "resource_type": "image",
            "cloud_name": CLOUDINARY_CLOUD_NAME,
            "folder": "Photos for royal libas/Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set",
            "relative_source_path": "Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set/gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png",
            "filename": self.photo_filename,
            "public_id": "test_pid_07",
            "secure_url": f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/image/upload/test_pid_07.png",
        }

        # Case A: Wrong folder (from a completely different design)
        bad_folder_entry = copy.deepcopy(valid_entry)
        bad_folder_entry["folder"] = "Photos for royal libas/Suit Set/Three Pieces/Different Design"
        is_val, reason = validate_manifest_recovery_entry(
            entry=bad_folder_entry,
            current_hash=content_hash,
            expected_resource_type="image",
            target_folder="Photos for royal libas/Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set",
            expected_rel_path="Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set/gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png",
            expected_filename=self.photo_filename,
            expected_cloud_name=CLOUDINARY_CLOUD_NAME,
        )
        self.assertFalse(is_val)
        self.assertIn("Folder mismatch", reason)

        # Case B: Wrong relative source path
        bad_rel_entry = copy.deepcopy(valid_entry)
        bad_rel_entry["relative_source_path"] = "Two Pieces/Co-ord Sets/Other/file.png"
        is_val2, reason2 = validate_manifest_recovery_entry(
            entry=bad_rel_entry,
            current_hash=content_hash,
            expected_resource_type="image",
            target_folder="Photos for royal libas/Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set",
            expected_rel_path="Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set/gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png",
            expected_filename=self.photo_filename,
            expected_cloud_name=CLOUDINARY_CLOUD_NAME,
        )
        self.assertFalse(is_val2)
        self.assertIn("Relative path mismatch", reason2)

    def test_08_correct_recovery_succeeds(self):
        """8. Correct recovery succeeds when all identity metadata matches."""
        content_hash = compute_sha256(self.photo_path)
        valid_entry = {
            "status": "uploaded",
            "content_hash": content_hash,
            "resource_type": "image",
            "cloud_name": CLOUDINARY_CLOUD_NAME,
            "folder": "Photos for royal libas/Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set",
            "relative_source_path": "Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set/gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png",
            "filename": self.photo_filename,
            "public_id": "test_pid_08",
            "secure_url": f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/image/upload/test_pid_08.png",
        }

        is_val, reason = validate_manifest_recovery_entry(
            entry=valid_entry,
            current_hash=content_hash,
            expected_resource_type="image",
            target_folder="Photos for royal libas/Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set",
            expected_rel_path="Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set/gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png",
            expected_filename=self.photo_filename,
            expected_cloud_name=CLOUDINARY_CLOUD_NAME,
        )
        self.assertTrue(is_val)
        self.assertEqual(reason, "Valid recovery entry")

    def test_09_missing_metadata_and_mismatches_are_rejected(self):
        """9. Missing identity metadata and mismatched hash/cloud/type are rejected."""
        content_hash = compute_sha256(self.photo_path)
        base = {
            "status": "uploaded",
            "content_hash": content_hash,
            "resource_type": "image",
            "cloud_name": CLOUDINARY_CLOUD_NAME,
            "folder": "Photos for royal libas/Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set",
            "relative_source_path": "Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set/gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png",
            "filename": self.photo_filename,
            "public_id": "test_pid_09",
            "secure_url": f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/image/upload/test_pid_09.png",
        }

        # Missing public_id
        entry_no_pid = copy.deepcopy(base)
        entry_no_pid["public_id"] = ""
        is_v, r = validate_manifest_recovery_entry(entry_no_pid, content_hash, "image", base["folder"], base["relative_source_path"], base["filename"], CLOUDINARY_CLOUD_NAME)
        self.assertFalse(is_v)
        self.assertIn("public_id", r)

        # Missing delivery URL
        entry_no_url = copy.deepcopy(base)
        entry_no_url["secure_url"] = ""
        entry_no_url["url"] = ""
        is_v, r = validate_manifest_recovery_entry(entry_no_url, content_hash, "image", base["folder"], base["relative_source_path"], base["filename"], CLOUDINARY_CLOUD_NAME)
        self.assertFalse(is_v)
        self.assertIn("delivery URL", r)

        # Cloud mismatch
        entry_bad_cloud = copy.deepcopy(base)
        entry_bad_cloud["cloud_name"] = "unrelated_cloud_env"
        is_v, r = validate_manifest_recovery_entry(entry_bad_cloud, content_hash, "image", base["folder"], base["relative_source_path"], base["filename"], CLOUDINARY_CLOUD_NAME)
        self.assertFalse(is_v)
        self.assertIn("Cloud name mismatch", r)

        # Resource type mismatch (expected video, manifest is image)
        is_v, r = validate_manifest_recovery_entry(base, content_hash, "video", base["folder"], base["relative_source_path"], base["filename"], CLOUDINARY_CLOUD_NAME)
        self.assertFalse(is_v)
        self.assertIn("Resource type mismatch", r)

        # Content hash mismatch
        is_v, r = validate_manifest_recovery_entry(base, "completely_different_hash_000", "image", base["folder"], base["relative_source_path"], base["filename"], CLOUDINARY_CLOUD_NAME)
        self.assertFalse(is_v)
        self.assertIn("Content hash mismatch", r)

    def test_10_failed_database_commits_do_not_leave_false_registered_manifest_state(self):
        """10. Failed database commits do not leave a false 'registered' manifest state."""
        # Cause database commit to fail by mocking db_session.commit to raise an exception
        failing_db = self.Session()
        def fail_commit():
            raise RuntimeError("Simulated Database Commit Failure")
        failing_db.commit = fail_commit

        try:
            with self.assertRaises(RuntimeError):
                import_new_arrivals(
                    dry_run=False,
                    confirm=True,
                    mock_upload=True,
                    source_dir=self.source_dir,
                    manifest_path=self.manifest_path,
                    db_session=failing_db,
                )
        finally:
            failing_db.close()

        # Check manifest on disk
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            manifest_data = json.load(f)

        rel_key = "Two Pieces/Co-ord Sets/Gulmeher Dusty Mauve Waistcoat Co-ord Set/gulmeher-dusty-mauve-waistcoat-co-ord-set-01.png"
        file_entry = manifest_data.get("files", {}).get(rel_key)
        self.assertIsNotNone(file_entry)
        # Entry MUST NOT be marked 'registered'
        self.assertEqual(file_entry.get("status"), "uploaded")
        self.assertNotIn("db_id", file_entry)

        # Subsequent run with normal db succeeds and updates to registered
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            manifest_data2 = json.load(f)
        file_entry2 = manifest_data2.get("files", {}).get(rel_key)
        self.assertEqual(file_entry2.get("status"), "registered")
        self.assertIsNotNone(file_entry2.get("db_id"))

    def test_11_repeated_successful_runs_create_no_duplicate_products_or_associations(self):
        """11. Repeated successful runs create no duplicate products or associations."""
        for run_idx in range(3):
            s = import_new_arrivals(
                dry_run=False,
                confirm=True,
                mock_upload=True,
                source_dir=self.source_dir,
                manifest_path=self.manifest_path,
                db_session=self.db,
            )
            if run_idx == 0:
                self.assertEqual(s["products_created"], 1)
                self.assertEqual(s["media_assets_uploaded"], 1)
            else:
                self.assertEqual(s["products_created"], 0)
                self.assertEqual(s["products_reused"], 1)
                self.assertEqual(s["media_assets_uploaded"], 0)
                self.assertEqual(s["media_assets_reused"], 1)
                self.assertEqual(s["images_attached"], 0)
                self.assertEqual(s["images_replaced"], 0)

        # Check counts in DB
        self.assertEqual(self.db.query(Product).count(), 1)
        self.assertEqual(self.db.query(MediaAsset).count(), 1)
        self.assertEqual(self.db.query(ProductImage).count(), 1)
        self.assertEqual(self.db.query(ProductVariant).count(), 5)

    def test_12_existing_aafreen_publication_preservation_continues_to_pass(self):
        """12. Existing Aafreen publication-preservation test continues to pass."""
        folder_path = "Photos for royal libas/Suit Set/Three Pieces/03 - Aafreen Beige Botanical Three-Piece Suit"
        aafreen = Product(
            name="Aafreen Beige Botanical Three-Piece Suit",
            slug="aafreen-beige-botanical-three-piece-suit",
            category="SUIT SET",
            subcategory="Three Pieces",
            source_folder=folder_path,
            status="PUBLISHED",
            is_active=True,
        )
        self.db.add(aafreen)
        self.db.commit()

        # Run reconcile_catalogue
        rec_sum = reconcile_catalogue(self.db, dry_run=False)
        self.db.refresh(aafreen)
        self.assertEqual(aafreen.status, "PUBLISHED")
        self.assertTrue(aafreen.is_active)
        self.assertFalse(rec_sum["aafreen_reverted_to_draft"])

        # Run import_new_arrivals
        import_new_arrivals(
            dry_run=False,
            confirm=True,
            mock_upload=True,
            source_dir=self.source_dir,
            manifest_path=self.manifest_path,
            db_session=self.db,
        )
        self.db.refresh(aafreen)
        self.assertEqual(aafreen.status, "PUBLISHED")
        self.assertTrue(aafreen.is_active)


if __name__ == "__main__":
    unittest.main()

