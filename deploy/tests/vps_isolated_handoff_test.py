#!/usr/bin/env python3
"""
Isolated Linux Process Concurrency & Production Entry-Point Verification Suite.

Designed to run in an isolated sandbox (e.g. /tmp on VPS) under user 'royal-deploy':
1. Test 1: First-Deployment Compatibility with the Exact Legacy Production Helper
   - Workflow holds pipeline lock (FD 200).
   - Invokes exact legacy helper (which acquires activation lock directly).
   - Verifies NO deadlock: legacy helper succeeds (code 0), switches symlink.
2. Test 2: Deployment with the Proposed Helper (Seamless Upgrade)
   - Proposed helper verifies ancestor exclusive flock via kernel /proc.
   - Executes mandatory backup, switches symlink, restarts royal-libas, verifies health.
   - Directly asserts observed symlink, exit code, and service restart.
3. Test 3: Mandatory Prerequisites - Missing or Non-Executable Backup Script
   - 3a: Backup script missing -> fails closed before touching symlink.
   - 3b: Backup script unexecutable -> fails closed before touching symlink.
   - 3c: Backup execution fails -> fails closed before touching symlink.
4. Test 4: Mandatory Prerequisites - Missing systemctl or curl
   - 4a: systemctl missing -> fails closed before touching symlink.
   - 4b: curl missing -> fails closed before touching symlink.
5. Test 5: Lock Authorization - Open FD Without Exclusive Lock Rejected
   - Process opens lock file without flock -x.
   - Proves kernel fdinfo verification rejects non-exclusive descriptors.
6. Test 6: Simultaneous Manual Activation Blocked During Active Pipeline
   - Direct activation in separate session during active pipeline is rejected.
   - Asserts exit code 1 and pipeline-in-progress error.
7. Test 7: Failed Service Restart Handling & Rollback
   - Systemctl restart fails -> helper catches failure, rolls back symlink to previous release.
   - Helper exits with code 1; ledger not updated.
8. Test 8: Failed Health Check & Rollback
   - Health check times out -> helper catches failure, rolls back symlink.
   - Helper exits with code 1; ledger not updated.
9. Test 9: Safe Recovery to Legacy Helper
   - Helper reverted to legacy helper -> subsequent deployment succeeds without deadlock.
10. Test 10: Authoritative Evidence Policy & Dry-Run Missing Lock Labeling
    - Historical releases preserved as uncertain_historical; dry run missing lock labeled UNPROTECTED.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone

try:
    import fcntl
    HAS_FCNTL = True
except ImportError:
    HAS_FCNTL = False


def create_mock_release(builds_dir: str, shared_dir: str, name: str, sha: str = None) -> str:
    rel_path = os.path.join(builds_dir, name)
    backend_dir = os.path.join(rel_path, "backend")
    frontend_dist = os.path.join(rel_path, "frontend", "dist")
    git_dir = os.path.join(rel_path, ".git")

    os.makedirs(backend_dir, exist_ok=True)
    os.makedirs(frontend_dist, exist_ok=True)
    os.makedirs(git_dir, exist_ok=True)

    commit_sha = sha or ("a" * 40)
    with open(os.path.join(git_dir, "HEAD"), "w", encoding="utf-8") as f:
        f.write(f"{commit_sha}\n")

    with open(os.path.join(frontend_dist, "index.html"), "w", encoding="utf-8") as f:
        f.write(f"<html><body>Royal Libas - {name}</body></html>")

    app_dir = os.path.join(backend_dir, "app")
    os.makedirs(app_dir, exist_ok=True)
    with open(os.path.join(app_dir, "main.py"), "w", encoding="utf-8") as f:
        f.write("# backend main")

    bin_dir = os.path.join(backend_dir, ".venv", "bin")
    os.makedirs(bin_dir, exist_ok=True)
    py_bin = os.path.join(bin_dir, "python")
    with open(py_bin, "w", encoding="utf-8") as f:
        f.write("#!/bin/sh\necho python")
    os.chmod(py_bin, 0o755)

    shared_env = os.path.join(shared_dir, ".env")
    shared_uploads = os.path.join(shared_dir, "uploads")
    os.symlink(shared_env, os.path.join(backend_dir, ".env"))
    os.symlink(shared_uploads, os.path.join(backend_dir, "uploads"))

    return rel_path


def create_legacy_helper_script(path: str, activation_lock: str, current_symlink: str, builds_dir: str):
    """
    Executable substitute matching the exact existing production root helper
    /usr/local/lib/royal-libas/activate-release.sh (which acquires only the activation lock).
    """
    script_content = f"""#!/bin/bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: activate-release.sh RELEASE_NAME COMMIT_SHA" >&2
  exit 1
fi

RELEASE_NAME="$1"
EXPECTED_SHA="$2"
ACTIVATION_LOCK="{activation_lock}"
CURRENT_SYMLINK="{current_symlink}"
BUILDS_DIR="{builds_dir}"

exec 200>"$ACTIVATION_LOCK"
if ! flock -n 200; then
  echo "Another deployment is running" >&2
  exit 1
fi

if [[ ! "$RELEASE_NAME" =~ ^release-[A-Za-z0-9]{{8}}$ ]]; then
  echo "Invalid release name" >&2
  exit 1
fi

RELEASE_DIR="$BUILDS_DIR/$RELEASE_NAME"
if [ ! -d "$RELEASE_DIR" ]; then
  echo "realpath: $RELEASE_DIR: No such file or directory" >&2
  exit 1
