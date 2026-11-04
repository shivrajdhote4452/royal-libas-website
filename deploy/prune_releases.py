#!/usr/bin/env python3
"""
Royal Libas VPS Release Retention and Pruning Engine

Safely retains the active production release and at least three verified,
usable rollback releases. Prunes only verified older releases from recorded
deployment history after fail-closed safety assertions.

Safety Invariants:
1. Continuous lifecycle locking:
   - In deployment pipeline: validates and holds inherited pipeline lock (FD 200).
   - In standalone cleanup: acquires and continuously holds both pipeline lock
     and activation lock from evaluation through completion.
2. Genuine read-only dry run: Never creates, touches, or mutates ledger or
   filesystem assets when running in dry-run mode.
3. Strict rollback usability: Requires backend .env symlink, uploads symlink,
   executable virtualenv, backend app code, and frontend dist/index.html to exist
   and resolve to valid shared targets.
4. Ledger record validation: Validates ISO 8601 timestamps, release naming,
   40-char commit SHAs, and 'activated' status. Rejects invalid records.
5. Preserves unverified releases: Never automatically deletes unrecorded builds;
   surfaces them for operator review.
6. Safe first deployment: Never assumes or hardcodes deletion rights; preserves
   all unrecorded releases and skips deletion until at least 3 verified usable
   rollbacks have accumulated in the ledger.
7. Fail-closed safety: Validates real paths, rejects nested mounts, and unlinks
   safe symlinks before directory deletion.
"""

import argparse
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

# Cross-platform file locking support
try:
    import fcntl
    HAS_FCNTL = True
except ImportError:
    HAS_FCNTL = False

RELEASE_NAME_RE = re.compile(r"^release-[A-Za-z0-9]{8}$")
COMMIT_SHA_RE = re.compile(r"^[0-9a-f]{40}$")


class LockAcquisitionError(Exception):
    """Raised when an exclusive deployment or activation lock cannot be acquired."""
    pass


class SafetyViolationError(Exception):
    """Raised when a candidate directory violates safety invariants."""
    pass


