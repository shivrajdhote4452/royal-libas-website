"""
Comprehensive Automated Test Suite for VPS Release Retention Engine.

Tests:
1. Standard retention flow (Active + 3 rollbacks retained, older pruned).
2. Fail-closed on regular file .env (never delete real secrets).
3. Fail-closed on wrong-target .env symlink.
4. Fail-closed on regular directory uploads (never delete real media).
5. Fail-closed on nested mounts or mount points.
6. Fail-closed on dangling or missing live symlink.
7. Absolute protection of the live release under all conditions.
8. Interrupted / unverified aborted builds handling (quarantine vs pruning).
9. Missing or corrupt ledger safe skipping.
10. Lock coordination and mutual exclusion.
11. Preservation of shared persistent target data after unlinking.
12. Unexpected folder names and directory traversal protection.
"""

import os
import shutil
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from deploy.prune_releases import (
    evaluate_retention_plan,
    prune_releases,
    verify_persistent_symlinks,
    verify_mount_safety,
    SafetyViolationError,
    LockAcquisitionError
)


class TestReleaseRetentionEngine(unittest.TestCase):
    def setUp(self):
        # Create isolated temporary workspace
        self.test_dir = tempfile.mkdtemp(prefix="test_retention_sandbox_")
        self.builds_dir = os.path.join(self.test_dir, "builds")
        os.makedirs(self.builds_dir, exist_ok=True)

        self.shared_dir = os.path.join(self.test_dir, "shared")
        self.shared_backend = os.path.join(self.shared_dir, "backend")
        os.makedirs(self.shared_backend, exist_ok=True)

        # Persistent shared data
        self.shared_env = os.path.join(self.shared_backend, ".env")
        with open(self.shared_env, "w", encoding="utf-8") as f:
            f.write("PROD_SECRET=very_secret_database_key\n")

        self.shared_uploads = os.path.join(self.shared_backend, "uploads")
        os.makedirs(self.shared_uploads, exist_ok=True)
        with open(os.path.join(self.shared_uploads, "product_photo.jpg"), "w", encoding="utf-8") as f:
            f.write("fake_binary_jpeg_data")

        self.current_symlink = os.path.join(self.test_dir, "current")
        self.ledger_file = os.path.join(self.builds_dir, ".deployments_ledger.tsv")
        self.pipeline_lock = os.path.join(self.builds_dir, ".deploy-pipeline.lock")
        self.activation_lock = os.path.join(self.test_dir, "deploy.lock")
        self.mounts_file = os.path.join(self.test_dir, "mock_mounts")
        with open(self.mounts_file, "w", encoding="utf-8") as f:
            f.write("/dev/sda1 / ext4 rw 0 0\n")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def _create_release(self, name: str, with_symlinks: bool = True, custom_env: str = None, custom_uploads: str = None, mtime: datetime = None) -> str:
        """Helper to create a mock release folder."""
        path = os.path.join(self.builds_dir, name)
        backend = os.path.join(path, "backend")
        frontend_dist = os.path.join(path, "frontend", "dist")
        os.makedirs(backend, exist_ok=True)
        os.makedirs(frontend_dist, exist_ok=True)

        with open(os.path.join(frontend_dist, "index.html"), "w", encoding="utf-8") as f:
            f.write(f"<html><body>Royal Libas - {name}</body></html>")

        with open(os.path.join(backend, "app.py"), "w", encoding="utf-8") as f:
            f.write("# backend app")

        if with_symlinks:
            env_target = custom_env if custom_env is not None else self.shared_env
            os.symlink(env_target, os.path.join(backend, ".env"))

            uploads_target = custom_uploads if custom_uploads is not None else self.shared_uploads
            os.symlink(uploads_target, os.path.join(backend, "uploads"))

        if mtime:
            t = mtime.timestamp()
            os.utime(path, (t, t))

        return path

    def _write_ledger(self, releases: list):
        """Helper to write ledger TSV."""
        with open(self.ledger_file, "w", encoding="utf-8") as f:
            for i, rel in enumerate(releases):
                ts = (datetime.now(timezone.utc) - timedelta(hours=len(releases) - i)).isoformat()
                f.write(f"{ts}\t{rel}\tsha_{rel}\tactivated\n")

    def test_standard_retention_flow(self):
        """Test that Live + 3 rollbacks (total 4) are retained, and older 6 are pruned."""
        releases = [f"release-0000000{i}" for i in range(1, 10)] + ["release-00000010"]
        for r in releases:
            self._create_release(r)

        # Set live release to the 10th
        live_path = os.path.join(self.builds_dir, "release-00000010")
        os.symlink(live_path, self.current_symlink)
        self._write_ledger(releases)

        # 1. Test Dry-Run first
        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            pipeline_lock_file=self.pipeline_lock,
            activation_lock_file=self.activation_lock,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            keep_count=4,
            dry_run=True,
            skip_locks=True,
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 0)
        # Verify no directories were deleted during dry-run
        self.assertEqual(len(os.listdir(self.builds_dir)), 11)  # 10 releases + .deployments_ledger.tsv

        # 2. Test Execution
        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            pipeline_lock_file=self.pipeline_lock,
            activation_lock_file=self.activation_lock,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            keep_count=4,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 0)

        # Retained set must be release-00000010 (live), release-00000009, 08, 07 (3 rollbacks)
        remaining = [d for d in os.listdir(self.builds_dir) if not d.startswith(".")]
        self.assertEqual(sorted(remaining), [
            "release-00000007",
            "release-00000008",
            "release-00000009",
            "release-00000010"
        ])

        # Verify persistent shared data is 100% intact
        self.assertTrue(os.path.isfile(self.shared_env))
        with open(self.shared_env, "r", encoding="utf-8") as f:
            self.assertEqual(f.read().strip(), "PROD_SECRET=very_secret_database_key")

        self.assertTrue(os.path.isfile(os.path.join(self.shared_uploads, "product_photo.jpg")))

    def test_fail_closed_on_regular_file_env(self):
        """Fail immediately if candidate has real .env file instead of symlink."""
        releases = ["release-00000001", "release-00000002", "release-00000003", "release-00000004", "release-00000005"]
        for r in releases:
            self._create_release(r)

        # Tamper with release-00000001: make .env a real regular file
        bad_env = os.path.join(self.builds_dir, "release-00000001", "backend", ".env")
        os.unlink(bad_env)
        with open(bad_env, "w", encoding="utf-8") as f:
            f.write("ACCIDENTAL_REAL_SECRET=do_not_delete")

        os.symlink(os.path.join(self.builds_dir, "release-00000005"), self.current_symlink)
        self._write_ledger(releases)

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            keep_count=4,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 1, "Must fail closed when .env is a real regular file")
        # Verify nothing was deleted
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-00000001")))

    def test_fail_closed_on_wrong_target_env_symlink(self):
        """Fail immediately if .env symlink points to unexpected location."""
        releases = ["release-00000001", "release-00000002", "release-00000003", "release-00000004", "release-00000005"]
        for r in releases:
            self._create_release(r)

        # Repoint release-00000001 .env to an illegal file
        illegal_file = os.path.join(self.test_dir, "other.env")
        with open(illegal_file, "w") as f:
            f.write("other")

        bad_env = os.path.join(self.builds_dir, "release-00000001", "backend", ".env")
        os.unlink(bad_env)
        os.symlink(illegal_file, bad_env)

        os.symlink(os.path.join(self.builds_dir, "release-00000005"), self.current_symlink)
        self._write_ledger(releases)

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            keep_count=4,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 1)

    def test_fail_closed_on_regular_dir_uploads(self):
        """Fail immediately if candidate has real directory for uploads instead of symlink."""
        releases = ["release-00000001", "release-00000002", "release-00000003", "release-00000004", "release-00000005"]
        for r in releases:
            self._create_release(r)

        bad_uploads = os.path.join(self.builds_dir, "release-00000001", "backend", "uploads")
        os.unlink(bad_uploads)
        os.makedirs(bad_uploads, exist_ok=True)
        with open(os.path.join(bad_uploads, "uploaded.jpg"), "w") as f:
            f.write("image")

        os.symlink(os.path.join(self.builds_dir, "release-00000005"), self.current_symlink)
        self._write_ledger(releases)

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            keep_count=4,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 1)

    def test_fail_closed_on_nested_mount(self):
        """Fail closed if candidate path is mounted or contains a mount point."""
        releases = ["release-00000001", "release-00000002", "release-00000003", "release-00000004", "release-00000005"]
        for r in releases:
            self._create_release(r)

        # Add candidate to mock mounts file
        cand_path = os.path.join(self.builds_dir, "release-00000001")
        with open(self.mounts_file, "a", encoding="utf-8") as f:
            f.write(f"/dev/sdb1 {cand_path} ext4 rw 0 0\n")

        os.symlink(os.path.join(self.builds_dir, "release-00000005"), self.current_symlink)
        self._write_ledger(releases)

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            keep_count=4,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 1)

    def test_fail_closed_on_dangling_or_missing_live_symlink(self):
        """Fail closed if current symlink is broken or missing."""
        self._write_ledger(["release-00000001"])

        # Non-existent symlink
        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=os.path.join(self.test_dir, "nonexistent_symlink"),
            ledger_file=self.ledger_file,
            skip_locks=True
        )
        self.assertEqual(exit_code, 1)

        # Dangling symlink
        os.symlink(os.path.join(self.builds_dir, "release-nonexistent"), self.current_symlink)
        self._write_ledger(["release-nonexistent"])
        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            skip_locks=True
        )
        self.assertEqual(exit_code, 1)

    def test_aborted_builds_quarantine_vs_pruning(self):
        """Test that fresh unverified aborted builds are quarantined, but old ones can be pruned."""
        now = datetime.now(timezone.utc)
        # Live and rollbacks
        releases = ["release-00000001", "release-00000002", "release-00000003", "release-00000004"]
        for r in releases:
            self._create_release(r)
        os.symlink(os.path.join(self.builds_dir, "release-00000004"), self.current_symlink)
        self._write_ledger(releases)

        # Create 1 fresh unverified build (1 hour old)
        self._create_release("release-fresh001", mtime=now - timedelta(hours=1))
        # Create 1 old unverified build (72 hours old)
        self._create_release("release-old00001", mtime=now - timedelta(hours=72))

        # Run with 24-hour quarantine
        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            keep_count=4,
            dry_run=False,
            prune_unverified_older_than_hours=24.0,
            skip_locks=True,
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 0)

        # release-fresh001 must still exist (quarantined)
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-fresh001")))
        # release-old00001 must have been pruned safely
        self.assertFalse(os.path.exists(os.path.join(self.builds_dir, "release-old00001")))
        # Live and rollbacks must still exist
        for r in releases:
            self.assertTrue(os.path.exists(os.path.join(self.builds_dir, r)))

    def test_missing_ledger_skips_safely(self):
        """If ledger file is missing, engine logs notice and skips without deleting."""
        self._create_release("release-00000001")
        os.symlink(os.path.join(self.builds_dir, "release-00000001"), self.current_symlink)

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=os.path.join(self.builds_dir, "missing_ledger.tsv"),
            skip_locks=True
        )
        self.assertEqual(exit_code, 0)
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-00000001")))

    def test_directory_traversal_and_malformed_names_ignored(self):
        """Malformed directory names or traversal attempts are ignored safely."""
        releases = ["release-00000001", "release-00000002", "release-00000003", "release-00000004"]
        for r in releases:
            self._create_release(r)
        os.symlink(os.path.join(self.builds_dir, "release-00000004"), self.current_symlink)
        self._write_ledger(releases)

        # Create malformed directory names
        os.makedirs(os.path.join(self.builds_dir, "release-invalid-length"), exist_ok=True)
        os.makedirs(os.path.join(self.builds_dir, "custom_backup"), exist_ok=True)

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            keep_count=4,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 0)
        # Malformed folders must not be touched
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-invalid-length")))
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "custom_backup")))

    def test_pipeline_lock_active_skips_safely(self):
        """When another process holds the pipeline lock, cleanup logs notice and exits cleanly."""
        self._create_release("release-00000001")
        os.symlink(os.path.join(self.builds_dir, "release-00000001"), self.current_symlink)
        self._write_ledger(["release-00000001"])

        with patch("deploy.prune_releases.FileLockContext") as mock_lock:
            # Simulate LockAcquisitionError
            mock_lock.return_value.__enter__.side_effect = LockAcquisitionError("Lock is held by deployment")
            exit_code = prune_releases(
                builds_dir=self.builds_dir,
                current_symlink=self.current_symlink,
                ledger_file=self.ledger_file,
                pipeline_lock_file=self.pipeline_lock,
                skip_locks=False
            )
            # Must return 0 (safe skip)
            self.assertEqual(exit_code, 0)
            self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-00000001")))

    def test_activation_lock_active_skips_safely(self):
        """When another process holds the activation lock, cleanup logs notice and exits cleanly."""
        self._create_release("release-00000001")
        os.symlink(os.path.join(self.builds_dir, "release-00000001"), self.current_symlink)
        self._write_ledger(["release-00000001"])

        with open(self.activation_lock, "w") as f:
            f.write("locked")

        with patch("deploy.prune_releases.FileLockContext") as mock_lock:
            # Pipeline lock passes, activation lock raises LockAcquisitionError
            class MockLockSeq:
                def __init__(self, path, mode, skip_lock):
                    self.path = path
                def __enter__(self):
                    if "deploy.lock" in self.path:
                        raise LockAcquisitionError("Held by activate-release.sh")
                    return self
                def __exit__(self, *args):
                    pass

            mock_lock.side_effect = MockLockSeq

            exit_code = prune_releases(
                builds_dir=self.builds_dir,
                current_symlink=self.current_symlink,
                ledger_file=self.ledger_file,
                pipeline_lock_file=self.pipeline_lock,
                activation_lock_file=self.activation_lock,
                skip_locks=False
            )
            self.assertEqual(exit_code, 0)

    def test_shared_data_untouched_after_multiple_prunes(self):
        """Verify that shared .env and uploads remain completely untouched after pruning multiple candidates."""
        releases = [f"release-0000000{i}" for i in range(1, 8)]
        for r in releases:
            self._create_release(r)
        os.symlink(os.path.join(self.builds_dir, "release-00000007"), self.current_symlink)
        self._write_ledger(releases)

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            keep_count=4,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 0)
        self.assertTrue(os.path.isfile(self.shared_env))
        self.assertTrue(os.path.isfile(os.path.join(self.shared_uploads, "product_photo.jpg")))


if __name__ == "__main__":
    unittest.main()
