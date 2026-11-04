#!/bin/bash
set -euo pipefail

# Royal Libas Production Release Activation & Symlink Switch Root Helper
# Intended installation location: /usr/local/lib/royal-libas/activate-release.sh
# Permissions: 0700, Owner: root:root
#
# Production Deployment Guarantees:
# 1. Coordinated Locking & Kernel-Level Exclusive Lock Ownership:
#    - Coordinates with $PIPELINE_LOCK and $ACTIVATION_LOCK across CI and manual workflows.
#    - Verifies via kernel /proc/locks and /proc/<ancestor>/fdinfo whether an ancestor actively
#      owns an exclusive WRITE flock on $PIPELINE_LOCK (not merely an open file descriptor).
#    - If run standalone, acquires exclusive locks directly.
#    - Direct manual activation while a pipeline is running is strictly rejected.
# 2. Strict Prerequisites (Fail-Closed Before Any Release Switch):
#    - Rejects invalid release names (^release-[A-Za-z0-9]{8}$) and commit SHAs (40-char hex).
#    - Verifies release directory exists and git commit metadata matches expected SHA.
#    - Verifies persistent shared assets: backend/.env and backend/uploads symlinks must point
#      to existing targets in $SHARED_DIR.
#    - MANDATORY Database Backup: $BACKUP_SCRIPT must exist, be executable, and execute successfully.
#      If missing, unexecutable, or failing, activation halts immediately with exit 1.
#    - MANDATORY Service Manager: $SYSTEMCTL_BIN must exist and be executable.
#    - MANDATORY Health Verification: $CURL_BIN must exist and $HEALTH_URL must be configured.
# 3. Atomic Symlink Switch & Automated Failure Rollback:
#    - Records pre-activation release target.
#    - Atomically switches current symlink via ln -sfn and mv -Tf.
# 4. Service Restart & Health Verification:
#    - Restarts production systemd service 'royal-libas' (NO || true; failures fail closed).
#    - Verifies application health via http://127.0.0.1:8000/health.
#    - On restart or health failure, immediately rolls back current symlink to previous
#      release, restarts service on previous release, and exits with code 1.

if [ "$#" -ne 2 ]; then
  echo "Usage: activate-release.sh RELEASE_NAME COMMIT_SHA" >&2
  exit 1
fi

RELEASE_NAME="$1"
EXPECTED_SHA="$2"

BUILDS_DIR="${BUILDS_DIR:-/var/www/royal-libas-releases/builds}"
CURRENT_SYMLINK="${CURRENT_SYMLINK:-/var/www/royal-libas-releases/current}"
SHARED_DIR="${SHARED_DIR:-/var/www/royal-libas/backend}"
PIPELINE_LOCK="${PIPELINE_LOCK:-$BUILDS_DIR/.deploy-pipeline.lock}"
ACTIVATION_LOCK="${ACTIVATION_LOCK:-/run/lock/royal-libas-deploy.lock}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-/usr/local/lib/royal-libas/backup-db.sh}"
SERVICE_NAME="${SERVICE_NAME:-royal-libas}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8000/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-20}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
CURL_BIN="${CURL_BIN:-curl}"

# ------------------------------------------------------------------------------
# 1. Mandatory Locks & Process-Tree Exclusive Lock Ownership Verification
# ------------------------------------------------------------------------------

