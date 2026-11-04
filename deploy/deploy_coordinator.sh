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

get_git_commit_sha() {
  local dir="$1"
  local sha=""
  if command -v git >/dev/null 2>&1; then
    sha="$(git -c "safe.directory=$dir" -C "$dir" rev-parse HEAD 2>/dev/null || true)"
    sha="$(echo "$sha" | tr -d '[:space:]')"
    if [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
      echo "$sha"
      return 0
    fi
  fi
  if [ -f "$dir/.git/HEAD" ]; then
    local head_content
    head_content="$(cat "$dir/.git/HEAD" 2>/dev/null | tr -d '\r\n')"
    if [[ "$head_content" =~ ^[0-9a-f]{40}$ ]]; then
      echo "$head_content"
      return 0
    fi
    if [[ "$head_content" =~ ^ref:[[:space:]]*(.+)$ ]]; then
      local ref_path="${BASH_REMATCH[1]}"
      if [ -f "$dir/.git/$ref_path" ]; then
        local loose_sha
        loose_sha="$(cat "$dir/.git/$ref_path" 2>/dev/null | tr -d '[:space:]')"
        if [[ "$loose_sha" =~ ^[0-9a-f]{40}$ ]]; then
          echo "$loose_sha"
          return 0
        fi
      fi
      if [ -f "$dir/.git/packed-refs" ]; then
        local packed_sha
        packed_sha="$(awk -v r="$ref_path" '$2 == r {print $1}' "$dir/.git/packed-refs" 2>/dev/null | tr -d '[:space:]')"
        if [[ "$packed_sha" =~ ^[0-9a-f]{40}$ ]]; then
          echo "$packed_sha"
          return 0
        fi
      fi
    fi
  fi
  return 1
}

# Record pre-deployment active release for potential rollback
PREVIOUS_RELEASE=""
PREVIOUS_COMMIT=""
if [ -L "$CURRENT_SYMLINK" ]; then
  PREVIOUS_RELEASE="$(basename "$(readlink -f "$CURRENT_SYMLINK")")"
  if [ -d "$BUILDS_DIR/$PREVIOUS_RELEASE" ]; then
    PREVIOUS_COMMIT="$(get_git_commit_sha "$BUILDS_DIR/$PREVIOUS_RELEASE" || true)"
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

# 4. Activation phase (caller maintains unbroken locks across preparation and activation)
echo ">>> [Phase 2/4] Activating Release: $RELEASE_NAME"
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
  echo "CRITICAL: Service health check failed after activation: $HEALTH_URL did not return '{\"status\":\"ok\"}' within 20s." >&2
  # Attempt automated rollback to previous release if valid
  if [ -n "$PREVIOUS_RELEASE" ] && [ "$PREVIOUS_RELEASE" != "$RELEASE_NAME" ] && [[ "$PREVIOUS_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
    echo ">>> [Rollback] Attempting automated rollback to previous release: $PREVIOUS_RELEASE ($PREVIOUS_COMMIT)..." >&2
    if sudo -n /usr/local/lib/royal-libas/activate-release.sh "$PREVIOUS_RELEASE" "$PREVIOUS_COMMIT"; then
      ROLLED_BACK_TARGET="$(basename "$(readlink -f "$CURRENT_SYMLINK")")"
      if [ "$ROLLED_BACK_TARGET" = "$PREVIOUS_RELEASE" ]; then
        echo ">>> [Rollback] Automated rollback succeeded. Site reverted to $PREVIOUS_RELEASE." >&2
      else
        echo ">>> [Rollback WARNING] Symlink target after rollback is '$ROLLED_BACK_TARGET', expected '$PREVIOUS_RELEASE'." >&2
      fi
    else
      echo ">>> [Rollback CRITICAL] Automated rollback failed to activate $PREVIOUS_RELEASE." >&2
    fi
  else
    echo ">>> [Rollback NOTICE] No valid previous release ($PREVIOUS_RELEASE) available for automated rollback." >&2
  fi
  echo "CRITICAL: Deployment failed health verification. Skipping ledger update and release pruning." >&2
  exit 1
fi

# 6. Ledger recording
echo ">>> [Phase 4/4] Updating Ledger & Managing Release Retention..."
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
printf '%s\t%s\t%s\t%s\n' "$TIMESTAMP" "$RELEASE_NAME" "$ACTUAL_SHA" "activated" >> "$LEDGER_FILE"

# 7. Safe automatic release retention running under pipeline lock
PRUNE_SCRIPT="$CURRENT_SYMLINK/deploy/prune_releases.py"
if [ -f "$PRUNE_SCRIPT" ]; then
  python3 "$PRUNE_SCRIPT" --execute --pipeline-lock-fd 200 || {
    echo "WARNING: Automatic retention pruning encountered a safety warning. Site remains live." >&2
  }
else
  echo "Notice: Retention script not found at '$PRUNE_SCRIPT'; skipping pruning."
fi

echo "Deployment and retention coordination completed successfully."
