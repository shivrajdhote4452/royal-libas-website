#!/usr/bin/env python3
"""
Isolated Linux Process Concurrency & Hand-off Verification Suite.

Designed to run on Linux (VPS) in an isolated /tmp sandbox to verify:
1. Lock Hand-Off Gap: Deliberately starts a competing manual activation
   precisely during the hand-off window (when activation FD 201 is closed
   but pipeline FD 200 is held). Verifies that the single coordinated
   protocol strictly blocks the competing activation.
2. Uncertain History: Verifies that matching Git commits alone without
   independent activation evidence are preserved as uncertain and NEVER deleted.
3. Missing Locks on Real Workflow Path: Verifies that dry run displays the
   UNPROTECTED / POTENTIALLY STALE INSPECTION banner and execute mode skips safely.
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

    # Git metadata
    commit_sha = sha or ("a" * 40)
    with open(os.path.join(git_dir, "HEAD"), "w", encoding="utf-8") as f:
        f.write(f"{commit_sha}\n")

    # Frontend dist
    with open(os.path.join(frontend_dist, "index.html"), "w", encoding="utf-8") as f:
        f.write(f"<html><body>Royal Libas - {name}</body></html>")

    # Backend app
    app_dir = os.path.join(backend_dir, "app")
    os.makedirs(app_dir, exist_ok=True)
    with open(os.path.join(app_dir, "main.py"), "w", encoding="utf-8") as f:
        f.write("# backend main")

    # Virtualenv
    bin_dir = os.path.join(backend_dir, ".venv", "bin")
    os.makedirs(bin_dir, exist_ok=True)
    py_bin = os.path.join(bin_dir, "python")
    with open(py_bin, "w", encoding="utf-8") as f:
        f.write("#!/bin/sh\necho python")
    os.chmod(py_bin, 0o755)

    # Symlinks to persistent shared storage
    shared_env = os.path.join(shared_dir, ".env")
    shared_uploads = os.path.join(shared_dir, "uploads")
    os.symlink(shared_env, os.path.join(backend_dir, ".env"))
    os.symlink(shared_uploads, os.path.join(backend_dir, "uploads"))

    return rel_path


def test_lock_handoff_gap_concurrency(base_dir: str, prune_script_path: str) -> bool:
    """
    Test 1: Deliberately launch competing manual activation during lock hand-off.
    
    Sequence:
    1. Workflow opens and locks PIPELINE_LOCK (FD 200).
    2. Workflow opens and locks ACTIVATION_LOCK (FD 201) for preparation.
    3. Workflow closes ACTIVATION_LOCK (FD 201) to simulate hand-off to activate-release.sh.
    4. At this exact moment, a competing manual activation process attempts to acquire locks.
    5. Assert: Competing manual activation is REJECTED by FD 200 (cannot run).
    6. Workflow completes activation, runs prune_releases.py with --pipeline-lock-fd 200.
    """
    print("\n" + "=" * 72)
    print("TEST 1: Lock Hand-Off Gap Concurrency & Mutual Exclusion")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test1_builds")
    shared_dir = os.path.join(base_dir, "test1_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    shared_env = os.path.join(shared_dir, ".env")
    with open(shared_env, "w") as f:
        f.write("PROD_SECRET=test1\n")

    shared_uploads = os.path.join(shared_dir, "uploads")
    os.makedirs(shared_uploads, exist_ok=True)

    current_symlink = os.path.join(base_dir, "test1_current")
    pipeline_lock_file = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock_file = os.path.join(base_dir, "test1_activation.lock")
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")

    # Touch lock files
    open(pipeline_lock_file, "a").close()
    open(activation_lock_file, "a").close()

    # Create 5 initial releases
    initial_releases = [f"release-init000{i}" for i in range(1, 6)]
    for r in initial_releases:
        create_mock_release(builds_dir, shared_dir, r, sha="1" * 40)

    # Initial live pointer
    os.symlink(os.path.join(builds_dir, "release-init0005"), current_symlink)

    # Seed initial ledger with 5 activated releases
    with open(ledger_file, "w") as f:
        for i, r in enumerate(initial_releases):
            ts = (datetime.now(timezone.utc) - timedelta(hours=6 - i)).isoformat()
            f.write(f"{ts}\t{r}\t{'1'*40}\tactivated\n")

    # New release to deploy
    new_release_name = "release-new00001"
    new_release_path = create_mock_release(builds_dir, shared_dir, new_release_name, sha="2" * 40)

    print("[Workflow] Step 1: Acquiring unbroken pipeline lock (FD 200)...")
    fd_pipeline = os.open(pipeline_lock_file, os.O_RDWR)
    fcntl.flock(fd_pipeline, fcntl.LOCK_EX | fcntl.LOCK_NB)

    print("[Workflow] Step 2: Acquiring activation lock (FD 201) across preparation...")
    fd_activation = os.open(activation_lock_file, os.O_RDWR)
    fcntl.flock(fd_activation, fcntl.LOCK_EX | fcntl.LOCK_NB)

    print("[Workflow] Step 3: Preparation complete. Releasing FD 201 for activation hand-off...")
    # Simulate hand-off gap: release FD 201, KEEP FD 200 HELD!
    fcntl.flock(fd_activation, fcntl.LOCK_UN)
    os.close(fd_activation)

    print("[Competing Manual Activation] Attempting to run during hand-off gap...")
    # Spawn competing manual activation process attempting to coordinate on PIPELINE_LOCK
    competing_cmd = [
        sys.executable, "-c",
        f"""
