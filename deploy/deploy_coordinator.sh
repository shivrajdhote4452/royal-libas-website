#!/bin/bash
# ==============================================================================
# Royal Libas VPS Deployment & Retention Coordinator
#
# Provides end-to-end coordinated lifecycle locking across preparation,
# activation, health checks, ledger auditing, and release retention.
#
# Usage:
#   bash deploy_coordinator.sh <COMMIT_SHA>
# ==============================================================================
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 COMMIT_SHA" >&2
  exit 1
fi

EXPECTED_SHA="$1"
if [[ ! "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "CRITICAL: Invalid commit SHA: '$EXPECTED_SHA'" >&2
  exit 1
fi

BUILDS_DIR="/var/www/royal-libas-releases/builds"
CURRENT_SYMLINK="/var/www/royal-libas-releases/current"
PIPELINE_LOCK="$BUILDS_DIR/.deploy-pipeline.lock"
ACTIVATION_LOCK="/run/lock/royal-libas-deploy.lock"
LEDGER_FILE="$BUILDS_DIR/.deployments_ledger.tsv"

# 1. Acquire unbroken exclusive lifecycle lock
exec 200>"$PIPELINE_LOCK"
if ! flock -n 200; then
  echo "CRITICAL: Another deployment or retention pipeline is currently in progress. Aborting." >&2
  exit 1
fi

# 2. Hold activation lock across preparation to prevent race with manual activation
if [ -f "$ACTIVATION_LOCK" ]; then
  exec 201<"$ACTIVATION_LOCK"
  if ! flock -n 201; then
    echo "CRITICAL: Existing activation lock ($ACTIVATION_LOCK) is currently held. Aborting." >&2
    exit 1
  fi
fi

# 3. Preparation phase
PREPARE_LOG="$(mktemp)"
trap 'rm -f "$PREPARE_LOG"' EXIT

echo ">>> [Phase 1/4] Preparing Release for SHA: $EXPECTED_SHA"
bash /usr/local/lib/royal-libas/prepare-release.sh "$EXPECTED_SHA" | tee "$PREPARE_LOG"

RELEASE_NAME="$(sed -n 's/^RELEASE_NAME=//p' "$PREPARE_LOG" | tail -n 1)"
ACTUAL_SHA="$(sed -n 's/^RELEASE_SHA=//p' "$PREPARE_LOG" | tail -n 1)"

if [[ ! "$RELEASE_NAME" =~ ^release-[A-Za-z0-9]{8}$ ]]; then
  echo "CRITICAL: Invalid release directory name generated: '$RELEASE_NAME'" >&2
  exit 1
fi

if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "CRITICAL: SHA mismatch: expected '$EXPECTED_SHA', got '$ACTUAL_SHA'" >&2
  exit 1
fi

# 4. Activation phase
echo ">>> [Phase 2/4] Activating Release: $RELEASE_NAME"
if [ -f "$ACTIVATION_LOCK" ]; then
  exec 201<&-
fi
sudo -n /usr/local/lib/royal-libas/activate-release.sh "$RELEASE_NAME" "$EXPECTED_SHA"

# Verify symlink target immediately matches intended release
RESOLVED_TARGET="$(basename "$(readlink -f "$CURRENT_SYMLINK")")"
if [ "$RESOLVED_TARGET" != "$RELEASE_NAME" ]; then
  echo "CRITICAL: Activation verification failed: expected '$RELEASE_NAME', found '$RESOLVED_TARGET'." >&2
  exit 1
fi

# 5. Post-activation health check verification
echo ">>> [Phase 3/4] Verifying Service Health..."
HEALTH_URL="http://127.0.0.1:8000/health"
HEALTH_OK=0
for i in {1..20}; do
  if curl -sf "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
    HEALTH_OK=1
    echo "Service health check verified: $HEALTH_URL returned OK"
    break
  fi
  sleep 1
done

if [ "$HEALTH_OK" -ne 1 ]; then
  echo "WARNING: Post-activation health check timed out. Deployment succeeded but skipping automatic retention." >&2
  exit 0
fi

# 6. Ledger recording
echo ">>> [Phase 4/4] Updating Ledger & Managing Release Retention..."
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
printf '%s\t%s\t%s\t%s\n' "$TIMESTAMP" "$RELEASE_NAME" "$ACTUAL_SHA" "activated" >> "$LEDGER_FILE"

# 7. Safe automatic release retention running under inherited pipeline lock
PRUNE_SCRIPT="$CURRENT_SYMLINK/deploy/prune_releases.py"
if [ -f "$PRUNE_SCRIPT" ]; then
  python3 "$PRUNE_SCRIPT" --execute --pipeline-lock-fd 200 || {
    echo "WARNING: Automatic retention pruning encountered a safety warning. Site remains live." >&2
  }
else
  echo "Notice: Retention script not found at '$PRUNE_SCRIPT'; skipping pruning."
fi

echo "Deployment and retention coordination completed successfully."
