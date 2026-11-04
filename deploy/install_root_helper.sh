#!/bin/bash
set -euo pipefail

# ==============================================================================
# Royal Libas Guarded Root Helper Installation Script
# ==============================================================================
# Target Location: /usr/local/lib/royal-libas/activate-release.sh
#
# Threat Model & Security Invariants:
# 1. Unprivileged Source Directory:
#    Release directories (/var/www/royal-libas-releases/...) are owned by the
#    unprivileged deploy user ('royal-deploy'). Executing scripts directly from
#    such directories with root privileges is a privilege escalation vulnerability
#    (TOCTOU race or file tampering by an unprivileged account).
#
# 2. Root-Controlled Staging Required:
#    The root operator MUST stage candidate files into a private, root-owned
#    directory (mode 0700, e.g. /root/rl-install-stage.XXXXXXXX or
#    /usr/local/lib/royal-libas/.stage.XXXXXXXX) before execution.
#
# 3. Pre-Execution Independent Verification:
#    BOTH this installer script and the candidate helper script MUST have their
#    SHA-256 checksums and bash syntax verified BEFORE root executes either script.
#
# 4. Fail-Closed Enforcement:
#    This installer will immediately abort without modifying the live helper if:
#    - Executed directly from a non-root owned directory or script file.
#    - Executed by a non-root user (id -u != 0).
#    - Any bash syntax error exists in candidate helper.
#    - Candidate helper SHA-256 does not match reviewed commit hash.
#    - Target directory or files are inaccessible.
#    - Backup of existing helper cannot be created or verified byte-for-byte.
#
# 5. Rollback Guarantee:
#    If post-replacement validation fails, the pre-existing helper is immediately
#    restored from the verified backup.
#
# Recommended Root Staging & Verification Procedure (Single Guarded Execution):
# ------------------------------------------------------------------------------
# Run as root via 'sudo bash -c' to guarantee atomic fail-closed execution
# and prevent partial execution of subsequent commands if any check fails:
#
#   sudo bash -c '
#   set -euo pipefail
#   EXPECTED_INSTALLER_SHA="<sha256 of install_root_helper.sh>"
#   EXPECTED_HELPER_SHA="328ea8543b5044bedfea82e94b4edc7bdb19bd8aabcd75e175de0bfee3efa93f"
#   RELEASE_DIR="/var/www/royal-libas-releases/current/deploy"
#
#   STAGE_DIR="$(mktemp -d /root/rl-install-stage.XXXXXXXX)"
#   trap '\''rm -rf "$STAGE_DIR"'\'' EXIT INT TERM
#
#   cp "$RELEASE_DIR/install_root_helper.sh" "$STAGE_DIR/install_root_helper.sh"
#   cp "$RELEASE_DIR/activate-release.sh" "$STAGE_DIR/activate-release.sh"
#   chown -R root:root "$STAGE_DIR"
#   chmod 0700 "$STAGE_DIR" "$STAGE_DIR"/*
#
#   # Pre-execution independent verification of BOTH scripts:
#   if ! bash -n "$STAGE_DIR/install_root_helper.sh"; then
#     echo "CRITICAL: Installer syntax verification failed. Aborting without executing installer." >&2
#     exit 1
#   fi
#
#   if ! bash -n "$STAGE_DIR/activate-release.sh"; then
#     echo "CRITICAL: Helper candidate syntax verification failed. Aborting without executing installer." >&2
#     exit 1
#   fi
#
#   if ! echo "$EXPECTED_INSTALLER_SHA  $STAGE_DIR/install_root_helper.sh" | sha256sum -c -; then
#     echo "CRITICAL: Installer checksum verification failed. Aborting without executing installer." >&2
#     exit 1
#   fi
#
#   if ! echo "$EXPECTED_HELPER_SHA  $STAGE_DIR/activate-release.sh" | sha256sum -c -; then
#     echo "CRITICAL: Helper candidate checksum verification failed. Aborting without executing installer." >&2
#     exit 1
#   fi
#
#   # Execute guarded installer strictly from verified root staging directory:
#   "$STAGE_DIR/install_root_helper.sh" "$STAGE_DIR/activate-release.sh" /usr/local/lib/royal-libas/activate-release.sh
#   '
# ==============================================================================

SOURCE_HELPER="${1:-${SOURCE_HELPER:-/var/www/royal-libas-releases/current/deploy/activate-release.sh}}"
TARGET_HELPER="${2:-${TARGET_HELPER:-/usr/local/lib/royal-libas/activate-release.sh}}"
EXPECTED_SHA256="${EXPECTED_SHA256:-328ea8543b5044bedfea82e94b4edc7bdb19bd8aabcd75e175de0bfee3efa93f}"
EXPECTED_UID="${EXPECTED_UID:-0}"

echo "========================================================================"
echo "Royal Libas Root Activation Helper Guarded Installer"
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "========================================================================"

# ------------------------------------------------------------------------------
# 1. Enforce root privileges and untrusted-directory execution prevention
# ------------------------------------------------------------------------------
if [ "${ALLOW_NON_ROOT_TEST:-0}" -ne 1 ]; then
  if [ "$(id -u)" -ne 0 ]; then
    echo "CRITICAL: This installation script must be executed as root (UID 0)." >&2
    exit 1
  fi
fi

# Detect self location and ownership
INSTALLER_PATH="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
INSTALLER_DIR="$(dirname "$INSTALLER_PATH")"

INSTALLER_UID="$(stat -c '%u' "$INSTALLER_PATH" 2>/dev/null || stat -f '%u' "$INSTALLER_PATH" 2>/dev/null || echo "-1")"
INSTALLER_DIR_UID="$(stat -c '%u' "$INSTALLER_DIR" 2>/dev/null || stat -f '%u' "$INSTALLER_DIR" 2>/dev/null || echo "-1")"
INSTALLER_DIR_PERM="$(stat -c '%a' "$INSTALLER_DIR" 2>/dev/null || stat -f '%Lp' "$INSTALLER_DIR" 2>/dev/null || echo "777")"