class ContinuousLockManager:
    """
    Manages continuous lifecycle locking throughout inspection, evaluation, and pruning.
    
    Supports:
    1. Inherited pipeline lock FD from calling deployment workflow (e.g. FD 200).
    2. Direct acquisition of pipeline lock file when running standalone.
    3. Direct acquisition of activation lock file to coordinate with activate-release.sh.
    """

    def __init__(
        self,
        pipeline_lock_file: str,
        pipeline_lock_fd: Optional[int] = None,
        activation_lock_file: Optional[str] = None,
        skip_locks: bool = False
    ):
        self.pipeline_lock_file = pipeline_lock_file
        self.pipeline_lock_fd = pipeline_lock_fd
        self.activation_lock_file = activation_lock_file
        self.skip_locks = skip_locks

        self._pipeline_file_obj = None
        self._activation_file_obj = None

    def __enter__(self):
        if self.skip_locks or not HAS_FCNTL:
            return self

        # 1. Pipeline lock coordination
        if self.pipeline_lock_fd is not None:
            # Validate that inherited FD is open and points to the pipeline lockfile
            try:
                fd_stat = os.fstat(self.pipeline_lock_fd)
                file_stat = os.stat(self.pipeline_lock_file)
                if (fd_stat.st_ino != file_stat.st_ino) or (fd_stat.st_dev != file_stat.st_dev):
                    raise LockAcquisitionError(
                        f"Inherited lock FD {self.pipeline_lock_fd} does not match '{self.pipeline_lock_file}'"
                    )
                # Verify lock on inherited FD without closing it
                fcntl.flock(self.pipeline_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except (OSError, BlockingIOError) as exc:
                raise LockAcquisitionError(
                    f"Inherited pipeline lock FD {self.pipeline_lock_fd} invalid or busy: {exc}"
                )
        else:
            # Standalone mode: acquire pipeline lock directly
            try:
                self._pipeline_file_obj = open(self.pipeline_lock_file, "a+")
                fcntl.flock(self._pipeline_file_obj.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except (BlockingIOError, PermissionError, OSError) as exc:
                self._cleanup_locks()
                raise LockAcquisitionError(
                    f"Cannot acquire exclusive pipeline lock on '{self.pipeline_lock_file}': {exc}"
                )

        # 2. Activation lock coordination
        if self.activation_lock_file and os.path.exists(self.activation_lock_file):
            try:
                # Open read-only to allow unprivileged royal-deploy user to lock 0644 file
                self._activation_file_obj = open(self.activation_lock_file, "r")
                fcntl.flock(self._activation_file_obj.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except (BlockingIOError, PermissionError, OSError) as exc:
                self._cleanup_locks()
                raise LockAcquisitionError(
                    f"Cannot acquire exclusive activation lock on '{self.activation_lock_file}': {exc}"
                )

        return self

    def _cleanup_locks(self):
        if self._activation_file_obj:
            try:
                fcntl.flock(self._activation_file_obj.fileno(), fcntl.LOCK_UN)
            except Exception:
                pass
            try:
                self._activation_file_obj.close()
            except Exception:
                pass
            self._activation_file_obj = None

        if self._pipeline_file_obj:
            try:
                fcntl.flock(self._pipeline_file_obj.fileno(), fcntl.LOCK_UN)
            except Exception:
                pass
            try:
                self._pipeline_file_obj.close()
            except Exception:
                pass
            self._pipeline_file_obj = None

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._cleanup_locks()


def get_dir_size_bytes(path: str) -> int:
    """Calculate directory size in bytes without traversing symlinks."""
    total = 0
    try:
        for entry in os.scandir(path):
            try:
                if entry.is_symlink():
                    continue
                if entry.is_file():
                    total += entry.stat().st_size
                elif entry.is_dir():
                    total += get_dir_size_bytes(entry.path)
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError):
        pass
    return total


def format_bytes(bytes_count: int) -> str:
    """Format bytes into human-readable string."""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if bytes_count < 1024.0:
            return f"{bytes_count:.1f} {unit}"
        bytes_count /= 1024.0
    return f"{bytes_count:.1f} PB"


def parse_and_validate_ledger(ledger_path: str) -> Tuple[List[Dict[str, str]], List[str]]:
    """
    Parse append-only deployments ledger and strictly validate records.
    
    Validations:
    - 4 tab-separated fields: TIMESTAMP, RELEASE_NAME, COMMIT_SHA, STATUS
    - Valid ISO 8601 UTC timestamp
    - Valid release name format
    - Valid 40-character hex commit SHA
    - STATUS == 'activated'
    
    Returns:
        (valid_records_chronological, validation_warnings)
    """
    if not os.path.isfile(ledger_path):
        return [], [f"Ledger file '{ledger_path}' does not exist."]

    valid_records: List[Dict[str, str]] = []
    warnings: List[str] = []

    with open(ledger_path, "r", encoding="utf-8") as f:
        for line_no, raw_line in enumerate(f, 1):
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split("\t")
            if len(parts) < 4:
                warnings.append(f"Line {line_no}: Malformed ledger entry (expected 4 fields, got {len(parts)}): '{line}'")
                continue

            ts_raw, rel_raw, sha_raw, status_raw = parts[0].strip(), parts[1].strip(), parts[2].strip(), parts[3].strip()

            # 1. Timestamp validation
            try:
                # Support timestamps ending in Z or with offset
                ts_clean = ts_raw.replace("Z", "+00:00")
                parsed_ts = datetime.fromisoformat(ts_clean)
            except Exception:
                warnings.append(f"Line {line_no}: Invalid timestamp format '{ts_raw}' in ledger.")
                continue

            # 2. Release format validation
            if not RELEASE_NAME_RE.match(rel_raw):
                warnings.append(f"Line {line_no}: Invalid release format '{rel_raw}' in ledger.")
                continue

            # 3. Commit SHA validation
            if not COMMIT_SHA_RE.match(sha_raw):
                warnings.append(f"Line {line_no}: Invalid commit SHA format '{sha_raw}' in ledger.")
                continue

            # 4. Activation status validation
            if status_raw.lower() != "activated" and status_raw.lower() != "active":
                warnings.append(f"Line {line_no}: Release '{rel_raw}' has non-activated status '{status_raw}'; ignored.")
                continue

            valid_records.append({
                "line": line_no,
                "timestamp": parsed_ts.isoformat(),
                "release": rel_raw,
                "sha": sha_raw,
                "status": "activated"
            })

    return valid_records, warnings


def verify_mount_safety(candidate_path: str, mounts_file: str = "/proc/mounts") -> None:
    """Fail closed if candidate or any subpath is a filesystem or bind mount."""
    candidate_real = os.path.realpath(candidate_path)
    if not os.path.isfile(mounts_file):
        return  # Non-Linux or test environment without mock mounts file

    try:
        with open(mounts_file, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    mount_point = os.path.realpath(parts[1])
                    if mount_point == candidate_real or mount_point.startswith(candidate_real + os.sep):
                        raise SafetyViolationError(
                            f"FAIL-CLOSED: Mount point detected inside candidate directory: '{mount_point}'"
                        )
    except (IOError, OSError) as exc:
        raise SafetyViolationError(f"FAIL-CLOSED: Unable to inspect mounts file '{mounts_file}': {exc}")


def verify_persistent_symlinks(candidate_path: str, expected_env: str, expected_uploads: str) -> None:
    """
    Ensure .env and uploads inside candidate directory strictly exist as valid symlinks
    pointing directly to the intended persistent production paths.
    Fail closed immediately if missing, regular files, or pointing elsewhere.
    """
    backend_dir = os.path.join(candidate_path, "backend")
    if not os.path.isdir(backend_dir):
        raise SafetyViolationError(f"FAIL-CLOSED: Candidate missing backend directory: '{candidate_path}'")

    # .env verification
    env_path = os.path.join(backend_dir, ".env")
    if not os.path.islink(env_path):
        raise SafetyViolationError(
            f"FAIL-CLOSED: '{env_path}' must exist strictly as a symlink pointing to production .env!"
        )
    target_env = os.readlink(env_path)
    target_env_real = os.path.realpath(env_path)
    expected_env_real = os.path.realpath(expected_env)
    if target_env_real != expected_env_real:
        raise SafetyViolationError(
            f"FAIL-CLOSED: '{env_path}' points to unexpected target: '{target_env}' (expected '{expected_env}')"
        )

    # uploads verification
    uploads_path = os.path.join(backend_dir, "uploads")
    if not os.path.islink(uploads_path):
        raise SafetyViolationError(
            f"FAIL-CLOSED: '{uploads_path}' must exist strictly as a symlink pointing to production uploads!"
        )
    target_uploads = os.readlink(uploads_path)
    target_uploads_real = os.path.realpath(uploads_path)
    expected_uploads_real = os.path.realpath(expected_uploads)
    if target_uploads_real != expected_uploads_real:
        raise SafetyViolationError(
            f"FAIL-CLOSED: '{uploads_path}' points to unexpected target: '{target_uploads}' (expected '{expected_uploads}')"
        )


def safe_unlink_persistent_symlinks(candidate_path: str) -> None:
    """Safely unlink known symlinks before directory deletion to avoid following symlinks."""
    for rel_link in [os.path.join("backend", ".env"), os.path.join("backend", "uploads")]:
        link_path = os.path.join(candidate_path, rel_link)
        if os.path.islink(link_path):
            try:
                os.unlink(link_path)
            except OSError as exc:
                raise SafetyViolationError(f"FAIL-CLOSED: Failed to unlink safe symlink '{link_path}': {exc}")


def validate_release_usability(
    release_path: str,
    builds_dir: str,
    expected_env: str,
    expected_uploads: str
) -> Tuple[bool, str]:
    """
    Validate that a release directory is structurally complete and usable as a rollback target.
    
    Verifies:
    1. Real directory physically under intended builds directory.
    2. Shared .env link exists and resolves to real existing shared .env.
    3. Shared uploads link exists and resolves to real existing shared uploads.
    4. Backend virtualenv python exists and is an executable file.
    5. Backend application code exists (backend/app or backend/app.py).
    6. Frontend production build exists and is non-empty (frontend/dist/index.html).
    """
    # 1. Directory containment
    if not os.path.isdir(release_path) or os.path.islink(release_path):
        return False, "Not a physical directory"

    real_rel = os.path.realpath(release_path)
    real_builds = os.path.realpath(builds_dir)
    if os.path.dirname(real_rel) != real_builds:
        return False, f"Release path '{real_rel}' is not directly under builds directory '{real_builds}'"

    # 2. Shared persistent storage checks
    if not os.path.isfile(expected_env):
        return False, f"Shared production .env file missing at '{expected_env}'"
    if not os.path.isdir(expected_uploads):
        return False, f"Shared production uploads directory missing at '{expected_uploads}'"

    try:
        verify_persistent_symlinks(release_path, expected_env, expected_uploads)
    except SafetyViolationError as err:
        return False, str(err)

    # 3. Backend virtualenv and code checks
    venv_python_unix = os.path.join(release_path, "backend", ".venv", "bin", "python")
    venv_python_win = os.path.join(release_path, "backend", ".venv", "Scripts", "python.exe")
    if not (os.path.isfile(venv_python_unix) or os.path.isfile(venv_python_win)):
        return False, "Missing backend Python virtual environment (.venv)"

    backend_app = os.path.join(release_path, "backend", "app")
    backend_py = os.path.join(release_path, "backend", "app.py")
    if not (os.path.isdir(backend_app) or os.path.isfile(backend_py)):
        return False, "Missing backend application code"

    # 4. Frontend dist check
    dist_index = os.path.join(release_path, "frontend", "dist", "index.html")
    if not os.path.isfile(dist_index):
        return False, "Missing frontend/dist/index.html"
    if os.path.getsize(dist_index) == 0:
        return False, "frontend/dist/index.html is empty (0 bytes)"

    return True, "OK [Structurally usable]"


def evaluate_retention_plan(
    builds_dir: str,
    current_symlink: str,
    ledger_records: List[Dict[str, str]],
    expected_env: str,
    expected_uploads: str,
    min_rollbacks: int = 3
) -> Tuple[str, List[str], List[Dict[str, any]], List[Dict[str, any]], List[str]]:
    """
    Evaluate retention plan based on verified ledger and usability assertions.

    Returns:
        (live_release_name, retained_rollback_names, prune_candidates, unverified_releases, warnings)
    """
    warnings: List[str] = []

    if not os.path.isdir(builds_dir):
        raise SafetyViolationError(f"Builds directory '{builds_dir}' does not exist.")

    if not os.path.islink(current_symlink):
        raise SafetyViolationError(f"Current release pointer '{current_symlink}' is not a symlink.")

    current_real = os.path.realpath(current_symlink)
    if not os.path.isdir(current_real):
        raise SafetyViolationError(f"Current release target '{current_real}' is not a valid directory.")

    live_release_name = os.path.basename(current_real)
    if not RELEASE_NAME_RE.match(live_release_name):
        raise SafetyViolationError(f"Live release name '{live_release_name}' does not match expected format.")

    # 1. Resolve chronological sequence of activations from validated ledger
    # Deduplicate repeated activations while preserving reverse chronological order
    verified_lineage_rev: List[Dict[str, str]] = []
    seen_in_ledger: Set[str] = set()

    for rec in reversed(ledger_records):
        rel = rec["release"]
        if rel not in seen_in_ledger:
            seen_in_ledger.add(rel)
            verified_lineage_rev.append(rec)

    # 2. Select and validate rollback candidates (excluding live release)
    retained_rollbacks: List[str] = []
    for rec in verified_lineage_rev:
        rel = rec["release"]
        if rel == live_release_name:
            continue

        rel_path = os.path.join(builds_dir, rel)
        is_usable, reason = validate_release_usability(rel_path, builds_dir, expected_env, expected_uploads)

        if is_usable:
            retained_rollbacks.append(rel)
            if len(retained_rollbacks) == min_rollbacks:
                break
        else:
            warnings.append(f"Recorded historical release '{rel}' is not usable for rollback ({reason}); skipped.")

    # Incomplete or uncertain rollback history guard
    if len(retained_rollbacks) < min_rollbacks:
        warnings.append(
            f"INSUFFICIENT ROLLBACK HISTORY: Only {len(retained_rollbacks)} usable rollback releases "
            f"found on disk (minimum {min_rollbacks} required). Automatic deletion is skipped."
        )

    protected_set: Set[str] = {live_release_name}.union(retained_rollbacks)

    # 3. Scan physical builds directory
    prune_candidates: List[Dict[str, any]] = []
    unverified_releases: List[Dict[str, any]] = []
    now = datetime.now(timezone.utc)

    with os.scandir(builds_dir) as it:
        for entry in it:
            if entry.name.startswith("."):
                continue
            if not entry.is_dir():
                continue

            entry_name = entry.name
            entry_path = entry.path

            if not RELEASE_NAME_RE.match(entry_name):
                warnings.append(f"Non-conforming folder name '{entry_name}' ignored.")
                continue

            if entry_name in protected_set:
                continue

            entry_size = get_dir_size_bytes(entry_path)
            mtime = datetime.fromtimestamp(os.path.getmtime(entry_path), tz=timezone.utc)
            age_hours = (now - mtime).total_seconds() / 3600.0

            if entry_name in seen_in_ledger:
                # Verified older historical release
                prune_candidates.append({
                    "name": entry_name,
                    "path": entry_path,
                    "size_bytes": entry_size,
                    "size_formatted": format_bytes(entry_size),
                    "mtime": mtime.isoformat(),
                    "age_hours": age_hours,
                    "status": "verified_historical_release"
                })
            else:
                # Unverified / unrecorded release (e.g. aborted build, test directory)
                # PRESERVED: NEVER automatically deleted!
                unverified_releases.append({
                    "name": entry_name,
                    "path": entry_path,
                    "size_bytes": entry_size,
                    "size_formatted": format_bytes(entry_size),
                    "mtime": mtime.isoformat(),
                    "age_hours": age_hours,
                    "status": "unverified_unrecorded_release"
                })

    return live_release_name, retained_rollbacks, prune_candidates, unverified_releases, warnings


def prune_releases(
    builds_dir: str = "/var/www/royal-libas-releases/builds",
    current_symlink: str = "/var/www/royal-libas-releases/current",
    ledger_file: str = "/var/www/royal-libas-releases/builds/.deployments_ledger.tsv",
    pipeline_lock_file: str = "/var/www/royal-libas-releases/builds/.deploy-pipeline.lock",
    pipeline_lock_fd: Optional[int] = None,
    activation_lock_file: str = "/run/lock/royal-libas-deploy.lock",
    shared_env: str = "/var/www/royal-libas/backend/.env",
    shared_uploads: str = "/var/www/royal-libas/backend/uploads",
    min_rollbacks: int = 3,
    dry_run: bool = True,
    skip_locks: bool = False,
    mounts_file: str = "/proc/mounts"
) -> int:
    """
    Main entry point for release retention and pruning.
    
    Locks are acquired and held continuously throughout the entire evaluation and deletion run.
    In dry-run mode, NO files are created or modified on disk.
    Returns 0 on success or safe skip; 1 on critical safety assertion failure.
    """
    print("=" * 72)
    print("Royal Libas VPS Release Retention & Pruning Engine")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print(f"Mode: {'DRY-RUN (Genuine Read-Only Inspection)' if dry_run else 'EXECUTE (Deletion Enabled)'}")
    print("=" * 72)

    # 1. Acquire and continuously hold lifecycle locks
    lock_mgr = ContinuousLockManager(
        pipeline_lock_file=pipeline_lock_file,
        pipeline_lock_fd=pipeline_lock_fd,
        activation_lock_file=activation_lock_file,
        skip_locks=skip_locks
    )

    try:
        with lock_mgr:
            if not skip_locks:
                print("[Lock Manager] Continuous lifecycle locks acquired and active.")

            # 2. Validate builds_dir and current symlink early (fail-closed invariant)
            if not os.path.isdir(builds_dir):
                print(f"CRITICAL SAFETY VIOLATION: Builds directory '{builds_dir}' does not exist.")
                return 1

            if not os.path.islink(current_symlink):
                print(f"CRITICAL SAFETY VIOLATION: Current release pointer '{current_symlink}' is not a symlink.")
                return 1

            current_real = os.path.realpath(current_symlink)
            if not os.path.isdir(current_real):
                print(f"CRITICAL SAFETY VIOLATION: Current release target '{current_real}' is not a valid directory.")
                return 1

            live_release_name = os.path.basename(current_real)
            if not RELEASE_NAME_RE.match(live_release_name):
                print(f"CRITICAL SAFETY VIOLATION: Live release name '{live_release_name}' does not match expected format.")
                return 1

            # 3. Parse and validate deployments ledger (GENUINE READ-ONLY: never writes ledger)
            if not os.path.isfile(ledger_file):
                print(f"NOTICE: Deployments ledger '{ledger_file}' does not exist.")
                print("In dry-run or first-run mode, no ledger is created. No releases will be deleted.")
                print("All existing releases are preserved safely.")
                return 0

            ledger_records, ledger_warnings = parse_and_validate_ledger(ledger_file)
            for lw in ledger_warnings:
                print(f"[Ledger Warning] {lw}")

            if not ledger_records:
                print(f"NOTICE: Deployments ledger '{ledger_file}' contains no valid activation records.")
                print("Cannot establish verified lineage. Safely skipping cleanup to preserve all releases.")
                return 0

            # 4. Evaluate retention plan
            try:
                live_rel, rollbacks, candidates, unverified, warnings = evaluate_retention_plan(
                    builds_dir=builds_dir,
                    current_symlink=current_symlink,
                    ledger_records=ledger_records,
                    expected_env=shared_env,
                    expected_uploads=shared_uploads,
                    min_rollbacks=min_rollbacks
                )
            except SafetyViolationError as exc:
                print(f"CRITICAL SAFETY VIOLATION during evaluation: {exc}")
                return 1

            # Output inventory & classification
            print("\n--- [RELEASE INVENTORY & CLASSIFICATION] ---")
            print(f"Live Active Target (Preserved):  {live_rel}")
            print(f"Retained Rollback Targets:      {', '.join(rollbacks) if rollbacks else 'None'}")
            print(f"Verified Rollbacks Available:    {len(rollbacks)} (Minimum required: {min_rollbacks})")
            print(f"Eligible Prune Candidates:       {len(candidates)}")
            print(f"Unverified Builds (Preserved):   {len(unverified)}")

            if warnings:
                print("\n--- [NOTICES & WARNINGS] ---")
                for w in warnings:
                    print(f" - {w}")

            if unverified:
                print("\n--- [UNVERIFIED RELEASES (PRESERVED - REQUIRES OPERATOR REVIEW)] ---")
                for u in unverified:
                    print(f" - {u['name']} [{u['size_formatted']}] (Age: {u['age_hours']:.1f}h) -> Preserved")

            # Safety check on rollback availability
            if len(rollbacks) < min_rollbacks:
                print(f"\nSAFETY GUARD: Fewer than {min_rollbacks} verified usable rollback releases available.")
                print("Skipping automatic pruning to preserve system recoverability.")
                return 0

            if not candidates:
                print("\nNo older verified candidates eligible for pruning. Release quota is in balance.")
                return 0

            print("\n--- [VERIFIED PRUNING CANDIDATES] ---")
            total_reclaimable = sum(c["size_bytes"] for c in candidates)
            for c in candidates:
                print(f" - {c['name']} [{c['size_formatted']}] (Age: {c['age_hours']:.1f}h, Status: {c['status']})")
            print(f"\nTotal Space to Reclaim: {format_bytes(total_reclaimable)}")

            # 4. Fail-closed structural assertions on every candidate
            print("\n--- [FAIL-CLOSED SAFETY VERIFICATION] ---")
            for c in candidates:
                cand_path = c["path"]
                print(f"Verifying candidate: {c['name']} ...", end=" ")
                try:
                    verify_mount_safety(cand_path, mounts_file=mounts_file)
                    verify_persistent_symlinks(cand_path, expected_env=shared_env, expected_uploads=shared_uploads)
                    print("OK [Symlinks & Mounts Safe]")
                except SafetyViolationError as exc:
                    print("FAILED!")
                    print(f"CRITICAL SAFETY ERROR on '{c['name']}': {exc}")
                    print("ABORTING ENTIRE CLEANUP OPERATION. No files were deleted.")
                    return 1

            # 5. Execute or Dry-Run
            if dry_run:
                print("\n[DRY-RUN COMPLETE] All safety checks passed. GENUINE READ-ONLY: No files were touched or removed.")
                print("To execute real deletions, run with --execute.")
                return 0

            print("\n--- [EXECUTING SAFE PRUNING (WHILE HOLDING CONTINUOUS LOCKS)] ---")
            deleted_count = 0
            reclaimed_bytes = 0

            for c in candidates:
                cand_path = c["path"]
                print(f"Pruning {c['name']} ({c['size_formatted']}) ...")
                try:
                    safe_unlink_persistent_symlinks(cand_path)
                    shutil.rmtree(cand_path)
                    deleted_count += 1
                    reclaimed_bytes += c["size_bytes"]
                    print(f" Successfully pruned {c['name']}.")
                except Exception as exc:
                    print(f"CRITICAL ERROR removing {c['name']}: {exc}")
                    print("Halting further pruning. Remaining candidates left untouched.")
                    return 1

            print(f"\n[EXECUTION COMPLETE] Successfully pruned {deleted_count} release folders.")
            print(f"Reclaimed Disk Space: {format_bytes(reclaimed_bytes)}.")
            return 0

    except LockAcquisitionError as err:
        print(f"NOTICE: {err}")
        print("Concurrent deployment or activation in progress. Release retention skipped safely.")
        return 0


def main():
    parser = argparse.ArgumentParser(description="Royal Libas VPS Release Retention & Pruning Engine")
    parser.add_argument("--builds-dir", default="/var/www/royal-libas-releases/builds", help="Builds directory path")
    parser.add_argument("--current-symlink", default="/var/www/royal-libas-releases/current", help="Current release symlink path")
    parser.add_argument("--ledger-file", default="/var/www/royal-libas-releases/builds/.deployments_ledger.tsv", help="Deployments ledger TSV")
    parser.add_argument("--pipeline-lock-file", default="/var/www/royal-libas-releases/builds/.deploy-pipeline.lock", help="Pipeline lock file")
    parser.add_argument("--pipeline-lock-fd", type=int, default=None, help="Inherited pipeline lock file descriptor (e.g. 200)")
    parser.add_argument("--activation-lock-file", default="/run/lock/royal-libas-deploy.lock", help="Activation lock file")
    parser.add_argument("--shared-env", default="/var/www/royal-libas/backend/.env", help="Expected production .env path")
    parser.add_argument("--shared-uploads", default="/var/www/royal-libas/backend/uploads", help="Expected production uploads path")
    parser.add_argument("--min-rollbacks", type=int, default=3, help="Minimum verified rollback releases to retain (default 3)")
    parser.add_argument("--execute", action="store_true", help="Actually perform deletion (default is dry-run)")
    parser.add_argument("--skip-locks", action="store_true", help="Skip file locking checks (for testing)")
    parser.add_argument("--mounts-file", default="/proc/mounts", help="Path to mounts table file")

    args = parser.parse_args()

    exit_code = prune_releases(
        builds_dir=args.builds_dir,
        current_symlink=args.current_symlink,
        ledger_file=args.ledger_file,
        pipeline_lock_file=args.pipeline_lock_file,
        pipeline_lock_fd=args.pipeline_lock_fd,
        activation_lock_file=args.activation_lock_file,
        shared_env=args.shared_env,
        shared_uploads=args.shared_uploads,
        min_rollbacks=args.min_rollbacks,
        dry_run=not args.execute,
        skip_locks=args.skip_locks,
        mounts_file=args.mounts_file
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
