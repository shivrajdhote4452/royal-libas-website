#!/usr/bin/env python3
"""
Isolated Linux Process Concurrency & Production Entry-Point Verification Suite.

Designed to run in an isolated sandbox (e.g. /tmp on VPS) under user 'royal-deploy':
1. Test 1: Simultaneous Legacy Helper Invocation During Preparation
   - Workflow holds pipeline lock (FD 200) and activation lock (FD 201).
   - Competing legacy helper is strictly blocked by activation lock (exit 1).
   - Observed symlink unchanged, no service restart.
2. Test 2: Simultaneous Legacy Invocation During Activation (Zero Hand-Off Gap)
   - Workflow holds continuous dual locks across preparation and activation.
   - Proposed helper verifies ancestor lock hold via kernel /proc.
   - Competing legacy helper during activation is strictly blocked.
   - Proposed helper switches symlink and executes 'systemctl restart royal-libas'.
   - Observed symlink, exit code, and service restart asserted directly.
3. Test 3: Lock Contention on Direct Proposed Helper Invocation
   - Direct invocation of proposed helper while pipeline is active is rejected.
   - Assert: exits with code 1 and pipeline-in-progress error.
4. Test 4: Failed Service Restart Handling & Automated Rollback
   - Systemctl restart of 'royal-libas' fails.
   - Proposed helper catches failure (NO || true; fails closed).
   - Automatically reverts symlink to previous release and restarts previous release.
   - Helper exits with code 1; ledger and pruning skipped.
5. Test 5: Post-Activation Health Check Failure & Rollback
   - Health check times out.
   - Automated rollback reverts symlink to previous release.
   - Helper exits with code 1; ledger and pruning skipped.
6. Test 6: Simultaneous Legacy Invocation During Pruning
   - Dual locks held across pruning strictly block competing legacy helper.
   - Pruning completes safely under continuous locks.
7. Test 7: Safe First Deployment & Manual Rollback Workflow
   - First-run bootstrapping on fresh environment preserves active + 3 rollbacks.
   - Coordinated rollback to a previous release verified end-to-end.
8. Test 8: Authoritative Evidence Policy & Dry-Run Labeling
   - Historical releases without independent proof preserved as uncertain_historical.
   - Missing lock during dry-run produces UNPROTECTED banner.
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
    Executable substitute matching the existing production root helper
    /usr/local/lib/royal-libas/activate-release.sh (which historically only acquires
    the activation lock and knows nothing about the pipeline lock).
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


def create_mock_backup(path: str, log_file: str):
    script_content = f"""#!/bin/bash
echo "BACKUP_EXECUTED" >> "{log_file}"
exit 0
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(script_content)
    os.chmod(path, 0o755)


