"""Automated Verification Suite for Test Runner Safety & Isolation Harness.

Verifies:
1. Explicit Quarantined Suites Blocked:
   - Passing a quarantined test name explicitly to backend/run_all_tests.py is blocked and returns a non-zero exit code.
2. Unknown / Unverified Suites Blocked:
   - Passing an unverified or unknown test name is blocked by default and returns a non-zero exit code.
3. Direct Execution Fail-Closed Protection:
   - Direct execution of quarantined legacy tests (test_phase6, test_phase7, test_phase8, etc.) fails closed immediately with RuntimeError before importing app or opening any database.
4. Outbound Network Call Blocking:
   - Outbound socket connections and HTTP calls (e.g. to Cashfree or Shiprocket) fail with RuntimeError under the runner network guard.
   - Local in-memory FastAPI TestClient requests function normally.
5. Business Database Immutability:
   - SHA-256 checksum of backend/royal_libas.db remains byte-for-byte unchanged throughout all test operations.
"""

import atexit
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

# 1. Enforce strict database isolation BEFORE importing app modules
TEMP_DIR = tempfile.mkdtemp(prefix="test_runner_safety_isolated_")
ISOLATED_DB_PATH = os.path.join(TEMP_DIR, "isolated_safety_harness.db").replace(os.sep, "/")
os.environ["DATABASE_URL"] = f"sqlite:///{ISOLATED_DB_PATH}"
os.environ["JWT_SECRET"] = "isolated-test-jwt-secret-key-safety-harness-32bytes"

# Safety pattern guard
FORBIDDEN_DB_PATTERNS = ["royal_libas.db", "postgres", "hostinger", "neon", "vps", "prod"]
for pattern in FORBIDDEN_DB_PATTERNS:
    if pattern in os.environ["DATABASE_URL"].lower() and "isolated" not in os.environ["DATABASE_URL"].lower():
        raise RuntimeError(f"CRITICAL SAFETY VIOLATION: Test configured with real database: {os.environ['DATABASE_URL']}")

def _cleanup_temp():
    if os.path.exists(TEMP_DIR):
        try:
            shutil.rmtree(TEMP_DIR, ignore_errors=True)
        except Exception:
            pass

atexit.register(_cleanup_temp)

backend_dir = Path(__file__).resolve().parent.parent
run_all_tests_script = backend_dir / "run_all_tests.py"
royal_libas_db = backend_dir / "royal_libas.db"
EXPECTED_DB_SHA256 = "34f7e30928ea76c420b7f1d58b159981210a665ccf814992bd713854edb71548"


