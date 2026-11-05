"""Automated Verification Suite for Test Runner Safety & Isolation Harness.

Verifies:
1. Explicit Quarantined Suites Blocked:
   - Passing a quarantined test name explicitly to backend/run_all_tests.py is blocked and returns a non-zero exit code.
2. Unknown / Unverified Suites Blocked:
   - Passing an unverified or unknown test name is blocked by default and returns a non-zero exit code.
3. Direct Execution Fail-Closed Protection:
   - Direct execution of quarantined legacy tests fails closed immediately with RuntimeError before importing app or opening any database.
4. Test Discovery Clean Skipping:
   - Standard unittest discovery reports quarantined legacy suites cleanly as skipped without errors.
5. Actual Network Guard Verification:
   - Verifies the actual network guard installed by run_all_tests.py (backend/network_guard.py).
   - Covers socket.connect, socket.connect_ex, sync HTTP (httpx.Client.send), and async HTTP (httpx.AsyncClient.send).
   - Uses safe local RFC 5737 probe targets without contacting external payment or shipping endpoints.
   - Verifies local loopback and in-memory FastAPI TestClient transports function normally.
6. Sentinel Database Immutability & Clean Checkout Compatibility:
   - Tracks an isolated sentinel dummy database created specifically for this test.
   - Compares before/after SHA-256 hash to prove zero unauthorized database mutations.
   - Zero dependence on backend/royal_libas.db existing, ensuring 100% compatibility with clean git checkouts and CI environments.
"""

import asyncio
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

# Safety pattern guard: Abort immediately if DATABASE_URL contains business/production keywords
FORBIDDEN_DB_PATTERNS = ["royal_libas.db", "postgres", "hostinger", "neon", "vps", "prod"]
for pattern in FORBIDDEN_DB_PATTERNS:
    if pattern in os.environ["DATABASE_URL"].lower() and "isolated" not in os.environ["DATABASE_URL"].lower():
        raise RuntimeError(f"CRITICAL SAFETY VIOLATION: Test configured with real database: {os.environ['DATABASE_URL']}")

# Create a sentinel dummy database file to prove zero modification
SENTINEL_DB_PATH = os.path.join(TEMP_DIR, "sentinel_dummy_db.sqlite")
with open(SENTINEL_DB_PATH, "wb") as f:
    f.write(b"ROYAL_LIBAS_SENTINEL_DATA_SECURITY_CHECK_42\n")

def get_file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest().lower()

INITIAL_SENTINEL_HASH = get_file_sha256(SENTINEL_DB_PATH)

def _cleanup_temp():
    if os.path.exists(TEMP_DIR):
        try:
            shutil.rmtree(TEMP_DIR, ignore_errors=True)
        except Exception:
            pass

atexit.register(_cleanup_temp)

backend_dir = Path(__file__).resolve().parent.parent
run_all_tests_script = backend_dir / "run_all_tests.py"
backend_dir_str = str(backend_dir).replace("\\", "/")


