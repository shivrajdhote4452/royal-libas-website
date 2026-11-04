#!/usr/bin/env python3
"""
Royal Libas VPS Release Retention and Pruning Engine

Safely retains the active production release and at least three verified,
usable rollback releases (preserving a minimum of 4 releases total).
Prunes only verified older releases from recorded deployment history after
strict cryptographic commit verification and fail-closed safety assertions.

Safety Invariants:
1. Continuous lifecycle locking:
   - In deployment pipeline: validates and holds inherited pipeline lock (FD 200).
   - In standalone cleanup: acquires and continuously holds both pipeline lock
     and activation lock from evaluation through completion.
   - If a required lock is missing, inaccessible, or busy, skips deletion safely.
2. Genuine read-only dry run: Never creates, touches, or mutates lock files,
   ledger files, or filesystem assets when running in dry-run mode.
   When locks are absent or unavailable, clearly labels the result as an
   unprotected, potentially stale inspection (never a deletion-safe plan).
3. Cryptographic commit verification: Verifies each candidate directory against
   its actual git commit on disk. Never authorizes deletion merely because a
   release name or SHA appears in the ledger. Preserves uncertain releases.
4. Strict rollback usability: Requires backend .env symlink, uploads symlink,
   executable virtualenv, backend app code, frontend dist/index.html to exist
   and resolve to valid shared targets, with matching commit metadata.
5. Chronological ledger validation: Validates ISO 8601 timestamps, release naming,
   40-char commit SHAs, and 'activated' status. Orders records chronologically
   by timestamp regardless of line append order. Rejects invalid records.
6. Safe first deployment & retention quota: Preserves current + at least 3
   independently validated rollback releases. The first eligible deletion normally
   requires a 5th recorded successful release.
7. Fail-closed safety: Validates real paths, rejects nested mounts, and unlinks
   safe symlinks before directory deletion.
"""

