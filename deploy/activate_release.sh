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

# 2. Validate release directory format and existence
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

# 3. Helper to reliably resolve commit SHA across branch-based and detached checkouts
get_git_commit_sha() {
  local dir="$1"
  local sha=""
  if command -v git >/dev/null 2>&1; then
    sha="$(git -c "safe.directory=*" -c "safe.directory=$dir" -C "$dir" rev-parse HEAD 2>/dev/null || true)"
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

# 4. Validate commit SHA matches git metadata on disk
ACTUAL_SHA="$(get_git_commit_sha "$RELEASE_DIR" || true)"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "CRITICAL: Commit mismatch for '$RELEASE_NAME': expected '$EXPECTED_SHA', disk has '$ACTUAL_SHA'." >&2
  exit 1
fi

# Record pre-activation release for potential rollback
PREVIOUS_RELEASE=""
PREVIOUS_COMMIT=""
if [ -L "$CURRENT_SYMLINK" ]; then
  PREVIOUS_RELEASE="$(basename "$(readlink -f "$CURRENT_SYMLINK")")"
  if [ -d "$BUILDS_DIR/$PREVIOUS_RELEASE" ]; then
    PREVIOUS_COMMIT="$(get_git_commit_sha "$BUILDS_DIR/$PREVIOUS_RELEASE" || true)"
  fi
fi

# 5. Release activation via privileged helper (caller maintains continuous locks)
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
  echo "CRITICAL: Manual activation failed health verification. Skipping ledger update and release pruning." >&2
  exit 1
fi

# 8. Record verified activation in append-only ledger
echo ">>> [Phase 3/3] Updating Ledger & Managing Retention..."
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
printf '%s\t%s\t%s\t%s\n' "$TIMESTAMP" "$RELEASE_NAME" "$EXPECTED_SHA" "activated" >> "$LEDGER_FILE"

# 8. Safe automatic release retention running under pipeline lock
PRUNE_SCRIPT="$CURRENT_SYMLINK/deploy/prune_releases.py"
if [ -f "$PRUNE_SCRIPT" ]; then
  python3 "$PRUNE_SCRIPT" --execute --pipeline-lock-fd 200 || {
    echo "WARNING: Automatic retention encountered a safety notice. Site remains live." >&2
  }
else
  echo "Notice: Retention script not found at '$PRUNE_SCRIPT'; skipping pruning."
fi

echo "Manual activation and retention coordination completed successfully."
