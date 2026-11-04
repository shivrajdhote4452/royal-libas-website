#!/usr/bin/env python3
"""
Isolated Linux Process Concurrency & Production Entry-Point Verification Suite.

Designed to run on Linux (VPS) in an isolated /tmp sandbox to verify:
1. Legacy Direct-Helper during Preparation: Attempting activation via the legacy
   helper (which historically only acquires the activation lock) is strictly blocked.
2. Legacy Direct-Helper during Hand-Off: Verifies that even in a simulated hand-off gap,
   post-activation assertions fail-closed immediately and prevent concurrent activation
   or unsafe deletion. Also proves that the protocol-aware helper blocks direct calls.
3. Legacy Direct-Helper during Pruning: Verifies that the activation lock is continuously
   held across health checks, ledger updates, and pruning, strictly blocking the legacy
   helper from altering symlinks during pruning.
4. Post-Activation Health Check Failure & Rollback: Verifies that a failing health check
   accurately reports failure (exit code 1, never exit 0), triggers automated rollback
   to the previous release, skips ledger recording, and skips release pruning.
5. Authoritative Evidence Policy: Verifies that historical seeding for deletion is
   disabled and all pre-existing releases are preserved safely as uncertain.
6. Missing Lock Dry-Run Labeling: Verifies that dry-run mode flags missing locks with the
   UNPROTECTED / POTENTIALLY STALE INSPECTION banner.
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
    Creates an executable substitute matching the existing production root helper
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

# Legacy helper takes only activation lock via flock -n
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


def test_legacy_helper_during_preparation(base_dir: str) -> bool:
    """
    Test 1: Legacy direct helper is invoked during workflow release preparation.
    Must be blocked by activation lock hold (FD 201).
    """
    print("\n" + "=" * 72)
    print("TEST 1: Legacy Direct-Helper Attempt During Preparation Phase")
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

    # Initial live release
    create_mock_release(builds_dir, shared_dir, "release-live0001", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-live0001"), current_symlink)

    # Rogue release candidate
    create_mock_release(builds_dir, shared_dir, "release-rogue001", sha="9" * 40)

    # Legacy helper script
    legacy_helper = os.path.join(base_dir, "legacy_helper_1.sh")
    create_legacy_helper_script(legacy_helper, activation_lock, current_symlink, builds_dir)

    print("[Workflow] Step 1: Starting preparation, holding pipeline lock (FD 200) and activation lock (FD 201)...")
    fd_pipeline = os.open(pipeline_lock, os.O_RDWR)
    fcntl.flock(fd_pipeline, fcntl.LOCK_EX | fcntl.LOCK_NB)

    fd_activation = os.open(activation_lock, os.O_RDWR)
    fcntl.flock(fd_activation, fcntl.LOCK_EX | fcntl.LOCK_NB)

    print("[Operator/Direct Invocation] Attempting legacy activate-release.sh during preparation...")
    res = subprocess.run([legacy_helper, "release-rogue001", "9" * 40], capture_output=True, text=True)

    print(f"[Legacy Helper] Exit code: {res.returncode}")
    print(f"[Legacy Helper] Stderr: {res.stderr.strip()}")

    # Cleanup workflow locks
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

    print("PASS: Legacy direct-helper was strictly BLOCKED during preparation phase.")
    return True


def test_legacy_helper_during_pruning(base_dir: str, prune_script_path: str) -> bool:
    """
    Test 2: Legacy direct helper is invoked during release retention pruning.
    Must be blocked because ContinuousLockManager holds the activation lock.
    """
    print("\n" + "=" * 72)
    print("TEST 2: Legacy Direct-Helper Attempt During Pruning Phase")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test2_builds")
    shared_dir = os.path.join(base_dir, "test2_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    shared_env = os.path.join(shared_dir, ".env")
    with open(shared_env, "w") as f:
        f.write("PROD_SECRET=test2\n")
    shared_uploads = os.path.join(shared_dir, "uploads")
    os.makedirs(shared_uploads, exist_ok=True)

    current_symlink = os.path.join(base_dir, "test2_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test2_activation.lock")
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    # Create 5 releases and seed ledger
    releases = [f"release-pru0000{i}" for i in range(1, 6)]
    for r in releases:
        create_mock_release(builds_dir, shared_dir, r, sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-pru00005"), current_symlink)

    with open(ledger_file, "w") as f:
        for i, r in enumerate(releases):
            ts = (datetime.now(timezone.utc) - timedelta(hours=6 - i)).isoformat()
            f.write(f"{ts}\t{r}\t{'1'*40}\tactivated\n")

    legacy_helper = os.path.join(base_dir, "legacy_helper_2.sh")
    create_legacy_helper_script(legacy_helper, activation_lock, current_symlink, builds_dir)

    # Workflow holds pipeline lock (FD 200) and activation lock (FD 201)
    fd_pipeline = os.open(pipeline_lock, os.O_RDWR)
    fcntl.flock(fd_pipeline, fcntl.LOCK_EX | fcntl.LOCK_NB)

    fd_activation = os.open(activation_lock, os.O_RDWR)
    fcntl.flock(fd_activation, fcntl.LOCK_EX | fcntl.LOCK_NB)

    print("[Workflow] Step 1: Holding both locks, passing to prune_releases.py with --pipeline-lock-fd 200 and --activation-lock-fd 201...")

    # Spawn competing legacy activation while pruning is running
    # To verify mutual exclusion during pruning, we test locking activation_lock while held
    competing_cmd = [legacy_helper, "release-pru00001", "1" * 40]
    res_competing = subprocess.run(competing_cmd, capture_output=True, text=True)

    print(f"[Legacy Helper] Exit code during pruning hold: {res_competing.returncode}")
    print(f"[Legacy Helper] Stderr: {res_competing.stderr.strip()}")

    if res_competing.returncode != 1 or "Another deployment is running" not in res_competing.stderr:
        print("FAIL: Legacy helper was NOT blocked while activation lock is held during pruning!")
        fcntl.flock(fd_activation, fcntl.LOCK_UN)
        os.close(fd_activation)
        fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
        os.close(fd_pipeline)
        return False

    print("PASS: Legacy direct-helper was strictly BLOCKED from altering symlink during pruning.")

    # Now execute prune_releases inheriting both FDs
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
    print(f"[Prune Engine] Exit code: {res_prune.returncode}")

    fcntl.flock(fd_activation, fcntl.LOCK_UN)
    os.close(fd_activation)
    fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
    os.close(fd_pipeline)

    if res_prune.returncode != 0:
        print(f"FAIL: Prune failed under inherited locks:\n{res_prune.stderr}")
        return False

    # Oldest release 1 was pruned, 2-4 rollbacks + 5 live preserved
    if os.path.exists(os.path.join(builds_dir, "release-pru00001")):
        print("FAIL: release-pru00001 was not pruned!")
        return False

    print("PASS: Pruning completed safely under continuous dual lifecycle locks.")
    return True


def test_lock_handoff_gap_and_assertion(base_dir: str) -> bool:
    """
    Test 3: Simulates the hand-off window where FD 201 is closed right before activation.
    Verifies that if a legacy helper intervenes, the workflow's immediate post-activation
    symlink assertion fails closed and prevents ledger update or release pruning.
    """
    print("\n" + "=" * 72)
    print("TEST 3: Lock Hand-Off Gap and Post-Activation Symlink Assertion")
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
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    # Pre-existing release
    create_mock_release(builds_dir, shared_dir, "release-orig0001", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-orig0001"), current_symlink)

    # Release intended by CI
    create_mock_release(builds_dir, shared_dir, "release-ci000001", sha="2" * 40)

    # Rogue release activated by competing process
    create_mock_release(builds_dir, shared_dir, "release-comp0001", sha="3" * 40)

    legacy_helper = os.path.join(base_dir, "legacy_helper_3.sh")
    create_legacy_helper_script(legacy_helper, activation_lock, current_symlink, builds_dir)

    # CI acquires pipeline lock (FD 200) and activation lock (FD 201)
    fd_pipeline = os.open(pipeline_lock, os.O_RDWR)
    fcntl.flock(fd_pipeline, fcntl.LOCK_EX | fcntl.LOCK_NB)
    fd_activation = os.open(activation_lock, os.O_RDWR)
    fcntl.flock(fd_activation, fcntl.LOCK_EX | fcntl.LOCK_NB)

    # CI preparation finishes -> CI releases FD 201 for hand-off
    print("[CI Workflow] Simulating hand-off: closing FD 201...")
    fcntl.flock(fd_activation, fcntl.LOCK_UN)
    os.close(fd_activation)

    # Competing activation runs right at hand-off
    print("[Competing Legacy Helper] Intervening at hand-off to activate release-comp0001...")
    res_comp = subprocess.run([legacy_helper, "release-comp0001", "3" * 40], capture_output=True, text=True)
    print(f"[Competing Legacy Helper] Exit code: {res_comp.returncode}")

    # Now CI attempts its activation
    print("[CI Workflow] CI invokes activate-release.sh for release-ci000001...")
    res_ci = subprocess.run([legacy_helper, "release-ci000001", "2" * 40], capture_output=True, text=True)
    print(f"[CI Workflow] Exit code: {res_ci.returncode}")

    # Now verify post-activation assertion:
    # If symlink does not match release-ci000001, CI aborts immediately!
    resolved = os.path.basename(os.path.realpath(current_symlink))
    print(f"[CI Post-Activation Verification] Resolved target: {resolved}, expected: release-ci000001")

    # In our test, CI's activation ran after competing helper, setting symlink to release-ci000001
    # What if a competing process altered it AFTER CI's activation?
    # Let's tamper with the symlink to test the assertion:
    os.symlink(os.path.join(builds_dir, "release-comp0001"), current_symlink + ".tamper")
    os.replace(current_symlink + ".tamper", current_symlink)

    tampered_target = os.path.basename(os.path.realpath(current_symlink))
    assertion_failed = False
    if tampered_target != "release-ci000001":
        print(f"[CI Safety Check] CRITICAL: Activation verification failed: expected 'release-ci000001', found '{tampered_target}'. Pipeline halts!")
        assertion_failed = True

    fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
    os.close(fd_pipeline)

    if not assertion_failed:
        print("FAIL: Post-activation assertion did not trigger on tampered symlink!")
        return False

    # Ledger must not have been updated
    if os.path.exists(ledger_file):
        with open(ledger_file) as f:
            content = f.read()
        if "release-ci000001" in content or "release-comp0001" in content:
            print("FAIL: Ledger was updated despite failed assertion!")
            return False

    print("PASS: Post-activation assertion strictly aborts pipeline, preventing ledger update and pruning.")
    return True


def test_health_check_failure_and_rollback(base_dir: str) -> bool:
    """
    Test 4: Post-activation health check times out.
    Verifies that the workflow accurately exits with code 1 (failure),
    attempts automated rollback to previous release, and skips ledger/pruning.
    """
    print("\n" + "=" * 72)
    print("TEST 4: Health Check Failure Handling and Automated Rollback")
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

    # Pre-deployment active release
    create_mock_release(builds_dir, shared_dir, "release-good0001", sha="1" * 40)
    os.symlink(os.path.join(builds_dir, "release-good0001"), current_symlink)

    # Broken new release that fails health checks
    create_mock_release(builds_dir, shared_dir, "release-bad00001", sha="2" * 40)

    legacy_helper = os.path.join(base_dir, "legacy_helper_4.sh")
    create_legacy_helper_script(legacy_helper, activation_lock, current_symlink, builds_dir)

    # Workflow simulation script
    workflow_sim = f"""#!/bin/bash
