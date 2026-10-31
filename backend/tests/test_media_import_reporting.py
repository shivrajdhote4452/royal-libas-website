r"""Focused Verification Test Suite for Media Import Reporting
Royal Libas by Tanya - Folder/File Segregated Reporting & Manifest Tracking

Verifies:
1. Files succeed but remote folder creation fails: overall result must not claim complete success (status is 'partial_failure').
2. Local folder exists but remote confirmation is unavailable: reported as unconfirmed.
3. Mixed folder/file outcomes produce accurate separate counts and separate failure lists.
4. A retry resolves pending folders without duplicate media uploads.
5. Updating folder-operation status preserves existing media metadata in full fidelity.
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
from app.models import MediaAsset, MediaFolder
import import_boutique_media


class TestMediaImportReporting(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_fd, cls.db_path = tempfile.mkstemp(suffix="_test_reporting.db")
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
        self.db.query(MediaAsset).delete()
        self.db.query(MediaFolder).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_01_files_succeed_but_remote_folder_creation_fails_overall_not_complete(self):
        """1. Files succeed but remote folder creation fails: overall result must not claim complete success."""
        with tempfile.TemporaryDirectory() as temp_source, \
             tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as temp_manifest:
            manifest_path = temp_manifest.name

            # Create a folder and a file in the source directory
            sub_dir = os.path.join(temp_source, "Heavy Dress")
            os.makedirs(sub_dir)
            file_path = os.path.join(sub_dir, "dress1.jpg")
            with open(file_path, "wb") as f:
                f.write(b"dress content for test 1")

            # Mock folder creation to FAIL
            mock_create_folder = MagicMock(return_value={"success": False, "error": "Cloudinary Rate Limited 429"})

            # Mock upload to SUCCEED
            mock_upload = MagicMock(return_value={
                "public_id": "dress1_pub",
                "asset_id": "dress1_aid",
                "secure_url": "https://res.cloudinary.com/galbyoxi/image/upload/dress1.jpg",
                "bytes": 500,
                "type": "upload",
                "format": "jpg",
            })

            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.create_cloudinary_folder", mock_create_folder), \
                 patch("import_boutique_media.cloudinary.uploader.upload", mock_upload):
                summary = import_boutique_media.run_import(
                    dry_run=False,
                    custom_source_dir=temp_source,
                    db_session=self.db,
                    custom_manifest_path=manifest_path,
                )

            # Files succeeded
            self.assertEqual(summary["files_uploaded"], 1)
            self.assertEqual(summary["files_failed"], 0)

            # Folder creation failed
            self.assertGreater(summary["cloudinary_folders_failed"], 0)
            self.assertEqual(summary["cloudinary_folders_confirmed"], 0)
            self.assertGreater(len(summary["folder_errors"]), 0)

            # Overall status MUST NOT be 'complete'
            self.assertNotEqual(summary["status"], "complete")
            self.assertEqual(summary["status"], "partial_failure")

            # Verify manifest records the folder failure with path and error
            with open(manifest_path, "r", encoding="utf-8") as mf:
                saved_manifest = json.load(mf)
            folder_ops = saved_manifest.get("folder_operations", {})
            self.assertIn("Photos for royal libas/Heavy Dress", folder_ops)
            f_op = folder_ops["Photos for royal libas/Heavy Dress"]
            self.assertEqual(f_op["status"], "failed")
            self.assertFalse(f_op["remote_confirmed"])
            self.assertIn("Rate Limited 429", f_op["error"])

        try:
            if os.path.exists(manifest_path):
                os.remove(manifest_path)
        except Exception:
            pass

    def test_02_local_folder_exists_but_remote_confirmation_unavailable_reported_as_unconfirmed(self):
        """2. Local folder exists but remote confirmation is unavailable: report it as unconfirmed."""
        with tempfile.TemporaryDirectory() as temp_source, \
             tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as temp_manifest:
            manifest_path = temp_manifest.name

            sub_dir = os.path.join(temp_source, "Suit Set")
            os.makedirs(sub_dir)

            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"):
                # Dry run has no remote confirmation
                summary = import_boutique_media.run_import(
                    dry_run=True,
                    custom_source_dir=temp_source,
                    db_session=self.db,
                    custom_manifest_path=manifest_path,
                )

            self.assertGreater(summary["cloudinary_folders_unconfirmed"], 0)
            self.assertEqual(summary["cloudinary_folders_confirmed"], 0)
            self.assertEqual(summary["status"], "pending")

        try:
            if os.path.exists(manifest_path):
                os.remove(manifest_path)
        except Exception:
            pass

    def test_03_mixed_folder_file_outcomes_produce_accurate_separate_counts(self):
        """3. Mixed folder/file outcomes produce accurate separate counts and segregated error lists."""
        with tempfile.TemporaryDirectory() as temp_source, \
             tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as temp_manifest:
            manifest_path = temp_manifest.name

            # Folder 1: Success
            ok_dir = os.path.join(temp_source, "FolderOK")
            os.makedirs(ok_dir)
            f1 = os.path.join(ok_dir, "good.jpg")
            with open(f1, "wb") as f:
                f.write(b"good bytes")

            # Folder 2: Will fail remote creation
            fail_dir = os.path.join(temp_source, "FolderFail")
            os.makedirs(fail_dir)
            f2 = os.path.join(fail_dir, "bad.jpg")
            with open(f2, "wb") as f:
                f.write(b"bad bytes")

            def mock_create_folder(folder_path):
                if "FolderFail" in folder_path:
                    return {"success": False, "error": "Remote quota reached"}
                return {"success": True}

            def mock_upload(file_bytes, folder=None, **kwargs):
                if folder and "FolderFail" in folder:
                    raise Exception("Network socket dropped")
                return {
                    "public_id": "good_pub",
                    "asset_id": "good_aid",
                    "secure_url": "https://res.cloudinary.com/galbyoxi/image/upload/good.jpg",
                    "bytes": 100,
                    "type": "upload",
                    "format": "jpg",
                }

            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.create_cloudinary_folder", side_effect=mock_create_folder), \
                 patch("import_boutique_media.cloudinary.uploader.upload", side_effect=mock_upload):
                summary = import_boutique_media.run_import(
                    dry_run=False,
                    custom_source_dir=temp_source,
                    db_session=self.db,
                    custom_manifest_path=manifest_path,
                )

            # Separate file metrics
            self.assertEqual(summary["files_uploaded"], 1)
            self.assertEqual(summary["files_failed"], 1)
            self.assertEqual(len(summary["file_errors"]), 1)
            self.assertIn("bad.jpg", summary["file_errors"][0]["file"])
            self.assertEqual(summary["file_errors"][0]["status"], "upload_failed")

            # Separate folder metrics
            self.assertGreaterEqual(summary["cloudinary_folders_confirmed"], 1)
            self.assertEqual(summary["cloudinary_folders_failed"], 1)
            self.assertEqual(len(summary["folder_errors"]), 1)
            self.assertIn("Photos for royal libas/FolderFail", summary["folder_errors"][0]["path"])

            # Status is partial_failure
            self.assertEqual(summary["status"], "partial_failure")

        try:
            if os.path.exists(manifest_path):
                os.remove(manifest_path)
        except Exception:
            pass

    def test_04_retry_resolves_pending_folders_without_duplicate_media_uploads(self):
        """4. A retry resolves pending folders without duplicate media uploads."""
        with tempfile.TemporaryDirectory() as temp_source, \
             tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as temp_manifest:
            manifest_path = temp_manifest.name

            sub_dir = os.path.join(temp_source, "Two Pieces")
            os.makedirs(sub_dir)
            f_path = os.path.join(sub_dir, "twopiece.jpg")
            with open(f_path, "wb") as f:
                f.write(b"unique two piece content bytes")

            upload_mock = MagicMock(return_value={
                "public_id": "two_piece_pub",
                "asset_id": "two_piece_aid_88",
                "secure_url": "https://res.cloudinary.com/galbyoxi/image/upload/twopiece.jpg",
                "bytes": 200,
                "type": "upload",
                "format": "jpg",
            })

            # RUN 1: Folder creation fails, file upload succeeds
            folder_mock_fail = MagicMock(return_value={"success": False, "error": "Cloudinary Rate Limit 429"})

            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.create_cloudinary_folder", folder_mock_fail), \
                 patch("import_boutique_media.cloudinary.uploader.upload", upload_mock):
                res1 = import_boutique_media.run_import(
                    dry_run=False,
                    custom_source_dir=temp_source,
                    db_session=self.db,
                    custom_manifest_path=manifest_path,
                )

            self.assertEqual(upload_mock.call_count, 1)
            self.assertEqual(res1["files_uploaded"], 1)
            self.assertGreater(res1["cloudinary_folders_failed"], 0)
            self.assertEqual(res1["status"], "partial_failure")

            # RUN 2 (RETRY): Folder creation succeeds. File MUST NOT be uploaded again!
            folder_mock_success = MagicMock(return_value={"success": True})

            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.create_cloudinary_folder", folder_mock_success), \
                 patch("import_boutique_media.cloudinary.uploader.upload", upload_mock):
                res2 = import_boutique_media.run_import(
                    dry_run=False,
                    custom_source_dir=temp_source,
                    db_session=self.db,
                    custom_manifest_path=manifest_path,
                )

            # Upload was NOT called again (call_count remains 1!)
            self.assertEqual(upload_mock.call_count, 1, "Duplicate upload occurred on retry!")
            self.assertEqual(res2["files_uploaded"], 0)
            self.assertEqual(res2["files_reused"], 1)
            self.assertEqual(res2["cloudinary_folders_failed"], 0)
            self.assertEqual(res2["status"], "complete")

            # Manifest reflects confirmed folder status
            with open(manifest_path, "r", encoding="utf-8") as mf:
                saved = json.load(mf)
            f_op = saved.get("folder_operations", {}).get("Photos for royal libas/Two Pieces", {})
            self.assertEqual(f_op.get("status"), "confirmed")
            self.assertTrue(f_op.get("remote_confirmed"))
            self.assertIsNone(f_op.get("error"))

        try:
            if os.path.exists(manifest_path):
                os.remove(manifest_path)
        except Exception:
            pass

    def test_05_updating_folder_operation_status_preserves_existing_media_metadata(self):
        """5. Updating folder-operation status preserves existing media metadata in full fidelity."""
        with tempfile.TemporaryDirectory() as temp_source, \
             tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as temp_manifest:
            manifest_path = temp_manifest.name

            # Pre-populate manifest with rich file metadata
            initial_manifest = {
                "source_dir": temp_source,
                "cloud_name": "galbyoxi",
                "folders": ["Photos for royal libas"],
                "folder_operations": {},
                "files": {
                    "existing_file.jpg": {
                        "status": "registered",
                        "db_id": 999,
                        "asset_id": "immut_aid_777",
                        "cloudinary_asset_id": "immut_aid_777",
                        "public_id": "immut_pub_777",
                        "cloud_name": "galbyoxi",
                        "delivery_type": "upload",
                        "secure_url": "https://res.cloudinary.com/galbyoxi/image/upload/v1/existing_file.jpg",
                        "url": "https://res.cloudinary.com/galbyoxi/image/upload/v1/existing_file.jpg",
                        "filename": "existing_file.jpg",
                        "display_name": "Existing Rich Asset",
                        "relative_source_path": "existing_file.jpg",
                        "content_hash": "sha256_full_fidelity_hash",
                        "folder": "Photos for royal libas",
                        "resource_type": "image",
                        "format": "jpg",
                        "width": 1920,
                        "height": 1080,
                        "duration": None,
                        "file_size": 123456,
                        "mime_type": "image/jpeg",
                        "reused": True,
                    }
                }
            }
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(initial_manifest, f)

            # Run folder sync updating folder status
            with patch("import_boutique_media.is_cloudinary_configured", return_value=True), \
                 patch("import_boutique_media.cloudinary.api.ping", return_value={"status": "ok"}), \
                 patch("import_boutique_media.detect_cloudinary_folder_mode", return_value="dynamic"), \
                 patch("import_boutique_media.create_cloudinary_folder", return_value={"success": True}):
                summary = import_boutique_media.run_import(
                    dry_run=False,
                    custom_source_dir=temp_source,
                    db_session=self.db,
                    custom_manifest_path=manifest_path,
                )

            # Inspect saved manifest
            with open(manifest_path, "r", encoding="utf-8") as f:
                updated_manifest = json.load(f)

            # Folder operations were added
            self.assertIn("Photos for royal libas", updated_manifest.get("folder_operations", {}))

            # Existing media metadata remains 100% intact!
            file_meta = updated_manifest.get("files", {}).get("existing_file.jpg", {})
            self.assertEqual(file_meta.get("asset_id"), "immut_aid_777")
            self.assertEqual(file_meta.get("cloudinary_asset_id"), "immut_aid_777")
            self.assertEqual(file_meta.get("public_id"), "immut_pub_777")
            self.assertEqual(file_meta.get("width"), 1920)
            self.assertEqual(file_meta.get("height"), 1080)
            self.assertEqual(file_meta.get("file_size"), 123456)
            self.assertEqual(file_meta.get("content_hash"), "sha256_full_fidelity_hash")
            self.assertEqual(file_meta.get("display_name"), "Existing Rich Asset")

        try:
            if os.path.exists(manifest_path):
                os.remove(manifest_path)
        except Exception:
            pass


if __name__ == "__main__":
    unittest.main()
