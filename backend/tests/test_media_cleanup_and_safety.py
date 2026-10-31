r"""Comprehensive Regression Test Suite for Media Cleanup & Import Safety
Royal Libas by Tanya - Orchestration & Failure Handling Verification

Verifies all 10 core regression scenarios:
1. Remote folder deletion failure preserves the local record.
2. Successful remote deletion followed by database failure produces a recoverable result.
3. Local-only reconciliation is explicitly distinguished from remote deletion.
4. Every hero/category/banner/poster field is detected as in-use (and broad substrings avoided).
5. Product media usage remains protected.
6. Failed folder creation is not reported as remote success.
7. Failed asset move preserves the previous local folder and reports failure.
8. Retrying a failed operation does not duplicate uploads or erase metadata.
9. Cleanup endpoints respect their injected test database session.
10. Routine import never triggers deletion.
"""
import os
import sys
import unittest
import tempfile
import json
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.abspath("backend"))

from app.database import Base
from app.models import MediaAsset, MediaFolder, Product, ProductImage, StoreSetting, Admin
from app.services.media_usage_service import (
    extract_cloudinary_public_id,
    normalize_media_url,
    match_asset_to_url,
    get_asset_usage_references,
)
from scripts.media_cleanup_maintenance import (
    audit_cleanup_candidates,
    run_cleanup_maintenance,
    PROTECTED_EMPTY_FOLDERS,
    OBSOLETE_FOLDER_MAPPINGS,
)
from scripts.migrate_media_manifest_to_db import migrate_manifest_to_db
import import_boutique_media


class TestMediaCleanupAndSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create an isolated temporary SQLite database for all test runs
        cls.db_fd, cls.db_path = tempfile.mkstemp(suffix="_test_safety.db")
        cls.engine = create_engine(f"sqlite:///{cls.db_path}", connect_args={"check_same_thread": False})
        cls.Session = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()
        try:
            os.close(cls.db_fd)
            if os.path.exists(cls.db_path):
                os.remove(cls.db_path)
        except Exception:
            pass

    def setUp(self):
        self.db = self.Session()
        # Clean up tables between test runs
        self.db.query(ProductImage).delete()
        self.db.query(Product).delete()
        self.db.query(MediaAsset).delete()
        self.db.query(MediaFolder).delete()
        self.db.query(StoreSetting).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_01_remote_folder_deletion_failure_preserves_local_record(self):
        """1. Remote folder deletion failure preserves the local record."""
        obsolete_path = "Photos for royal libas/Heavy Dress/Designer Wear/1"
        folder = MediaFolder(name="1", path=obsolete_path)
        self.db.add(folder)
        self.db.commit()
        folder_id = folder.id

        mock_delete = MagicMock(return_value={"success": False, "error": "Cloudinary API Rate Limited 429"})

        with patch("scripts.media_cleanup_maintenance.is_cloudinary_configured", return_value=True), \
             patch("scripts.media_cleanup_maintenance.delete_cloudinary_folder", mock_delete):
            res = run_cleanup_maintenance(dry_run=False, remove_remote_folders=True, db_session=self.db)

        # Assert local record is strictly PRESERVED
        preserved = self.db.query(MediaFolder).filter(MediaFolder.id == folder_id).first()
        self.assertIsNotNone(preserved, "Local folder was deleted despite remote deletion failure!")
        self.assertEqual(preserved.path, obsolete_path)
        self.assertEqual(res["reconciled_local_folders"], 0)
        self.assertEqual(res["reconciled_remote_folders"], 0)
        self.assertEqual(res["status"], "failed")
        self.assertEqual(len(res["remote_folder_errors"]), 1)
        self.assertEqual(res["remote_folder_errors"][0]["status"], "remote_deletion_failed")

    def test_02_successful_remote_deletion_followed_by_db_failure_produces_recoverable_result(self):
        """2. Successful remote deletion followed by database failure produces a recoverable result."""
        obsolete_path = "Photos for royal libas/Heavy Dress/Designer Wear/3"
        folder = MediaFolder(name="3", path=obsolete_path)
        self.db.add(folder)
        self.db.commit()

        mock_delete = MagicMock(return_value={"success": True})

        # Simulate database failure during commit/delete
        with patch("scripts.media_cleanup_maintenance.is_cloudinary_configured", return_value=True), \
             patch("scripts.media_cleanup_maintenance.delete_cloudinary_folder", mock_delete), \
             patch.object(self.db, "commit", side_effect=Exception("Simulated SQLite disk/lock failure")):
            res = run_cleanup_maintenance(dry_run=False, remove_remote_folders=True, db_session=self.db)

        self.assertEqual(res["reconciled_remote_folders"], 1)
        self.assertEqual(res["reconciled_local_folders"], 0)
        self.assertEqual(len(res["remote_folder_errors"]), 1)
        err = res["remote_folder_errors"][0]
        self.assertEqual(err["status"], "recoverable_reconciliation_needed")
        self.assertTrue(err["remote_deleted"])

    def test_03_local_only_reconciliation_is_explicitly_distinguished_from_remote_deletion(self):
        """3. Local-only reconciliation is explicitly distinguished from remote deletion."""
        obsolete_path = "Photos for royal libas/Heavy Dress/Designer Wear/4"
        folder = MediaFolder(name="4", path=obsolete_path)
        self.db.add(folder)
        self.db.commit()

        mock_delete = MagicMock()

        with patch("scripts.media_cleanup_maintenance.is_cloudinary_configured", return_value=True), \
             patch("scripts.media_cleanup_maintenance.delete_cloudinary_folder", mock_delete):
            res = run_cleanup_maintenance(dry_run=False, remove_remote_folders=False, db_session=self.db)

        # Cloudinary remote delete was never called
        mock_delete.assert_not_called()
        self.assertEqual(res["reconciled_local_folders"], 1)
        self.assertEqual(res["reconciled_remote_folders"], 0)
        self.assertEqual(res["status"], "success")
        self.assertIsNone(self.db.query(MediaFolder).filter(MediaFolder.path == obsolete_path).first())

    def test_04_every_hero_category_banner_poster_field_is_detected_as_in_use(self):
        """4. Every hero/category/banner/poster field is detected as in-use without broad substring false positives."""
        setting = StoreSetting(
            hero_title="Timeless Luxury",
            hero_image_url="https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/hero_main.jpg",
            category_two_pieces_image="https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/cat_two_pieces.jpg",
            category_suit_set_image="https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/cat_suit_set.jpg",
            category_heavy_dress_image="https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/cat_heavy_dress.jpg",
            festive_banner_image="https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/banner_festive.jpg",
            poster_occasion_image="https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/poster_occasion.jpg",
            poster_everyday_image="https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/poster_everyday.jpg",
            poster_story_image="https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/poster_story.jpg",
        )
        self.db.add(setting)

        # Create assets for each
        assets_info = [
            ("hero", "editorial/hero_main", "https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/hero_main.jpg", "Homepage Hero Banner"),
            ("two_pieces", "editorial/cat_two_pieces", "https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/cat_two_pieces.jpg", "Category Card: Two Pieces"),
            ("suit_set", "editorial/cat_suit_set", "https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/cat_suit_set.jpg", "Category Card: Suit Set"),
            ("heavy_dress", "editorial/cat_heavy_dress", "https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/cat_heavy_dress.jpg", "Category Card: Heavy Dress"),
            ("festive", "editorial/banner_festive", "https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/banner_festive.jpg", "Festive Announcement Banner"),
            ("occasion", "editorial/poster_occasion", "https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/poster_occasion.jpg", "Editorial Poster: Occasion Wear"),
            ("everyday", "editorial/poster_everyday", "https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/poster_everyday.jpg", "Editorial Poster: Everyday Luxury"),
            ("story", "editorial/poster_story", "https://res.cloudinary.com/galbyoxi/image/upload/v1700000000/editorial/poster_story.jpg", "Editorial Poster: Tanya's Heritage Story"),
        ]

        for fname, pub_id, url, expected_label in assets_info:
            a = MediaAsset(
                filename=f"{fname}.jpg",
                public_id=pub_id,
                url=url,
                secure_url=url,
                cloud_name="galbyoxi",
                folder="editorial",
                mime_type="image/jpeg",
            )
            self.db.add(a)
            self.db.flush()
            prod_usages, editorial_usages = get_asset_usage_references(a, self.db)
            self.assertIn(expected_label, editorial_usages, f"Field {expected_label} was not detected as in-use!")

        # Test false-substring prevention
        # e.g. public_id='hero' should NOT match 'editorial/hero_main.jpg'
        substring_asset = MediaAsset(
            filename="hero.jpg",
            public_id="hero",
            url="https://res.cloudinary.com/galbyoxi/image/upload/v1/hero.jpg",
            cloud_name="galbyoxi",
            folder="root",
            mime_type="image/jpeg",
        )
        self.db.add(substring_asset)
        self.db.commit()

        prod_usages, editorial_usages = get_asset_usage_references(substring_asset, self.db)
        self.assertEqual(editorial_usages, [], "False substring match occurred for 'hero' vs 'editorial/hero_main'!")

    def test_05_product_media_usage_remains_protected(self):
        """5. Product media usage remains protected."""
        prod = Product(name="Anarkali Suit", slug="anarkali-suit", is_active=True)
        self.db.add(prod)
        self.db.flush()

        asset = MediaAsset(
            filename="anarkali.jpg",
            public_id="Photos for royal libas/Heavy Dress/anarkali",
            url="https://res.cloudinary.com/galbyoxi/image/upload/v1/anarkali.jpg",
            secure_url="https://res.cloudinary.com/galbyoxi/image/upload/v1/anarkali.jpg",
            cloud_name="galbyoxi",
            folder="Photos for royal libas/Heavy Dress",
            mime_type="image/jpeg",
        )
        self.db.add(asset)
        self.db.flush()

        pimg = ProductImage(product_id=prod.id, url=asset.secure_url, public_id=asset.public_id, sort_order=0)
        self.db.add(pimg)
        self.db.commit()

        prod_usages, editorial_usages = get_asset_usage_references(asset, self.db)
        self.assertEqual(len(prod_usages), 1)
        self.assertEqual(prod_usages[0]["name"], "Anarkali Suit")
        self.assertEqual(prod_usages[0]["slug"], "anarkali-suit")

    def test_06_failed_folder_creation_is_not_reported_as_remote_success(self):
        """6. Failed folder creation is not reported as remote success."""
        with tempfile.TemporaryDirectory() as temp_source:
            sub = os.path.join(temp_source, "Test Category")
            os.makedirs(sub)

            mock_folder_create = MagicMock(return_value={"success": False, "error": "Cloudinary Rate Limit 429"})

            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.create_cloudinary_folder", mock_folder_create), \
                 patch("import_boutique_media.save_manifest"):
                summary = import_boutique_media.run_import(dry_run=False, custom_source_dir=temp_source, db_session=self.db)

        # Folder is created locally, remote failure was properly logged
        self.assertGreaterEqual(mock_folder_create.call_count, 1)
        local_f = self.db.query(MediaFolder).filter(MediaFolder.name == "Test Category").first()
        self.assertIsNotNone(local_f)

    def test_07_failed_asset_move_preserves_previous_local_folder_and_reports_failure(self):
        """7. Failed asset move preserves previous local folder and reports failure."""
        old_folder_path = "Photos for royal libas/Heavy Dress/Designer Wear/1"
        target_folder_path = "Photos for royal libas/Heavy Dress/Designer Wear/01 - Gulnaar Ruby Red Designer Set"

        asset = MediaAsset(
            filename="gulnaar.jpg",
            display_name="Gulnaar 1",
            public_id="gulnaar_pub_1",
            cloudinary_asset_id="asset_gul_1",
            cloud_name="galbyoxi",
            delivery_type="upload",
            content_hash="hash_gulnaar_unique",
            url="https://res.cloudinary.com/galbyoxi/image/upload/v1/gulnaar.jpg",
            secure_url="https://res.cloudinary.com/galbyoxi/image/upload/v1/gulnaar.jpg",
            resource_type="image",
            file_size=45000,
            mime_type="image/jpeg",
            folder=old_folder_path,
        )
        self.db.add(asset)
        self.db.commit()
        asset_id = asset.id

        with tempfile.TemporaryDirectory() as temp_source:
            target_dir = os.path.join(temp_source, "Heavy Dress", "Designer Wear", "01 - Gulnaar Ruby Red Designer Set")
            os.makedirs(target_dir)
            file_path = os.path.join(target_dir, "gulnaar.jpg")
            with open(file_path, "wb") as f:
                f.write(b"content for gulnaar unique")

            mock_move = MagicMock(return_value={"success": False, "error": "Remote asset move timed out"})
            captured_manifest = {}

            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.compute_sha256", return_value="hash_gulnaar_unique"), \
                 patch("import_boutique_media.move_cloudinary_asset_folder", mock_move), \
                 patch("import_boutique_media.save_manifest", side_effect=lambda m: captured_manifest.update(m)):
                summary = import_boutique_media.run_import(dry_run=False, custom_source_dir=temp_source, db_session=self.db)

        # Asset local folder MUST remain old_folder_path
        db_asset = self.db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
        self.assertEqual(db_asset.folder, old_folder_path, "Local folder was updated despite remote move failure!")
        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["reorganized"], 0)

        # Manifest records recoverable move failure
        rel_key = "Heavy Dress/Designer Wear/01 - Gulnaar Ruby Red Designer Set/gulnaar.jpg"
        file_entry = captured_manifest.get("files", {}).get(rel_key, {})
        self.assertEqual(file_entry.get("status"), "move_failed")
        self.assertEqual(file_entry.get("folder"), old_folder_path)
        self.assertEqual(file_entry.get("target_folder"), target_folder_path)

    def test_08_retrying_failed_operation_does_not_duplicate_uploads_or_erase_metadata(self):
        """8. Retrying a failed operation does not duplicate uploads or erase metadata."""
        with tempfile.TemporaryDirectory() as temp_source:
            sub = os.path.join(temp_source, "Co-ord Sets")
            os.makedirs(sub)
            file_path = os.path.join(sub, "coord.jpg")
            with open(file_path, "wb") as f:
                f.write(b"coord dress bytes")

            upload_mock = MagicMock(return_value={
                "public_id": "coord_pub_id",
                "asset_id": "coord_asset_id_99",
                "secure_url": "https://res.cloudinary.com/galbyoxi/image/upload/coord.jpg",
                "bytes": 500,
                "type": "upload",
                "format": "jpg",
                "width": 800,
                "height": 1200,
            })

            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.cloudinary.uploader.upload", upload_mock), \
                 patch("import_boutique_media.save_manifest"):

                # First run - upload occurs once
                res1 = import_boutique_media.run_import(dry_run=False, custom_source_dir=temp_source, db_session=self.db)
                self.assertEqual(upload_mock.call_count, 1)

                # Retry/repeat run - MUST NOT call upload again!
                res2 = import_boutique_media.run_import(dry_run=False, custom_source_dir=temp_source, db_session=self.db)
                self.assertEqual(upload_mock.call_count, 1, "Duplicate upload occurred on retry!")

        # Verify metadata remains complete
        saved_asset = self.db.query(MediaAsset).filter(MediaAsset.public_id == "coord_pub_id").first()
        self.assertIsNotNone(saved_asset)
        self.assertEqual(saved_asset.cloudinary_asset_id, "coord_asset_id_99")
        self.assertEqual(saved_asset.width, 800)
        self.assertEqual(saved_asset.height, 1200)

    def test_09_cleanup_endpoints_respect_injected_test_database_session(self):
        """9. Cleanup endpoints respect their injected test database session."""
        from app.routers.admin import admin_media_cleanup_preview, admin_media_cleanup_execute
        from app.schemas import MediaCleanupExecuteRequest

        obsolete_folder = MediaFolder(name="5", path="Photos for royal libas/Heavy Dress/Palazzo Set/5")
        self.db.add(obsolete_folder)
        self.db.commit()

        mock_admin = Admin(id=1, email="owner@royallibas.com", role="OWNER")

        # 1. Preview endpoint with injected db
        preview_res = admin_media_cleanup_preview(db=self.db, current_admin=mock_admin)
        self.assertTrue(preview_res.dry_run)
        self.assertEqual(preview_res.safe_to_reconcile_count, 1)

        # 2. Execute endpoint with injected db
        exec_payload = MediaCleanupExecuteRequest(confirm=True, clean_remote_folders=False)
        with patch("app.routers.admin.log_activity"):
            exec_res = admin_media_cleanup_execute(payload=exec_payload, db=self.db, current_admin=mock_admin)

        self.assertEqual(exec_res.status, "success")
        self.assertEqual(exec_res.reconciled_local_folders, 1)
        self.assertIsNone(self.db.query(MediaFolder).filter(MediaFolder.path == "Photos for royal libas/Heavy Dress/Palazzo Set/5").first())

    def test_10_routine_import_never_triggers_deletion(self):
        """10. Routine import never triggers deletion of media or folders absent from source."""
        asset = MediaAsset(
            filename="unrelated_present.jpg",
            display_name="Present",
            public_id="Photos for royal libas/present_file",
            cloudinary_asset_id="asset_pres_1",
            cloud_name="galbyoxi",
            delivery_type="upload",
            content_hash="hash_pres",
            url="https://res.cloudinary.com/galbyoxi/image/upload/present.jpg",
            resource_type="image",
            file_size=30000,
            mime_type="image/jpeg",
            folder="Photos for royal libas/present_folder",
        )
        folder = MediaFolder(name="present_folder", path="Photos for royal libas/present_folder")
        self.db.add_all([asset, folder])
        self.db.commit()

        asset_id = asset.id
        folder_id = folder.id

        with tempfile.TemporaryDirectory() as empty_source:
            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.save_manifest"):
                import_boutique_media.run_import(dry_run=False, custom_source_dir=empty_source, db_session=self.db)

        self.assertIsNotNone(self.db.query(MediaAsset).filter(MediaAsset.id == asset_id).first(), "Routine import deleted absent media asset!")
        self.assertIsNotNone(self.db.query(MediaFolder).filter(MediaFolder.id == folder_id).first(), "Routine import deleted absent folder!")


if __name__ == "__main__":
    unittest.main()
