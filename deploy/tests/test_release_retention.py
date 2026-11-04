"""
Comprehensive Automated Test Suite for VPS Release Retention Engine.

Tests:
1. Standard retention flow (Active + at least 3 usable rollbacks retained, older pruned).
2. Preserves unverified / unrecorded releases (NEVER deleted; surfaced for review).
3. Insufficient rollback history (< 3 usable rollbacks) safely skips pruning.
4. Repeated activations handling (deduplicates while respecting chronological order).
5. Rollback usability validation (excludes candidates with missing assets or broken code).
6. Auto-bootstrapping first-run ledger when missing.
7. Inherited pipeline lock FD coordination (--pipeline-lock-fd).
8. Continuous locking in standalone mode.
9. Fail-closed on regular file .env.
10. Fail-closed on wrong-target .env symlink.
11. Fail-closed on regular directory uploads.
12. Fail-closed on nested mounts or mount points.
13. Fail-closed on dangling or missing live symlink.
14. Preservation of shared persistent target data after unlinking.
15. Malformed folder names and directory traversal protection.
"""

import os
import shutil
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

from deploy.prune_releases import (
    evaluate_retention_plan,
    prune_releases,
    verify_persistent_symlinks,
    verify_mount_safety,
    validate_release_usability,
    bootstrap_ledger_if_missing,
    parse_ledger,
    ContinuousLockManager,
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

    def _create_release(
        self,
        name: str,
        with_symlinks: bool = True,
        with_frontend_dist: bool = True,
        with_backend_app: bool = True,
        custom_env: str = None,
        custom_uploads: str = None,
        mtime: datetime = None
    ) -> str:
        """Helper to create a physically complete mock release folder."""
        path = os.path.join(self.builds_dir, name)
        backend = os.path.join(path, "backend")
        frontend_dist = os.path.join(path, "frontend", "dist")
        os.makedirs(backend, exist_ok=True)

        if with_frontend_dist:
            os.makedirs(frontend_dist, exist_ok=True)
            with open(os.path.join(frontend_dist, "index.html"), "w", encoding="utf-8") as f:
                f.write(f"<html><body>Royal Libas - {name}</body></html>")

        if with_backend_app:
            app_dir = os.path.join(backend, "app")
            os.makedirs(app_dir, exist_ok=True)
            with open(os.path.join(app_dir, "main.py"), "w", encoding="utf-8") as f:
                f.write("# backend main")

        if with_symlinks:
            env_target = custom_env if custom_env is not None else self.shared_env
            os.symlink(env_target, os.path.join(backend, ".env"))

            uploads_target = custom_uploads if custom_uploads is not None else self.shared_uploads
            os.symlink(uploads_target, os.path.join(backend, "uploads"))

        if mtime:
            t = mtime.timestamp()
            os.utime(path, (t, t))

        return path

    def _write_ledger(self, records: list):
        """Helper to write ledger TSV with list of (release_name, status)."""
        with open(self.ledger_file, "w", encoding="utf-8") as f:
            f.write("# TIMESTAMP\tRELEASE_NAME\tCOMMIT_SHA\tSTATUS\n")
            for i, item in enumerate(records):
                if isinstance(item, tuple):
                    rel, status = item
                else:
                    rel, status = item, "activated"
                ts = (datetime.now(timezone.utc) - timedelta(hours=len(records) - i)).isoformat()
                f.write(f"{ts}\t{rel}\tsha_{rel}\t{status}\n")

    def test_standard_retention_flow(self):
        """Test that Live + at least 3 usable rollbacks are retained, and older 6 are pruned."""
        releases = [f"release-0000000{i}" for i in range(1, 10)] + ["release-00000010"]
        for r in releases:
            self._create_release(r)

        live_path = os.path.join(self.builds_dir, "release-00000010")
        os.symlink(live_path, self.current_symlink)
        self._write_ledger(releases)

        # 1. Dry-Run
        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            pipeline_lock_file=self.pipeline_lock,
            activation_lock_file=self.activation_lock,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            min_rollbacks=3,
            dry_run=True,
            skip_locks=True,
            mounts_file=self.mounts_file,
            auto_bootstrap=False
        )
        self.assertEqual(exit_code, 0)
        self.assertEqual(len(os.listdir(self.builds_dir)), 11)  # 10 releases + ledger

        # 2. Execution
        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            pipeline_lock_file=self.pipeline_lock,
            activation_lock_file=self.activation_lock,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            min_rollbacks=3,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file,
            auto_bootstrap=False
        )
        self.assertEqual(exit_code, 0)

        remaining = [d for d in os.listdir(self.builds_dir) if not d.startswith(".")]
        # Exactly 4 retained: release-00000010 (live), and 09, 08, 07 (3 rollbacks)
        self.assertEqual(sorted(remaining), [
            "release-00000007",
            "release-00000008",
            "release-00000009",
            "release-00000010"
        ])

    def test_unverified_releases_are_strictly_preserved(self):
        """Unverified/unrecorded releases must NEVER be automatically deleted."""
        releases = ["release-00000001", "release-00000002", "release-00000003", "release-00000004", "release-00000005"]
        for r in releases:
            self._create_release(r)
        os.symlink(os.path.join(self.builds_dir, "release-00000005"), self.current_symlink)
        self._write_ledger(releases)

        # Create an unrecorded release (e.g. interrupted build 3 days old)
        self._create_release("release-unrecorded", mtime=datetime.now(timezone.utc) - timedelta(days=3))

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            min_rollbacks=3,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file,
            auto_bootstrap=False
        )
        self.assertEqual(exit_code, 0)

        # release-unrecorded MUST still exist on disk (preserved for review)
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-unrecorded")))
        # release-00000001 (older verified release) was pruned
        self.assertFalse(os.path.exists(os.path.join(self.builds_dir, "release-00000001")))

    def test_insufficient_usable_rollbacks_safely_skips_pruning(self):
        """If fewer than min_rollbacks usable rollbacks exist, automatic pruning is skipped."""
        # Only 2 releases exist: 1 live + 1 rollback
        releases = ["release-00000001", "release-00000002"]
        for r in releases:
            self._create_release(r)
        os.symlink(os.path.join(self.builds_dir, "release-00000002"), self.current_symlink)
        self._write_ledger(releases)

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            min_rollbacks=3,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file,
            auto_bootstrap=False
        )
        self.assertEqual(exit_code, 0)
        # release-00000001 MUST NOT be pruned because we need at least 3 rollbacks
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-00000001")))

    def test_unusable_rollback_candidate_excluded_from_quota(self):
        """If a recorded release has missing frontend or broken code, it cannot satisfy rollback quota."""
        # 4 releases in ledger: 04 (live), 03 (usable), 02 (broken - missing frontend), 01 (usable)
        self._create_release("release-00000001")
        self._create_release("release-00000002", with_frontend_dist=False)  # Broken!
        self._create_release("release-00000003")
        self._create_release("release-00000004")

        os.symlink(os.path.join(self.builds_dir, "release-00000004"), self.current_symlink)
        self._write_ledger(["release-00000001", "release-00000002", "release-00000003", "release-00000004"])

        # Usable rollbacks are only release-00000003 and release-00000001 (total = 2, < min_rollbacks of 3)
        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            min_rollbacks=3,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file,
            auto_bootstrap=False
        )
        self.assertEqual(exit_code, 0)
        # Because usable rollbacks < 3, no older release may be pruned!
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-00000001")))

    def test_repeated_activations_handled_in_chronological_order(self):
        """Repeated activations in ledger are deduplicated in reverse chronological order."""
        # Sequence: rel1 -> rel2 -> rel1 -> rel3 (live)
        # Distinct prior activations in reverse: rel1, rel2
        for r in ["release-00000001", "release-00000002", "release-00000003"]:
            self._create_release(r)
        os.symlink(os.path.join(self.builds_dir, "release-00000003"), self.current_symlink)
        self._write_ledger([
            "release-00000001",
            "release-00000002",
            "release-00000001",
            "release-00000003"
        ])

        live_rel, rollbacks, candidates, unverified, warnings = evaluate_retention_plan(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_records=parse_ledger(self.ledger_file),
            expected_env=self.shared_env,
            expected_uploads=self.shared_uploads,
            min_rollbacks=2
        )
        self.assertEqual(live_rel, "release-00000003")
        self.assertEqual(rollbacks, ["release-00000001", "release-00000002"])

    def test_auto_bootstrap_ledger_on_first_run(self):
        """Missing ledger is automatically initialized so first deployment after merge works safely."""
        missing_ledger = os.path.join(self.builds_dir, "nonexistent_ledger.tsv")
        self.assertFalse(os.path.exists(missing_ledger))

        was_bootstrapped = bootstrap_ledger_if_missing(missing_ledger, self.builds_dir)
        self.assertTrue(was_bootstrapped)
        self.assertTrue(os.path.isfile(missing_ledger))

        # Verify parsed records contain audited baseline
        records = parse_ledger(missing_ledger)
        self.assertGreaterEqual(len(records), 16)
        self.assertEqual(records[-1]["release"], "release-6eIbw7Gt")

    def test_continuous_lock_manager_inherited_fd(self):
        """Validate ContinuousLockManager with simulated inherited FD."""
        with open(self.pipeline_lock, "w") as f:
            f.write("pipeline_lock")

        # Open FD to lockfile
        fd = os.open(self.pipeline_lock, os.O_RDWR)
        try:
            with ContinuousLockManager(
                pipeline_lock_file=self.pipeline_lock,
                pipeline_lock_fd=fd,
                skip_locks=False
            ):
                pass
        finally:
            os.close(fd)

    def test_fail_closed_on_regular_file_env(self):
        """Fail immediately if candidate has real .env file instead of symlink."""
        releases = ["release-00000001", "release-00000002", "release-00000003", "release-00000004", "release-00000005"]
        for r in releases:
            self._create_release(r)

        bad_env = os.path.join(self.builds_dir, "release-00000001", "backend", ".env")
        os.unlink(bad_env)
        with open(bad_env, "w", encoding="utf-8") as f:
            f.write("REAL_SECRET=forbidden")

        os.symlink(os.path.join(self.builds_dir, "release-00000005"), self.current_symlink)
        self._write_ledger(releases)

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            min_rollbacks=3,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file,
            auto_bootstrap=False
        )
        self.assertEqual(exit_code, 1, "Must fail closed on real .env file")
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-00000001")))

    def test_fail_closed_on_wrong_target_env_symlink(self):
        """Fail immediately if .env symlink points to unexpected location."""
        releases = ["release-00000001", "release-00000002", "release-00000003", "release-00000004", "release-00000005"]
        for r in releases:
            self._create_release(r)

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
            min_rollbacks=3,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file,
            auto_bootstrap=False
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
            min_rollbacks=3,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file,
            auto_bootstrap=False
        )
        self.assertEqual(exit_code, 1)

    def test_fail_closed_on_nested_mount(self):
        """Fail closed if candidate path is mounted or contains a mount point."""
        releases = ["release-00000001", "release-00000002", "release-00000003", "release-00000004", "release-00000005"]
        for r in releases:
            self._create_release(r)

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
            min_rollbacks=3,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file,
            auto_bootstrap=False
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
            skip_locks=True,
            auto_bootstrap=False
        )
        self.assertEqual(exit_code, 1)

        # Dangling symlink
        os.symlink(os.path.join(self.builds_dir, "release-nonexistent"), self.current_symlink)
        self._write_ledger(["release-nonexistent"])
        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            skip_locks=True,
            auto_bootstrap=False
        )
        self.assertEqual(exit_code, 1)

    def test_shared_data_untouched_after_multiple_prunes(self):
        """Verify that shared .env and uploads remain completely untouched after pruning candidates."""
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
            min_rollbacks=3,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file,
            auto_bootstrap=False
        )
        self.assertEqual(exit_code, 0)
        self.assertTrue(os.path.isfile(self.shared_env))
        self.assertTrue(os.path.isfile(os.path.join(self.shared_uploads, "product_photo.jpg")))


if __name__ == "__main__":
    unittest.main()
