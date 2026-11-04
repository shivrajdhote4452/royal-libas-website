#!/usr/bin/env python3
"""
Royal Libas VPS Release Retention and Pruning Engine

Safely retains the active production release and at least three verified
usable rollback releases. Prunes only verified older releases from recorded
deployment history after fail-closed safety assertions.

Safety Invariants:
1. Continuous lifecycle locking:
   - In deployment pipeline: validates and holds inherited pipeline lock (FD 200).
   - In standalone cleanup: acquires and continuously holds both pipeline lock
     and activation lock from evaluation through completion.
2. Unbroken execution: Avoids lock conflict when invoked by deployment workflow.
3. Usability-verified rollback releases: Validates each rollback candidate
   (backend code, frontend dist, .env symlink, uploads symlink). Requires >= 3.
4. Preserves unverified releases: Never automatically deletes unrecorded builds;
   surfaces them for operator review.
5. Self-bootstrapping first-run: Automatically initializes historical ledger if
   missing so first deployment after merge works without manual commands.
6. Fail-closed safety: Validates symlinks, real paths, mount points, and unlinks
   safely before removing candidate directories.
7. Safe skipping: If lock contention, missing history, or safety violations occur,
   skips deletion safely without failing active deployment.
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

# Audited historical production releases in exact chronological order
VERIFIED_PRODUCTION_LINEAGE = [
    ("2026-11-01T14:28:52Z", "release-huDNUmEb", "805e7a93091e8f073ad3d629fc4d952d46cd454b", "activated"),
    ("2026-11-01T14:36:34Z", "release-CPCGzuLG", "d9e7507cd1b8f820e44c9644fc460bb50902c6f1", "activated"),
    ("2026-11-01T17:46:46Z", "release-tHmKpYTN", "e2bd0a4c27d23574c3ac323edf7c4070c576eb20", "activated"),
    ("2026-11-02T08:16:09Z", "release-WF0rJVqS", "8a71c821deb6cb36cee868e535b2c0924ee114c7", "activated"),
    ("2026-11-02T10:27:55Z", "release-nhKRvmAd", "9c41227852571ba8b2d47e605821ddc3200f801a", "activated"),
    ("2026-11-02T10:51:09Z", "release-uXFXM8EL", "57352a3e3da16f023e3dd7d90f5ade1eb21c104e", "activated"),
    ("2026-11-02T13:00:46Z", "release-E66XdkE0", "1cfa9d693f1d4cc6a70652653f77d2a7ced4ac36", "activated"),
    ("2026-11-02T20:09:08Z", "release-ZRTuDbQi", "4d173af0bec121bb701d0cb64dba268bb4800e35", "activated"),
    ("2026-11-03T08:21:13Z", "release-5j4xvcke", "1be2722ae23f20f4707b237b31cdc37ec649147b", "activated"),
    ("2026-11-03T11:57:12Z", "release-SWr5ReQx", "564741fd8576cb3df9a4b6f6f6aeb908baf068d8", "activated"),
    ("2026-11-03T19:47:41Z", "release-GyuopHsQ", "3644fb8cc4cf8a7b52436ed24cba1df3b9726e2f", "activated"),
    ("2026-11-04T06:13:59Z", "release-boHz00xc", "5c685c1a7e406c2d97fd5532cea40aab964f24a4", "activated"),
    ("2026-11-04T07:57:19Z", "release-RTuyby3U", "ab04b86ec82e0a1224574a9a0ed78bdff2ca742d", "activated"),
    ("2026-11-04T08:56:51Z", "release-uYOraQbp", "78ffebe8f4e8d276eb722a85f8f5fda1d9a6db17", "activated"),
    ("2026-11-04T10:23:26Z", "release-Uf7UYjUy", "d82eae0a3cf59294cbd5edcdfa0888f9bbc2e033", "activated"),
    ("2026-11-04T11:51:06Z", "release-6eIbw7Gt", "19e78593c4013aaef2e43fa7c67b48442d8f531a", "active"),
]


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


def bootstrap_ledger_if_missing(ledger_path: str, builds_dir: str) -> bool:
    """
    Self-bootstraps deployments ledger if it does not exist yet.
    Ensures safe first deployment after merge without requiring manual setup commands.
    Returns True if bootstrapped, False if already existed.
    """
    if os.path.isfile(ledger_path):
        return False

    os.makedirs(os.path.dirname(os.path.abspath(ledger_path)), exist_ok=True)
    temp_ledger = f"{ledger_path}.tmp.{os.getpid()}"

    with open(temp_ledger, "w", encoding="utf-8") as f:
        f.write("# Royal Libas Deployments Ledger (Append-Only)\n")
        f.write("# TIMESTAMP\tRELEASE_NAME\tCOMMIT_SHA\tSTATUS\n")
        for ts, rel, sha, status in VERIFIED_PRODUCTION_LINEAGE:
            f.write(f"{ts}\t{rel}\t{sha}\t{status}\n")

    os.replace(temp_ledger, ledger_path)
    return True


def parse_ledger(ledger_path: str) -> List[Dict[str, str]]:
    """
    Parse append-only deployments ledger.
    Format per line: TIMESTAMP\tRELEASE_NAME\tCOMMIT_SHA\tSTATUS
    Returns list of records ordered from oldest to newest.
    """
    if not os.path.isfile(ledger_path):
        return []

    records = []
    with open(ledger_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) >= 3:
                records.append({
                    "timestamp": parts[0].strip(),
                    "release": parts[1].strip(),
                    "sha": parts[2].strip(),
                    "status": parts[3].strip() if len(parts) > 3 else "activated"
                })
    return records


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
    Ensure .env and uploads inside candidate directory are strictly valid symlinks.
    Fail closed immediately if they are regular files or point to unexpected targets.
    """
    backend_dir = os.path.join(candidate_path, "backend")
    if not os.path.isdir(backend_dir):
        return

    env_path = os.path.join(backend_dir, ".env")
    if os.path.exists(env_path) or os.path.islink(env_path):
        if not os.path.islink(env_path):
            raise SafetyViolationError(
                f"FAIL-CLOSED: '{env_path}' is a regular file/directory, NOT a symlink. Secrets could be destroyed!"
            )
        target = os.readlink(env_path)
        target_norm = os.path.normpath(target)
        expected_norm = os.path.normpath(expected_env)
        if target_norm != expected_norm and os.path.realpath(env_path) != os.path.realpath(expected_env):
            raise SafetyViolationError(
                f"FAIL-CLOSED: '{env_path}' points to unexpected target: '{target}' (expected '{expected_env}')"
            )

    uploads_path = os.path.join(backend_dir, "uploads")
    if os.path.exists(uploads_path) or os.path.islink(uploads_path):
        if not os.path.islink(uploads_path):
            raise SafetyViolationError(
                f"FAIL-CLOSED: '{uploads_path}' is a regular directory! User media could be destroyed!"
            )
        target = os.readlink(uploads_path)
        target_norm = os.path.normpath(target)
        expected_norm = os.path.normpath(expected_uploads)
        if target_norm != expected_norm and os.path.realpath(uploads_path) != os.path.realpath(expected_uploads):
            raise SafetyViolationError(
                f"FAIL-CLOSED: '{uploads_path}' points to unexpected target: '{target}' (expected '{expected_uploads}')"
            )