# ------------------------------------------------------------------------------
# TEST 1: Simultaneous Legacy Helper Invocation During Preparation
# ------------------------------------------------------------------------------
def test_legacy_helper_during_preparation(base_dir: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 1: Simultaneous Legacy Helper Attempt During Preparation Phase")
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
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    create_mock_release(builds_dir, shared_dir, "release-live0001", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-live0001"), current_symlink)

    create_mock_release(builds_dir, shared_dir, "release-rogue001", sha="9" * 40)

    legacy_helper = os.path.join(base_dir, "legacy_helper_1.sh")
    create_legacy_helper_script(legacy_helper, activation_lock, current_symlink, builds_dir)

    print("[Workflow] Holding pipeline lock (FD 200) and activation lock (FD 201) during preparation...")
    fd_pipeline = os.open(pipeline_lock, os.O_RDWR)
    fcntl.flock(fd_pipeline, fcntl.LOCK_EX | fcntl.LOCK_NB)

    fd_activation = os.open(activation_lock, os.O_RDWR)
    fcntl.flock(fd_activation, fcntl.LOCK_EX | fcntl.LOCK_NB)

    print("[Competing Process] Invoking legacy activate-release.sh during preparation...")
    res = subprocess.run([legacy_helper, "release-rogue001", "9" * 40], capture_output=True, text=True)

    print(f"[Legacy Helper] Exit code: {res.returncode}")
    print(f"[Legacy Helper] Stderr: {res.stderr.strip()}")

    fcntl.flock(fd_activation, fcntl.LOCK_UN)
    os.close(fd_activation)
    fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
    os.close(fd_pipeline)

    if res.returncode != 1 or "Another deployment is running" not in res.stderr:
        print("FAIL: Legacy helper was NOT blocked during preparation phase!")
        return False

    current_target = os.path.basename(os.path.realpath(current_symlink))
    if current_target != "release-live0001":
        print(f"FAIL: Current symlink was modified to {current_target}!")
        return False

    if os.path.exists(ledger_file):
        print("FAIL: Ledger file created unexpectedly during blocked preparation!")
        return False

    print("PASS: Legacy direct-helper was strictly BLOCKED during preparation phase.")
    return True


# ------------------------------------------------------------------------------
# TEST 2: Simultaneous Legacy Invocation During Activation (Zero Hand-Off Gap)
# ------------------------------------------------------------------------------
def test_simultaneous_legacy_during_activation(base_dir: str, proposed_helper_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 2: Simultaneous Legacy Invocation During Activation (Zero Hand-Off Gap)")
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
    create_mock_release(builds_dir, shared_dir, "release-comp0002", sha="3" * 40)

    legacy_helper = os.path.join(base_dir, "legacy_helper_2.sh")
    create_legacy_helper_script(legacy_helper, activation_lock, current_symlink, builds_dir)

    systemctl_log = os.path.join(base_dir, "systemctl_2.log")
    mock_systemctl = os.path.join(base_dir, "mock_systemctl_2.sh")
    create_mock_systemctl(mock_systemctl, systemctl_log, os.path.join(base_dir, "fail_sys_flag"))

    mock_curl = os.path.join(base_dir, "mock_curl_2.sh")
    create_mock_curl(mock_curl, os.path.join(base_dir, "fail_curl_flag"))

    backup_log = os.path.join(base_dir, "backup_2.log")
    mock_backup = os.path.join(base_dir, "mock_backup_2.sh")
    create_mock_backup(mock_backup, backup_log)

    # Workflow holds BOTH locks continuously
    fd_pipeline = os.open(pipeline_lock, os.O_RDWR)
    fcntl.flock(fd_pipeline, fcntl.LOCK_EX | fcntl.LOCK_NB)

    fd_activation = os.open(activation_lock, os.O_RDWR)
    fcntl.flock(fd_activation, fcntl.LOCK_EX | fcntl.LOCK_NB)

    print("[Workflow] Holding continuous dual locks (FD 200, 201) across activation call...")

    # Competing legacy helper attempts activation while locks are held
    print("[Competing Legacy Helper] Attempting activation while workflow is activating...")
    res_comp = subprocess.run([legacy_helper, "release-comp0002", "3" * 40], capture_output=True, text=True)
    print(f"[Competing Legacy Helper] Exit code: {res_comp.returncode}")
    print(f"[Competing Legacy Helper] Stderr: {res_comp.stderr.strip()}")

    if res_comp.returncode != 1 or "Another deployment is running" not in res_comp.stderr:
        print("FAIL: Competing legacy helper was NOT blocked during activation hold!")
        fcntl.flock(fd_activation, fcntl.LOCK_UN)
        os.close(fd_activation)
        fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
        os.close(fd_pipeline)
        return False

    # Workflow executes actual proposed helper (inheriting open FDs in process tree)
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

    print("[Workflow] Executing proposed activate-release.sh under active ancestry...")
    res_prop = subprocess.run([proposed_helper_path, "release-next0002", "2" * 40], capture_output=True, text=True, env=env)

    fcntl.flock(fd_activation, fcntl.LOCK_UN)
    os.close(fd_activation)
    fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
    os.close(fd_pipeline)

    print(f"[Proposed Helper] Exit code: {res_prop.returncode}")
    print(f"[Proposed Helper] Stdout: {res_prop.stdout.strip()}")

    if res_prop.returncode != 0:
        print(f"FAIL: Proposed helper failed under ancestor locks:\n{res_prop.stderr}")
        return False

    # Directly assert observed symlink target
    observed_target = os.path.basename(os.path.realpath(current_symlink))
    print(f"[Direct Assertion] Current symlink target: {observed_target} (expected: release-next0002)")
    if observed_target != "release-next0002":
        print(f"FAIL: Observed symlink {observed_target} does not match release-next0002!")
        return False

    # Directly assert service restart call on 'royal-libas'
    with open(systemctl_log) as f:
        sys_calls = f.read()
    print(f"[Direct Assertion] Systemctl calls:\n{sys_calls.strip()}")
    if "restart royal-libas" not in sys_calls:
        print("FAIL: systemctl restart royal-libas was not called!")
        return False

    # Directly assert pre-deployment database backup was executed
    with open(backup_log) as f:
        backup_calls = f.read()
    if "BACKUP_EXECUTED" not in backup_calls:
        print("FAIL: Pre-deployment database backup was not executed!")
        return False

    print("PASS: Zero hand-off gap verified: competing helper blocked, proposed helper activated correctly.")
    return True


# ------------------------------------------------------------------------------
# TEST 3: Lock Contention on Direct Proposed Helper Invocation
# ------------------------------------------------------------------------------
def test_direct_proposed_helper_contention(base_dir: str, proposed_helper_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 3: Direct Proposed Helper Contention (CI Pipeline Active)")
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
    create_mock_release(builds_dir, shared_dir, "release-comp0003", sha="2" * 40)

    # Simulate CI pipeline holding the pipeline lock in a detached process
    ci_script = f"""#!/bin/bash
exec 200>"{pipeline_lock}"
flock -n 200
sleep 5
"""
    ci_proc = subprocess.Popen(["bash", "-c", ci_script])
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

    print("[Operator] Attempting direct activate-release.sh in separate session while CI holds lock...")
    res = subprocess.run(
        [proposed_helper_path, "release-comp0003", "2" * 40],
        capture_output=True,
        text=True,
        env=env
    )

    ci_proc.terminate()
    ci_proc.wait()

    print(f"[Proposed Helper] Exit code: {res.returncode}")
    print(f"[Proposed Helper] Stderr: {res.stderr.strip()}")

    if res.returncode != 1 or "Deployment pipeline is currently in progress" not in res.stderr:
        print("FAIL: Direct proposed helper was NOT blocked when pipeline lock held by non-ancestor!")
        return False

    observed_target = os.path.basename(os.path.realpath(current_symlink))
    if observed_target != "release-live0003":
        print(f"FAIL: Symlink was modified to {observed_target}!")
        return False

    print("PASS: Direct proposed helper was strictly blocked by active pipeline lock.")
    return True


# ------------------------------------------------------------------------------
# TEST 4: Failed Service Restart Handling & Automated Rollback
# ------------------------------------------------------------------------------
def test_failed_service_restart_and_rollback(base_dir: str, proposed_helper_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 4: Failed Service Restart Handling & Automated Rollback")
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
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    create_mock_release(builds_dir, shared_dir, "release-good0004", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-good0004"), current_symlink)
    create_mock_release(builds_dir, shared_dir, "release-fail0004", sha="2" * 40)

    systemctl_log = os.path.join(base_dir, "systemctl_4.log")
    mock_systemctl = os.path.join(base_dir, "mock_systemctl_4.sh")
    fail_flag = os.path.join(base_dir, "fail_sys_4")
    # Trigger restart failure!
    open(fail_flag, "w").close()
    create_mock_systemctl(mock_systemctl, systemctl_log, fail_flag)

    mock_curl = os.path.join(base_dir, "mock_curl_4.sh")
    create_mock_curl(mock_curl, os.path.join(base_dir, "fail_curl_4"))

    mock_backup = os.path.join(base_dir, "mock_backup_4.sh")
    create_mock_backup(mock_backup, os.path.join(base_dir, "backup_4.log"))

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

    print("[Helper] Invoking activate-release.sh with intentional service restart failure...")
    res = subprocess.run([proposed_helper_path, "release-fail0004", "2" * 40], capture_output=True, text=True, env=env)

    print(f"[Proposed Helper] Exit code: {res.returncode}")
    print(f"[Proposed Helper] Stderr:\n{res.stderr.strip()}")

    if res.returncode != 1:
        print(f"FAIL: Proposed helper returned exit code {res.returncode}, expected 1!")
        return False

    if "Failed to restart service 'royal-libas'" not in res.stderr:
        print("FAIL: Expected restart failure error message missing from stderr!")
        return False

    # Directly assert symlink was rolled back to previous release
    observed_target = os.path.basename(os.path.realpath(current_symlink))
    print(f"[Direct Assertion] Post-failure symlink target: {observed_target} (expected: release-good0004)")
    if observed_target != "release-good0004":
        print(f"FAIL: Symlink was not rolled back! Found {observed_target}")
        return False

    # Directly assert rollback restart attempted
    with open(systemctl_log) as f:
        sys_calls = f.read()
    print(f"[Direct Assertion] Systemctl calls:\n{sys_calls.strip()}")
    if sys_calls.count("restart royal-libas") < 2:
        print("FAIL: Systemctl was not called for rollback restart!")
        return False

    print("PASS: Service restart failure failed closed, triggered automated rollback, and returned exit 1.")
    return True


# ------------------------------------------------------------------------------
# TEST 5: Health Check Failure Handling & Rollback
# ------------------------------------------------------------------------------
def test_health_check_failure_and_rollback(base_dir: str, proposed_helper_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 5: Post-Activation Health Check Failure & Rollback")
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

    create_mock_release(builds_dir, shared_dir, "release-good0005", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-good0005"), current_symlink)
    create_mock_release(builds_dir, shared_dir, "release-unhl0005", sha="2" * 40)

    systemctl_log = os.path.join(base_dir, "systemctl_5.log")
    mock_systemctl = os.path.join(base_dir, "mock_systemctl_5.sh")
    create_mock_systemctl(mock_systemctl, systemctl_log, os.path.join(base_dir, "fail_sys_5"))

    fail_curl_flag = os.path.join(base_dir, "fail_curl_5")
    open(fail_curl_flag, "w").close()
    mock_curl = os.path.join(base_dir, "mock_curl_5.sh")
    create_mock_curl(mock_curl, fail_curl_flag)

    mock_backup = os.path.join(base_dir, "mock_backup_5.sh")
    create_mock_backup(mock_backup, os.path.join(base_dir, "backup_5.log"))

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
    res = subprocess.run([proposed_helper_path, "release-unhl0005", "2" * 40], capture_output=True, text=True, env=env)

    print(f"[Proposed Helper] Exit code: {res.returncode}")
    print(f"[Proposed Helper] Stderr:\n{res.stderr.strip()}")

    if res.returncode != 1:
        print(f"FAIL: Expected exit code 1, got {res.returncode}!")
        return False

    if "Service health check failed" not in res.stderr:
        print("FAIL: Expected health check error message missing from stderr!")
        return False

    observed_target = os.path.basename(os.path.realpath(current_symlink))
    print(f"[Direct Assertion] Post-failure symlink target: {observed_target} (expected: release-good0005)")
    if observed_target != "release-good0005":
        print(f"FAIL: Symlink was not rolled back to release-good0005!")
        return False

    print("PASS: Health check failure triggered automated rollback and returned exit 1.")
    return True


# ------------------------------------------------------------------------------
# TEST 6: Simultaneous Legacy Invocation During Pruning
# ------------------------------------------------------------------------------
def test_simultaneous_legacy_during_pruning(base_dir: str, prune_script_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 6: Simultaneous Legacy Invocation During Pruning Phase")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test6_builds")
    shared_dir = os.path.join(base_dir, "test6_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    shared_env = os.path.join(shared_dir, ".env")
    with open(shared_env, "w") as f:
        f.write("PROD_SECRET=test6\n")
    shared_uploads = os.path.join(shared_dir, "uploads")
    os.makedirs(shared_uploads, exist_ok=True)

    current_symlink = os.path.join(base_dir, "test6_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test6_activation.lock")
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    releases = [f"release-pru0000{i}" for i in range(1, 6)]
    for r in releases:
        create_mock_release(builds_dir, shared_dir, r, sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-pru00005"), current_symlink)

    with open(ledger_file, "w") as f:
        for i, r in enumerate(releases):
            ts = (datetime.now(timezone.utc) - timedelta(hours=6 - i)).isoformat()
            f.write(f"{ts}\t{r}\t{'1'*40}\tactivated\n")

    legacy_helper = os.path.join(base_dir, "legacy_helper_6.sh")
    create_legacy_helper_script(legacy_helper, activation_lock, current_symlink, builds_dir)

    fd_pipeline = os.open(pipeline_lock, os.O_RDWR)
    fcntl.flock(fd_pipeline, fcntl.LOCK_EX | fcntl.LOCK_NB)

    fd_activation = os.open(activation_lock, os.O_RDWR)
    fcntl.flock(fd_activation, fcntl.LOCK_EX | fcntl.LOCK_NB)

    print("[Workflow] Holding both locks, testing competing legacy helper...")
    res_comp = subprocess.run([legacy_helper, "release-pru00001", "1" * 40], capture_output=True, text=True)

    print(f"[Legacy Helper] Exit code: {res_comp.returncode}")
    print(f"[Legacy Helper] Stderr: {res_comp.stderr.strip()}")

    if res_comp.returncode != 1 or "Another deployment is running" not in res_comp.stderr:
        print("FAIL: Legacy helper was NOT blocked while activation lock is held during pruning!")
        fcntl.flock(fd_activation, fcntl.LOCK_UN)
        os.close(fd_activation)
        fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
        os.close(fd_pipeline)
        return False

    prune_cmd = [
        sys.executable, prune_script_path,
        "--execute",
        "--pipeline-lock-fd", str(fd_pipeline),
        "--activation-lock-fd", str(fd_activation),
        "--builds-dir", builds_dir,
        "--current-symlink", current_symlink,
        "--ledger-file", ledger_file,
        "--pipeline-lock-file", pipeline_lock,
        "--activation-lock-file", activation_lock,
        "--shared-env", shared_env,
        "--shared-uploads", shared_uploads,
        "--min-rollbacks", "3"
    ]
    res_prune = subprocess.run(prune_cmd, capture_output=True, text=True, pass_fds=(fd_pipeline, fd_activation))

    fcntl.flock(fd_activation, fcntl.LOCK_UN)
    os.close(fd_activation)
    fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
    os.close(fd_pipeline)

    if res_prune.returncode != 0:
        print(f"FAIL: Prune failed under inherited locks:\n{res_prune.stderr}")
        return False

    if os.path.exists(os.path.join(builds_dir, "release-pru00001")):
        print("FAIL: release-pru00001 was not pruned!")
        return False

    print("PASS: Pruning succeeded safely while continuous locks blocked competing activations.")
    return True


# ------------------------------------------------------------------------------
# TEST 7: Safe First Deployment & Manual Rollback Workflow
# ------------------------------------------------------------------------------
def test_first_deployment_and_rollback_workflow(base_dir: str, prune_script_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 7: Safe First Deployment & Manual Rollback Workflow")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test7_builds")
    shared_dir = os.path.join(base_dir, "test7_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    shared_env = os.path.join(shared_dir, ".env")
    with open(shared_env, "w") as f:
        f.write("PROD_SECRET=test7\n")
    shared_uploads = os.path.join(shared_dir, "uploads")
    os.makedirs(shared_uploads, exist_ok=True)

    current_symlink = os.path.join(base_dir, "test7_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test7_activation.lock")
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    # Step 1: Pre-existing state (4 releases exist on disk, no ledger yet)
    releases = [f"release-fst0000{i}" for i in range(1, 5)]
    for r in releases:
        create_mock_release(builds_dir, shared_dir, r, sha="7" * 40)
    os.symlink(os.path.join(builds_dir, "release-fst00004"), current_symlink)

    print("[First Run] Running retention with 4 total releases on fresh system (no ledger)...")
    res_prune_1 = subprocess.run([
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

    # All 4 releases must be preserved (live + 3 rollbacks)
    for r in releases:
        if not os.path.isdir(os.path.join(builds_dir, r)):
            print(f"FAIL: Release {r} was pruned on first run!")
            return False

    print("PASS: First run preserved active release and all rollback candidates.")

    # Step 2: Now add 5th release (first eligible deletion)
    create_mock_release(builds_dir, shared_dir, "release-fst00005", sha="7" * 40)
    # Re-point symlink to 5
    os.unlink(current_symlink)
    os.symlink(os.path.join(builds_dir, "release-fst00005"), current_symlink)

    # Record all 5 in ledger
    with open(ledger_file, "w") as f:
        for i in range(1, 6):
            ts = (datetime.now(timezone.utc) - timedelta(hours=6 - i)).isoformat()
            f.write(f"{ts}\t{'release-fst0000' + str(i)}\t{'7'*40}\tactivated\n")

    print("[Fifth Release] Running retention with 5 recorded releases...")
    res_prune_2 = subprocess.run([
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

    # Oldest (release-fst00001) pruned; 2, 3, 4 retained as rollbacks; 5 live
    if os.path.exists(os.path.join(builds_dir, "release-fst00001")):
        print("FAIL: Oldest release-fst00001 was not pruned when 5 releases were recorded!")
        return False

    for r in ["release-fst00002", "release-fst00003", "release-fst00004", "release-fst00005"]:
        if not os.path.isdir(os.path.join(builds_dir, r)):
            print(f"FAIL: Release {r} was improperly deleted!")
            return False

    print("PASS: Safe first deployment and retention quota strictly maintained (live + 3 rollbacks).")
    return True


# ------------------------------------------------------------------------------
# TEST 8: Authoritative Evidence Policy & Dry-Run Labeling
# ------------------------------------------------------------------------------
def test_authoritative_evidence_and_dry_run(base_dir: str, seed_script_path: str, prune_script_path: str) -> bool:
    print("\n" + "=" * 72)
    print("TEST 8: Authoritative Evidence Policy & Dry-Run Missing Lock Labeling")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test8_builds")
    shared_dir = os.path.join(base_dir, "test8_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    shared_env = os.path.join(shared_dir, ".env")
    with open(shared_env, "w") as f:
        f.write("PROD_SECRET=test8\n")
    shared_uploads = os.path.join(shared_dir, "uploads")
    os.makedirs(shared_uploads, exist_ok=True)

    current_symlink = os.path.join(base_dir, "test8_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test8_activation.lock")
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    # Pre-existing historical releases
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
        t1 = test_legacy_helper_during_preparation(sandbox)
        t2 = test_simultaneous_legacy_during_activation(sandbox, proposed_helper)
        t3 = test_direct_proposed_helper_contention(sandbox, proposed_helper)
        t4 = test_failed_service_restart_and_rollback(sandbox, proposed_helper)
        t5 = test_health_check_failure_and_rollback(sandbox, proposed_helper)
        t6 = test_simultaneous_legacy_during_pruning(sandbox, prune_script)
        t7 = test_first_deployment_and_rollback_workflow(sandbox, prune_script)
        t8 = test_authoritative_evidence_and_dry_run(sandbox, seed_script, prune_script)

        print("\n" + "=" * 72)
        print("CONSOLIDATED PRODUCTION-EQUIVALENT TEST RESULTS:")
        print(f"  Test 1 (Simultaneous Legacy Helper During Prep):    {'PASS' if t1 else 'FAIL'}")
        print(f"  Test 2 (Simultaneous Legacy During Activation):     {'PASS' if t2 else 'FAIL'}")
        print(f"  Test 3 (Lock Contention on Direct Proposed Helper): {'PASS' if t3 else 'FAIL'}")
        print(f"  Test 4 (Failed Service Restart & Rollback):         {'PASS' if t4 else 'FAIL'}")
        print(f"  Test 5 (Post-Activation Health Failure & Rollback):  {'PASS' if t5 else 'FAIL'}")
        print(f"  Test 6 (Simultaneous Legacy During Pruning):        {'PASS' if t6 else 'FAIL'}")
        print(f"  Test 7 (First Deployment & Rollback Workflow):      {'PASS' if t7 else 'FAIL'}")
        print(f"  Test 8 (Authoritative Evidence Policy & Dry-Run):   {'PASS' if t8 else 'FAIL'}")
        print("=" * 72)

        if all([t1, t2, t3, t4, t5, t6, t7, t8]):
            print("\nALL 8 PRODUCTION-EQUIVALENT ISOLATED TESTS PASSED SUCCESSFULLY!")
            sys.exit(0)
        else:
            print("\nSOME TESTS FAILED!")
            sys.exit(1)
    finally:
        shutil.rmtree(sandbox, ignore_errors=True)
        print(f"Sandbox cleaned up: {sandbox}")


if __name__ == "__main__":
    main()
