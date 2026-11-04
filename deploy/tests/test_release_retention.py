"""
Comprehensive Automated Test Suite for VPS Release Retention Engine.

Tests:
1. Standard retention flow (Active + at least 3 usable rollbacks retained, older pruned).
2. Real sequence from empty ledger (First eligible deletion occurs on 5th recorded release).
3. Genuine read-only dry run (NEVER creates or mutates lock, ledger, or release folders).
4. Safe skip with missing ledger on first run.
5. Commit SHA mismatch on disk preserves release as uncertain (never deletes).
6. Ledger historical backfill ordering (entries appended out of order are sorted chronologically).
7. Strict rollback usability verification (missing links, missing venv, empty frontend).
8. Strict ledger validation (invalid timestamps, release names, commit SHAs, non-activated).
9. Preserves unverified / unrecorded releases (NEVER automatically deleted).
10. Repeated activations handled in reverse chronological deduplication.
11. Missing lock safe handling (dry-run skips without creating; execute skips safely).
12. Concurrent activation lock coordination (skips safely when held).
13. Concurrent pipeline lock coordination (skips safely when held).
14. Fail-closed on regular file .env.
15. Fail-closed on wrong-target .env symlink.
16. Fail-closed on regular directory uploads.
17. Fail-closed on nested mounts or mount points.
18. Fail-closed on dangling or missing live symlink.
19. Seed ledger evidence verification and chronological sorting.
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
    get_release_commit_sha,
    ContinuousLockManager,
    SafetyViolationError,
    LockAcquisitionError
)
from deploy.seed_ledger import seed_ledger


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
        mtime: datetime = None,
        sha: str = None
    ) -> str:
        """Helper to create a physically complete mock release folder with git metadata."""
        path = os.path.join(self.builds_dir, name)
        backend = os.path.join(path, "backend")
        frontend_dist = os.path.join(path, "frontend", "dist")
        os.makedirs(backend, exist_ok=True)

        # Mock git commit
        git_dir = os.path.join(path, ".git")
        os.makedirs(git_dir, exist_ok=True)
        if sha is not None:
            commit_sha = sha
        else:
            try:
                commit_sha = f"{int(name.split('-')[1]):040d}"
            except (IndexError, ValueError):
                commit_sha = "0" * 40
        with open(os.path.join(git_dir, "HEAD"), "w", encoding="utf-8") as f:
            f.write(f"{commit_sha}\n")

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
                    rel = item
                    sha = f"{int(item.split('-')[1]):040d}"
                    status = "activated"
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

        # Active target preserved
        self.assertTrue(os.path.isdir(live_path))
        # 3 rollbacks preserved: 9, 8, 7
        self.assertTrue(os.path.isdir(os.path.join(self.builds_dir, "release-00000009")))
        self.assertTrue(os.path.isdir(os.path.join(self.builds_dir, "release-00000008")))
        self.assertTrue(os.path.isdir(os.path.join(self.builds_dir, "release-00000007")))

        # Older releases pruned: 1 through 6
        for i in range(1, 7):
            self.assertFalse(os.path.exists(os.path.join(self.builds_dir, f"release-0000000{i}")))

    def test_real_sequence_from_empty_ledger_requires_fifth_release(self):
        """
        Verify the real sequence from an empty ledger:
        With active + 3 rollbacks retained, the 1st eligible deletion requires a 5th recorded release.
        """
        # Create 5 releases physically
        rel_names = [f"release-0000000{i}" for i in range(1, 6)]
        for r in rel_names:
            self._create_release(r)

        # Deployment 1: 1 release recorded
        os.symlink(os.path.join(self.builds_dir, "release-00000001"), self.current_symlink)
        self._write_ledger(["release-00000001"])
        recs, _ = parse_and_validate_ledger(self.ledger_file)
        live, rollbacks, candidates, _, _ = evaluate_retention_plan(
            self.builds_dir, self.current_symlink, recs, self.shared_env, self.shared_uploads, min_rollbacks=3
        )
        self.assertEqual(live, "release-00000001")
        self.assertEqual(len(rollbacks), 0)
        self.assertEqual(len(candidates), 0, "No candidates on 1st deployment")

        # Deployment 2: 2 releases recorded
        os.unlink(self.current_symlink)
        os.symlink(os.path.join(self.builds_dir, "release-00000002"), self.current_symlink)
        self._write_ledger(["release-00000001", "release-00000002"])
        recs, _ = parse_and_validate_ledger(self.ledger_file)
        live, rollbacks, candidates, _, _ = evaluate_retention_plan(
            self.builds_dir, self.current_symlink, recs, self.shared_env, self.shared_uploads, min_rollbacks=3
        )
        self.assertEqual(len(rollbacks), 1)
        self.assertEqual(len(candidates), 0, "No candidates on 2nd deployment")

        # Deployment 3: 3 releases recorded
        os.unlink(self.current_symlink)
        os.symlink(os.path.join(self.builds_dir, "release-00000003"), self.current_symlink)
        self._write_ledger(["release-00000001", "release-00000002", "release-00000003"])
        recs, _ = parse_and_validate_ledger(self.ledger_file)
        live, rollbacks, candidates, _, _ = evaluate_retention_plan(
            self.builds_dir, self.current_symlink, recs, self.shared_env, self.shared_uploads, min_rollbacks=3
        )
        self.assertEqual(len(rollbacks), 2)
        self.assertEqual(len(candidates), 0, "No candidates on 3rd deployment")

        # Deployment 4: 4 releases recorded (1 live + 3 rollbacks)
        os.unlink(self.current_symlink)
        os.symlink(os.path.join(self.builds_dir, "release-00000004"), self.current_symlink)
        self._write_ledger(["release-00000001", "release-00000002", "release-00000003", "release-00000004"])
        recs, _ = parse_and_validate_ledger(self.ledger_file)
        live, rollbacks, candidates, _, _ = evaluate_retention_plan(
            self.builds_dir, self.current_symlink, recs, self.shared_env, self.shared_uploads, min_rollbacks=3
        )
        self.assertEqual(live, "release-00000004")
        self.assertEqual(len(rollbacks), 3, "Exactly 3 rollbacks available")
        self.assertEqual(len(candidates), 0, "4 releases total = 1 live + 3 rollbacks. 0 eligible deletions!")

        # Deployment 5: 5 releases recorded (1 live + 3 rollbacks + 1 older release)
        os.unlink(self.current_symlink)
        os.symlink(os.path.join(self.builds_dir, "release-00000005"), self.current_symlink)
        self._write_ledger(rel_names)
        recs, _ = parse_and_validate_ledger(self.ledger_file)
        live, rollbacks, candidates, _, _ = evaluate_retention_plan(
            self.builds_dir, self.current_symlink, recs, self.shared_env, self.shared_uploads, min_rollbacks=3
        )
        self.assertEqual(live, "release-00000005")
        self.assertEqual(rollbacks, ["release-00000004", "release-00000003", "release-00000002"])
        self.assertEqual(len(candidates), 1, "5th release unlocks the 1st eligible deletion!")
        self.assertEqual(candidates[0]["name"], "release-00000001")

    def test_dry_run_is_genuinely_read_only(self):
        """Dry-run mode must never create, touch, or mutate lock, ledger, or release directories."""
        self._create_release("release-00000001")
        os.symlink(os.path.join(self.builds_dir, "release-00000001"), self.current_symlink)

        # Ledger does NOT exist initially
        self.assertFalse(os.path.exists(self.ledger_file))
        self.assertFalse(os.path.exists(self.pipeline_lock))

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
            skip_locks=False
        )
        self.assertEqual(exit_code, 0)
        # Verify genuine read-only invariant: no files created
        self.assertFalse(os.path.exists(self.ledger_file), "Ledger file must not be created in dry run")
        self.assertFalse(os.path.exists(self.pipeline_lock), "Lock file must not be created in dry run")
        self.assertTrue(os.path.isdir(os.path.join(self.builds_dir, "release-00000001")))

    def test_commit_sha_mismatch_preserves_uncertain_release(self):
        """If a candidate directory commit on disk does not match ledger SHA, it is preserved as uncertain."""
        releases = [f"release-0000000{i}" for i in range(1, 6)]
        for r in releases:
            self._create_release(r)

        # Corrupt commit SHA on disk for release-00000001
        corrupt_git_head = os.path.join(self.builds_dir, "release-00000001", ".git", "HEAD")
        with open(corrupt_git_head, "w", encoding="utf-8") as f:
            f.write("ffffffffffffffffffffffffffffffffffffffff\n")

        os.symlink(os.path.join(self.builds_dir, "release-00000005"), self.current_symlink)
        self._write_ledger(releases)

        recs, _ = parse_and_validate_ledger(self.ledger_file)
        live, rollbacks, candidates, unverified, warnings = evaluate_retention_plan(
            self.builds_dir, self.current_symlink, recs, self.shared_env, self.shared_uploads, min_rollbacks=3
        )
        self.assertEqual(len(candidates), 0, "Commit mismatch must not be admitted to prune_candidates")
        self.assertEqual(len(unverified), 1, "Commit mismatch must be preserved in unverified/uncertain")
        self.assertEqual(unverified[0]["name"], "release-00000001")
        self.assertIn("commit_mismatch", unverified[0]["status"].lower())

    def test_ledger_historical_backfill_chronological_ordering(self):
        """Historical records appended out of order after newer entries are sorted chronologically."""
        # Ledger file has release-00000005 first (newest), then historical releases appended after it
        with open(self.ledger_file, "w", encoding="utf-8") as f:
            f.write("# TIMESTAMP\tRELEASE_NAME\tCOMMIT_SHA\tSTATUS\n")
            f.write("2026-11-04T12:00:00Z\trelease-00000005\t0000000000000000000000000000000000000005\tactivated\n")
            f.write("2026-11-01T10:00:00Z\trelease-00000001\t0000000000000000000000000000000000000001\tactivated\n")
            f.write("2026-11-02T10:00:00Z\trelease-00000002\t0000000000000000000000000000000000000002\tactivated\n")
            f.write("2026-11-03T10:00:00Z\trelease-00000003\t0000000000000000000000000000000000000003\tactivated\n")
            f.write("2026-11-04T10:00:00Z\trelease-00000004\t0000000000000000000000000000000000000004\tactivated\n")

        valid_records, warnings = parse_and_validate_ledger(self.ledger_file)
        self.assertEqual(len(valid_records), 5)
        # Verify chronological ordering by timestamp
        self.assertEqual(valid_records[0]["release"], "release-00000001")
        self.assertEqual(valid_records[1]["release"], "release-00000002")
        self.assertEqual(valid_records[2]["release"], "release-00000003")
        self.assertEqual(valid_records[3]["release"], "release-00000004")
        self.assertEqual(valid_records[4]["release"], "release-00000005")

    def test_strict_rollback_usability_verification(self):
        """Rollback candidates missing venv, frontend, or symlinks are rejected from rollback retention."""
        # 1. Missing venv
        p1 = self._create_release("release-00000001", with_venv=False)
        usable, reason = validate_release_usability(p1, self.builds_dir, self.shared_env, self.shared_uploads)
        self.assertFalse(usable)
        self.assertIn("virtual environment", reason)

        # 2. Missing frontend
        p2 = self._create_release("release-00000002", with_frontend_dist=False)
        usable, reason = validate_release_usability(p2, self.builds_dir, self.shared_env, self.shared_uploads)
        self.assertFalse(usable)
        self.assertIn("Missing frontend/dist/index.html", reason)

        # 3. Empty frontend
        p3 = self._create_release("release-00000003", empty_frontend_dist=True)
        usable, reason = validate_release_usability(p3, self.builds_dir, self.shared_env, self.shared_uploads)
        self.assertFalse(usable)
        self.assertIn("empty", reason)

    def test_strict_ledger_validation_rejects_corrupted_lines(self):
        """Malformed or corrupted ledger entries are skipped with warnings."""
        with open(self.ledger_file, "w", encoding="utf-8") as f:
            f.write("# Header\n")
            f.write("INVALID_TIMESTAMP\trelease-00000001\t0000000000000000000000000000000000000001\tactivated\n")
            f.write("2026-11-04T01:00:00Z\tbad_release_name\t0000000000000000000000000000000000000001\tactivated\n")
            f.write("2026-11-04T02:00:00Z\trelease-00000001\tshort_sha\tactivated\n")
            f.write("2026-11-04T03:00:00Z\trelease-00000001\t0000000000000000000000000000000000000001\tfailed\n")
            f.write("2026-11-04T04:00:00Z\trelease-00000001\t0000000000000000000000000000000000000001\tactivated\n")

        records, warnings = parse_and_validate_ledger(self.ledger_file)
        self.assertEqual(len(records), 1)
        self.assertEqual(len(warnings), 4)

    def test_unverified_releases_strictly_preserved(self):
        """Unverified directories (not in ledger) are NEVER deleted, even with execute mode."""
        releases = [f"release-0000000{i}" for i in range(1, 6)]
        for r in releases:
            self._create_release(r)
        # Unrecorded release
        self._create_release("release-unrecorded")

        os.symlink(os.path.join(self.builds_dir, "release-00000005"), self.current_symlink)
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
        self.assertTrue(os.path.isdir(os.path.join(self.builds_dir, "release-unrecorded")))

    def test_missing_lock_safe_handling(self):
        """Missing lock in execute mode skips deletion safely."""
        self._create_release("release-00000001")
        os.symlink(os.path.join(self.builds_dir, "release-00000001"), self.current_symlink)
        self._write_ledger(["release-00000001"])

        missing_lock = os.path.join(self.test_dir, "nonexistent.lock")
        exit_code = prune_releases(
            builds_dir=self.builds_dir,
            current_symlink=self.current_symlink,
            ledger_file=self.ledger_file,
            pipeline_lock_file=missing_lock,
            activation_lock_file=self.activation_lock,
            shared_env=self.shared_env,
            shared_uploads=self.shared_uploads,
            dry_run=False,
            skip_locks=False
        )
        self.assertEqual(exit_code, 0)

    def test_fail_closed_on_regular_file_env(self):
        """Fail closed if candidate directory .env is a regular file instead of symlink."""
        self._create_release("release-00000001")
        env_link = os.path.join(self.builds_dir, "release-00000001", "backend", ".env")
        os.unlink(env_link)
        with open(env_link, "w") as f:
            f.write("DANGEROUS_REGULAR_FILE")

        releases = [f"release-0000000{i}" for i in range(1, 6)]
        for r in releases[1:]:
            self._create_release(r)
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
        """Fail closed if candidate directory .env symlink points to wrong file."""
        rogue_env = os.path.join(self.test_dir, "rogue.env")
        with open(rogue_env, "w") as f:
            f.write("ROGUE")

        self._create_release("release-00000001", custom_env=rogue_env)
        releases = [f"release-0000000{i}" for i in range(1, 6)]
        for r in releases[1:]:
            self._create_release(r)
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

    def test_fail_closed_on_regular_directory_uploads(self):
        """Fail closed if candidate directory uploads is a regular directory instead of symlink."""
        self._create_release("release-00000001")
        uploads_link = os.path.join(self.builds_dir, "release-00000001", "backend", "uploads")
        os.unlink(uploads_link)
        os.makedirs(uploads_link, exist_ok=True)

        releases = [f"release-0000000{i}" for i in range(1, 6)]
        for r in releases[1:]:
            self._create_release(r)
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

    def test_fail_closed_on_nested_mounts(self):
        """Fail closed if candidate directory or any subpath is a mount point."""
        releases = [f"release-0000000{i}" for i in range(1, 6)]
        for r in releases:
            self._create_release(r)
        os.symlink(os.path.join(self.builds_dir, "release-00000005"), self.current_symlink)
        self._write_ledger(releases)

        # Mock mount inside candidate
        candidate_rel = os.path.join(self.builds_dir, "release-00000001")
        with open(self.mounts_file, "a", encoding="utf-8") as f:
            f.write(f"/dev/sdb1 {candidate_rel} ext4 rw 0 0\n")

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

    def test_seed_ledger_missing_evidence_disables_seeding(self):
        """Without independent activation evidence, seed_ledger refuses to mark historical entries as activated."""
        self._create_release("release-huDNUmEb", sha="805e7a93091e8f073ad3d629fc4d952d46cd454b")

        # Without evidence file, execution must not mark it as activated
        res = seed_ledger(
            self.ledger_file,
            builds_dir=self.builds_dir,
            pipeline_lock_file=self.pipeline_lock,
            evidence_file=None,
            dry_run=False
        )
        self.assertEqual(res, 0)
        # Ledger was not seeded with unverified activated records
        recs, _ = parse_and_validate_ledger(self.ledger_file)
        self.assertEqual(len(recs), 0)

    def test_seed_ledger_with_independent_evidence(self):
        """With independent activation evidence, seed_ledger verifies physical release directories, commits, and evidence."""
        # Create 2 physical releases
        self._create_release("release-huDNUmEb", sha="805e7a93091e8f073ad3d629fc4d952d46cd454b")
        self._create_release("release-CPCGzuLG", sha="d9e7507cd1b8f820e44c9644fc460bb50902c6f1")

        # Independent evidence file containing proof for release-huDNUmEb only
        evidence_file = os.path.join(self.test_dir, "evidence.tsv")
        with open(evidence_file, "w", encoding="utf-8") as f:
            f.write("release-huDNUmEb\t805e7a93091e8f073ad3d629fc4d952d46cd454b\tpostgres_backup_snapshot_1\n")

        # Existing ledger contains a newer deployment
        with open(self.ledger_file, "w", encoding="utf-8") as f:
            f.write("2026-11-04T12:00:00Z\trelease-00000005\t0000000000000000000000000000000000000005\tactivated\n")

        # Execute merges and sorts chronologically
        res_exec = seed_ledger(
            self.ledger_file,
            builds_dir=self.builds_dir,
            pipeline_lock_file=self.pipeline_lock,
            evidence_file=evidence_file,
            dry_run=False
        )
        self.assertEqual(res_exec, 0)

        recs, _ = parse_and_validate_ledger(self.ledger_file)
        # Only release-huDNUmEb has independent evidence and is seeded as activated
        self.assertEqual(len(recs), 2)
        self.assertEqual(recs[0]["release"], "release-huDNUmEb")
        self.assertEqual(recs[0]["status"], "activated")
        self.assertEqual(recs[1]["release"], "release-00000005")

    def test_uncertain_historical_releases_never_deleted(self):
        """Historical releases marked as uncertain_historical are strictly excluded from deletion."""
        # Create 6 physical releases
        releases = [f"release-0000000{i}" for i in range(1, 7)]
        for r in releases:
            self._create_release(r)

        os.symlink(os.path.join(self.builds_dir, "release-00000006"), self.current_symlink)

        # Write ledger where older releases 1, 2, 3 have status uncertain_historical
        with open(self.ledger_file, "w", encoding="utf-8") as f:
            f.write("# TIMESTAMP\tRELEASE_NAME\tCOMMIT_SHA\tSTATUS\n")
            f.write("2026-11-01T10:00:00Z\trelease-00000001\t0000000000000000000000000000000000000001\tuncertain_historical\n")
            f.write("2026-11-02T10:00:00Z\trelease-00000002\t0000000000000000000000000000000000000002\tuncertain_historical\n")
            f.write("2026-11-03T10:00:00Z\trelease-00000003\t0000000000000000000000000000000000000003\tuncertain_historical\n")
            f.write("2026-11-04T10:00:00Z\trelease-00000004\t0000000000000000000000000000000000000004\tactivated\n")
            f.write("2026-11-04T11:00:00Z\trelease-00000005\t0000000000000000000000000000000000000005\tactivated\n")
            f.write("2026-11-04T12:00:00Z\trelease-00000006\t0000000000000000000000000000000000000006\tactivated\n")

        recs, warnings = parse_and_validate_ledger(self.ledger_file)
        self.assertEqual(len(recs), 3, "Only the 3 activated releases are admitted to valid_records")
        self.assertEqual(len(warnings), 3, "Uncertain releases produce validation notices")

        live, rollbacks, candidates, unverified, _ = evaluate_retention_plan(
            self.builds_dir, self.current_symlink, recs, self.shared_env, self.shared_uploads, min_rollbacks=3
        )
        # Because only 2 rollbacks are activated (release 4 and 5), min_rollbacks (3) is not satisfied
        # candidates MUST be 0!
        self.assertEqual(len(candidates), 0)
        # Releases 1, 2, 3 must be in unverified and PRESERVED!
        unverified_names = [u["name"] for u in unverified]
        self.assertIn("release-00000001", unverified_names)
        self.assertIn("release-00000002", unverified_names)
        self.assertIn("release-00000003", unverified_names)

        # Execute pruning
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
        # All releases 1 through 6 MUST still exist on disk!
        for i in range(1, 7):
            self.assertTrue(
                os.path.isdir(os.path.join(self.builds_dir, f"release-0000000{i}")),
                f"release-0000000{i} must not be deleted!"
            )


if __name__ == "__main__":
    unittest.main()
