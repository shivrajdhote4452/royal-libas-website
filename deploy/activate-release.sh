#!/bin/bash
set -euo pipefail

# Royal Libas Production Release Activation & Symlink Switch Root Helper
# Designed to be installed at /usr/local/lib/royal-libas/activate-release.sh
# Participates in the single coordinated locking protocol across CI and manual paths.

if [ "$#" -lt 2 ]; then
  echo "Usage: activate-release.sh RELEASE_NAME COMMIT_SHA [--from-pipeline]" >&2
  exit 1
fi

RELEASE_NAME="$1"
EXPECTED_SHA="$2"
FROM_PIPELINE="${3:-}"

BUILDS_DIR="/var/www/royal-libas-releases/builds"
CURRENT_SYMLINK="/var/www/royal-libas-releases/current"
PIPELINE_LOCK="$BUILDS_DIR/.deploy-pipeline.lock"
ACTIVATION_LOCK="/run/lock/royal-libas-deploy.lock"

# 1. Coordinate with pipeline locking protocol
PIPELINE_TOKEN="${BUILDS_DIR}/.deploy-pipeline.token"

if [ -f "$PIPELINE_LOCK" ]; then
  if ! flock -n "$PIPELINE_LOCK" true 2>/dev/null; then
    # Pipeline lock is currently held by another process (e.g. CI workflow).
    # Check if this activation was authorized by the active pipeline holding the lock.
    is_authorized=0
    if [ -f "$PIPELINE_TOKEN" ]; then
      # Token file exists; check if created recently (within last 120 seconds)
      token_age=$(( $(date +%s) - $(date -r "$PIPELINE_TOKEN" +%s 2>/dev/null || echo 0) ))
      if [ "$token_age" -ge 0 ] && [ "$token_age" -le 120 ]; then
        is_authorized=1
      fi
    fi

    if [ "$is_authorized" -ne 1 ]; then
      echo "CRITICAL: Deployment pipeline is currently in progress. Direct activation is prohibited during pipeline execution." >&2
      exit 1
    fi
  else
    # Direct invocation by operator when no CI is running:
    # Must acquire exclusive pipeline lock to protect the entire activation run.
    exec 200>"$PIPELINE_LOCK"
    flock -n 200
  fi
fi

# 2. Acquire low-level activation lock
exec 201>"$ACTIVATION_LOCK"
if ! flock -n 201; then
  echo "Another deployment is running" >&2
  exit 1
fi

# 3. Validate arguments
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

# 4. Validate git commit on disk
ACTUAL_SHA="$(git -C "$RELEASE_DIR" rev-parse HEAD 2>/dev/null || cat "$RELEASE_DIR/.git/HEAD" 2>/dev/null || true)"
ACTUAL_SHA="$(echo "$ACTUAL_SHA" | tr -d '[:space:]')"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "Commit SHA mismatch on disk for '$RELEASE_NAME'" >&2
  exit 1
fi

# 5. Atomic symlink switch
TMP_SYMLINK="${CURRENT_SYMLINK}.tmp.$$"
ln -sfn "$RELEASE_DIR" "$TMP_SYMLINK"
mv -Tf "$TMP_SYMLINK" "$CURRENT_SYMLINK"

# 6. Restart systemd services if present
if command -v systemctl >/dev/null 2>&1; then
  systemctl restart royal-libas-backend || true
fi

echo "Successfully activated $RELEASE_NAME ($EXPECTED_SHA)"
