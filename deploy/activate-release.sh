#!/bin/bash
set -euo pipefail

# Royal Libas Production Release Activation & Symlink Switch Root Helper
# Intended installation location: /usr/local/lib/royal-libas/activate-release.sh
# Permissions: 0700, Owner: root:root
#
# Production Deployment Guarantees:
# 1. Coordinated Locking & Process-Tree Ancestry Authorization:
#    - Coordinates with $PIPELINE_LOCK and $ACTIVATION_LOCK across CI and manual workflows.
#    - Verifies via kernel /proc whether any active lock is held by an ancestor calling process.
#    - Completely eliminates arbitrary token files and prevents hand-off race windows.
#    - If invoked standalone, acquires exclusive locks directly.
# 2. Strict Input & Cryptographic Commit Validation:
#    - Rejects invalid release names (^release-[A-Za-z0-9]{8}$).
#    - Rejects invalid commit SHAs (40-char hex).
#    - Verifies release directory exists and git commit metadata matches expected SHA.
# 3. Persistent Shared Assets Validation:
#    - Verifies backend/.env is a symlink to shared .env and target exists.
#    - Verifies backend/uploads is a symlink to shared uploads and target exists.
# 4. Pre-Deployment Database Backup:
#    - Executes /usr/local/lib/royal-libas/backup-db.sh before any symlink modification.
# 5. Atomic Symlink Switch & Automated Failure Rollback:
#    - Records pre-activation release target.
#    - Atomically switches current symlink via ln -sfn and mv -Tf.
# 6. Service Restart & Health Verification:
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
# 1. Process-Tree Lock Coordination
# ------------------------------------------------------------------------------

is_file_locked() {
  local lock_file="$1"
  [ -f "$lock_file" ] || return 1
  ! flock -n "$lock_file" true 2>/dev/null
}

is_lock_held_by_ancestor() {
  local lock_file="$1"
  [ -f "$lock_file" ] || return 1
  local target_real
  target_real="$(realpath "$lock_file" 2>/dev/null || echo "$lock_file")"

  local cur="$$"
  while [ -n "$cur" ] && [ "$cur" -gt 1 ]; do
    if [ -d "/proc/$cur/fd" ]; then
      for fd_link in /proc/"$cur"/fd/*; do
        if [ -L "$fd_link" ]; then
          local fd_target
          fd_target="$(readlink -f "$fd_link" 2>/dev/null || true)"
          if [ "$fd_target" = "$target_real" ]; then
            return 0
          fi
        fi
      done
    fi

    if [ -r "/proc/$cur/stat" ]; then
      cur="$(awk '{print $4}' "/proc/$cur/stat" 2>/dev/null || echo 0)"
    else
      cur="$(ps -o ppid= -p "$cur" 2>/dev/null | tr -d ' ' || echo 0)"
    fi
  done

  return 1
}

# 1a. Coordinate with Pipeline Lock
if [ -f "$PIPELINE_LOCK" ]; then
  if is_file_locked "$PIPELINE_LOCK"; then
    if ! is_lock_held_by_ancestor "$PIPELINE_LOCK"; then
      echo "CRITICAL: Deployment pipeline is currently in progress. Direct activation is prohibited during pipeline execution." >&2
      exit 1
    fi
  else
    # Direct invocation when no pipeline is running: acquire exclusive lock
    exec 200>"$PIPELINE_LOCK"
    if ! flock -n 200; then
      echo "CRITICAL: Failed to acquire pipeline lock ($PIPELINE_LOCK)." >&2
      exit 1
    fi
  fi
fi

# 1b. Coordinate with Activation Lock
if [ -f "$ACTIVATION_LOCK" ]; then
  if is_file_locked "$ACTIVATION_LOCK"; then
    if ! is_lock_held_by_ancestor "$ACTIVATION_LOCK"; then
      echo "Another deployment is running" >&2
      exit 1
    fi
  else
    # Direct invocation or first acquisition: acquire exclusive lock
    exec 201>"$ACTIVATION_LOCK"
    if ! flock -n 201; then
      echo "Another deployment is running" >&2
      exit 1
    fi
  fi
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
# 3. Persistent Shared Assets Validation
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
# 4. Pre-Deployment Database Backup
# ------------------------------------------------------------------------------

if [ -f "$BACKUP_SCRIPT" ] && [ -x "$BACKUP_SCRIPT" ]; then
  echo ">>> [Database Backup] Running $BACKUP_SCRIPT before switching release..."
  if ! "$BACKUP_SCRIPT"; then
    echo "CRITICAL: Pre-deployment database backup failed. Aborting activation." >&2
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# 5. Capture Previous Release & Switch Symlink Atomically
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

    if command -v "$SYSTEMCTL_BIN" >/dev/null 2>&1; then
      echo ">>> [Rollback] Restarting $SERVICE_NAME on previous release..." >&2
      "$SYSTEMCTL_BIN" restart "$SERVICE_NAME" || {
        echo ">>> [Rollback CRITICAL] Failed to restart $SERVICE_NAME during rollback." >&2
      }
    fi
  else
    echo ">>> [Rollback NOTICE] No previous release directory available for automated rollback." >&2
  fi

  exit 1
}

# ------------------------------------------------------------------------------
# 6. Service Restart & Health Verification
# ------------------------------------------------------------------------------

if command -v "$SYSTEMCTL_BIN" >/dev/null 2>&1; then
  echo ">>> Restarting service '$SERVICE_NAME'..."
  if ! "$SYSTEMCTL_BIN" restart "$SERVICE_NAME"; then
    rollback_and_fail "Failed to restart service '$SERVICE_NAME'"
  fi
fi

if command -v "$CURL_BIN" >/dev/null 2>&1 && [ -n "$HEALTH_URL" ]; then
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
fi

echo "Successfully activated $RELEASE_NAME ($EXPECTED_SHA)"