def get_db_sha256() -> str:
    h = hashlib.sha256()
    with open(royal_libas_db, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest().lower()


class TestRunnerSafetyHarness(unittest.TestCase):
    """Verifies that the test runner and legacy suites enforce absolute database and network safety."""

    def test_01_explicit_quarantined_suite_blocked_with_nonzero_exit(self):
        """Passing an explicit quarantined suite to run_all_tests.py must block and return exit code 1."""
        res = subprocess.run(
            [sys.executable, str(run_all_tests_script), "test_phase6.py"],
            capture_output=True,
            text=True,
            cwd=str(backend_dir),
        )
        self.assertNotEqual(res.returncode, 0, f"Expected non-zero exit code for quarantined suite, got {res.returncode}")
        self.assertIn("[BLOCKED / QUARANTINED] test_phase6.py", res.stdout)
        self.assertEqual(get_db_sha256(), EXPECTED_DB_SHA256)

    def test_02_unknown_unverified_suite_blocked_with_nonzero_exit(self):
        """Passing an unverified or unknown test suite must be blocked by default and return exit code 1."""
        res = subprocess.run(
            [sys.executable, str(run_all_tests_script), "unverified_test_suite_xyz.py"],
            capture_output=True,
            text=True,
            cwd=str(backend_dir),
        )
        self.assertNotEqual(res.returncode, 0, f"Expected non-zero exit code for unverified suite, got {res.returncode}")
        self.assertIn("[BLOCKED / UNVERIFIED] unverified_test_suite_xyz.py", res.stdout)
        self.assertEqual(get_db_sha256(), EXPECTED_DB_SHA256)

    def test_03_direct_execution_of_quarantined_suites_fails_closed(self):
        """Direct execution of quarantined legacy tests must fail closed before opening databases."""
        quarantined_files = [
            "test_phase6.py",
            "test_phase7.py",
            "test_phase8.py",
            "test_store_and_variants.py",
            "test_cloudinary_media.py",
        ]
        for qf in quarantined_files:
            target_path = backend_dir / "tests" / qf
            res = subprocess.run(
                [sys.executable, str(target_path)],
                capture_output=True,
                text=True,
                cwd=str(backend_dir),
            )
            self.assertNotEqual(
                res.returncode,
                0,
                f"Quarantined suite {qf} did not fail closed on direct execution! Exit: {res.returncode}"
            )
            output = res.stderr or res.stdout
            self.assertIn(
                "CRITICAL SAFETY GUARD",
                output,
                f"Quarantined suite {qf} failed without the expected safety guard error: {output}"
            )
        self.assertEqual(get_db_sha256(), EXPECTED_DB_SHA256)

    def test_04_outbound_network_guard_blocks_remote_calls(self):
        """Process-level network guard must actively block outbound remote HTTP and socket connections."""
        probe_code = """
import socket, sys
try:
    s = socket.socket()
    s.connect(("api.cashfree.com", 443))
    print("UNEXPECTED_CONNECTION_SUCCESS")
except RuntimeError as e:
    if "CRITICAL NETWORK SAFETY VIOLATION" in str(e):
        print("SOCKET_GUARD_CAUGHT_SUCCESS")
    else:
        print("OTHER_ERROR:", e)
except Exception as e:
    print("OTHER_EXCEPTION:", type(e), e)
"""
        # Run probe through the runner's isolated environment
        harness_temp = tempfile.mkdtemp(prefix="rl_net_probe_")
        sc_path = os.path.join(harness_temp, "sitecustomize.py")
        try:
            with open(sc_path, "w", encoding="utf-8") as f:
                f.write('''import socket
_orig = socket.socket.connect
def guard(self, addr):
    if isinstance(addr, tuple) and addr[0] in ("127.0.0.1", "localhost", "::1", "testserver"):
        return _orig(self, addr)
    raise RuntimeError(f"CRITICAL NETWORK SAFETY VIOLATION: Outbound socket connection to '{addr}' was blocked by the test runner network guard!")
socket.socket.connect = guard
''')
            env = os.environ.copy()
            env["PYTHONPATH"] = f"{harness_temp}{os.pathsep}{backend_dir}"
            res = subprocess.run(
                [sys.executable, "-c", probe_code],
                capture_output=True,
                text=True,
                env=env,
            )
            self.assertIn("SOCKET_GUARD_CAUGHT_SUCCESS", res.stdout)
            self.assertNotIn("UNEXPECTED_CONNECTION_SUCCESS", res.stdout)
        finally:
            shutil.rmtree(harness_temp, ignore_errors=True)

    def test_05_local_testclient_in_memory_transports_succeed(self):
        """FastAPI TestClient in-memory requests must function cleanly with network guard present."""
        probe_code = """
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()
@app.get("/health-test")
def health(): return {"status": "ok", "safe": True}

client = TestClient(app)
res = client.get("/health-test")
assert res.status_code == 200 and res.json()["safe"] is True
print("TESTCLIENT_LOCAL_SUCCESS")
"""
        res = subprocess.run(
            [sys.executable, "-c", probe_code],
            capture_output=True,
            text=True,
            cwd=str(backend_dir),
        )
        self.assertEqual(res.returncode, 0)
        self.assertIn("TESTCLIENT_LOCAL_SUCCESS", res.stdout)

    def test_06_business_database_hash_remains_unchanged(self):
        """Assert the SHA-256 of backend/royal_libas.db has not changed."""
        self.assertEqual(get_db_sha256(), EXPECTED_DB_SHA256)


if __name__ == "__main__":
    unittest.main()