is_exclusive_flock_held_by_ancestor() {
  local lock_file="$1"
  [ -f "$lock_file" ] || return 1

  local target_inode
  target_inode="$(stat -c '%i' "$lock_file" 2>/dev/null || echo 0)"
  [ "$target_inode" -gt 0 ] || return 1

  # 1. Collect all ancestor PIDs from $$ up to init (PID 1)
  local cur="$$"
  local ancestors=()
  while [ -n "$cur" ] && [ "$cur" -gt 1 ]; do
    ancestors+=("$cur")
    if [ -r "/proc/$cur/stat" ]; then
      cur="$(awk '{print $4}' "/proc/$cur/stat" 2>/dev/null || echo 0)"
    else
      cur="$(ps -o ppid= -p "$cur" 2>/dev/null | tr -d ' ' || echo 0)"
    fi
  done

  # 2. Check /proc/locks for FLOCK WRITE matching target_inode held by an ancestor
  if [ -r /proc/locks ]; then
    while read -r _ ltype _ mode lpid dev_inode _ || [ -n "$ltype" ]; do
      if [ "$ltype" = "FLOCK" ] && [ "$mode" = "WRITE" ]; then
        local l_inode="${dev_inode##*:}"
        if [ "$l_inode" = "$target_inode" ]; then
          for anc in "${ancestors[@]}"; do
            if [ "$lpid" -eq "$anc" ]; then
              return 0
            fi
          done
        fi
      fi
    done < /proc/locks
  fi

  # 3. Check /proc/<ancestor>/fdinfo/* for active lock line with FLOCK and WRITE
  for anc in "${ancestors[@]}"; do
    local fdinfo_dir="/proc/$anc/fdinfo"
    if [ -d "$fdinfo_dir" ]; then
      for fdinfo_file in "$fdinfo_dir"/*; do
        if [ -f "$fdinfo_file" ] && [ -r "$fdinfo_file" ]; then
          if grep -q "^ino:[[:space:]]*${target_inode}$" "$fdinfo_file" 2>/dev/null; then
            if grep -q "^lock:.*FLOCK.*WRITE" "$fdinfo_file" 2>/dev/null; then
              return 0
            fi
          fi
        fi
      done
    fi
  done

  return 1
}

# Ensure lock directories and files are accessible
if [ ! -f "$PIPELINE_LOCK" ]; then
  if ! touch "$PIPELINE_LOCK" 2>/dev/null; then
    echo "CRITICAL: Mandatory pipeline lock file '$PIPELINE_LOCK' is not accessible. Aborting." >&2
    exit 1
  fi
fi

if [ ! -f "$ACTIVATION_LOCK" ]; then
  if ! touch "$ACTIVATION_LOCK" 2>/dev/null; then
    echo "CRITICAL: Mandatory activation lock file '$ACTIVATION_LOCK' is not accessible. Aborting." >&2
    exit 1
  fi
fi

# 1a. Coordinate with Pipeline Lock
if ! flock -n "$PIPELINE_LOCK" true 2>/dev/null; then
  # Pipeline lock is locked by a process. Verify caller's ancestor owns the EXCLUSIVE lock!
  if ! is_exclusive_flock_held_by_ancestor "$PIPELINE_LOCK"; then
    echo "CRITICAL: Deployment pipeline is currently in progress. Direct activation is prohibited during pipeline execution." >&2
    exit 1
  fi
  # Caller actively holds exclusive pipeline lock. Authorized!
else
  # Direct invocation when no pipeline is running: acquire exclusive lock
  exec 200>"$PIPELINE_LOCK"
  if ! flock -n 200; then
    echo "CRITICAL: Failed to acquire exclusive pipeline lock on '$PIPELINE_LOCK'." >&2
    exit 1
  fi
fi

# 1b. Acquire Activation Lock
exec 201>"$ACTIVATION_LOCK"
if ! flock -n 201; then
  echo "Another deployment is running" >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 2. Release & Commit Validation
# ------------------------------------------------------------------------------

if [[ ! "$RELEASE_NAME" =~ ^release-[A-Za-z0-9]{8}$ ]]; then
  echo "Invalid release name" >&2
  exit 1
fi

if [[ ! "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid commit SHA" >&2
  exit 1
fi

RELEASE_DIR="$BUILDS_DIR/$RELEASE_NAME"
if [ ! -d "$RELEASE_DIR" ]; then
  echo "realpath: $RELEASE_DIR: No such file or directory" >&2
  exit 1
fi

ACTUAL_SHA="$(git -C "$RELEASE_DIR" rev-parse HEAD 2>/dev/null || cat "$RELEASE_DIR/.git/HEAD" 2>/dev/null || true)"
ACTUAL_SHA="$(echo "$ACTUAL_SHA" | tr -d '[:space:]')"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "Release commit mismatch" >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 3. Persistent Shared Assets Validation (Fail Closed)
# ------------------------------------------------------------------------------

SHARED_ENV_EXPECTED="$SHARED_DIR/.env"
SHARED_UPLOADS_EXPECTED="$SHARED_DIR/uploads"

if [ ! -L "$RELEASE_DIR/backend/.env" ]; then
  echo "CRITICAL: $RELEASE_DIR/backend/.env is not a symlink" >&2
  exit 1
fi
RESOLVED_ENV="$(realpath "$RELEASE_DIR/backend/.env" 2>/dev/null || true)"
EXPECTED_ENV_REAL="$(realpath "$SHARED_ENV_EXPECTED" 2>/dev/null || echo "$SHARED_ENV_EXPECTED")"
if [ "$RESOLVED_ENV" != "$EXPECTED_ENV_REAL" ]; then
  echo "CRITICAL: $RELEASE_DIR/backend/.env does not resolve to $SHARED_ENV_EXPECTED (got: $RESOLVED_ENV)" >&2
  exit 1
fi
if [ ! -f "$RESOLVED_ENV" ]; then
  echo "CRITICAL: Shared .env target does not exist on disk: $RESOLVED_ENV" >&2
  exit 1
fi

if [ ! -L "$RELEASE_DIR/backend/uploads" ]; then
  echo "CRITICAL: $RELEASE_DIR/backend/uploads is not a symlink" >&2
  exit 1
fi
RESOLVED_UPLOADS="$(realpath "$RELEASE_DIR/backend/uploads" 2>/dev/null || true)"
EXPECTED_UPLOADS_REAL="$(realpath "$SHARED_UPLOADS_EXPECTED" 2>/dev/null || echo "$SHARED_UPLOADS_EXPECTED")"
if [ "$RESOLVED_UPLOADS" != "$EXPECTED_UPLOADS_REAL" ]; then
  echo "CRITICAL: $RELEASE_DIR/backend/uploads does not resolve to $SHARED_UPLOADS_EXPECTED (got: $RESOLVED_UPLOADS)" >&2
  exit 1
fi
if [ ! -d "$RESOLVED_UPLOADS" ]; then
  echo "CRITICAL: Shared uploads directory does not exist on disk: $RESOLVED_UPLOADS" >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 4. Mandatory Service Control and Health Tools
# ------------------------------------------------------------------------------

if ! command -v "$SYSTEMCTL_BIN" >/dev/null 2>&1; then
  echo "CRITICAL: Mandatory service manager '$SYSTEMCTL_BIN' not found. Aborting activation." >&2
  exit 1
fi

if ! command -v "$CURL_BIN" >/dev/null 2>&1; then
  echo "CRITICAL: Mandatory health verification tool '$CURL_BIN' not found. Aborting activation." >&2
  exit 1
fi

if [ -z "$HEALTH_URL" ]; then
  echo "CRITICAL: Mandatory health verification URL is not configured. Aborting activation." >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 5. Mandatory Pre-Deployment Database Backup (Fail Closed)
# ------------------------------------------------------------------------------

if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "CRITICAL: Mandatory database backup script '$BACKUP_SCRIPT' not found. Aborting activation." >&2
  exit 1
fi

if [ ! -x "$BACKUP_SCRIPT" ]; then
  echo "CRITICAL: Mandatory database backup script '$BACKUP_SCRIPT' is not executable. Aborting activation." >&2
  exit 1
fi

echo ">>> [Database Backup] Running $BACKUP_SCRIPT before switching release..."
if ! "$BACKUP_SCRIPT"; then
  echo "CRITICAL: Pre-deployment database backup failed. Aborting activation before symlink switch." >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 6. Capture Previous Release & Switch Symlink Atomically
# ------------------------------------------------------------------------------

PREVIOUS_RELEASE_DIR=""
if [ -L "$CURRENT_SYMLINK" ]; then
  PREVIOUS_RELEASE_DIR="$(realpath "$CURRENT_SYMLINK" 2>/dev/null || true)"
fi

TMP_SYMLINK="${CURRENT_SYMLINK}.tmp.$$"
ln -sfn "$RELEASE_DIR" "$TMP_SYMLINK"
mv -Tf "$TMP_SYMLINK" "$CURRENT_SYMLINK"

# Rollback helper function on restart or health failure
rollback_and_fail() {
  local reason="$1"
  echo "CRITICAL: $reason" >&2

  if [ -n "$PREVIOUS_RELEASE_DIR" ] && [ -d "$PREVIOUS_RELEASE_DIR" ] && [ "$PREVIOUS_RELEASE_DIR" != "$RELEASE_DIR" ]; then
    echo ">>> [Rollback] Reverting current symlink to previous release: $(basename "$PREVIOUS_RELEASE_DIR")..." >&2
    local rb_tmp="${CURRENT_SYMLINK}.rollback.$$"
    ln -sfn "$PREVIOUS_RELEASE_DIR" "$rb_tmp"
    mv -Tf "$rb_tmp" "$CURRENT_SYMLINK"

    echo ">>> [Rollback] Restarting $SERVICE_NAME on previous release..." >&2
    "$SYSTEMCTL_BIN" restart "$SERVICE_NAME" || {
      echo ">>> [Rollback CRITICAL] Failed to restart $SERVICE_NAME during rollback." >&2
    }
  else
    echo ">>> [Rollback NOTICE] No previous release directory available for automated rollback." >&2
  fi

  exit 1
}

# ------------------------------------------------------------------------------
# 7. Service Restart & Health Verification
# ------------------------------------------------------------------------------

echo ">>> Restarting service '$SERVICE_NAME'..."
if ! "$SYSTEMCTL_BIN" restart "$SERVICE_NAME"; then
  rollback_and_fail "Failed to restart service '$SERVICE_NAME'"
fi

echo ">>> Verifying health at $HEALTH_URL (timeout: ${HEALTH_TIMEOUT}s)..."
health_ok=0
for ((i=1; i<=HEALTH_TIMEOUT; i++)); do
  if "$CURL_BIN" -sf "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
    health_ok=1
    echo "Service health verified: $HEALTH_URL returned OK"
    break
  fi
  sleep 1
done

if [ "$health_ok" -ne 1 ]; then
  rollback_and_fail "Service health check failed: $HEALTH_URL did not return '{\"status\":\"ok\"}' within ${HEALTH_TIMEOUT}s"
fi

echo "Successfully activated $RELEASE_NAME ($EXPECTED_SHA)"