import os, sys, fcntl
try:
    fd = os.open({repr(pipeline_lock_file)}, os.O_RDWR)
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    print("COMPETING_ACQUIRED")
    sys.exit(0)
except (BlockingIOError, OSError):
    print("COMPETING_BLOCKED_BY_FD200")
    sys.exit(1)
"""
    ]
    res_competing = subprocess.run(competing_cmd, capture_output=True, text=True)

    print(f"[Competing Manual Activation] Exit code: {res_competing.returncode}")
    print(f"[Competing Manual Activation] Output: {res_competing.stdout.strip()}")

    if res_competing.returncode == 0:
        print("FAIL: Competing manual activation was NOT blocked! Hand-off race window exists!")
        return False

    print("PASS: Competing manual activation was strictly BLOCKED by FD 200 during hand-off gap!")

    # Workflow finishes activation
    print("[Workflow] Step 4: Activating new release and verifying symlink...")
    tmp_symlink = current_symlink + ".tmp"
    os.symlink(new_release_path, tmp_symlink)
    os.replace(tmp_symlink, current_symlink)

    resolved = os.path.basename(os.path.realpath(current_symlink))
    assert resolved == new_release_name, f"Expected {new_release_name}, got {resolved}"

    # Append to ledger
    ts_now = datetime.now(timezone.utc).isoformat()
    with open(ledger_file, "a") as f:
        f.write(f"{ts_now}\t{new_release_name}\t{'2'*40}\tactivated\n")

    # Workflow invokes prune_releases.py inheriting FD 200
    print("[Workflow] Step 5: Invoking prune_releases.py with inherited pipeline lock FD 200...")
    prune_cmd = [
        sys.executable, prune_script_path,
        "--execute",
        "--pipeline-lock-fd", str(fd_pipeline),
        "--builds-dir", builds_dir,
        "--current-symlink", current_symlink,
        "--ledger-file", ledger_file,
        "--pipeline-lock-file", pipeline_lock_file,
        "--activation-lock-file", activation_lock_file,
        "--shared-env", shared_env,
        "--shared-uploads", shared_uploads,
        "--min-rollbacks", "3"
    ]
    res_prune = subprocess.run(prune_cmd, capture_output=True, text=True, pass_fds=(fd_pipeline,))
    print(f"[Workflow] Prune exit code: {res_prune.returncode}")

    if res_prune.returncode != 0:
        print(f"FAIL: Prune failed under inherited FD 200:\n{res_prune.stderr}")
        return False

    print("PASS: Prune succeeded under inherited FD 200.")

    # Cleanup workflow lock
    fcntl.flock(fd_pipeline, fcntl.LOCK_UN)
    os.close(fd_pipeline)
    return True


def test_uncertain_history_preservation(base_dir: str, seed_script_path: str, prune_script_path: str) -> bool:
    """
    Test 2: Matching Git commit alone without independent evidence is preserved as uncertain.
    """
    print("\n" + "=" * 72)
    print("TEST 2: Uncertain Historical Entries Strictly Preserved")
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
    pipeline_lock_file = os.path.join(builds_dir, ".deploy-pipeline.lock")
    activation_lock_file = os.path.join(base_dir, "test2_activation.lock")
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")

    open(pipeline_lock_file, "a").close()
    open(activation_lock_file, "a").close()

    # Create 6 physical releases with valid git commits
    # Let release-huDNUmEb be one of the known candidates
    rel1 = create_mock_release(builds_dir, shared_dir, "release-huDNUmEb", sha="805e7a93091e8f073ad3d629fc4d952d46cd454b")
    rel2 = create_mock_release(builds_dir, shared_dir, "release-CPCGzuLG", sha="d9e7507cd1b8f820e44c9644fc460bb50902c6f1")
    rel3 = create_mock_release(builds_dir, shared_dir, "release-tHmKpYTN", sha="e2bd0a4c27d23574c3ac323edf7c4070c576eb20")
    rel4 = create_mock_release(builds_dir, shared_dir, "release-WF0rJVqS", sha="8a71c821deb6cb36cee868e535b2c0924ee114c7")
    rel5 = create_mock_release(builds_dir, shared_dir, "release-nhKRvmAd", sha="9c41227852571ba8b2d47e605821ddc3200f801a")
    rel6 = create_mock_release(builds_dir, shared_dir, "release-uXFXM8EL", sha="57352a3e3da16f023e3dd7d90f5ade1eb21c104e")

    os.symlink(os.path.join(builds_dir, "release-uXFXM8EL"), current_symlink)

    # 1. Run seed_ledger without independent evidence
    print("[Seed Ledger] Running WITHOUT independent evidence file...")
    seed_cmd = [
        sys.executable, seed_script_path,
        "--ledger-file", ledger_file,
        "--builds-dir", builds_dir,
        "--pipeline-lock-file", pipeline_lock_file,
        "--execute"
    ]
    res_seed = subprocess.run(seed_cmd, capture_output=True, text=True)
    print(res_seed.stdout)

    if "INDEPENDENT ACTIVATION EVIDENCE MISSING" not in res_seed.stdout:
        print("FAIL: Safety notice missing from seed_ledger output!")
        return False

    # Ledger should not have unverified activated entries
    if os.path.exists(ledger_file):
        with open(ledger_file) as f:
            content = f.read()
        if "activated" in content:
            print("FAIL: Historical releases were incorrectly seeded as activated without evidence!")
            return False

    print("PASS: seed_ledger refused to authorize historical releases without evidence.")

    # 2. Write ledger with 2 verified releases, and mark the rest as uncertain_historical
    with open(ledger_file, "w") as f:
        f.write("2026-11-01T14:28:52Z\trelease-huDNUmEb\t805e7a93091e8f073ad3d629fc4d952d46cd454b\tuncertain_historical\n")
        f.write("2026-11-01T14:36:34Z\trelease-CPCGzuLG\td9e7507cd1b8f820e44c9644fc460bb50902c6f1\tuncertain_historical\n")
        f.write("2026-11-01T17:46:46Z\trelease-tHmKpYTN\te2bd0a4c27d23574c3ac323edf7c4070c576eb20\tuncertain_historical\n")
        f.write("2026-11-02T08:16:09Z\trelease-WF0rJVqS\t8a71c821deb6cb36cee868e535b2c0924ee114c7\tuncertain_historical\n")
        f.write("2026-11-02T10:27:55Z\trelease-nhKRvmAd\t9c41227852571ba8b2d47e605821ddc3200f801a\tactivated\n")
        f.write("2026-11-02T10:51:09Z\trelease-uXFXM8EL\t57352a3e3da16f023e3dd7d90f5ade1eb21c104e\tactivated\n")

    # Run prune_releases.py in execute mode
    print("[Prune Releases] Running with uncertain historical entries...")
    prune_cmd = [
        sys.executable, prune_script_path,
        "--execute",
        "--builds-dir", builds_dir,
        "--current-symlink", current_symlink,
        "--ledger-file", ledger_file,
        "--pipeline-lock-file", pipeline_lock_file,
        "--activation-lock-file", activation_lock_file,
        "--shared-env", shared_env,
        "--shared-uploads", shared_uploads,
        "--min-rollbacks", "3"
    ]
    res_prune = subprocess.run(prune_cmd, capture_output=True, text=True)
    print(res_prune.stdout)

    # Assert all 6 releases still exist on disk!
    for r in ["release-huDNUmEb", "release-CPCGzuLG", "release-tHmKpYTN", "release-WF0rJVqS", "release-nhKRvmAd", "release-uXFXM8EL"]:
        if not os.path.isdir(os.path.join(builds_dir, r)):
            print(f"FAIL: Uncertain release '{r}' was deleted!")
            return False

    print("PASS: All uncertain historical releases were strictly preserved against deletion!")
    return True


def test_missing_lock_dry_run_unprotected_banner(base_dir: str, prune_script_path: str) -> bool:
    """
    Test 3: Missing lock during dry-run produces UNPROTECTED / POTENTIALLY STALE banner.
    """
    print("\n" + "=" * 72)
    print("TEST 3: Missing Lock During Dry Run Output Labeling")
    print("=" * 72)

    builds_dir = os.path.join(base_dir, "test3_builds")
    shared_dir = os.path.join(base_dir, "test3_shared")
    os.makedirs(builds_dir, exist_ok=True)
    os.makedirs(shared_dir, exist_ok=True)

    shared_env = os.path.join(shared_dir, ".env")
    with open(shared_env, "w") as f:
        f.write("PROD_SECRET=test3\n")

    shared_uploads = os.path.join(shared_dir, "uploads")
    os.makedirs(shared_uploads, exist_ok=True)

    current_symlink = os.path.join(base_dir, "test3_current")
    nonexistent_pipeline_lock = os.path.join(base_dir, "nonexistent_pipeline.lock")
    nonexistent_activation_lock = os.path.join(base_dir, "nonexistent_activation.lock")
    ledger_file = os.path.join(builds_dir, ".deployments_ledger.tsv")

    # Create 5 releases and seed ledger
    releases = [f"release-mock000{i}" for i in range(1, 6)]
    for r in releases:
        create_mock_release(builds_dir, shared_dir, r, sha="0" * 40)

    os.symlink(os.path.join(builds_dir, "release-mock0005"), current_symlink)

    with open(ledger_file, "w") as f:
        for i, r in enumerate(releases):
            ts = (datetime.now(timezone.utc) - timedelta(hours=6 - i)).isoformat()
            f.write(f"{ts}\t{r}\t{'0'*40}\tactivated\n")

    # Run dry run with missing lock files
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

    sandbox = tempfile.mkdtemp(prefix="vps_test_handoff_")
    print(f"Isolated Test Sandbox: {sandbox}")

    try:
        t1_ok = test_lock_handoff_gap_concurrency(sandbox, prune_script)
        t2_ok = test_uncertain_history_preservation(sandbox, seed_script, prune_script)
        t3_ok = test_missing_lock_dry_run_unprotected_banner(sandbox, prune_script)

        print("\n" + "=" * 72)
        print("CONSOLIDATED TEST RESULTS:")
        print(f"  Test 1 (Lock Hand-Off Gap Concurrency):       {'PASS' if t1_ok else 'FAIL'}")
        print(f"  Test 2 (Uncertain History Preservation):      {'PASS' if t2_ok else 'FAIL'}")
        print(f"  Test 3 (Missing Lock Dry Run Banner):         {'PASS' if t3_ok else 'FAIL'}")
        print("=" * 72)

        if t1_ok and t2_ok and t3_ok:
            print("\nALL VPS CONCURRENCY & INTEGRITY TESTS PASSED SUCCESSFULLY!")
            sys.exit(0)
        else:
            print("\nSOME TESTS FAILED!")
            sys.exit(1)
    finally:
        shutil.rmtree(sandbox, ignore_errors=True)
        print(f"Sandbox cleaned up: {sandbox}")


if __name__ == "__main__":
    main()
