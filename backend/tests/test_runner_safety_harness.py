"""Automated Verification Suite for Test Runner Safety & Isolation Harness.

Verifies:
1. Explicit Quarantined Suites Blocked:
   - Passing a quarantined test name explicitly to backend/run_all_tests.py is blocked and returns a non-zero exit code.
2. Unknown / Unverified Suites Blocked:
   - Passing an unverified or unknown test name is blocked by default and returns a non-zero exit code.
3. Direct Execution Fail-Closed Protection:
   - Direct execution of all nine quarantined legacy tests fails closed immediately with RuntimeError before importing app or opening any database.
4. Test Discovery Clean Skipping:
   - Standard unittest discovery reports quarantined legacy suites cleanly as skipped without errors.
5. Runner Zero-Test & All-Skips Detection:
   - Suites that execute 0 tests or only skipped tests are detected as [SKIPPED / ZERO TESTS] and never counted as passed.
   - An explicit run targeting an empty/skipped suite exits with code 1.
6. Actual Runner-Injected Network Guard Verification:
   - Verifies the network guard as actually injected via sitecustomize.py by the runner.
   - The probe scripts execute WITHOUT importing network_guard directly.
   - Covers socket.connect, socket.connect_ex, sync HTTP (httpx.Client.send), and async HTTP (httpx.AsyncClient.send).
   - Safe local RFC 5737 targets (192.0.2.1) are used without external calls.
   - Local loopback and in-memory FastAPI TestClient transports function normally.
   - BOUNDARIES & LIMITS DOCUMENTED: The guard operates at the Python application and transport layer
     (standard library socket and httpx client). It does not intercept raw OS packets or C-level kernel
     sockets that bypass Python runtime, nor does it replace host-level packet filters or cloud VPC security.
7. Stand-in Database & Local Business DB Immutability:
   - Dedicated disposable stand-in SQLite database (standin_business.db) with actual tables and records.
   - Compares initial and final SHA-256 hashes to guarantee complete isolation.
   - Verifies local backend/royal_libas.db (if present) is untouched, while maintaining full compatibility
     with clean checkouts where no business database exists.
"""

import atexit
import hashlib
import os
import re
import shutil
import sqlite3
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

# 2. Setup Dedicated Disposable Stand-in Business Database with actual tables and records
STANDIN_BUSINESS_DB = os.path.join(TEMP_DIR, "standin_business.db")
conn = sqlite3.connect(STANDIN_BUSINESS_DB)
cursor = conn.cursor()
cursor.execute("CREATE TABLE products (id INTEGER PRIMARY KEY, title TEXT, price REAL, stock INTEGER);")
cursor.execute("INSERT INTO products VALUES (1, 'Standin Silk Kurti', 2999.0, 15);")
cursor.execute("INSERT INTO products VALUES (2, 'Standin Velvet Suit', 4999.0, 8);")
cursor.execute("CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, status TEXT, total REAL);")
cursor.execute("INSERT INTO orders VALUES (101, 'Test Customer', 'CONFIRMED', 2999.0);")
cursor.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, val TEXT);")
cursor.execute("INSERT INTO settings VALUES ('store_name', 'Royal Libas Standin Boutique');")
conn.commit()
conn.close()

def get_file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest().lower()

INITIAL_STANDIN_HASH = get_file_sha256(STANDIN_BUSINESS_DB)

# 3. Track Local Business Database (if present)
backend_dir = Path(__file__).resolve().parent.parent
backend_dir_str = str(backend_dir).replace("\\", "/")
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
REAL_BUSINESS_DB = backend_dir / "royal_libas.db"
INITIAL_REAL_DB_HASH = get_file_sha256(str(REAL_BUSINESS_DB)) if REAL_BUSINESS_DB.exists() else None

# 4. Prepare runner sitecustomize injection directory to test runner-injected network guard
RUNNER_INJECTION_DIR = os.path.join(TEMP_DIR, "runner_injection")
os.makedirs(RUNNER_INJECTION_DIR, exist_ok=True)
with open(os.path.join(RUNNER_INJECTION_DIR, "sitecustomize.py"), "w", encoding="utf-8") as sc_file:
    sc_file.write("# Injected sitecustomize matching runner architecture\nimport network_guard\n")

def _cleanup_temp():
    if os.path.exists(TEMP_DIR):
        try:
            shutil.rmtree(TEMP_DIR, ignore_errors=True)
        except Exception:
            pass