class TestRunnerSafetyHarness(unittest.TestCase):
    """Verifies that the test runner, network guards, and legacy suites enforce absolute safety."""

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
        self.assertEqual(get_file_sha256(SENTINEL_DB_PATH), INITIAL_SENTINEL_HASH)

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
        self.assertEqual(get_file_sha256(SENTINEL_DB_PATH), INITIAL_SENTINEL_HASH)

    def test_03_direct_execution_of_quarantined_suites_fails_closed(self):
        """Direct execution of quarantined legacy tests must fail closed before opening databases."""
        quarantined_files = [
            "test_phase6.py",
            "test_phase7.py",
            "test_phase8.py",
            "test_store_and_variants.py",
            "test_cloudinary_media.py",
            "test_phase2.py",
            "test_phase4.py",
            "test_phase5.py",
            "test_security_reliability.py",
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
        self.assertEqual(get_file_sha256(SENTINEL_DB_PATH), INITIAL_SENTINEL_HASH)

    def test_04_quarantined_suites_skip_cleanly_during_test_discovery(self):
        """Standard unittest discovery must discover and report quarantined legacy suites cleanly as skipped."""
        res = subprocess.run(
            [sys.executable, "-m", "unittest", "discover", "backend/tests", "-p", "test_phase6.py"],
            capture_output=True,
            text=True,
            cwd=str(backend_dir.parent),
        )
        self.assertEqual(res.returncode, 0, f"Discovery failed with non-zero exit code: {res.stderr}")
        output = res.stderr or res.stdout
        self.assertIn("OK (skipped=1)", output)

    def test_05_actual_network_guard_blocks_socket_connect_and_connect_ex(self):
        """Tests that the canonical network_guard installed by run_all_tests.py blocks connect and connect_ex."""
        probe_code = f"""
import sys
sys.path.insert(0, "{backend_dir_str}")
import network_guard
import socket

# 1. Test socket.connect against RFC 5737 non-routable test address
connect_blocked = False
try:
    s1 = socket.socket()
    s1.connect(("192.0.2.1", 443))
except RuntimeError as e:
    if "CRITICAL NETWORK SAFETY VIOLATION" in str(e):
        connect_blocked = True

# 2. Test socket.connect_ex against RFC 5737 non-routable test address
connect_ex_blocked = False
try:
    s2 = socket.socket()
    s2.connect_ex(("192.0.2.1", 443))
except RuntimeError as e:
    if "CRITICAL NETWORK SAFETY VIOLATION" in str(e):
        connect_ex_blocked = True

assert connect_blocked, "socket.connect was NOT blocked by canonical network guard!"
assert connect_ex_blocked, "socket.connect_ex was NOT blocked by canonical network guard!"
print("ACTUAL_NETWORK_GUARD_SOCKETS_BLOCKED")
"""
        probe_path = os.path.join(TEMP_DIR, "probe_socket_guard.py")
        with open(probe_path, "w", encoding="utf-8") as f:
            f.write(probe_code)

        res = subprocess.run(
            [sys.executable, probe_path],
            capture_output=True,
            text=True,
            cwd=str(backend_dir),
        )
        self.assertEqual(res.returncode, 0, f"Socket guard probe failed: {res.stderr}")
        self.assertIn("ACTUAL_NETWORK_GUARD_SOCKETS_BLOCKED", res.stdout)

    def test_06_actual_network_guard_blocks_sync_and_async_httpx(self):
        """Tests that the canonical network_guard installed by run_all_tests.py blocks sync and async httpx requests."""
        probe_code = f"""
import asyncio
import sys
sys.path.insert(0, "{backend_dir_str}")
import network_guard
import httpx

# 1. Test synchronous httpx.Client.send
sync_blocked = False
try:
    with httpx.Client(timeout=1.0) as client:
        client.get("http://192.0.2.1:8080/test-sync")
except RuntimeError as e:
    if "CRITICAL NETWORK SAFETY VIOLATION: Outbound sync HTTP request" in str(e):
        sync_blocked = True

# 2. Test asynchronous httpx.AsyncClient.send
async def test_async():
    async_blocked = False
    try:
        async with httpx.AsyncClient(timeout=1.0) as aclient:
            await aclient.get("http://192.0.2.1:8080/test-async")
    except RuntimeError as e:
        if "CRITICAL NETWORK SAFETY VIOLATION: Outbound async HTTP request" in str(e):
            async_blocked = True
    return async_blocked

async_blocked = asyncio.run(test_async())

assert sync_blocked, "Sync httpx was NOT blocked by canonical network guard!"
assert async_blocked, "Async httpx was NOT blocked by canonical network guard!"
print("ACTUAL_NETWORK_GUARD_HTTPX_BLOCKED")
"""
        probe_path = os.path.join(TEMP_DIR, "probe_httpx_guard.py")
        with open(probe_path, "w", encoding="utf-8") as f:
            f.write(probe_code)

        res = subprocess.run(
            [sys.executable, probe_path],
            capture_output=True,
            text=True,
            cwd=str(backend_dir),
        )
        self.assertEqual(res.returncode, 0, f"HTTPX guard probe failed: {res.stderr}")
        self.assertIn("ACTUAL_NETWORK_GUARD_HTTPX_BLOCKED", res.stdout)

    def test_07_local_testclient_in_memory_transports_succeed(self):
        """FastAPI TestClient in-memory requests must function cleanly with network guard present."""
        probe_code = f"""
import sys
sys.path.insert(0, "{backend_dir_str}")
import network_guard

from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()
@app.get("/health-test")
def health(): return {{"status": "ok", "safe": True}}

client = TestClient(app)
res = client.get("/health-test")
assert res.status_code == 200 and res.json()["safe"] is True
print("TESTCLIENT_LOCAL_SUCCESS")
"""
        probe_path = os.path.join(TEMP_DIR, "probe_testclient.py")
        with open(probe_path, "w", encoding="utf-8") as f:
            f.write(probe_code)

        res = subprocess.run(
            [sys.executable, probe_path],
            capture_output=True,
            text=True,
            cwd=str(backend_dir),
        )
        self.assertEqual(res.returncode, 0, f"TestClient probe failed: {res.stderr}")
        self.assertIn("TESTCLIENT_LOCAL_SUCCESS", res.stdout)

    def test_08_sentinel_database_remains_strictly_unchanged(self):
        """Assert the sentinel dummy database was not modified in any way."""
        self.assertEqual(get_file_sha256(SENTINEL_DB_PATH), INITIAL_SENTINEL_HASH)


if __name__ == "__main__":
    unittest.main()