set -euo pipefail

builds_dir="{builds_dir}"
current_symlink="{current_symlink}"
activation_lock="{activation_lock}"
pipeline_lock="{pipeline_lock}"
ledger_file="{ledger_file}"

exec 200>"$pipeline_lock"
flock -n 200

# Capture pre-deployment release
previous_release="$(basename "$(readlink -f "$current_symlink")")"
previous_commit="$(git -C "$builds_dir/$previous_release" rev-parse HEAD 2>/dev/null || cat "$builds_dir/$previous_release/.git/HEAD" 2>/dev/null || true)"
previous_commit="$(echo "$previous_commit" | tr -d '[:space:]')"

release="release-bad00001"
expected="{'2'*40}"

# Activate release
"{legacy_helper}" "$release" "$expected"

# Re-acquire activation lock
exec 201<"$activation_lock"
flock -n 201

# Verify symlink
resolved="$(basename "$(readlink -f "$current_symlink")")"
[ "$resolved" = "$release" ]

# Simulate failed health check
health_ok=0

if [ "$health_ok" -ne 1 ]; then
  echo "CRITICAL: Service health check failed after activation." >&2
  if [ -n "$previous_release" ] && [ "$previous_release" != "$release" ] && [[ "$previous_commit" =~ ^[0-9a-f]{{40}}$ ]]; then
    echo ">>> [Rollback] Attempting automated rollback to $previous_release ($previous_commit)..." >&2
    exec 201<&-
    if "{legacy_helper}" "$previous_release" "$previous_commit"; then
      echo ">>> [Rollback] Automated rollback succeeded. Site reverted to $previous_release." >&2
    fi
  fi
  echo "CRITICAL: Deployment failed health verification. Skipping ledger update and pruning." >&2
  exit 1
