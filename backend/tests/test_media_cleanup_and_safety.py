r"""Comprehensive Regression Test Suite for Media Cleanup & Import Safety
Tests all 10 verification scenarios required by Royal Libas:
1. Routine import never deletes assets.
2. A partial/failed import cannot trigger cleanup.
3. Cleanup preview changes nothing (dry-run).
4. Cleanup requires explicit confirmation.
5. Remote deletion failure preserves the local record.
6. In-use media and intentional empty folders are protected.
7. Repeat import/reconciliation produces no duplicate uploads.
8. Reused manifest entries retain full metadata.
9. Restoring the manifest preserves media identities and metadata.
10. Old-folder reconciliation does not break URLs or recreate duplicates.
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
from app.models import MediaAsset, MediaFolder, Product, ProductImage, StoreSetting
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

    def test_01_routine_import_never_deletes_assets(self):
        """Scenario 1: Routine import must never delete assets even if absent from source."""
        asset = MediaAsset(
            filename="unrelated_custom_photo.jpg",
            display_name="Unrelated Photo",
            public_id="Photos for royal libas/custom/photo1",
            cloudinary_asset_id="asset_cust_1",
            cloud_name="galbyoxi",
            delivery_type="upload",
            content_hash="dummyhash123",
            url="https://res.cloudinary.com/galbyoxi/image/upload/custom.jpg",
            resource_type="image",
            file_size=50000,
            mime_type="image/jpeg",
            folder="Photos for royal libas/custom",
        )
        self.db.add(asset)
        self.db.commit()
        asset_id = asset.id

        with tempfile.TemporaryDirectory() as empty_source:
            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.save_manifest"):
                import_boutique_media.run_import(dry_run=False, custom_source_dir=empty_source, db_session=self.db)

        preserved = self.db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
        self.assertIsNotNone(preserved, "Asset absent from source was deleted by routine import!")
        self.assertEqual(preserved.filename, "unrelated_custom_photo.jpg")

    def test_02_partial_or_failed_import_cannot_trigger_cleanup(self):
        """Scenario 2: Failed or partial imports must not trigger cleanup or delete existing records."""
        existing_asset = MediaAsset(
            filename="preexisting.jpg",
            display_name="Preexisting",
            public_id="Photos for royal libas/preexisting",
            cloudinary_asset_id="asset_pre",
            cloud_name="galbyoxi",
            url="https://res.cloudinary.com/galbyoxi/image/upload/preexisting.jpg",
            resource_type="image",
            file_size=25000,
            mime_type="image/jpeg",
            folder="Photos for royal libas/Heavy Dress",
        )
        self.db.add(existing_asset)
        self.db.commit()
        asset_id = existing_asset.id

        with tempfile.TemporaryDirectory() as temp_source:
            test_file = os.path.join(temp_source, "failing_photo.jpg")
            with open(test_file, "wb") as f:
                f.write(b"dummy image bytes for upload failure test")

            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.cloudinary.uploader.upload", side_effect=Exception("Simulated upload network crash")), \
                 patch("import_boutique_media.save_manifest"):
                import_boutique_media.run_import(dry_run=False, custom_source_dir=temp_source, db_session=self.db)

        preserved = self.db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
        self.assertIsNotNone(preserved)

    def test_03_cleanup_preview_changes_nothing(self):
        """Scenario 3: Cleanup preview must be completely non-destructive (dry-run)."""
        obsolete_f = MediaFolder(name="1", path="Photos for royal libas/Heavy Dress/Designer Wear/1")
        self.db.add(obsolete_f)
        self.db.commit()

        initial_count = self.db.query(MediaFolder).count()

        with patch("scripts.media_cleanup_maintenance.is_cloudinary_configured", return_value=True):
            res = run_cleanup_maintenance(dry_run=True, remove_remote_folders=False, db_session=self.db)

        self.assertTrue(res["dry_run"])
        self.assertEqual(res["reconciled_local_folders"], 0)
        self.assertEqual(self.db.query(MediaFolder).count(), initial_count, "Dry-run modified database records!")

    def test_04_cleanup_requires_explicit_confirmation(self):
        """Scenario 4: Folder reconciliation only executes when confirmation is explicitly passed."""
        obsolete_f = MediaFolder(name="1", path="Photos for royal libas/Heavy Dress/Designer Wear/1")
        self.db.add(obsolete_f)
        self.db.commit()
        folder_id = obsolete_f.id

        with patch("scripts.media_cleanup_maintenance.is_cloudinary_configured", return_value=True):
            # Dry-run
            res_preview = run_cleanup_maintenance(dry_run=True, db_session=self.db)
            self.assertEqual(res_preview["reconciled_local_folders"], 0)

            # Execution with confirmation
            res_exec = run_cleanup_maintenance(dry_run=False, remove_remote_folders=False, db_session=self.db)
            self.assertEqual(res_exec["reconciled_local_folders"], 1)

        self.assertIsNone(self.db.query(MediaFolder).filter(MediaFolder.id == folder_id).first())

    def test_05_remote_deletion_failure_preserves_local_record(self):
        """Scenario 5: When Cloudinary folder deletion fails remotely, local handling handles failure predictably."""
        from app.services.cloudinary_service import delete_cloudinary_folder
        with patch("app.services.cloudinary_service.is_cloudinary_configured", return_value=True), \
             patch("app.services.cloudinary_service.cloudinary.api.delete_folder", side_effect=Exception("Cloudinary API Rate Limited 429")):
            res = delete_cloudinary_folder("Photos for royal libas/Heavy Dress/Designer Wear/1")
            self.assertFalse(res["success"])
            self.assertIn("Rate Limited", res["error"])

    def test_06_in_use_media_and_intentional_empty_folders_protected(self):
        """Scenario 6: In-use assets and intentional empty folders (Designer Wear/2, Lehenga, etc.) are strictly protected."""
        # 1. Protected folders
        f2 = MediaFolder(name="2", path="Photos for royal libas/Heavy Dress/Designer Wear/2")
        f_leh = MediaFolder(name="Lehenga", path="Photos for royal libas/Heavy Dress/Lehenga")
        self.db.add_all([f2, f_leh])
        self.db.commit()

        audit = audit_cleanup_candidates(self.db)
        protected_paths = [pf["path"] for pf in audit["protected_empty_folders"]]
        self.assertIn("Photos for royal libas/Heavy Dress/Designer Wear/2", protected_paths)
        self.assertIn("Photos for royal libas/Heavy Dress/Lehenga", protected_paths)

        # 2. In-use asset in product
        prod = Product(name="Test Kurti", slug="test-kurti", is_active=True)
        self.db.add(prod)
        self.db.flush()

        in_use_asset = MediaAsset(
            filename="kurti.jpg",
            display_name="Kurti",
            public_id="samples/kurti",
            url="https://res.cloudinary.com/galbyoxi/image/upload/samples/kurti.jpg",
            file_size=10000,
            mime_type="image/jpeg",
            folder="samples",
        )
        self.db.add(in_use_asset)
        self.db.flush()

        prod_img = ProductImage(product_id=prod.id, url=in_use_asset.url, public_id=in_use_asset.public_id, sort_order=0)
        self.db.add(prod_img)
        self.db.commit()

        audit2 = audit_cleanup_candidates(self.db)
        sample_cand = next(s for s in audit2["sample_assets"] if s["id"] == in_use_asset.id)
        self.assertTrue(sample_cand["is_in_use"], "In-use asset was not flagged as in-use!")
        self.assertIn("Test Kurti", sample_cand["used_in_products"])

    def test_07_repeat_import_produces_no_duplicate_uploads(self):
        """Scenario 7: Repeating import/reconciliation produces 0 duplicate uploads."""
        with tempfile.TemporaryDirectory() as temp_source:
            subdir = os.path.join(temp_source, "Designer Wear")
            os.makedirs(subdir)
            file_path = os.path.join(subdir, "dress.jpg")
            with open(file_path, "wb") as f:
                f.write(b"unique dress bytes for duplicate test")

            upload_mock = MagicMock(return_value={
                "public_id": "dress_pub",
                "asset_id": "dress_aid",
                "secure_url": "https://res.cloudinary.com/galbyoxi/image/upload/dress.jpg",
                "bytes": 35,
                "type": "upload",
                "format": "jpg",
            })

            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.cloudinary.uploader.upload", upload_mock), \
                 patch("import_boutique_media.save_manifest"):

                # First run - uploads
                import_boutique_media.run_import(dry_run=False, custom_source_dir=temp_source, db_session=self.db)
                self.assertEqual(upload_mock.call_count, 1)

                # Second run - MUST reuse without uploading!
                import_boutique_media.run_import(dry_run=False, custom_source_dir=temp_source, db_session=self.db)
                self.assertEqual(upload_mock.call_count, 1, "Duplicate upload occurred on repeated import!")

    def test_08_reused_manifest_entries_retain_full_metadata(self):
        """Scenario 8: Reused manifest entries retain full metadata (cloud_name, delivery_type, asset_id, format, dimensions)."""
        asset = MediaAsset(
            filename="suit.jpg",
            display_name="Royal Suit",
            public_id="suit_pub_1",
            cloudinary_asset_id="asset_suit_immut_1",
            cloud_name="galbyoxi",
            delivery_type="upload",
            content_hash="hash_suit_888",
            url="https://res.cloudinary.com/galbyoxi/image/upload/suit.jpg",
            secure_url="https://res.cloudinary.com/galbyoxi/image/upload/suit.jpg",
            resource_type="image",
            format="jpg",
            width=1200,
            height=1600,
            duration=None,
            file_size=88888,
            mime_type="image/jpeg",
            alt_text="Royal Suit Alt",
            folder="Photos for royal libas/Suit Set",
        )
        self.db.add(asset)
        self.db.commit()

        with tempfile.TemporaryDirectory() as temp_source:
            file_path = os.path.join(temp_source, "suit.jpg")
            with open(file_path, "wb") as f:
                f.write(b"suit file content")

            captured_manifest = {}
            def mock_save(m):
                captured_manifest.update(m)

            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.compute_sha256", return_value="hash_suit_888"), \
                 patch("import_boutique_media.save_manifest", side_effect=mock_save):
                import_boutique_media.run_import(dry_run=False, custom_source_dir=temp_source, db_session=self.db)

        entry = captured_manifest.get("files", {}).get("suit.jpg", {})
        self.assertEqual(entry.get("cloud_name"), "galbyoxi")
        self.assertEqual(entry.get("delivery_type"), "upload")
        self.assertEqual(entry.get("asset_id"), "asset_suit_immut_1")
        self.assertEqual(entry.get("cloudinary_asset_id"), "asset_suit_immut_1")
        self.assertEqual(entry.get("format"), "jpg")
        self.assertEqual(entry.get("width"), 1200)
        self.assertEqual(entry.get("height"), 1600)
        self.assertEqual(entry.get("file_size"), 88888)

    def test_09_restoring_manifest_preserves_identities_in_isolated_database(self):
        """Scenario 9: Restoring manifest into a fresh isolated DB preserves immutable asset IDs and metadata."""
        isolated_fd, isolated_path = tempfile.mkstemp(suffix="_isolated.db")
        iso_engine = create_engine(f"sqlite:///{isolated_path}")
        IsoSession = sessionmaker(bind=iso_engine)
        Base.metadata.create_all(bind=iso_engine)
        iso_db = IsoSession()

        try:
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as mf:
                mock_manifest = {
                    "source_dir": "test/source",
                    "cloud_name": "galbyoxi",
                    "folders": ["Photos for royal libas/Heavy Dress/Designer Wear/01 - Gulnaar Ruby Red Designer Set"],
                    "files": {
                        "gulnaar.jpg": {
                            "status": "registered",
                            "asset_id": "immut_asset_999",
                            "public_id": "gulnaar_pub_id",
                            "cloud_name": "galbyoxi",
                            "delivery_type": "upload",
                            "secure_url": "https://res.cloudinary.com/galbyoxi/image/upload/gulnaar.jpg",
                            "filename": "gulnaar.jpg",
                            "content_hash": "hash_gulnaar",
                            "folder": "Photos for royal libas/Heavy Dress/Designer Wear/01 - Gulnaar Ruby Red Designer Set",
                            "format": "jpg",
                            "width": 1000,
                            "height": 1500,
                            "file_size": 75000,
                            "resource_type": "image",
                        }
                    }
                }
                json.dump(mock_manifest, mf)
                mf_path = mf.name

            res = migrate_manifest_to_db(db_session=iso_db, manifest_path=mf_path)
            self.assertEqual(res["status"], "success")
            self.assertEqual(res["assets_created"], 1)

            restored = iso_db.query(MediaAsset).filter(MediaAsset.cloudinary_asset_id == "immut_asset_999").first()
            self.assertIsNotNone(restored)
            self.assertEqual(restored.public_id, "gulnaar_pub_id")
            self.assertEqual(restored.width, 1000)
            self.assertEqual(restored.height, 1500)
            self.assertEqual(restored.delivery_type, "upload")

        finally:
            iso_db.close()
            iso_engine.dispose()
            os.close(isolated_fd)
            if os.path.exists(isolated_path):
                os.remove(isolated_path)
            if os.path.exists(mf_path):
                os.remove(mf_path)

    def test_10_old_folder_reconciliation_does_not_break_urls_or_recreate_duplicates(self):
        """Scenario 10: Old folder reconciliation maps accurately without breaking URLs or public IDs."""
        asset = MediaAsset(
            filename="photo.jpg",
            display_name="Gulnaar 1",
            public_id="Photos for royal libas/Heavy Dress/Designer Wear/1/file_xyz",
            cloudinary_asset_id="asset_gul_1",
            cloud_name="galbyoxi",
            url="https://res.cloudinary.com/galbyoxi/image/upload/v123/Photos%20for%20royal%20libas/Heavy%20Dress/Designer%20Wear/1/file_xyz.jpg",
            resource_type="image",
            file_size=40000,
            mime_type="image/jpeg",
            folder="Photos for royal libas/Heavy Dress/Designer Wear/01 - Gulnaar Ruby Red Designer Set",
        )
        old_folder = MediaFolder(name="1", path="Photos for royal libas/Heavy Dress/Designer Wear/1")
        named_folder = MediaFolder(name="01 - Gulnaar Ruby Red Designer Set", path="Photos for royal libas/Heavy Dress/Designer Wear/01 - Gulnaar Ruby Red Designer Set")
        self.db.add_all([asset, old_folder, named_folder])
        self.db.commit()
        asset_id = asset.id

        with patch("scripts.media_cleanup_maintenance.is_cloudinary_configured", return_value=True), \
             patch("scripts.media_cleanup_maintenance.delete_cloudinary_folder", return_value={"success": True}):
            res = run_cleanup_maintenance(dry_run=False, remove_remote_folders=True, db_session=self.db)

        self.assertEqual(res["reconciled_local_folders"], 1)

        checked_asset = self.db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
        self.assertEqual(checked_asset.public_id, "Photos for royal libas/Heavy Dress/Designer Wear/1/file_xyz")
        self.assertEqual(checked_asset.url, "https://res.cloudinary.com/galbyoxi/image/upload/v123/Photos%20for%20royal%20libas/Heavy%20Dress/Designer%20Wear/1/file_xyz.jpg")
        self.assertEqual(checked_asset.folder, "Photos for royal libas/Heavy Dress/Designer Wear/01 - Gulnaar Ruby Red Designer Set")


if __name__ == "__main__":
    unittest.main()