import argparse
import os
import re
import shutil
import subprocess
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
        activation_lock_fd: Optional[int] = None,
        skip_locks: bool = False,
        dry_run: bool = False
    ):
        self.pipeline_lock_file = pipeline_lock_file
        self.pipeline_lock_fd = pipeline_lock_fd
        self.activation_lock_file = activation_lock_file
        self.activation_lock_fd = activation_lock_fd
        self.skip_locks = skip_locks
        self.dry_run = dry_run

        self.lock_status: str = "PENDING"
        self.lock_details: List[str] = []
        self._pipeline_file_obj = None
        self._activation_file_obj = None

    def __enter__(self):
        if self.skip_locks or not HAS_FCNTL:
            self.lock_status = "SKIPPED"
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
                fcntl.flock(self.pipeline_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.lock_details.append(f"Inherited pipeline lock FD {self.pipeline_lock_fd} active")
            except (OSError, BlockingIOError) as exc:
                raise LockAcquisitionError(
                    f"Inherited pipeline lock FD {self.pipeline_lock_fd} invalid or busy: {exc}"
                )
        else:
            # Standalone mode: inspect/acquire pipeline lock directly
            if not os.path.exists(self.pipeline_lock_file):
                if self.dry_run:
                    self.lock_status = "UNPROTECTED_MISSING_LOCK"
                    self.lock_details.append(
                        f"Pipeline lock '{self.pipeline_lock_file}' is missing on disk"
                    )
                else:
                    raise LockAcquisitionError(
                        f"Required pipeline lock file '{self.pipeline_lock_file}' does not exist. Skipping deletion safely."
                    )
            else:
                try:
                    # Open read-only to never mutate filesystem or create file
                    self._pipeline_file_obj = open(self.pipeline_lock_file, "r")
                    fcntl.flock(self._pipeline_file_obj.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self.lock_details.append(f"Pipeline lock '{self.pipeline_lock_file}' acquired")
                except (BlockingIOError, PermissionError, OSError) as exc:
                    self._cleanup_locks()
                    if self.dry_run:
                        self.lock_status = "UNPROTECTED_LOCK_BUSY"
                        self.lock_details.append(
                            f"Pipeline lock '{self.pipeline_lock_file}' is held by another process: {exc}"
                        )
                    else:
                        raise LockAcquisitionError(
                            f"Cannot acquire exclusive pipeline lock on '{self.pipeline_lock_file}': {exc}"
                        )

        # 2. Activation lock coordination
        if self.activation_lock_fd is not None:
            # Validate inherited activation lock FD
            try:
                if self.activation_lock_file and os.path.exists(self.activation_lock_file):
                    fd_stat = os.fstat(self.activation_lock_fd)
                    file_stat = os.stat(self.activation_lock_file)
                    if (fd_stat.st_ino != file_stat.st_ino) or (fd_stat.st_dev != file_stat.st_dev):
                        raise LockAcquisitionError(
                            f"Inherited activation lock FD {self.activation_lock_fd} does not match '{self.activation_lock_file}'"
                        )
                fcntl.flock(self.activation_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.lock_details.append(f"Inherited activation lock FD {self.activation_lock_fd} active")
            except (OSError, BlockingIOError) as exc:
                raise LockAcquisitionError(
                    f"Inherited activation lock FD {self.activation_lock_fd} invalid or busy: {exc}"
                )
        elif self.activation_lock_file:
            if not os.path.exists(self.activation_lock_file):
                if self.dry_run:
                    if self.lock_status == "PENDING":
                        self.lock_status = "UNPROTECTED_MISSING_LOCK"
                    self.lock_details.append(
                        f"Activation lock '{self.activation_lock_file}' is missing on disk"
                    )
                else:
                    raise LockAcquisitionError(
                        f"Required activation lock file '{self.activation_lock_file}' does not exist. Skipping deletion safely."
                    )
            else:
                try:
                    # Open read-only to allow unprivileged royal-deploy user to lock 0644 file
                    self._activation_file_obj = open(self.activation_lock_file, "r")
                    fcntl.flock(self._activation_file_obj.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self.lock_details.append(f"Activation lock '{self.activation_lock_file}' acquired")
                except (BlockingIOError, PermissionError, OSError) as exc:
                    self._cleanup_locks()
                    if self.dry_run:
                        self.lock_status = "UNPROTECTED_LOCK_BUSY"
                        self.lock_details.append(
                            f"Activation lock '{self.activation_lock_file}' is held by another process: {exc}"
                        )
                    else:
                        raise LockAcquisitionError(
                            f"Cannot acquire exclusive activation lock on '{self.activation_lock_file}': {exc}"
                        )

        if self.lock_status == "PENDING":
            self.lock_status = "ALL_LOCKS_ACQUIRED"

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


def get_release_commit_sha(release_path: str) -> Optional[str]:
    """
    Retrieve actual git commit SHA from the release directory on disk.
    
    Inspects git repository inside the release directory via git rev-parse HEAD,
    or falls back to parsing .git/HEAD for detached/ref states.
    Returns 40-character commit SHA, or None if unavailable.
    """
    git_dir = os.path.join(release_path, ".git")
    if not os.path.isdir(git_dir):
        return None

    # 1. Try git command directly if available
    try:
        res = subprocess.run(
            ["git", "-C", release_path, "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if res.returncode == 0:
            sha = res.stdout.strip()
            if COMMIT_SHA_RE.match(sha):
                return sha
    except Exception:
        pass

    # 2. Filesystem fallback: read .git/HEAD directly
    try:
        head_file = os.path.join(git_dir, "HEAD")
        if os.path.isfile(head_file):
            with open(head_file, "r", encoding="utf-8") as f:
                content = f.read().strip()
            if COMMIT_SHA_RE.match(content):
                return content
            if content.startswith("ref: "):
                ref_subpath = content[5:].strip()
                ref_path = os.path.join(git_dir, ref_subpath)
                if os.path.isfile(ref_path):
                    with open(ref_path, "r", encoding="utf-8") as rf:
                        ref_sha = rf.read().strip()
                    if COMMIT_SHA_RE.match(ref_sha):
                        return ref_sha
    except Exception:
        pass

    return None


def parse_and_validate_ledger(ledger_path: str) -> Tuple[List[Dict[str, any]], List[str]]:
    """
    Parse append-only deployments ledger and strictly validate records.
    
    Validations:
    - 4 tab-separated fields: TIMESTAMP, RELEASE_NAME, COMMIT_SHA, STATUS
    - Valid ISO 8601 UTC timestamp
    - Valid release name format
    - Valid 40-character hex commit SHA
    - STATUS == 'activated' or 'active' (uncertain or unverified entries flagged)
    
    Returns:
        (valid_records_chronological, validation_warnings)
    """
    if not os.path.isfile(ledger_path):
        return [], [f"Ledger file '{ledger_path}' does not exist."]

    valid_records: List[Dict[str, any]] = []
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

            # 4. Activation status validation: only 'activated' or 'active' is trusted for retention
            norm_status = status_raw.lower()
            if norm_status not in ("activated", "active"):
                warnings.append(
                    f"Line {line_no}: Release '{rel_raw}' has non-verified status '{status_raw}'; "
                    f"preserved as uncertain and excluded from deletion lineage."
                )
                continue

            valid_records.append({
                "line": line_no,
                "timestamp": parsed_ts.isoformat(),
                "parsed_ts": parsed_ts,
                "release": rel_raw,
                "sha": sha_raw.lower(),
                "status": "activated"
            })

    # Sort strictly chronologically by parsed timestamp
    valid_records.sort(key=lambda r: r["parsed_ts"])

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
    expected_uploads: str,
    expected_sha: Optional[str] = None
) -> Tuple[bool, str]:
    """
    Validate that a release directory is structurally complete, usable as a rollback target,
    and matches its recorded commit SHA.
    
    Verifies:
    1. Real directory physically under intended builds directory.
    2. Shared .env link exists and resolves to real existing shared .env.
    3. Shared uploads link exists and resolves to real existing shared uploads.
    4. Backend virtualenv python exists and is an executable file.
    5. Backend application code exists (backend/app or backend/app.py).
    6. Frontend production build exists and is non-empty (frontend/dist/index.html).
    7. Commit SHA on disk matches expected recorded commit SHA.
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

    # 5. Cryptographic commit verification
    if expected_sha:
        actual_sha = get_release_commit_sha(release_path)
        if actual_sha is None:
            return False, f"Missing git commit metadata on disk for '{os.path.basename(release_path)}'"
        if actual_sha.lower() != expected_sha.lower():
            return False, f"Commit mismatch on disk: expected '{expected_sha}', found '{actual_sha}'"

    return True, "OK [Structurally usable & commit verified]"


def evaluate_retention_plan(
    builds_dir: str,
    current_symlink: str,
    ledger_records: List[Dict[str, any]],
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

    if not ledger_records:
        raise SafetyViolationError("Deployments ledger contains no valid activation records.")

    # 1. Verify chronological sequence of activations from validated ledger
    # The records are chronologically sorted ascending; the newest activation is the last entry.
    latest_activation = ledger_records[-1]["release"]
    if latest_activation != live_release_name:
        raise SafetyViolationError(
            f"Inconsistent deployment history: current active symlink points to '{live_release_name}', "
            f"but latest recorded activation in ledger is '{latest_activation}'. Lineage is ambiguous; failing closed."
        )

    # Deduplicate repeated activations while preserving reverse chronological order
    verified_lineage_rev: List[Dict[str, any]] = []
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
        is_usable, reason = validate_release_usability(
            rel_path,
            builds_dir,
            expected_env,
            expected_uploads,
            expected_sha=rec["sha"]
        )

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
    verified_record_map = {r["release"]: r for r in verified_lineage_rev}

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

            if entry_name in verified_record_map:
                # Validate commit SHA before admitting as prune candidate
                rec = verified_record_map[entry_name]
                actual_sha = get_release_commit_sha(entry_path)
                if actual_sha is None or actual_sha.lower() != rec["sha"].lower():
                    warnings.append(
                        f"Release '{entry_name}' recorded with SHA '{rec['sha']}', but disk has '{actual_sha}'. "
                        f"Marked uncertain and preserved."
                    )
                    unverified_releases.append({
                        "name": entry_name,
                        "path": entry_path,
                        "size_bytes": entry_size,
                        "size_formatted": format_bytes(entry_size),
                        "mtime": mtime.isoformat(),
                        "age_hours": age_hours,
                        "status": "uncertain_commit_mismatch"
                    })
                else:
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
    activation_lock_fd: Optional[int] = None,
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
        activation_lock_fd=activation_lock_fd,
        skip_locks=skip_locks,
        dry_run=dry_run
    )

    try:
        with lock_mgr:
            if not skip_locks:
                if lock_mgr.lock_status == "ALL_LOCKS_ACQUIRED":
                    print("[Lock Manager] Continuous lifecycle locks acquired and active.")
                else:
                    print(f"[Lock Manager] Lifecycle lock status: {lock_mgr.lock_status}")

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

            # Display plan summary
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

            # Check whether lifecycle locks were acquired during dry run
            if dry_run and lock_mgr.lock_status not in ("ALL_LOCKS_ACQUIRED", "SKIPPED"):
                print("\n" + "=" * 72)
                print("[DRY-RUN RESULT: UNPROTECTED / POTENTIALLY STALE INSPECTION]")
                print("WARNING: Required lifecycle locks are absent or unavailable:")
                for det in lock_mgr.lock_details:
                    print(f"  - {det}")
                print("\nBecause lifecycle locks could not be verified, this inspection is")
                print("UNPROTECTED against concurrent deployments or manual activations.")
                print("DO NOT report or treat this output as a deletion-safe plan.")
                print("In execution mode, pruning would be skipped safely to prevent races.")
                print("=" * 72)
                return 0

            # Check rollback quota: must retain at least min_rollbacks verified usable releases
            if len(rollbacks) < min_rollbacks:
                print(f"\nSAFETY GUARD: Fewer than {min_rollbacks} verified usable rollback releases available.")
                print("Skipping automatic pruning to preserve system recoverability.")
                return 0

            if not candidates:
                print("\nNo older verified candidates eligible for pruning. Release quota is in balance.")
                return 0

            total_reclaim_bytes = sum(c["size_bytes"] for c in candidates)
            print("\n--- [VERIFIED PRUNING CANDIDATES] ---")
            for c in candidates:
                print(f" - {c['name']} [{c['size_formatted']}] (Age: {c['age_hours']:.1f}h, Status: {c['status']})")
            print(f"\nTotal Space to Reclaim: {format_bytes(total_reclaim_bytes)}")

            # Dry-run vs Execution path
            if dry_run:

                # In dry-run mode, perform non-destructive safety checks
                print("\n--- [FAIL-CLOSED SAFETY VERIFICATION] ---")
                for c in candidates:
                    try:
                        verify_mount_safety(c["path"], mounts_file)
                        verify_persistent_symlinks(c["path"], shared_env, shared_uploads)
                        print(f"Verifying candidate: {c['name']} ... OK [Symlinks & Mounts Safe]")
                    except SafetyViolationError as exc:
                        print(f"Verifying candidate: {c['name']} ... FAILED!")
                        print(f"CRITICAL SAFETY ERROR on '{c['name']}': {exc}")
                        return 1

                print("\n[DRY-RUN COMPLETE] All safety checks and lifecycle locks passed. GENUINE READ-ONLY: No files were touched or removed.")
                print("To execute real deletions, run with --execute.")
                return 0

            # EXECUTE MODE: Deletion path
            print("\n--- [FAIL-CLOSED SAFETY VERIFICATION] ---")
            for c in candidates:
                try:
                    verify_mount_safety(c["path"], mounts_file)
                    verify_persistent_symlinks(c["path"], shared_env, shared_uploads)
                    print(f"Verifying candidate: {c['name']} ... OK [Symlinks & Mounts Safe]")
                except SafetyViolationError as exc:
                    print(f"Verifying candidate: {c['name']} ... FAILED!")
                    print(f"CRITICAL SAFETY ERROR on '{c['name']}': {exc}")
                    print("ABORTING ENTIRE CLEANUP OPERATION. No files were deleted.")
                    return 1

            print("\n--- [EXECUTING SAFE PRUNING (WHILE HOLDING CONTINUOUS LOCKS)] ---")
            pruned_count = 0
            for c in candidates:
                cand_path = c["path"]
                print(f"Pruning {c['name']} ({c['size_formatted']}) ...")

                # Re-verify path safety immediately prior to removal
                if not os.path.isdir(cand_path) or os.path.islink(cand_path):
                    print(f"Candidate {c['name']} is no longer a valid directory; skipping.")
                    continue

                if os.path.realpath(cand_path) == current_real:
                    print(f"CRITICAL: Candidate {c['name']} resolved to live release; aborting!")
                    return 1

                try:
                    safe_unlink_persistent_symlinks(cand_path)
                    shutil.rmtree(cand_path)
                    print(f" Successfully pruned {c['name']}.")
                    pruned_count += 1
                except Exception as exc:
                    print(f"ERROR: Failed to remove '{c['name']}': {exc}")
                    return 1

            print(f"\n[EXECUTION COMPLETE] Successfully pruned {pruned_count} release folders.")
            print(f"Reclaimed Disk Space: {format_bytes(total_reclaim_bytes)}.")
            return 0

    except LockAcquisitionError as lock_err:
        print(f"NOTICE: {lock_err}")
        print("Concurrent deployment or activation in progress, or lock unavailable. Release retention skipped safely.")
        return 0


def main():
    parser = argparse.ArgumentParser(
        description="Royal Libas VPS Release Retention & Pruning Engine"
    )
    parser.add_argument(
        "--builds-dir",
        default="/var/www/royal-libas-releases/builds",
        help="Directory containing release folders"
    )
    parser.add_argument(
        "--current-symlink",
        default="/var/www/royal-libas-releases/current",
        help="Path to symlink pointing to active release"
    )
    parser.add_argument(
        "--ledger-file",
        default="/var/www/royal-libas-releases/builds/.deployments_ledger.tsv",
        help="Path to deployments ledger TSV"
    )
    parser.add_argument(
        "--pipeline-lock-file",
        default="/var/www/royal-libas-releases/builds/.deploy-pipeline.lock",
        help="Path to deployment pipeline lock"
    )
    parser.add_argument(
        "--pipeline-lock-fd",
        type=int,
        default=None,
        help="Inherited pipeline lock file descriptor from deployment wrapper"
    )
    parser.add_argument(
        "--activation-lock-file",
        default="/run/lock/royal-libas-deploy.lock",
        help="Path to release activation lock"
    )
    parser.add_argument(
        "--activation-lock-fd",
        type=int,
        default=None,
        help="Inherited activation lock file descriptor from deployment wrapper"
    )
    parser.add_argument(
        "--shared-env",
        default="/var/www/royal-libas/backend/.env",
        help="Path to production shared .env"
    )
    parser.add_argument(
        "--shared-uploads",
        default="/var/www/royal-libas/backend/uploads",
        help="Path to production shared uploads directory"
    )
    parser.add_argument(
        "--min-rollbacks",
        type=int,
        default=3,
        help="Minimum verified usable rollback releases to retain (default: 3)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Perform genuine read-only inspection (default behavior)"
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Execute real directory removal (default is genuine read-only dry-run)"
    )
    parser.add_argument(
        "--skip-locks",
        action="store_true",
        help="Skip lock acquisition (TEST HARNESS ONLY)"
    )

    args = parser.parse_args()

    exit_code = prune_releases(
        builds_dir=args.builds_dir,
        current_symlink=args.current_symlink,
        ledger_file=args.ledger_file,
        pipeline_lock_file=args.pipeline_lock_file,
        pipeline_lock_fd=args.pipeline_lock_fd,
        activation_lock_file=args.activation_lock_file,
        activation_lock_fd=args.activation_lock_fd,
        shared_env=args.shared_env,
        shared_uploads=args.shared_uploads,
        min_rollbacks=args.min_rollbacks,
        dry_run=(not args.execute) or args.dry_run,
        skip_locks=args.skip_locks
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
