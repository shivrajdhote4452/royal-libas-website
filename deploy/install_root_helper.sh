#!/bin/bash
set -euo pipefail

# Royal Libas Guarded Root Helper Installation Script
# Location: /var/www/royal-libas-releases/current/deploy/install_root_helper.sh
#
# Production Invariants:
# 1. Must be executed as root (UID 0).
# 2. Strict fail-closed: stops immediately if ANY check fails.
# 3. Copies candidate to root-controlled temporary file in target directory.
# 4. Traps EXIT/INT/TERM to clean up temporary file on failure.
# 5. Validates bash syntax (bash -n) on candidate BEFORE replacement.
# 6. Validates SHA-256 against reviewed commit BEFORE replacement.
# 7. Creates byte-for-byte verified backup of existing helper BEFORE replacement.
# 8. Never touches or replaces installed helper if any verification fails.

SOURCE_HELPER="${1:-${SOURCE_HELPER:-/var/www/royal-libas-releases/current/deploy/activate-release.sh}}"
TARGET_HELPER="${2:-${TARGET_HELPER:-/usr/local/lib/royal-libas/activate-release.sh}}"
EXPECTED_SHA256="${EXPECTED_SHA256:-328ea8543b5044bedfea82e94b4edc7bdb19bd8aabcd75e175de0bfee3efa93f}"

echo "========================================================================"
echo "Royal Libas Root Activation Helper Guarded Installer"
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "========================================================================"

# 1. Enforce root privileges (unless explicitly in isolated test mode)
if [ "${ALLOW_NON_ROOT_TEST:-0}" -ne 1 ] && [ "$(id -u)" -ne 0 ]; then
  echo "CRITICAL: This installation script must be executed as root (UID 0)." >&2
  exit 1
fi

# 2. Validate paths
TARGET_DIR="$(dirname "$TARGET_HELPER")"
if [ ! -d "$TARGET_DIR" ]; then
  echo "CRITICAL: Target directory '$TARGET_DIR' does not exist." >&2
  exit 1
fi

if [ ! -f "$SOURCE_HELPER" ]; then
  echo "CRITICAL: Source candidate helper '$SOURCE_HELPER' not found." >&2
  exit 1
fi

if [ ! -s "$SOURCE_HELPER" ]; then
  echo "CRITICAL: Source candidate helper '$SOURCE_HELPER' is empty." >&2
  exit 1
fi

# 3. Setup temporary file and cleanup trap
TMP_HELPER=""
cleanup() {
  local exit_code=$?
  if [ -n "$TMP_HELPER" ] && [ -f "$TMP_HELPER" ]; then
    echo ">>> Cleaning up temporary file '$TMP_HELPER'..." >&2
    rm -f "$TMP_HELPER"
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

TMP_HELPER="$(mktemp "${TARGET_DIR}/activate-release.tmp.XXXXXXXX")"
echo ">>> [1/5] Copied candidate to root temporary file: $TMP_HELPER"
cp -p "$SOURCE_HELPER" "$TMP_HELPER"
chown root:root "$TMP_HELPER" 2>/dev/null || true
chmod 0700 "$TMP_HELPER"

# 4. Syntax verification
echo ">>> [2/5] Verifying candidate bash syntax..."
if ! bash -n "$TMP_HELPER"; then
  echo "CRITICAL: Bash syntax check failed on candidate helper. Aborting without replacement." >&2
  exit 1
fi
echo ">>> Syntax check passed."

# 5. Checksum verification against reviewed commit
echo ">>> [3/5] Verifying SHA-256 checksum against reviewed commit..."
ACTUAL_SHA256="$(sha256sum "$TMP_HELPER" | awk '{print $1}')"
if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "CRITICAL: SHA-256 checksum mismatch!" >&2
  echo "  Expected: $EXPECTED_SHA256" >&2
  echo "  Actual:   $ACTUAL_SHA256" >&2
  echo "Aborting without modifying existing helper." >&2
  exit 1
fi
echo ">>> Checksum verified: $ACTUAL_SHA256"

# 6. Create verified, byte-for-byte identical backup of existing helper
BACKUP_HELPER=""
if [ -f "$TARGET_HELPER" ]; then
  echo ">>> [4/5] Creating verified backup of existing helper..."
  TIMESTAMP="$(date -u +"%Y%m%d-%H%M%S")"
  BACKUP_HELPER="${TARGET_HELPER}.bak-${TIMESTAMP}"
  cp -p "$TARGET_HELPER" "$BACKUP_HELPER"

  if [ ! -f "$BACKUP_HELPER" ] || [ ! -s "$BACKUP_HELPER" ]; then
    echo "CRITICAL: Failed to create non-empty backup at '$BACKUP_HELPER'. Aborting." >&2
    exit 1
  fi

  if ! cmp -s "$TARGET_HELPER" "$BACKUP_HELPER"; then
    echo "CRITICAL: Backup file '$BACKUP_HELPER' does not match existing helper byte-for-byte. Aborting." >&2
    exit 1
  fi
  echo ">>> Verified backup created: $BACKUP_HELPER"
else
  echo ">>> [4/5] No existing helper found at '$TARGET_HELPER'; skipping backup."
fi

# 7. Atomic replacement
echo ">>> [5/5] Atomically installing verified helper..."
mv -f "$TMP_HELPER" "$TARGET_HELPER"
# Disarm trap so cleanup does not remove the target
TMP_HELPER=""

chown root:root "$TARGET_HELPER" 2>/dev/null || true
chmod 0700 "$TARGET_HELPER"

# 8. Post-replacement confirmation
INSTALLED_SHA256="$(sha256sum "$TARGET_HELPER" | awk '{print $1}')"
if [ "$INSTALLED_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "CRITICAL: Post-install checksum validation failed! Rolling back from backup..." >&2
  if [ -n "$BACKUP_HELPER" ] && [ -f "$BACKUP_HELPER" ]; then
    cp -p "$BACKUP_HELPER" "$TARGET_HELPER"
    chmod 0700 "$TARGET_HELPER"
  fi
  exit 1
fi

echo "========================================================================"
echo "SUCCESS: activate-release.sh installed successfully."
echo "Target: $TARGET_HELPER"
echo "Permissions: 0700 (root:root)"
echo "SHA-256: $INSTALLED_SHA256"
if [ -n "$BACKUP_HELPER" ]; then
  echo "Backup preserved at: $BACKUP_HELPER"
fi
echo "========================================================================"
exit 0