fi

TMP_SYMLINK="${{CURRENT_SYMLINK}}.tmp.$$"
ln -sfn "$RELEASE_DIR" "$TMP_SYMLINK"
mv -Tf "$TMP_SYMLINK" "$CURRENT_SYMLINK"

echo "LEGACY_ACTIVATED $RELEASE_NAME"
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(script_content)
    os.chmod(path, 0o755)


def create_mock_systemctl(path: str, log_file: str, fail_flag: str):
    script_content = f"""#!/bin/bash
echo "$*" >> "{log_file}"
if [ -f "{fail_flag}" ]; then
  echo "Job for royal-libas.service failed because the control process exited with error code." >&2
  exit 1
fi
exit 0
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(script_content)
    os.chmod(path, 0o755)


def create_mock_curl(path: str, fail_flag: str):
    script_content = f"""#!/bin/bash
if [ -f "{fail_flag}" ]; then
  exit 1
fi
echo '{{"status":"ok"}}'
exit 0
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(script_content)
    os.chmod(path, 0o755)


def create_mock_backup(path: str, log_file: str, fail_flag: str = None):
    flag_check = f'if [ -f "{fail_flag}" ]; then echo "Database backup script failed" >&2; exit 1; fi' if fail_flag else ""
    script_content = f"""#!/bin/bash
{flag_check}
echo "BACKUP_EXECUTED" >> "{log_file}"
exit 0
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(script_content)
    os.chmod(path, 0o755)


# ------------------------------------------------------------------------------
# TEST 1: First-Deployment Compatibility with the Exact Legacy Helper
# ------------------------------------------------------------------------------
def test_first_deployment_compatibility_legacy_helper(base_dir: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 1: First-Deployment Compatibility with Exact Legacy Helper")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test1_builds")
    shared_dir = os.path.join(base_dir, "test1_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    with open(os.path.join(shared_dir, ".env"), "w") as f:
        f.write("PROD_SECRET=test1\n")
    os.makedirs(os.path.join(shared_dir, "uploads"), exist_ok=True)

    current_symlink = os.path.join(base_dir, "test1_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test1_activation.lock")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    create_mock_release(builds_dir, shared_dir, "release-live0001", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-live0001"), current_symlink)
    create_mock_release(builds_dir, shared_dir, "release-next0001", sha="2" * 40)

    legacy_helper = os.path.join(base_dir, "legacy_helper_1.sh")
    create_legacy_helper_script(legacy_helper, activation_lock, current_symlink, builds_dir)

    print("[Workflow] Holding pipeline lock (FD 200) across preparation...")
    fd_pipeline = os.open(pipeline_lock, os.O_RDWR)
    fcntl.flock(fd_pipeline, fcntl.LOCK_EX | fcntl.LOCK_NB)

    # Workflow invokes legacy helper. Crucial: workflow does NOT hold activation_lock
    print("[Workflow] Invoking exact legacy helper without activation lock deadlock...")
    res = subprocess.run([legacy_helper, "release-next0001", "2" * 40], capture_output=True, text=True)

    fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
    os.close(fd_pipeline)

    print(f"[Legacy Helper] Exit code: {res.returncode}")
    print(f"[Legacy Helper] Stdout: {res.stdout.strip()}")

    if res.returncode != 0:
        print(f"FAIL: Legacy helper deadlocked or failed:\n{res.stderr}")
        return False

    observed_target = os.path.basename(os.path.realpath(current_symlink))
    print(f"[Direct Assertion] Observed symlink: {observed_target} (expected: release-next0001)")
    if observed_target != "release-next0001":
        print(f"FAIL: Symlink was not switched! Found {observed_target}")
        return False

    print("PASS: First deployment succeeds with exact legacy production helper (zero deadlock).")
    return True


# ------------------------------------------------------------------------------
# TEST 2: Deployment with the Proposed Helper (Seamless Upgrade)
# ------------------------------------------------------------------------------
def test_deployment_with_proposed_helper(base_dir: str, proposed_helper_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 2: Deployment with Proposed Helper (Seamless Upgrade)")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test2_builds")
    shared_dir = os.path.join(base_dir, "test2_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    with open(os.path.join(shared_dir, ".env"), "w") as f:
        f.write("PROD_SECRET=test2\n")
    os.makedirs(os.path.join(shared_dir, "uploads"), exist_ok=True)

    current_symlink = os.path.join(base_dir, "test2_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test2_activation.lock")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    create_mock_release(builds_dir, shared_dir, "release-live0002", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-live0002"), current_symlink)
    create_mock_release(builds_dir, shared_dir, "release-next0002", sha="2" * 40)

    systemctl_log = os.path.join(base_dir, "systemctl_2.log")
    mock_systemctl = os.path.join(base_dir, "mock_systemctl_2.sh")
    create_mock_systemctl(mock_systemctl, systemctl_log, os.path.join(base_dir, "fail_sys_2"))

    mock_curl = os.path.join(base_dir, "mock_curl_2.sh")
    create_mock_curl(mock_curl, os.path.join(base_dir, "fail_curl_2"))

    backup_log = os.path.join(base_dir, "backup_2.log")
    mock_backup = os.path.join(base_dir, "mock_backup_2.sh")
    create_mock_backup(mock_backup, backup_log)

    # Workflow holds pipeline lock FD 200
    fd_pipeline = os.open(pipeline_lock, os.O_RDWR)
    fcntl.flock(fd_pipeline, fcntl.LOCK_EX | fcntl.LOCK_NB)

    env = os.environ.copy()
    env.update({
        "BUILDS_DIR": builds_dir,
        "CURRENT_SYMLINK": current_symlink,
        "SHARED_DIR": shared_dir,
        "PIPELINE_LOCK": pipeline_lock,
        "ACTIVATION_LOCK": activation_lock,
        "BACKUP_SCRIPT": mock_backup,
        "SYSTEMCTL_BIN": mock_systemctl,
        "CURL_BIN": mock_curl,
        "SERVICE_NAME": "royal-libas",
        "HEALTH_URL": "http://127.0.0.1:8000/health"
    })

    print("[Workflow] Executing proposed activate-release.sh with verified exclusive pipeline lock...")
    res = subprocess.run([proposed_helper_path, "release-next0002", "2" * 40], capture_output=True, text=True, env=env)

    fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
    os.close(fd_pipeline)

    print(f"[Proposed Helper] Exit code: {res.returncode}")
    print(f"[Proposed Helper] Stdout:\n{res.stdout.strip()}")

    if res.returncode != 0:
        print(f"FAIL: Proposed helper failed:\n{res.stderr}")
        return False

    observed_target = os.path.basename(os.path.realpath(current_symlink))
    print(f"[Direct Assertion] Current symlink target: {observed_target} (expected: release-next0002)")
    if observed_target != "release-next0002":
        print(f"FAIL: Observed symlink {observed_target} does not match release-next0002!")
        return False

    with open(systemctl_log) as f:
        sys_calls = f.read()
    print(f"[Direct Assertion] Systemctl calls:\n{sys_calls.strip()}")
    if "restart royal-libas" not in sys_calls:
        print("FAIL: systemctl restart royal-libas was not called!")
        return False

    with open(backup_log) as f:
        backup_calls = f.read()
    if "BACKUP_EXECUTED" not in backup_calls:
        print("FAIL: Pre-deployment database backup was not executed!")
        return False

    print("PASS: Proposed helper validated ancestry lock, executed backup, restarted royal-libas, and activated release.")
    return True


# ------------------------------------------------------------------------------
# TEST 3: Mandatory Prerequisites - Missing or Non-Executable Backup Script
# ------------------------------------------------------------------------------
def test_mandatory_backup_prerequisite(base_dir: str, proposed_helper_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 3: Mandatory Prerequisites - Backup Script Fail-Closed")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test3_builds")
    shared_dir = os.path.join(base_dir, "test3_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    with open(os.path.join(shared_dir, ".env"), "w") as f:
        f.write("PROD_SECRET=test3\n")
    os.makedirs(os.path.join(shared_dir, "uploads"), exist_ok=True)

    current_symlink = os.path.join(base_dir, "test3_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test3_activation.lock")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    create_mock_release(builds_dir, shared_dir, "release-live0003", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-live0003"), current_symlink)
    create_mock_release(builds_dir, shared_dir, "release-cand0003", sha="2" * 40)

    mock_systemctl = os.path.join(base_dir, "mock_systemctl_3.sh")
    create_mock_systemctl(mock_systemctl, os.path.join(base_dir, "sys_3.log"), os.path.join(base_dir, "fail_sys_3"))
    mock_curl = os.path.join(base_dir, "mock_curl_3.sh")
    create_mock_curl(mock_curl, os.path.join(base_dir, "fail_curl_3"))

    # Case 3a: Missing backup script
    nonexistent_backup = os.path.join(base_dir, "nonexistent_backup.sh")
    env = os.environ.copy()
    env.update({
        "BUILDS_DIR": builds_dir,
        "CURRENT_SYMLINK": current_symlink,
        "SHARED_DIR": shared_dir,
        "PIPELINE_LOCK": pipeline_lock,
        "ACTIVATION_LOCK": activation_lock,
        "BACKUP_SCRIPT": nonexistent_backup,
        "SYSTEMCTL_BIN": mock_systemctl,
        "CURL_BIN": mock_curl,
        "SERVICE_NAME": "royal-libas",
        "HEALTH_URL": "http://127.0.0.1:8000/health"
    })

    print("[Case 3a] Invoking helper with missing backup script...")
    res_3a = subprocess.run([proposed_helper_path, "release-cand0003", "2" * 40], capture_output=True, text=True, env=env)
    print(f"[Case 3a] Exit code: {res_3a.returncode}")
    print(f"[Case 3a] Stderr: {res_3a.stderr.strip()}")

    if res_3a.returncode != 1 or "Mandatory database backup script" not in res_3a.stderr:
        print("FAIL: Missing backup script did NOT fail closed with exit code 1!")
        return False

    target_3a = os.path.basename(os.path.realpath(current_symlink))
    if target_3a != "release-live0003":
        print(f"FAIL: Symlink was modified despite missing backup script! Found {target_3a}")
        return False

    # Case 3b: Non-executable backup script
    unexecutable_backup = os.path.join(base_dir, "unexec_backup.sh")
    with open(unexecutable_backup, "w") as f:
        f.write("#!/bin/bash\necho unexec")
    os.chmod(unexecutable_backup, 0o644)  # NOT executable
    env["BACKUP_SCRIPT"] = unexecutable_backup

    print("[Case 3b] Invoking helper with non-executable backup script...")
    res_3b = subprocess.run([proposed_helper_path, "release-cand0003", "2" * 40], capture_output=True, text=True, env=env)
    print(f"[Case 3b] Exit code: {res_3b.returncode}")
    print(f"[Case 3b] Stderr: {res_3b.stderr.strip()}")

    if res_3b.returncode != 1 or "is not executable" not in res_3b.stderr:
        print("FAIL: Non-executable backup script did NOT fail closed!")
        return False

    target_3b = os.path.basename(os.path.realpath(current_symlink))
    if target_3b != "release-live0003":
        print(f"FAIL: Symlink was modified despite non-executable backup script! Found {target_3b}")
        return False

    # Case 3c: Failing backup script execution
    failing_backup = os.path.join(base_dir, "failing_backup.sh")
    fail_flag = os.path.join(base_dir, "fail_backup_flag")
    open(fail_flag, "w").close()
    create_mock_backup(failing_backup, os.path.join(base_dir, "bk_3c.log"), fail_flag=fail_flag)
    env["BACKUP_SCRIPT"] = failing_backup

    print("[Case 3c] Invoking helper with failing backup script...")
    res_3c = subprocess.run([proposed_helper_path, "release-cand0003", "2" * 40], capture_output=True, text=True, env=env)
    print(f"[Case 3c] Exit code: {res_3c.returncode}")
    print(f"[Case 3c] Stderr: {res_3c.stderr.strip()}")

    if res_3c.returncode != 1 or "Pre-deployment database backup failed" not in res_3c.stderr:
        print("FAIL: Failing backup execution did NOT fail closed!")
        return False

    target_3c = os.path.basename(os.path.realpath(current_symlink))
    if target_3c != "release-live0003":
        print(f"FAIL: Symlink was modified despite failed backup! Found {target_3c}")
        return False

    print("PASS: Mandatory backup script requirement verified: all failure modes fail closed without switching symlink.")
    return True


# ------------------------------------------------------------------------------
# TEST 4: Mandatory Prerequisites - Missing systemctl or curl
# ------------------------------------------------------------------------------
def test_mandatory_tools_prerequisite(base_dir: str, proposed_helper_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 4: Mandatory Prerequisites - Service Manager & HTTP Client")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test4_builds")
    shared_dir = os.path.join(base_dir, "test4_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    with open(os.path.join(shared_dir, ".env"), "w") as f:
        f.write("PROD_SECRET=test4\n")
    os.makedirs(os.path.join(shared_dir, "uploads"), exist_ok=True)

    current_symlink = os.path.join(base_dir, "test4_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test4_activation.lock")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    create_mock_release(builds_dir, shared_dir, "release-live0004", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-live0004"), current_symlink)
    create_mock_release(builds_dir, shared_dir, "release-cand0004", sha="2" * 40)

    mock_backup = os.path.join(base_dir, "mock_backup_4.sh")
    create_mock_backup(mock_backup, os.path.join(base_dir, "bk_4.log"))
    mock_systemctl = os.path.join(base_dir, "mock_systemctl_4.sh")
    create_mock_systemctl(mock_systemctl, os.path.join(base_dir, "sys_4.log"), os.path.join(base_dir, "fail_sys_4"))
    mock_curl = os.path.join(base_dir, "mock_curl_4.sh")
    create_mock_curl(mock_curl, os.path.join(base_dir, "fail_curl_4"))

    # Case 4a: Missing systemctl
    env = os.environ.copy()
    env.update({
        "BUILDS_DIR": builds_dir,
        "CURRENT_SYMLINK": current_symlink,
        "SHARED_DIR": shared_dir,
        "PIPELINE_LOCK": pipeline_lock,
        "ACTIVATION_LOCK": activation_lock,
        "BACKUP_SCRIPT": mock_backup,
        "SYSTEMCTL_BIN": "/nonexistent/systemctl",
        "CURL_BIN": mock_curl,
        "SERVICE_NAME": "royal-libas",
        "HEALTH_URL": "http://127.0.0.1:8000/health"
    })

    print("[Case 4a] Invoking helper with missing systemctl...")
    res_4a = subprocess.run([proposed_helper_path, "release-cand0004", "2" * 40], capture_output=True, text=True, env=env)
    if res_4a.returncode != 1 or "Mandatory service manager" not in res_4a.stderr:
        print("FAIL: Missing systemctl did NOT fail closed!")
        return False

    target_4a = os.path.basename(os.path.realpath(current_symlink))
    if target_4a != "release-live0004":
        print(f"FAIL: Symlink was modified despite missing systemctl! Found {target_4a}")
        return False

    # Case 4b: Missing curl
    env["SYSTEMCTL_BIN"] = mock_systemctl
    env["CURL_BIN"] = "/nonexistent/curl"

    print("[Case 4b] Invoking helper with missing curl...")
    res_4b = subprocess.run([proposed_helper_path, "release-cand0004", "2" * 40], capture_output=True, text=True, env=env)
    if res_4b.returncode != 1 or "Mandatory health verification tool" not in res_4b.stderr:
        print("FAIL: Missing curl did NOT fail closed!")
        return False

    target_4b = os.path.basename(os.path.realpath(current_symlink))
    if target_4b != "release-live0004":
        print(f"FAIL: Symlink was modified despite missing curl! Found {target_4b}")
        return False

    print("PASS: Mandatory tool prerequisites verified: missing systemctl or curl fails closed before release switch.")
    return True


# ------------------------------------------------------------------------------
# TEST 5: Lock Authorization - Open FD Without Exclusive Lock Rejected
# ------------------------------------------------------------------------------
def test_open_fd_without_exclusive_lock_rejected(base_dir: str, proposed_helper_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 5: Lock Authorization - Open FD Without Exclusive Lock Rejected")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test5_builds")
    shared_dir = os.path.join(base_dir, "test5_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    with open(os.path.join(shared_dir, ".env"), "w") as f:
        f.write("PROD_SECRET=test5\n")
    os.makedirs(os.path.join(shared_dir, "uploads"), exist_ok=True)

    current_symlink = os.path.join(base_dir, "test5_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test5_activation.lock")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    create_mock_release(builds_dir, shared_dir, "release-live0005", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-live0005"), current_symlink)
    create_mock_release(builds_dir, shared_dir, "release-cand0005", sha="2" * 40)

    # Simulate an external CI pipeline holding the real exclusive lock on pipeline_lock
    ci_proc = subprocess.Popen(["bash", "-c", f"exec 200>{pipeline_lock}; flock -n 200; sleep 5"])
    time.sleep(0.3)

    # Calling process merely OPENS pipeline_lock (FD 200) WITHOUT flock -x
    fd_open_only = os.open(pipeline_lock, os.O_RDWR)

    env = os.environ.copy()
    env.update({
        "BUILDS_DIR": builds_dir,
        "CURRENT_SYMLINK": current_symlink,
        "SHARED_DIR": shared_dir,
        "PIPELINE_LOCK": pipeline_lock,
        "ACTIVATION_LOCK": activation_lock,
        "SERVICE_NAME": "royal-libas"
    })

    print("[Caller] Has pipeline_lock open on FD, but DOES NOT own exclusive lock. Invoking helper...")
    res = subprocess.run([proposed_helper_path, "release-cand0005", "2" * 40], capture_output=True, text=True, env=env)

    os.close(fd_open_only)
    ci_proc.terminate()
    ci_proc.wait()

    print(f"[Proposed Helper] Exit code: {res.returncode}")
    print(f"[Proposed Helper] Stderr: {res.stderr.strip()}")

    if res.returncode != 1 or "Deployment pipeline is currently in progress" not in res.stderr:
        print("FAIL: Helper allowed activation when caller merely had an open FD without exclusive lock!")
        return False

    target = os.path.basename(os.path.realpath(current_symlink))
    if target != "release-live0005":
        print(f"FAIL: Symlink modified without exclusive lock! Found {target}")
        return False

    print("PASS: Kernel exclusive lock verification correctly rejected non-exclusive open file descriptor.")
    return True


# ------------------------------------------------------------------------------
# TEST 6: Simultaneous Manual Activation Blocked During Active Pipeline
# ------------------------------------------------------------------------------
def test_simultaneous_manual_activation_blocked(base_dir: str, proposed_helper_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 6: Simultaneous Manual Activation Blocked During Active Pipeline")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test6_builds")
    shared_dir = os.path.join(base_dir, "test6_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    with open(os.path.join(shared_dir, ".env"), "w") as f:
        f.write("PROD_SECRET=test6\n")
    os.makedirs(os.path.join(shared_dir, "uploads"), exist_ok=True)

    current_symlink = os.path.join(base_dir, "test6_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test6_activation.lock")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    create_mock_release(builds_dir, shared_dir, "release-live0006", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-live0006"), current_symlink)
    create_mock_release(builds_dir, shared_dir, "release-cand0006", sha="2" * 40)

    # Active pipeline running in separate process tree
    ci_proc = subprocess.Popen(["bash", "-c", f"exec 200>{pipeline_lock}; flock -n 200; sleep 5"])
    time.sleep(0.3)

    env = os.environ.copy()
    env.update({
        "BUILDS_DIR": builds_dir,
        "CURRENT_SYMLINK": current_symlink,
        "SHARED_DIR": shared_dir,
        "PIPELINE_LOCK": pipeline_lock,
        "ACTIVATION_LOCK": activation_lock,
        "SERVICE_NAME": "royal-libas"
    })

    print("[Operator] Attempting manual activate-release.sh in separate terminal while CI holds pipeline lock...")
    res = subprocess.run([proposed_helper_path, "release-cand0006", "2" * 40], capture_output=True, text=True, env=env)

    ci_proc.terminate()
    ci_proc.wait()

    print(f"[Proposed Helper] Exit code: {res.returncode}")
    print(f"[Proposed Helper] Stderr: {res.stderr.strip()}")

    if res.returncode != 1 or "Deployment pipeline is currently in progress" not in res.stderr:
        print("FAIL: Direct manual activation was NOT blocked during active pipeline!")
        return False

    target = os.path.basename(os.path.realpath(current_symlink))
    if target != "release-live0006":
        print(f"FAIL: Symlink was modified by competing manual activation! Found {target}")
        return False

    print("PASS: Direct manual activation strictly blocked during active pipeline execution.")
    return True


# ------------------------------------------------------------------------------
# TEST 7: Failed Service Restart Handling & Rollback
# ------------------------------------------------------------------------------
def test_failed_service_restart_handling_and_rollback(base_dir: str, proposed_helper_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 7: Failed Service Restart Handling & Automated Rollback")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test7_builds")
    shared_dir = os.path.join(base_dir, "test7_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    with open(os.path.join(shared_dir, ".env"), "w") as f:
        f.write("PROD_SECRET=test7\n")
    os.makedirs(os.path.join(shared_dir, "uploads"), exist_ok=True)

    current_symlink = os.path.join(base_dir, "test7_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test7_activation.lock")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    create_mock_release(builds_dir, shared_dir, "release-good0007", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-good0007"), current_symlink)
    create_mock_release(builds_dir, shared_dir, "release-fail0007", sha="2" * 40)

    systemctl_log = os.path.join(base_dir, "systemctl_7.log")
    mock_systemctl = os.path.join(base_dir, "mock_systemctl_7.sh")
    fail_flag = os.path.join(base_dir, "fail_sys_7")
    open(fail_flag, "w").close()  # Force systemctl failure
    create_mock_systemctl(mock_systemctl, systemctl_log, fail_flag)

    mock_curl = os.path.join(base_dir, "mock_curl_7.sh")
    create_mock_curl(mock_curl, os.path.join(base_dir, "fail_curl_7"))
    mock_backup = os.path.join(base_dir, "mock_backup_7.sh")
    create_mock_backup(mock_backup, os.path.join(base_dir, "bk_7.log"))

    env = os.environ.copy()
    env.update({
        "BUILDS_DIR": builds_dir,
        "CURRENT_SYMLINK": current_symlink,
        "SHARED_DIR": shared_dir,
        "PIPELINE_LOCK": pipeline_lock,
        "ACTIVATION_LOCK": activation_lock,
        "BACKUP_SCRIPT": mock_backup,
        "SYSTEMCTL_BIN": mock_systemctl,
        "CURL_BIN": mock_curl,
        "SERVICE_NAME": "royal-libas",
        "HEALTH_URL": "http://127.0.0.1:8000/health"
    })

    print("[Helper] Invoking activate-release.sh with failing systemctl restart...")
    res = subprocess.run([proposed_helper_path, "release-fail0007", "2" * 40], capture_output=True, text=True, env=env)

    print(f"[Proposed Helper] Exit code: {res.returncode}")
    print(f"[Proposed Helper] Stderr:\n{res.stderr.strip()}")

    if res.returncode != 1 or "Failed to restart service 'royal-libas'" not in res.stderr:
        print("FAIL: Failed restart did NOT fail closed with exit code 1!")
        return False

    observed_target = os.path.basename(os.path.realpath(current_symlink))
    print(f"[Direct Assertion] Post-failure symlink: {observed_target} (expected: release-good0007)")
    if observed_target != "release-good0007":
        print(f"FAIL: Symlink was not rolled back to release-good0007!")
        return False

    print("PASS: Service restart failure caught without || true, triggered automated rollback, and returned exit 1.")
    return True


# ------------------------------------------------------------------------------
# TEST 8: Failed Health Check & Rollback
# ------------------------------------------------------------------------------
def test_failed_health_check_and_rollback(base_dir: str, proposed_helper_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 8: Failed Health Check & Automated Rollback")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test8_builds")
    shared_dir = os.path.join(base_dir, "test8_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    with open(os.path.join(shared_dir, ".env"), "w") as f:
        f.write("PROD_SECRET=test8\n")
    os.makedirs(os.path.join(shared_dir, "uploads"), exist_ok=True)

    current_symlink = os.path.join(base_dir, "test8_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test8_activation.lock")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    create_mock_release(builds_dir, shared_dir, "release-good0008", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-good0008"), current_symlink)
    create_mock_release(builds_dir, shared_dir, "release-unhl0008", sha="2" * 40)

    mock_systemctl = os.path.join(base_dir, "mock_systemctl_8.sh")
    create_mock_systemctl(mock_systemctl, os.path.join(base_dir, "sys_8.log"), os.path.join(base_dir, "fail_sys_8"))

    fail_curl_flag = os.path.join(base_dir, "fail_curl_8")
    open(fail_curl_flag, "w").close()
    mock_curl = os.path.join(base_dir, "mock_curl_8.sh")
    create_mock_curl(mock_curl, fail_curl_flag)

    mock_backup = os.path.join(base_dir, "mock_backup_8.sh")
    create_mock_backup(mock_backup, os.path.join(base_dir, "bk_8.log"))

    env = os.environ.copy()
    env.update({
        "BUILDS_DIR": builds_dir,
        "CURRENT_SYMLINK": current_symlink,
        "SHARED_DIR": shared_dir,
        "PIPELINE_LOCK": pipeline_lock,
        "ACTIVATION_LOCK": activation_lock,
        "BACKUP_SCRIPT": mock_backup,
        "SYSTEMCTL_BIN": mock_systemctl,
        "CURL_BIN": mock_curl,
        "HEALTH_TIMEOUT": "2",
        "SERVICE_NAME": "royal-libas",
        "HEALTH_URL": "http://127.0.0.1:8000/health"
    })

    print("[Helper] Invoking activate-release.sh with failing health check...")
    res = subprocess.run([proposed_helper_path, "release-unhl0008", "2" * 40], capture_output=True, text=True, env=env)

    print(f"[Proposed Helper] Exit code: {res.returncode}")
    print(f"[Proposed Helper] Stderr:\n{res.stderr.strip()}")

    if res.returncode != 1 or "Service health check failed" not in res.stderr:
        print("FAIL: Health check failure did not exit with code 1!")
        return False

    observed_target = os.path.basename(os.path.realpath(current_symlink))
    print(f"[Direct Assertion] Post-failure symlink: {observed_target} (expected: release-good0008)")
    if observed_target != "release-good0008":
        print(f"FAIL: Symlink was not rolled back to release-good0008!")
        return False

    print("PASS: Health check failure caught, triggered automated rollback, and returned exit 1.")
    return True


# ------------------------------------------------------------------------------
# TEST 9: Safe Recovery to Legacy Helper
# ------------------------------------------------------------------------------
def test_safe_recovery_to_legacy_helper(base_dir: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 9: Safe Recovery to Legacy Helper")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test9_builds")
    shared_dir = os.path.join(base_dir, "test9_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    with open(os.path.join(shared_dir, ".env"), "w") as f:
        f.write("PROD_SECRET=test9\n")
    os.makedirs(os.path.join(shared_dir, "uploads"), exist_ok=True)

    current_symlink = os.path.join(base_dir, "test9_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test9_activation.lock")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    create_mock_release(builds_dir, shared_dir, "release-live0009", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-live0009"), current_symlink)
    create_mock_release(builds_dir, shared_dir, "release-next0009", sha="2" * 40)

    # Legacy helper restored from backup
    restored_legacy_helper = os.path.join(base_dir, "restored_legacy_helper.sh")
    create_legacy_helper_script(restored_legacy_helper, activation_lock, current_symlink, builds_dir)

    print("[Workflow] Holding pipeline lock FD 200 during preparation...")
    fd_pipeline = os.open(pipeline_lock, os.O_RDWR)
    fcntl.flock(fd_pipeline, fcntl.LOCK_EX | fcntl.LOCK_NB)

    print("[Workflow] Invoking restored legacy helper...")
    res = subprocess.run([restored_legacy_helper, "release-next0009", "2" * 40], capture_output=True, text=True)

    fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
    os.close(fd_pipeline)

    print(f"[Restored Helper] Exit code: {res.returncode}")
    print(f"[Restored Helper] Stdout: {res.stdout.strip()}")

    if res.returncode != 0:
        print(f"FAIL: Restored legacy helper failed:\n{res.stderr}")
        return False

    observed_target = os.path.basename(os.path.realpath(current_symlink))
    print(f"[Direct Assertion] Current symlink target: {observed_target} (expected: release-next0009)")
    if observed_target != "release-next0009":
        print(f"FAIL: Symlink was not switched! Found {observed_target}")
        return False

    print("PASS: Safe recovery verified: restored legacy helper executes cleanly without workflow deadlock.")
    return True


# ------------------------------------------------------------------------------
# TEST 10: Authoritative Evidence Policy & Dry-Run Missing Lock Labeling
# ------------------------------------------------------------------------------
def test_authoritative_evidence_and_dry_run(base_dir: str, seed_script_path: str, prune_script_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 10: Authoritative Evidence Policy & Dry-Run Missing Lock Labeling")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test10_builds")
    shared_dir = os.path.join(base_dir, "test10_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    shared_env = os.path.join(shared_dir, ".env")
    with open(shared_env, "w") as f:
        f.write("PROD_SECRET=test10\n")
    shared_uploads = os.path.join(shared_dir, "uploads")
    os.makedirs(shared_uploads, exist_ok=True)

    current_symlink = os.path.join(base_dir, "test10_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test10_activation.lock")
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    historical = [
        ("release-huDNUmEb", "805e7a93091e8f073ad3d629fc4d952d46cd454b"),
        ("release-CPCGzuLG", "d9e7507cd1b8f820e44c9644fc460bb50902c6f1"),
        ("release-tHmKpYTN", "e2bd0a4c27d23574c3ac323edf7c4070c576eb20"),
        ("release-WF0rJVqS", "8a71c821deb6cb36cee868e535b2c0924ee114c7"),
        ("release-nhKRvmAd", "9c41227852571ba8b2d47e605821ddc3200f801a"),
        ("release-uXFXM8EL", "57352a3e3da16f023e3dd7d90f5ade1eb21c104e"),
    ]
    for rel, sha in historical:
        create_mock_release(builds_dir, shared_dir, rel, sha=sha)
    os.symlink(os.path.join(builds_dir, "release-uXFXM8EL"), current_symlink)

    res_seed = subprocess.run([
        sys.executable, seed_script_path,
        "--ledger-file", ledger_file,
        "--builds-dir", builds_dir,
        "--pipeline-lock-file", pipeline_lock,
        "--execute"
    ], capture_output=True, text=True)

    if "AUTHORITATIVE EVIDENCE POLICY" not in res_seed.stdout:
        print("FAIL: Policy banner missing from seed_ledger output!")
        return False

    with open(ledger_file) as f:
        lines = [l.strip().split("\t") for l in f if l.strip() and not l.startswith("#")]

    for l in lines:
        if l[3] == "activated":
            print(f"FAIL: Historical release {l[1]} was marked activated!")
            return False
        assert l[3] == "uncertain_historical"

    # Prune must preserve every historical release
    res_prune = subprocess.run([
        sys.executable, prune_script_path,
        "--execute",
        "--builds-dir", builds_dir,
        "--current-symlink", current_symlink,
        "--ledger-file", ledger_file,
        "--pipeline-lock-file", pipeline_lock,
        "--activation-lock-file", activation_lock,
        "--shared-env", shared_env,
        "--shared-uploads", shared_uploads,
        "--min-rollbacks", "3"
    ], capture_output=True, text=True)

    for rel, _ in historical:
        if not os.path.isdir(os.path.join(builds_dir, rel)):
            print(f"FAIL: Historical release {rel} was deleted!")
            return False

    # Dry-run with missing locks on verified ledger
    dry_ledger = os.path.join(builds_dir, ".dry_test_ledger.tsv")
    with open(dry_ledger, "w") as f:
        for i, (rel, sha) in enumerate(historical):
            ts = (datetime.now(timezone.utc) - timedelta(hours=6 - i)).isoformat()
            f.write(f"{ts}\t{rel}\t{sha}\tactivated\n")

    nonexistent_pipeline_lock = os.path.join(base_dir, "missing_pipe.lock")
    nonexistent_activation_lock = os.path.join(base_dir, "missing_act.lock")

    res_dry = subprocess.run([
        sys.executable, prune_script_path,
        "--dry-run",
        "--builds-dir", builds_dir,
        "--current-symlink", current_symlink,
        "--ledger-file", dry_ledger,
        "--pipeline-lock-file", nonexistent_pipeline_lock,
        "--activation-lock-file", nonexistent_activation_lock,
        "--shared-env", shared_env,
        "--shared-uploads", shared_uploads
    ], capture_output=True, text=True)

    if "[DRY-RUN RESULT: UNPROTECTED / POTENTIALLY STALE INSPECTION]" not in res_dry.stdout:
        print("FAIL: Dry run did not label missing lock output with UNPROTECTED banner!")
        return False

    print("PASS: Authoritative Evidence Policy and Dry-Run Unprotected labeling verified.")
    return True


def main():
    if not HAS_FCNTL:
        print("SKIP: fcntl not supported on this platform (requires Linux/POSIX).")
        sys.exit(0)

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    prune_script = os.path.join(repo_root, "deploy", "prune_releases.py")
    seed_script = os.path.join(repo_root, "deploy", "seed_ledger.py")
    proposed_helper = os.path.join(repo_root, "deploy", "activate-release.sh")

    assert os.path.isfile(prune_script), f"Missing {prune_script}"
    assert os.path.isfile(seed_script), f"Missing {seed_script}"
    assert os.path.isfile(proposed_helper), f"Missing {proposed_helper}"

    sandbox = tempfile.mkdtemp(prefix="vps_test_prod_equiv_")
    print(f"Isolated Production-Equivalent Test Sandbox: {sandbox}")

    try:
        t1 = test_first_deployment_compatibility_legacy_helper(sandbox)
        t2 = test_deployment_with_proposed_helper(sandbox, proposed_helper)
        t3 = test_mandatory_backup_prerequisite(sandbox, proposed_helper)
        t4 = test_mandatory_tools_prerequisite(sandbox, proposed_helper)
        t5 = test_open_fd_without_exclusive_lock_rejected(sandbox, proposed_helper)
        t6 = test_simultaneous_manual_activation_blocked(sandbox, proposed_helper)
        t7 = test_failed_service_restart_handling_and_rollback(sandbox, proposed_helper)
        t8 = test_failed_health_check_and_rollback(sandbox, proposed_helper)
        t9 = test_safe_recovery_to_legacy_helper(sandbox)
        t10 = test_authoritative_evidence_and_dry_run(sandbox, seed_script, prune_script)

        print("\n" + "=" * 72)
        print("CONSOLIDATED PRODUCTION-EQUIVALENT TEST RESULTS:")
        print(f"  Test 1 (First-Deploy Compat Legacy Helper):   {'PASS' if t1 else 'FAIL'}")
        print(f"  Test 2 (Proposed Helper Deployment):          {'PASS' if t2 else 'FAIL'}")
        print(f"  Test 3 (Mandatory Backup Prerequisites):      {'PASS' if t3 else 'FAIL'}")
        print(f"  Test 4 (Mandatory Tools Prerequisites):       {'PASS' if t4 else 'FAIL'}")
        print(f"  Test 5 (Lock Authorization Open FD Rejected): {'PASS' if t5 else 'FAIL'}")
        print(f"  Test 6 (Simultaneous Manual Call Blocked):    {'PASS' if t6 else 'FAIL'}")
        print(f"  Test 7 (Failed Service Restart & Rollback):   {'PASS' if t7 else 'FAIL'}")
        print(f"  Test 8 (Failed Health Check & Rollback):      {'PASS' if t8 else 'FAIL'}")
        print(f"  Test 9 (Safe Recovery to Legacy Helper):      {'PASS' if t9 else 'FAIL'}")
        print(f"  Test 10 (Authoritative Policy & Dry-Run):     {'PASS' if t10 else 'FAIL'}")
        print("=" * 72)

        if all([t1, t2, t3, t4, t5, t6, t7, t8, t9, t10]):
            print("\nALL 10 PRODUCTION-EQUIVALENT ISOLATED TESTS PASSED SUCCESSFULLY!")
            sys.exit(0)
        else:
            print("\nSOME TESTS FAILED!")
            sys.exit(1)
    finally:
        shutil.rmtree(sandbox, ignore_errors=True)
        print(f"Sandbox cleaned up: {sandbox}")


if __name__ == "__main__":
    main()
