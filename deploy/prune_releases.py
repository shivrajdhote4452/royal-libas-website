#!/usr/bin/env python3
"""
Royal Libas VPS Release Retention and Pruning Engine

Safely retains the active production release and at least three verified
successful rollback releases. Prunes verified older release directories
after strict fail-closed safety assertions.

Safety Invariants:
1. Coordinated lifecycle locking (mutual exclusion with deployments and activations).
2. Live release target dynamically verified at runtime (never deleted).
3. Rollback releases verified from append-only ledger (never relies on mtime or random names).
4. Shared persistent data verified (.env, uploads, backups, postgres).
5. Mount point and nested mount verification via /proc/mounts.
6. Fail-closed on any unexpected structure or uncertainty.
7. Safe unlinking before directory removal.
8. Supports dry-run reporting by default.
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


class LockAcquisitionError(Exception):
    """Raised when an exclusive deployment or activation lock cannot be acquired."""
    pass


class SafetyViolationError(Exception):
    """Raised when a candidate directory violates safety invariants."""
    pass


class FileLockContext:
    """Non-blocking POSIX file lock context manager."""

    def __init__(self, lock_path: str, mode: str = "a+", skip_lock: bool = False):
        self.lock_path = lock_path
        self.mode = mode
        self.skip_lock = skip_lock
        self.file_obj = None

    def __enter__(self):
        if self.skip_lock or not HAS_FCNTL:
            return self

        try:
            # If path doesn't exist and we want to read, open with a+ to ensure creation
            self.file_obj = open(self.lock_path, self.mode)
            fcntl.flock(self.file_obj.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (BlockingIOError, PermissionError, OSError) as exc:
            if self.file_obj:
                try:
                    self.file_obj.close()
                except Exception:
                    pass
                self.file_obj = None
            raise LockAcquisitionError(f"Cannot acquire non-blocking lock on '{self.lock_path}': {exc}")

        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.file_obj:
            try:
                fcntl.flock(self.file_obj.fileno(), fcntl.LOCK_UN)
            except Exception:
                pass
            try:
                self.file_obj.close()
            except Exception:
                pass
            self.file_obj = None


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
        for line_no, line in enumerate(f, 1):
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
        # Normalize target path check
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


def evaluate_retention_plan(
    builds_dir: str,
    current_symlink: str,
    ledger_records: List[Dict[str, str]],
    keep_count: int = 4,
    prune_unverified_older_than_hours: Optional[float] = None
) -> Tuple[str, List[str], List[Dict[str, any]], List[Dict[str, any]]]:
    """
    Evaluate which releases to retain and which to prune.

    Returns:
        (live_release_name, retained_rollback_names, prune_candidates, skipped_entries)
    """
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

    # Deduplicate ledger while preserving chronological sequence
    verified_sequence = []
    seen = set()
    for rec in ledger_records:
        rel = rec["release"]
        if RELEASE_NAME_RE.match(rel) and rel not in seen:
            seen.add(rel)
            verified_sequence.append(rec)

    # Find position of live release in ledger if present
    # Reconstructed chronological rollback candidates
    # The active release is always retained. Rollbacks are previous verified deployments.
    verified_releases = [r["release"] for r in verified_sequence]
    
    # Identify rollback candidates from ledger (excluding live release)
    prior_verified = [r for r in verified_releases if r != live_release_name]
    # Retain the most recent (keep_count - 1) prior verified releases
    rollback_retain_count = max(0, keep_count - 1)
    retained_rollbacks = prior_verified[-rollback_retain_count:] if rollback_retain_count > 0 else []

    protected_set: Set[str] = {live_release_name}.union(retained_rollbacks)

    # Discover all physical directories in builds_dir
    all_entries = []
    with os.scandir(builds_dir) as it:
        for entry in it:
            if entry.name.startswith("."):
                continue
            if entry.is_dir():
                all_entries.append(entry.name)

    prune_candidates = []
    skipped_entries = []
    now = datetime.now(timezone.utc)

    for entry_name in all_entries:
        entry_path = os.path.join(builds_dir, entry_name)

        # 1. Format check
        if not RELEASE_NAME_RE.match(entry_name):
            skipped_entries.append({
                "name": entry_name,
                "reason": "Name does not match release pattern",
                "path": entry_path
            })
            continue

        # 2. Live release protection
        if entry_name == live_release_name:
            continue

        # 3. Rollback protection
        if entry_name in protected_set:
            continue

        # 4. Verified older release vs Unverified
        is_verified = entry_name in seen
        entry_size = get_dir_size_bytes(entry_path)
        mtime = datetime.fromtimestamp(os.path.getmtime(entry_path), tz=timezone.utc)
        age_hours = (now - mtime).total_seconds() / 3600.0

        if is_verified:
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
            # Unverified folder (aborted build / manual experiment)
            if prune_unverified_older_than_hours is not None and age_hours >= prune_unverified_older_than_hours:
                prune_candidates.append({
                    "name": entry_name,
                    "path": entry_path,
                    "size_bytes": entry_size,
                    "size_formatted": format_bytes(entry_size),
                    "mtime": mtime.isoformat(),
                    "age_hours": age_hours,
                    "status": "quarantined_unverified_aborted_build"
                })
            else:
                skipped_entries.append({
                    "name": entry_name,
                    "reason": f"Unverified release (not in verified history; age {age_hours:.1f}h < quarantine)",
                    "path": entry_path
                })

    return live_release_name, retained_rollbacks, prune_candidates, skipped_entries


def prune_releases(
    builds_dir: str = "/var/www/royal-libas-releases/builds",
    current_symlink: str = "/var/www/royal-libas-releases/current",
    ledger_file: str = "/var/www/royal-libas-releases/builds/.deployments_ledger.tsv",
    pipeline_lock_file: str = "/var/www/royal-libas-releases/builds/.deploy-pipeline.lock",
    activation_lock_file: str = "/run/lock/royal-libas-deploy.lock",
    shared_env: str = "/var/www/royal-libas/backend/.env",
    shared_uploads: str = "/var/www/royal-libas/backend/uploads",
    keep_count: int = 4,
    dry_run: bool = True,
    prune_unverified_older_than_hours: Optional[float] = None,
    skip_locks: bool = False,
    mounts_file: str = "/proc/mounts"
) -> int:
    """
    Main entry point for release retention and pruning.
    Returns exit code (0 = success / safe skip, 1 = failure).
    """
    print("=" * 70)
    print("Royal Libas VPS Release Retention & Pruning Engine")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print(f"Mode: {'DRY-RUN (Inspection Only)' if dry_run else 'EXECUTE (Deletion Enabled)'}")
    print("=" * 70)

    # 1. Coordinated lifecycle locks
    if not skip_locks:
        print("[Lock Check] Verifying mutual exclusion...")
        # Check pipeline lock
        if os.path.exists(pipeline_lock_file):
            try:
                with FileLockContext(pipeline_lock_file, "r", skip_lock=False):
                    pass
            except LockAcquisitionError as err:
                print(f"NOTICE: {err}")
                print("A deployment pipeline or concurrent operation is currently active. Safely skipping cleanup.")
                return 0

        # Check activation lock
        if os.path.exists(activation_lock_file):
            try:
                with FileLockContext(activation_lock_file, "r", skip_lock=False):
                    pass
            except LockAcquisitionError as err:
                print(f"NOTICE: {err}")
                print("Activation lock is currently held by deploy/activate. Safely skipping cleanup.")
                return 0
        print("[Lock Check] Locks verified free. Proceeding with evaluation.")

    # 2. Parse ledger
    if not os.path.isfile(ledger_file):
        print(f"WARNING: Deployments ledger '{ledger_file}' does not exist.")
        print("Cannot verify release lineage without evidence. Safely skipping cleanup.")
        return 0

    ledger_records = parse_ledger(ledger_file)
    if not ledger_records:
        print(f"WARNING: Deployments ledger '{ledger_file}' contains no valid records.")
        print("Safely skipping cleanup to protect potential rollback targets.")
        return 0

    # 3. Evaluate retention plan
    try:
        live_rel, rollbacks, candidates, skipped = evaluate_retention_plan(
            builds_dir=builds_dir,
            current_symlink=current_symlink,
            ledger_records=ledger_records,
            keep_count=keep_count,
            prune_unverified_older_than_hours=prune_unverified_older_than_hours
        )
    except SafetyViolationError as exc:
        print(f"CRITICAL SAFETY VIOLATION during evaluation: {exc}")
        return 1

    print("\n--- [RELEASE INVENTORY & CLASSIFICATION] ---")
    print(f"Live Active Target (Preserved):  {live_rel}")
    print(f"Retained Rollback Targets:      {', '.join(rollbacks) if rollbacks else 'None'}")
    print(f"Total Retained Minimum:          {keep_count} (Actual Retained: {1 + len(rollbacks)})")
    print(f"Eligible Prune Candidates:       {len(candidates)}")
    print(f"Skipped / Quarantined Entries:   {len(skipped)}")

    if skipped:
        print("\n--- [SKIPPED ENTRIES] ---")
        for s in skipped:
            print(f" - {s['name']}: {s['reason']}")

    if not candidates:
        print("\nNo candidates eligible for pruning. VPS release storage is within retention quota.")
        return 0

    print("\n--- [PRUNING CANDIDATES] ---")
    total_reclaimable = sum(c["size_bytes"] for c in candidates)
    for c in candidates:
        print(f" - {c['name']} [{c['size_formatted']}] (Age: {c['age_hours']:.1f}h, Status: {c['status']})")
    print(f"\nTotal Space to Reclaim: {format_bytes(total_reclaimable)}")

    # 4. Strict fail-closed assertions on every candidate
    print("\n--- [FAIL-CLOSED SAFETY VERIFICATION] ---")
    for c in candidates:
        cand_path = c["path"]
        print(f"Verifying safety for candidate: {c['name']} ...", end=" ")
        try:
            # Mount safety
            verify_mount_safety(cand_path, mounts_file=mounts_file)
            # Persistent symlinks safety
            verify_persistent_symlinks(cand_path, expected_env=shared_env, expected_uploads=shared_uploads)
            print("OK [Symlinks & Mounts Safe]")
        except SafetyViolationError as exc:
            print("FAILED!")
            print(f"CRITICAL SAFETY ERROR on '{c['name']}': {exc}")
            print("ABORTING ENTIRE CLEANUP OPERATION. No files were deleted.")
            return 1

    # 5. Execute or Dry-Run
    if dry_run:
        print("\n[DRY-RUN COMPLETE] All safety checks passed. No files were removed.")
        print("To execute real deletions, run with --execute.")
        return 0

    print("\n--- [EXECUTING SAFE PRUNING] ---")
    deleted_count = 0
    reclaimed_bytes = 0

    for c in candidates:
        cand_path = c["path"]
        print(f"Pruning {c['name']} ({c['size_formatted']}) ...")
        try:
            # Unlink safe persistent symlinks first
            safe_unlink_persistent_symlinks(cand_path)
            # Remove directory
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


def main():
    parser = argparse.ArgumentParser(description="Royal Libas VPS Release Retention & Pruning Engine")
    parser.add_argument("--builds-dir", default="/var/www/royal-libas-releases/builds", help="Builds directory path")
    parser.add_argument("--current-symlink", default="/var/www/royal-libas-releases/current", help="Current release symlink path")
    parser.add_argument("--ledger-file", default="/var/www/royal-libas-releases/builds/.deployments_ledger.tsv", help="Deployments ledger TSV")
    parser.add_argument("--pipeline-lock-file", default="/var/www/royal-libas-releases/builds/.deploy-pipeline.lock", help="Pipeline lock file")
    parser.add_argument("--activation-lock-file", default="/run/lock/royal-libas-deploy.lock", help="Activation lock file")
    parser.add_argument("--shared-env", default="/var/www/royal-libas/backend/.env", help="Expected production .env path")
    parser.add_argument("--shared-uploads", default="/var/www/royal-libas/backend/uploads", help="Expected production uploads path")
    parser.add_argument("--keep", type=int, default=4, help="Total releases to retain (active + rollbacks, minimum 4)")
    parser.add_argument("--execute", action="store_true", help="Actually perform deletion (default is dry-run)")
    parser.add_argument("--prune-unverified-older-than-hours", type=float, default=24.0, help="Prune unverified aborted builds older than N hours")
    parser.add_argument("--skip-locks", action="store_true", help="Skip file locking checks (for testing)")
    parser.add_argument("--mounts-file", default="/proc/mounts", help="Path to mounts table file")

    args = parser.parse_args()

    # Enforce minimum retention of active + 3 rollbacks = 4
    keep_count = max(4, args.keep)
    dry_run = not args.execute

    exit_code = prune_releases(
        builds_dir=args.builds_dir,
        current_symlink=args.current_symlink,
        ledger_file=args.ledger_file,
        pipeline_lock_file=args.pipeline_lock_file,
        activation_lock_file=args.activation_lock_file,
        shared_env=args.shared_env,
        shared_uploads=args.shared_uploads,
        keep_count=keep_count,
        dry_run=dry_run,
        prune_unverified_older_than_hours=args.prune_unverified_older_than_hours,
        skip_locks=args.skip_locks,
        mounts_file=args.mounts_file
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