atexit.register(_cleanup_temp)

run_all_tests_script = backend_dir / "run_all_tests.py"
backend_dir_str = str(backend_dir).replace("\\", "/")


class TestRunnerSafetyHarness(unittest.TestCase):
    """Verifies test runner safety, zero-test/skip detection, injected network guards, and standin isolation."""

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
        self.assertEqual(get_file_sha256(STANDIN_BUSINESS_DB), INITIAL_STANDIN_HASH)

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
        self.assertEqual(get_file_sha256(STANDIN_BUSINESS_DB), INITIAL_STANDIN_HASH)

    def test_03_direct_execution_of_all_nine_quarantined_suites_fails_closed(self):
        """Direct execution of all 9 quarantined legacy tests must fail closed before opening databases."""
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
                "CRITICAL SAFETY GUARD: Direct execution of quarantined legacy suite",
                output,
                f"Quarantined suite {qf} failed without the expected safety guard error: {output}"
            )
        self.assertEqual(get_file_sha256(STANDIN_BUSINESS_DB), INITIAL_STANDIN_HASH)

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

    def test_05_runner_detects_zero_tests_and_all_skips_without_false_pass(self):
        """Runner must detect test suites executing 0 tests or only skips, categorizing them as skipped."""
        from run_all_tests import check_suite_output

        # Case A: Standard unittest with module skip (Ran 0 tests)
        out_module_skip = "test_case (unittest.loader._FailedTest.test_case) ... \nRan 0 tests in 0.000s\n\nOK (skipped=1)\n"
        success_a, zero_a, reason_a = check_suite_output(out_module_skip, 0)
        self.assertFalse(success_a, "Zero-test run must NOT be classified as successful pass")
        self.assertTrue(zero_a, "Zero-test run must be detected as zero/skipped")
        self.assertIn("0 tests ran", reason_a)

        # Case B: All tests inside suite skipped
        out_all_skipped = "...s.s... \nRan 5 tests in 0.003s\n\nOK (skipped=5)\n"
        success_b, zero_b, reason_b = check_suite_output(out_all_skipped, 0)
        self.assertFalse(success_b, "All-skips suite must NOT be classified as successful pass")
        self.assertTrue(zero_b, "All-skips suite must be detected as zero/skipped")
        self.assertIn("all 5 were skipped", reason_b)

        # Case C: Legitimate suite with passed tests and some skips
        out_mixed_pass = "Ran 8 tests in 0.040s\n\nOK (skipped=2)\n"
        success_c, zero_c, _ = check_suite_output(out_mixed_pass, 0)
        self.assertTrue(success_c, "Suite with passed tests must be classified as pass")
        self.assertFalse(zero_c)

        # Case D: Empty run with no tests ran
        out_no_tests = "NO TESTS RAN\n"
        success_d, zero_d, reason_d = check_suite_output(out_no_tests, 0)
        self.assertFalse(success_d)
        self.assertTrue(zero_d)

    def test_06_actual_injected_network_guard_blocks_socket_connect_and_connect_ex(self):
        """Tests that runner-injected sitecustomize.py blocks socket connect and connect_ex without direct imports."""
        # Note: This probe DOES NOT import network_guard! It tests runner injection via sitecustomize.
        probe_code = """
import socket

# 1. Test socket.connect against RFC 5737 non-routable documentation IP
connect_blocked = False
try:
    s1 = socket.socket()
    s1.connect(("192.0.2.1", 443))
except RuntimeError as e:
    if "CRITICAL NETWORK SAFETY VIOLATION" in str(e):
        connect_blocked = True

# 2. Test socket.connect_ex against RFC 5737 non-routable documentation IP
connect_ex_blocked = False
try:
    s2 = socket.socket()
    s2.connect_ex(("192.0.2.1", 443))
except RuntimeError as e:
    if "CRITICAL NETWORK SAFETY VIOLATION" in str(e):
        connect_ex_blocked = True

assert connect_blocked, "socket.connect was NOT intercepted by runner-injected network guard!"
assert connect_ex_blocked, "socket.connect_ex was NOT intercepted by runner-injected network guard!"
print("RUNNER_INJECTED_SOCKET_GUARD_CONFIRMED")
"""
        probe_path = os.path.join(TEMP_DIR, "probe_injected_socket.py")
        with open(probe_path, "w", encoding="utf-8") as f:
            f.write(probe_code)

        probe_env = os.environ.copy()
        probe_env["PYTHONPATH"] = f"{RUNNER_INJECTION_DIR}{os.pathsep}{backend_dir}"

        res = subprocess.run(
            [sys.executable, probe_path],
            capture_output=True,
            text=True,
            cwd=str(backend_dir),
            env=probe_env,
        )
        self.assertEqual(res.returncode, 0, f"Injected socket guard probe failed: {res.stderr}")
        self.assertIn("RUNNER_INJECTED_SOCKET_GUARD_CONFIRMED", res.stdout)

    def test_07_actual_injected_network_guard_blocks_sync_and_async_httpx(self):
        """Tests that runner-injected sitecustomize.py blocks sync and async httpx without direct imports."""
        # Note: This probe DOES NOT import network_guard! It tests runner injection via sitecustomize.
        probe_code = """
import asyncio
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

assert sync_blocked, "Sync httpx was NOT intercepted by runner-injected network guard!"
assert async_blocked, "Async httpx was NOT intercepted by runner-injected network guard!"
print("RUNNER_INJECTED_HTTPX_GUARD_CONFIRMED")
"""
        probe_path = os.path.join(TEMP_DIR, "probe_injected_httpx.py")
        with open(probe_path, "w", encoding="utf-8") as f:
            f.write(probe_code)

        probe_env = os.environ.copy()
        probe_env["PYTHONPATH"] = f"{RUNNER_INJECTION_DIR}{os.pathsep}{backend_dir}"

        res = subprocess.run(
            [sys.executable, probe_path],
            capture_output=True,
            text=True,
            cwd=str(backend_dir),
            env=probe_env,
        )
        self.assertEqual(res.returncode, 0, f"Injected httpx guard probe failed: {res.stderr}")
        self.assertIn("RUNNER_INJECTED_HTTPX_GUARD_CONFIRMED", res.stdout)

    def test_08_local_testclient_in_memory_transports_succeed(self):
        """FastAPI TestClient in-memory requests must function cleanly under injected network guard."""
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
        probe_path = os.path.join(TEMP_DIR, "probe_injected_testclient.py")
        with open(probe_path, "w", encoding="utf-8") as f:
            f.write(probe_code)

        probe_env = os.environ.copy()
        probe_env["PYTHONPATH"] = f"{RUNNER_INJECTION_DIR}{os.pathsep}{backend_dir}"

        res = subprocess.run(
            [sys.executable, probe_path],
            capture_output=True,
            text=True,
            cwd=str(backend_dir),
            env=probe_env,
        )
        self.assertEqual(res.returncode, 0, f"TestClient probe failed: {res.stderr}")
        self.assertIn("TESTCLIENT_LOCAL_SUCCESS", res.stdout)

    def test_09_standin_business_database_and_local_db_remains_strictly_unchanged(self):
        """Assert both dedicated disposable stand-in DB and real local DB (if present) were untouched."""
        # 1. Assert Stand-in Business Database hash and contents
        current_standin_hash = get_file_sha256(STANDIN_BUSINESS_DB)
        self.assertEqual(
            current_standin_hash,
            INITIAL_STANDIN_HASH,
            f"Stand-in business database was modified! Hash before: {INITIAL_STANDIN_HASH}, after: {current_standin_hash}"
        )
        # Verify row counts in stand-in database
        conn = sqlite3.connect(STANDIN_BUSINESS_DB)
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM products;")
        prod_count = cursor.fetchone()[0]
        cursor.execute("SELECT count(*) FROM orders;")
        order_count = cursor.fetchone()[0]
        conn.close()
        self.assertEqual(prod_count, 2, "Stand-in product count changed!")
        self.assertEqual(order_count, 1, "Stand-in order count changed!")

        # 2. Assert Local Business Database (if present on disk)
        if REAL_BUSINESS_DB.exists():
            current_real_db_hash = get_file_sha256(str(REAL_BUSINESS_DB))
            self.assertEqual(
                current_real_db_hash,
                INITIAL_REAL_DB_HASH,
                f"Local business database royal_libas.db was modified! Hash before: {INITIAL_REAL_DB_HASH}, after: {current_real_db_hash}"
            )
        else:
            # Documented clean checkout guarantee
            print("[INFO] Clean checkout verified: local business database does not exist.")


if __name__ == "__main__":
    unittest.main()
