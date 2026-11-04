#!/bin/bash
set -euo pipefail

# Royal Libas Coordinated Manual Release Activation & Rollback Utility
# Part of the unified deployment and retention locking protocol.

if [ "$#" -ne 2 ]; then
  echo "Usage: activate_release.sh RELEASE_NAME COMMIT_SHA" >&2
  exit 1
fi

RELEASE_NAME="$1"
EXPECTED_SHA="$2"

BUILDS_DIR="/var/www/royal-libas-releases/builds"
CURRENT_SYMLINK="/var/www/royal-libas-releases/current"
PIPELINE_LOCK="$BUILDS_DIR/.deploy-pipeline.lock"
ACTIVATION_LOCK="/run/lock/royal-libas-deploy.lock"
LEDGER_FILE="$BUILDS_DIR/.deployments_ledger.tsv"

# 1. Acquire unbroken exclusive pipeline lock covering the entire activation lifecycle
exec 200>"$PIPELINE_LOCK"
if ! flock -n 200; then
  echo "CRITICAL: Another deployment or activation pipeline is currently in progress. Aborting." >&2
  exit 1
fi

# 2. Check if low-level activation lock is held by another process
if [ -f "$ACTIVATION_LOCK" ]; then
  if ! flock -n "$ACTIVATION_LOCK" true 2>/dev/null; then
    echo "CRITICAL: Activation lock ($ACTIVATION_LOCK) is currently held. Aborting." >&2
    exit 1
  fi
fi

# 3. Validate release directory format and existence
if [[ ! "$RELEASE_NAME" =~ ^release-[A-Za-z0-9]{8}$ ]]; then
  echo "CRITICAL: Invalid release name format: '$RELEASE_NAME'" >&2
  exit 1
fi

if [[ ! "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "CRITICAL: Invalid commit SHA format: '$EXPECTED_SHA'" >&2
  exit 1
fi

RELEASE_DIR="$BUILDS_DIR/$RELEASE_NAME"
if [ ! -d "$RELEASE_DIR" ]; then
  echo "CRITICAL: Release directory '$RELEASE_DIR' does not exist." >&2
  exit 1
fi

# 4. Validate commit SHA matches git metadata on disk
ACTUAL_SHA="$(git -C "$RELEASE_DIR" rev-parse HEAD 2>/dev/null || cat "$RELEASE_DIR/.git/HEAD" 2>/dev/null || true)"
ACTUAL_SHA="$(echo "$ACTUAL_SHA" | tr -d '[:space:]')"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "CRITICAL: Commit mismatch for '$RELEASE_NAME': expected '$EXPECTED_SHA', disk has '$ACTUAL_SHA'." >&2
  exit 1
fi

# 5. Release activation via privileged helper
echo ">>> [Phase 1/3] Activating Release: $RELEASE_NAME ($EXPECTED_SHA)"
sudo -n /usr/local/lib/royal-libas/activate-release.sh "$RELEASE_NAME" "$EXPECTED_SHA"

# 6. Verify symlink target immediately matches intended release
RESOLVED_TARGET="$(basename "$(readlink -f "$CURRENT_SYMLINK")")"
if [ "$RESOLVED_TARGET" != "$RELEASE_NAME" ]; then
  echo "CRITICAL: Activation verification failed: expected '$RELEASE_NAME', found '$RESOLVED_TARGET'." >&2
  exit 1
fi

# 7. Post-activation service health check verification
echo ">>> [Phase 2/3] Verifying Service Health..."
HEALTH_URL="http://127.0.0.1:8000/health"
HEALTH_OK=0
for i in {1..20}; do
  if curl -sf "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
    HEALTH_OK=1
    echo "Service health verified: $HEALTH_URL returned OK"
    break
  fi
  sleep 1
done

if [ "$HEALTH_OK" -ne 1 ]; then
  echo "WARNING: Health check timed out after manual activation. Skipping release pruning." >&2
  exit 0
fi

# 8. Record verified activation in append-only ledger
echo ">>> [Phase 3/3] Updating Ledger & Managing Retention..."
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
printf '%s\t%s\t%s\t%s\n' "$TIMESTAMP" "$RELEASE_NAME" "$EXPECTED_SHA" "activated" >> "$LEDGER_FILE"

# 9. Safe automatic release retention running under inherited pipeline lock
PRUNE_SCRIPT="$CURRENT_SYMLINK/deploy/prune_releases.py"
if [ -f "$PRUNE_SCRIPT" ]; then
  python3 "$PRUNE_SCRIPT" --execute --pipeline-lock-fd 200 || {
    echo "WARNING: Automatic retention encountered a safety notice. Site remains live." >&2
  }
else
  echo "Notice: Retention script not found at '$PRUNE_SCRIPT'; skipping pruning."
fi

echo "Manual activation and retention coordination completed successfully."