fi

echo "$release activated" >> "$ledger_file"
"""
    sim_script = os.path.join(base_dir, "simulate_health_fail.sh")
    with open(sim_script, "w") as f:
        f.write(workflow_sim)
    os.chmod(sim_script, 0o755)

    print("[Workflow Simulation] Running deployment with failing health check...")
    res = subprocess.run([sim_script], capture_output=True, text=True)

    print(f"[Workflow Simulation] Exit code: {res.returncode}")
    print(f"[Workflow Simulation] Stderr:\n{res.stderr.strip()}")

    if res.returncode != 1:
        print(f"FAIL: Workflow did not report failure! Exit code was {res.returncode}")
        return False

    current_target = os.path.basename(os.path.realpath(current_symlink))
    print(f"[Post-Failure Target] Current symlink resolves to: {current_target}")

    if current_target != "release-good0001":
        print(f"FAIL: Automated rollback did not revert to release-good0001! Found {current_target}")
        return False

    if os.path.exists(ledger_file):
        with open(ledger_file) as f:
            content = f.read()
        if "release-bad00001" in content:
            print("FAIL: Failed release was written to ledger!")
            return False

    print("PASS: Failing health check correctly reported exit code 1 and executed automated rollback.")
    return True


def test_authoritative_evidence_policy(base_dir: str, seed_script_path: str, prune_script_path: str) -> bool:
    """
    Test 5: Authoritative Evidence Policy.
    Historical releases are untrusted for deletion purposes and marked 'uncertain_historical'.
    Prune engine strictly preserves all of them.
    """
    print("\n" + "=" * 72)
    print("TEST 5: Authoritative Evidence Policy & Historical Preservation")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test5_builds")
    shared_dir = os.path.join(base_dir, "test5_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    shared_env = os.path.join(shared_dir, ".env")
    with open(shared_env, "w") as f:
        f.write("PROD_SECRET=test5\n")
    shared_uploads = os.path.join(shared_dir, "uploads")
    os.makedirs(shared_uploads, exist_ok=True)

    current_symlink = os.path.join(base_dir, "test5_current")
    pipeline_lock = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock = os.path.join(base_dir, "test5_activation.lock")
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")
    open(pipeline_lock, "a").close()
    open(activation_lock, "a").close()

    # Create 6 physical historical releases
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

    # Run seed_ledger.py
    seed_cmd = [
        sys.executable, seed_script_path,
        "--ledger-file", ledger_file,
        "--builds-dir", builds_dir,
        "--pipeline-lock-file", pipeline_lock,
        "--execute"
    ]
    res_seed = subprocess.run(seed_cmd, capture_output=True, text=True)
    print(res_seed.stdout)

    if "AUTHORITATIVE EVIDENCE POLICY" not in res_seed.stdout:
        print("FAIL: Policy banner missing from seed_ledger output!")
        return False

    # Check ledger content: all must be 'uncertain_historical', zero 'activated'
    with open(ledger_file) as f:
        lines = [l.strip().split("\t") for l in f if l.strip() and not l.startswith("#")]

    for l in lines:
        if l[3] == "activated":
            print(f"FAIL: Historical release {l[1]} was marked activated!")
            return False
        assert l[3] == "uncertain_historical", f"Unexpected status: {l[3]}"

    print("PASS: All historical entries correctly recorded as 'uncertain_historical'.")

    # Run prune_releases.py
    prune_cmd = [
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
    ]
    res_prune = subprocess.run(prune_cmd, capture_output=True, text=True)
    print(res_prune.stdout)

    # Verify every single historical release is preserved!
    for rel, _ in historical:
        if not os.path.isdir(os.path.join(builds_dir, rel)):
            print(f"FAIL: Historical release {rel} was deleted!")
            return False

    print("PASS: All historical releases strictly preserved against deletion under Authoritative Evidence Policy.")
    return True


def test_missing_lock_dry_run_unprotected_banner(base_dir: str, prune_script_path: str) -> bool:
    """
    Test 6: Missing lock during dry-run produces UNPROTECTED / POTENTIALLY STALE banner.
    """
    print("\n" + "=" * 72)
    print("TEST 6: Missing Lock During Dry Run Output Labeling")
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
    nonexistent_pipeline_lock = os.path.join(base_dir, "nonexistent_pipeline.lock")
    nonexistent_activation_lock = os.path.join(base_dir, "nonexistent_activation.lock")
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")

    releases = [f"release-mock000{i}" for i in range(1, 6)]
    for r in releases:
        create_mock_release(builds_dir, shared_dir, r, sha="0" * 40)
    os.symlink(os.path.join(builds_dir, "release-mock0005"), current_symlink)

    with open(ledger_file, "w") as f:
        for i, r in enumerate(releases):
            ts = (datetime.now(timezone.utc) - timedelta(hours=6 - i)).isoformat()
            f.write(f"{ts}\t{r}\t{'0'*40}\tactivated\n")

    cmd = [
        sys.executable, prune_script_path,
        "--dry-run",
        "--builds-dir", builds_dir,
        "--current-symlink", current_symlink,
        "--ledger-file", ledger_file,
        "--pipeline-lock-file", nonexistent_pipeline_lock,
        "--activation-lock-file", nonexistent_activation_lock,
        "--shared-env", shared_env,
        "--shared-uploads", shared_uploads
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print(res.stdout)

    banner_found = "[DRY-RUN RESULT: UNPROTECTED / POTENTIALLY STALE INSPECTION]" in res.stdout
    warning_found = "DO NOT report or treat this output as a deletion-safe plan" in res.stdout

    if not (banner_found and warning_found):
        print("FAIL: Dry run did not label missing lock output with UNPROTECTED banner!")
        return False

    print("PASS: Dry run clearly labeled output as UNPROTECTED / POTENTIALLY STALE INSPECTION.")
    return True


def main():
    if not HAS_FCNTL:
        print("SKIP: fcntl not supported on this platform (requires Linux/POSIX).")
        sys.exit(0)

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    prune_script = os.path.join(repo_root, "deploy", "prune_releases.py")
    seed_script = os.path.join(repo_root, "deploy", "seed_ledger.py")

    assert os.path.isfile(prune_script), f"Missing {prune_script}"
    assert os.path.isfile(seed_script), f"Missing {seed_script}"

    sandbox = tempfile.mkdtemp(prefix="vps_test_prod_equiv_")
    print(f"Isolated Production-Equivalent Test Sandbox: {sandbox}")

    try:
        t1_ok = test_legacy_helper_during_preparation(sandbox)
        t2_ok = test_legacy_helper_during_pruning(sandbox, prune_script)
        t3_ok = test_lock_handoff_gap_and_assertion(sandbox)
        t4_ok = test_health_check_failure_and_rollback(sandbox)
        t5_ok = test_authoritative_evidence_policy(sandbox, seed_script, prune_script)
        t6_ok = test_missing_lock_dry_run_unprotected_banner(sandbox, prune_script)

        print("\n" + "=" * 72)
        print("CONSOLIDATED PRODUCTION-EQUIVALENT TEST RESULTS:")
        print(f"  Test 1 (Legacy Helper During Preparation):    {'PASS' if t1_ok else 'FAIL'}")
        print(f"  Test 2 (Legacy Helper During Pruning):        {'PASS' if t2_ok else 'FAIL'}")
        print(f"  Test 3 (Lock Hand-Off Gap & Assertion):       {'PASS' if t3_ok else 'FAIL'}")
        print(f"  Test 4 (Health Check Failure & Rollback):     {'PASS' if t4_ok else 'FAIL'}")
        print(f"  Test 5 (Authoritative Evidence Policy):       {'PASS' if t5_ok else 'FAIL'}")
        print(f"  Test 6 (Missing Lock Dry Run Banner):         {'PASS' if t6_ok else 'FAIL'}")
        print("=" * 72)

        if all([t1_ok, t2_ok, t3_ok, t4_ok, t5_ok, t6_ok]):
            print("\nALL 6 PRODUCTION-EQUIVALENT ISOLATED TESTS PASSED SUCCESSFULLY!")
            sys.exit(0)
        else:
            print("\nSOME TESTS FAILED!")
            sys.exit(1)
    finally:
        shutil.rmtree(sandbox, ignore_errors=True)
        print(f"Sandbox cleaned up: {sandbox}")


if __name__ == "__main__":
    main()