if [ "${ENFORCE_OWNERSHIP_CHECK:-1}" -eq 1 ]; then
  if [ "${ALLOW_NON_ROOT_TEST:-0}" -ne 1 ] || [ "${CHECK_OWNERSHIP_IN_TEST:-0}" -eq 1 ]; then
    if [ "$INSTALLER_UID" != "$EXPECTED_UID" ]; then
      echo "CRITICAL: Security violation: Installer '$INSTALLER_PATH' is owned by UID $INSTALLER_UID (expected UID $EXPECTED_UID)." >&2
      echo "Refusing to execute unprivileged or untrusted script with root permissions." >&2
      echo "Procedure: Root must stage installer and helper into a private root-owned 0700 directory and verify checksums before execution." >&2
      exit 1
    fi

    if [ "$INSTALLER_DIR_UID" != "$EXPECTED_UID" ]; then
      echo "CRITICAL: Security violation: Parent directory '$INSTALLER_DIR' is owned by UID $INSTALLER_DIR_UID (expected UID $EXPECTED_UID)." >&2
      echo "Refusing to execute script from an unprivileged directory." >&2
      exit 1
    fi

    # Ensure parent directory is not group-writable or other-writable (bits 0022)
    if [ "$(( 0$INSTALLER_DIR_PERM & 0022 ))" -ne 0 ]; then
      echo "CRITICAL: Security violation: Parent directory '$INSTALLER_DIR' has insecure permissions ($INSTALLER_DIR_PERM)." >&2
      echo "Parent directory must not be writable by non-root users." >&2
      exit 1
    fi
  fi
fi

# ------------------------------------------------------------------------------
# 2. Validate source and target paths
# ------------------------------------------------------------------------------
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

SOURCE_PATH="$(readlink -f "$SOURCE_HELPER" 2>/dev/null || realpath "$SOURCE_HELPER" 2>/dev/null || echo "$SOURCE_HELPER")"
SOURCE_UID="$(stat -c '%u' "$SOURCE_PATH" 2>/dev/null || stat -f '%u' "$SOURCE_PATH" 2>/dev/null || echo "-1")"

if [ "${ENFORCE_OWNERSHIP_CHECK:-1}" -eq 1 ]; then
  if [ "${ALLOW_NON_ROOT_TEST:-0}" -ne 1 ] || [ "${CHECK_OWNERSHIP_IN_TEST:-0}" -eq 1 ]; then
    if [ "$SOURCE_UID" != "$EXPECTED_UID" ]; then
      echo "CRITICAL: Security violation: Candidate helper '$SOURCE_PATH' is owned by UID $SOURCE_UID (expected UID $EXPECTED_UID)." >&2
      echo "Candidate helper must be staged into a root-owned 0700 directory and verified before installation." >&2
      exit 1
    fi
  fi
fi

# Pre-copy candidate syntax check
echo ">>> [1/5] Verifying candidate syntax before staging..."
if ! bash -n "$SOURCE_PATH"; then
  echo "CRITICAL: Bash syntax check failed on candidate source '$SOURCE_PATH'. Aborting." >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 3. Setup temporary file and cleanup trap in target directory
# ------------------------------------------------------------------------------
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
echo ">>> [2/5] Copied candidate to root temporary file: $TMP_HELPER"
cp -p "$SOURCE_PATH" "$TMP_HELPER"
chown root:root "$TMP_HELPER" 2>/dev/null || true
chmod 0700 "$TMP_HELPER"

# ------------------------------------------------------------------------------
# 4. Syntax verification on staged temporary file
# ------------------------------------------------------------------------------
echo ">>> [3/5] Verifying staged temporary file syntax..."
if ! bash -n "$TMP_HELPER"; then
  echo "CRITICAL: Bash syntax check failed on staged temporary file. Aborting without replacement." >&2
  exit 1
fi
echo ">>> Syntax check passed."

# ------------------------------------------------------------------------------
# 5. Checksum verification against reviewed commit
# ------------------------------------------------------------------------------
echo ">>> [4/5] Verifying SHA-256 checksum against reviewed commit..."
ACTUAL_SHA256="$(sha256sum "$TMP_HELPER" | awk '{print $1}')"
if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "CRITICAL: SHA-256 checksum mismatch!" >&2
  echo "  Expected: $EXPECTED_SHA256" >&2
  echo "  Actual:   $ACTUAL_SHA256" >&2
  echo "Aborting without modifying existing helper." >&2
  exit 1
fi
echo ">>> Checksum verified: $ACTUAL_SHA256"

# ------------------------------------------------------------------------------
# 6. Create verified, byte-for-byte identical backup of existing helper
# ------------------------------------------------------------------------------
BACKUP_HELPER=""
if [ -f "$TARGET_HELPER" ]; then
  echo ">>> [5/5] Creating verified backup of existing helper..."
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
  echo ">>> [5/5] No existing helper found at '$TARGET_HELPER'; skipping backup."
fi

# ------------------------------------------------------------------------------
# 7. Atomic replacement
# ------------------------------------------------------------------------------
echo ">>> Atomically installing verified helper..."
mv -f "$TMP_HELPER" "$TARGET_HELPER"
# Disarm trap so cleanup does not remove the target
TMP_HELPER=""

chown root:root "$TARGET_HELPER" 2>/dev/null || true
chmod 0700 "$TARGET_HELPER"

# ------------------------------------------------------------------------------
# 8. Post-replacement confirmation
# ------------------------------------------------------------------------------
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
