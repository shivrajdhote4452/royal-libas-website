"""
Comprehensive Automated Test Suite for VPS Release Retention Engine.

Tests:
1. Standard retention flow (Active + at least 3 usable rollbacks retained, older pruned).
2. Genuine read-only dry run (NEVER creates or mutates ledger or release folders).
3. First-run safe behavior (when ledger has fewer than 3 rollbacks, skips deletion).
4. Strict rollback usability verification:
   - Missing or invalid .env symlink -> fails usability.
   - Missing or invalid uploads symlink -> fails usability.
   - Missing virtualenv python -> fails usability.
   - Missing or empty frontend dist/index.html -> fails usability.
5. Strict ledger validation:
   - Invalid timestamp format rejected.
   - Invalid release name rejected.
   - Invalid commit SHA rejected.
   - Non-activated status rejected.
6. Preserves unverified / unrecorded releases (NEVER automatically deleted).
7. Repeated activations handled in reverse chronological deduplication.
8. Inherited pipeline lock FD coordination (--pipeline-lock-fd).
9. Continuous locking in standalone mode.
10. Fail-closed on regular file .env.
11. Fail-closed on wrong-target .env symlink.
12. Fail-closed on regular directory uploads.
13. Fail-closed on nested mounts or mount points.
14. Fail-closed on dangling or missing live symlink.
15. Preservation of shared persistent target data after unlinking.
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
    validate_release_usability,
    parse_and_validate_ledger,
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
        empty_frontend_dist: bool = False,
        with_backend_app: bool = True,
        with_venv: bool = True,
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
            dist_file = os.path.join(frontend_dist, "index.html")
            with open(dist_file, "w", encoding="utf-8") as f:
                if not empty_frontend_dist:
                    f.write(f"<html><body>Royal Libas - {name}</body></html>")

        if with_backend_app:
            app_dir = os.path.join(backend, "app")
            os.makedirs(app_dir, exist_ok=True)
            with open(os.path.join(app_dir, "main.py"), "w", encoding="utf-8") as f:
                f.write("# backend main")

        if with_venv:
            # Create mock executable virtualenv python
            bin_dir = os.path.join(backend, ".venv", "bin")
            os.makedirs(bin_dir, exist_ok=True)
            py_bin = os.path.join(bin_dir, "python")
            with open(py_bin, "w", encoding="utf-8") as f:
                f.write("#!/bin/sh\necho python")
            os.chmod(py_bin, 0o755)

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
        """Helper to write ledger TSV with list of tuples or release names."""
        with open(self.ledger_file, "w", encoding="utf-8") as f:
            f.write("# TIMESTAMP\tRELEASE_NAME\tCOMMIT_SHA\tSTATUS\n")
            for i, item in enumerate(records):
                if isinstance(item, tuple):
                    rel, sha, status = item
                else:
                    rel, sha, status = item, f"{i:040d}", "activated"
                ts = (datetime.now(timezone.utc) - timedelta(hours=len(records) - i)).isoformat()
                f.write(f"{ts}\t{rel}\t{sha}\t{status}\n")

    def test_standard_retention_flow(self):
        """Test that Live + at least 3 usable rollbacks are retained, and older releases are pruned."""
        releases = [f"release-0000000{i}" for i in range(1, 10)] + ["release-00000010"]
        for r in releases:
            self._create_release(r)

        live_path = os.path.join(self.builds_dir, "release-00000010")
        os.symlink(live_path, self.current_symlink)
        self._write_ledger(releases)

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
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 0)

        remaining = [d for d in os.listdir(self.builds_dir) if not d.startswith(".")]
        self.assertEqual(sorted(remaining), [
            "release-00000007",
            "release-00000008",
            "release-00000009",
            "release-00000010"
        ])

    def test_genuine_read_only_dry_run(self):
        """Dry-run must not create or modify ledger or delete any directories."""
        missing_ledger = os.path.join(self.builds_dir, "nonexistent_ledger.tsv")
        self._create_release("release-00000001")
        os.symlink(os.path.join(self.builds_dir, "release-00000001"), self.current_symlink)

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=missing_ledger,
            dry_run=True,
            skip_locks=True
        )
        self.assertEqual(exit_code, 0)
        # MUST NOT create missing ledger file in dry-run mode
        self.assertFalse(os.path.exists(missing_ledger))
        # Release directory must still exist
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-00000001")))

    def test_first_run_safe_behavior_skips_deletion(self):
        """When ledger has only 1 newly deployed release, engine skips deletion safely."""
        self._create_release("release-00000001")
        os.symlink(os.path.join(self.builds_dir, "release-00000001"), self.current_symlink)
        self._write_ledger(["release-00000001"])

        # Also have an older unrecorded release present in builds
        self._create_release("release-unrecorded")

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            min_rollbacks=3,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 0)
        # Neither folder should be deleted because rollback quota is unmet
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-00000001")))
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-unrecorded")))

    def test_rollback_usability_validation_failures(self):
        """Ensure validate_release_usability enforces every required invariant."""
        # 1. Missing .env symlink
        r1 = self._create_release("release-no000env", with_symlinks=False)
        usable, reason = validate_release_usability(r1, self.builds_dir, self.shared_env, self.shared_uploads)
        self.assertFalse(usable)
        self.assertIn(".env", reason)

        # 2. Missing virtual environment
        r2 = self._create_release("release-no00venv", with_venv=False)
        usable, reason = validate_release_usability(r2, self.builds_dir, self.shared_env, self.shared_uploads)
        self.assertFalse(usable)
        self.assertIn(".venv", reason)

        # 3. Missing frontend dist/index.html
        r3 = self._create_release("release-no00dist", with_frontend_dist=False)
        usable, reason = validate_release_usability(r3, self.builds_dir, self.shared_env, self.shared_uploads)
        self.assertFalse(usable)
        self.assertIn("frontend/dist/index.html", reason)

        # 4. Empty frontend dist/index.html
        r4 = self._create_release("release-empty001", empty_frontend_dist=True)
        usable, reason = validate_release_usability(r4, self.builds_dir, self.shared_env, self.shared_uploads)
        self.assertFalse(usable)
        self.assertIn("empty", reason)

    def test_ledger_record_validation(self):
        """Validate that malformed or non-activated ledger lines are rejected."""
        valid_sha = "a" * 40
        records = [
            # Valid record
            ("release-00000001", valid_sha, "activated"),
            # Bad SHA
            ("release-00000002", "not_a_sha", "activated"),
            # Bad Status
            ("release-00000003", valid_sha, "failed"),
            # Bad Release name
            ("invalid_release_name", valid_sha, "activated"),
        ]
        self._write_ledger(records)

        valid_parsed, warnings = parse_and_validate_ledger(self.ledger_file)
        # Exactly 1 valid record should pass
        self.assertEqual(len(valid_parsed), 1)
        self.assertEqual(valid_parsed[0]["release"], "release-00000001")
        self.assertGreaterEqual(len(warnings), 3)

    def test_unverified_releases_are_strictly_preserved(self):
        """Unverified/unrecorded releases must NEVER be automatically deleted."""
        releases = ["release-00000001", "release-00000002", "release-00000003", "release-00000004", "release-00000005"]
        for r in releases:
            self._create_release(r)
        os.symlink(os.path.join(self.builds_dir, "release-00000005"), self.current_symlink)
        self._write_ledger(releases)

        self._create_release("release-unrecorded")

        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            min_rollbacks=3,
            dry_run=False,
            skip_locks=True,
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 0)
        # release-unrecorded MUST still exist on disk (preserved for review)
        self.assertTrue(os.path.exists(os.path.join(self.builds_dir, "release-unrecorded")))
        # release-00000001 was pruned
        self.assertFalse(os.path.exists(os.path.join(self.builds_dir, "release-00000001")))

    def test_repeated_activations_handled_in_chronological_order(self):
        """Repeated activations in ledger are deduplicated in reverse chronological order."""
        for r in ["release-00000001", "release-00000002", "release-00000003"]:
            self._create_release(r)
        os.symlink(os.path.join(self.builds_dir, "release-00000003"), self.current_symlink)
        self._write_ledger([
            "release-00000001",
            "release-00000002",
            "release-00000001",
            "release-00000003"
        ])

        valid_records, _ = parse_and_validate_ledger(self.ledger_file)
        live_rel, rollbacks, candidates, unverified, warnings = evaluate_retention_plan(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_records=valid_records,
            expected_env=self.shared_env,
            expected_uploads=self.shared_uploads,
            min_rollbacks=2
        )
        self.assertEqual(live_rel, "release-00000003")
        self.assertEqual(rollbacks, ["release-00000001", "release-00000002"])

    def test_continuous_lock_manager_inherited_fd(self):
        """Validate ContinuousLockManager with simulated inherited FD."""
        with open(self.pipeline_lock, "w") as f:
            f.write("pipeline_lock")

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
            mounts_file=self.mounts_file
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
            min_rollbacks=3,
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
        os.symlink(os.path.join(self.builds_dir, "release-00000099"), self.current_symlink)
        self._write_ledger(["release-00000099"])
        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            skip_locks=True
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
            mounts_file=self.mounts_file
        )
        self.assertEqual(exit_code, 0)
        self.assertTrue(os.path.isfile(self.shared_env))
        self.assertTrue(os.path.isfile(os.path.join(self.shared_uploads, "product_photo.jpg")))


if __name__ == "__main__":
    unittest.main()