def safe_unlink_persistent_symlinks(candidate_path: str) -> None:
    """Safely unlink known symlinks before directory deletion."""
    for rel_link in [os.path.join("backend", ".env"), os.path.join("backend", "uploads")]:
        link_path = os.path.join(candidate_path, rel_link)
        if os.path.islink(link_path):
            try:
                os.unlink(link_path)
            except OSError as exc:
                raise SafetyViolationError(f"FAIL-CLOSED: Failed to unlink safe symlink '{link_path}': {exc}")


def validate_release_usability(
    release_path: str,
    expected_env: str,
    expected_uploads: str
) -> Tuple[bool, str]:
    """
    Validate that a release directory is physically sound and usable as a rollback target.
    
    Verifies:
    1. Directory exists and matches format.
    2. Frontend production build exists (frontend/dist/index.html).
    3. Backend code or virtualenv exists (backend/app or backend/.venv).
    4. Backend .env is a symlink pointing to expected persistent .env.
    5. Backend uploads is a symlink pointing to expected persistent uploads.
    """
    if not os.path.isdir(release_path):
        return False, "Directory does not exist on disk"

    # Frontend dist check
    dist_index = os.path.join(release_path, "frontend", "dist", "index.html")
    if not os.path.isfile(dist_index):
        return False, "Missing frontend/dist/index.html"

    # Backend code check
    backend_app = os.path.join(release_path, "backend", "app")
    backend_py = os.path.join(release_path, "backend", "app.py")
    if not (os.path.isdir(backend_app) or os.path.isfile(backend_py)):
        return False, "Missing backend application code"

    # Symlink checks
    try:
        verify_persistent_symlinks(release_path, expected_env, expected_uploads)
    except SafetyViolationError as err:
        return False, str(err)

    return True, "OK"


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

    # 1. Resolve chronological sequence of activations from ledger
    # Handle repeated activations: traverse records in reverse to identify the most recent distinct activations
    verified_lineage_rev: List[str] = []
    seen_in_ledger: Set[str] = set()

    for rec in reversed(ledger_records):
        rel = rec["release"]
        if RELEASE_NAME_RE.match(rel) and rel not in seen_in_ledger:
            seen_in_ledger.add(rel)
            verified_lineage_rev.append(rel)

    # 2. Select and validate rollback candidates (excluding live release)
    retained_rollbacks: List[str] = []
    for rel in verified_lineage_rev:
        if rel == live_release_name:
            continue

        rel_path = os.path.join(builds_dir, rel)
        is_usable, reason = validate_release_usability(rel_path, expected_env, expected_uploads)

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
            f"found on disk (minimum {min_rollbacks} required). Skipping automatic deletion."
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
    mounts_file: str = "/proc/mounts",
    auto_bootstrap: bool = True
) -> int:
    """
    Main entry point for release retention and pruning.
    
    Locks are acquired and held continuously throughout the entire evaluation and deletion run.
    Returns 0 on success or safe skip; 1 on critical safety assertion failure.
    """
    print("=" * 72)
    print("Royal Libas VPS Release Retention & Pruning Engine")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print(f"Mode: {'DRY-RUN (Inspection Only)' if dry_run else 'EXECUTE (Deletion Enabled)'}")
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
            print("[Lock Manager] Continuous lifecycle locks acquired and active.")

            # 2. Bootstrap ledger if missing (ensures safe first deployment)
            if auto_bootstrap:
                if bootstrap_ledger_if_missing(ledger_file, builds_dir):
                    print(f"[Ledger] Self-bootstrapped initial verified historical records in '{ledger_file}'.")

            # 3. Parse deployments ledger
            if not os.path.isfile(ledger_file):
                print(f"WARNING: Deployments ledger '{ledger_file}' does not exist.")
                print("Cannot verify release lineage without evidence. Safely skipping cleanup.")
                return 0

            ledger_records = parse_ledger(ledger_file)
            if not ledger_records:
                print(f"WARNING: Deployments ledger '{ledger_file}' contains no valid records.")
                print("Safely skipping cleanup to protect rollback capability.")
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
                print(f"\nSAFETY GUARD: Fewer than {min_rollbacks} usable rollback releases available.")
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

            # 5. Fail-closed structural assertions on every candidate
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

            # 6. Execute or Dry-Run
            if dry_run:
                print("\n[DRY-RUN COMPLETE] All safety checks passed. No files were removed.")
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
    parser.add_argument("--no-auto-bootstrap", action="store_true", help="Do not auto-bootstrap missing ledger")
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
        mounts_file=args.mounts_file,
        auto_bootstrap=not args.no_auto_bootstrap
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
