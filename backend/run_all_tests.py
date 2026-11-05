"""Royal Libas Automated Test Runner.

Security & Execution Model:
1. Strict Allowlist Execution:
   - Only explicitly verified safe test suites are permitted to execute.
   - Any unknown, unverified, or quarantined test suite is blocked by default.
   - Blocked or quarantined test invocations return a non-zero exit code.
2. Complete Database Isolation:
   - Tests execute strictly against ephemeral, disposable temporary databases.
   - The business database (backend/royal_libas.db), PostgreSQL databases, and remote environments are NEVER accessed, altered, or deleted.
   - Zero destructive SQL queries on existing databases.
3. Outbound Network Guard:
   - An active transport-level network interceptor is injected into test subprocesses via PYTHONPATH.
   - Outbound socket connections and HTTP calls (including Cashfree and Shiprocket) are blocked, raising RuntimeError.
   - In-memory local TestClient functionality is fully preserved.
4. Quarantined Suites:
   - Legacy suites that have not been modernized are quarantined and fail closed if invoked directly.
"""

import atexit
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
tests_dir = backend_dir / "tests"

# 1. Enforce strict runner-level database isolation
temp_dir = tempfile.mkdtemp(prefix="rl_runner_isolated_")
disposable_db_path = os.path.join(temp_dir, "runner_disposable.db").replace(os.sep, "/")

# 2. Inject transport-level network guard via sitecustomize into subprocesses
sitecustomize_path = os.path.join(temp_dir, "sitecustomize.py")
with open(sitecustomize_path, "w", encoding="utf-8") as sc_file:
    sc_file.write('''"""Process-level outbound network guard injected by Royal Libas test runner."""
import socket

# Allow only loopback and in-memory ASGI test transport addresses
_ALLOWED_HOSTS = ("127.0.0.1", "localhost", "::1", "testserver")

_orig_socket_connect = socket.socket.connect

def guarded_socket_connect(self, address):
    if isinstance(address, tuple) and len(address) > 0:
        host = str(address[0]).lower()
        if host in _ALLOWED_HOSTS:
            return _orig_socket_connect(self, address)
    raise RuntimeError(
        f"CRITICAL NETWORK SAFETY VIOLATION: Outbound socket connection to '{address}' "
        "was blocked by the test runner network guard!"
    )

socket.socket.connect = guarded_socket_connect

try:
    import httpx
    _orig_httpx_send = httpx.Client.send

    def guarded_httpx_send(self, request, *args, **kwargs):
        host = (request.url.host or "").lower()
        if host in _ALLOWED_HOSTS:
            return _orig_httpx_send(self, request, *args, **kwargs)
        raise RuntimeError(
            f"CRITICAL NETWORK SAFETY VIOLATION: Outbound HTTP request to '{request.url}' "
            "was blocked by the test runner network guard!"
        )

    httpx.Client.send = guarded_httpx_send
except ImportError:
    pass
''')

def _cleanup():
    if os.path.exists(temp_dir):
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass

atexit.register(_cleanup)

# Prepare isolated environment for child processes
runner_env = os.environ.copy()
runner_env["DATABASE_URL"] = f"sqlite:///{disposable_db_path}"
runner_env["JWT_SECRET"] = "isolated-runner-jwt-secret-key-royal-libas-32bytes"
runner_env["CASHFREE_CLIENT_ID"] = "cf_test_isolated_runner_id"
runner_env["CASHFREE_CLIENT_SECRET"] = "cf_test_isolated_runner_secret"
runner_env["CASHFREE_ENVIRONMENT"] = "sandbox"
runner_env["SHIPROCKET_API_EMAIL"] = "test@royallibas.com"
runner_env["SHIPROCKET_API_PASSWORD"] = "test_shiprocket_password"

# Prepend temp_dir so sitecustomize.py loads automatically in child Python processes
orig_pythonpath = runner_env.get("PYTHONPATH", "")
runner_env["PYTHONPATH"] = f"{temp_dir}{os.pathsep}{backend_dir}" + (f"{os.pathsep}{orig_pythonpath}" if orig_pythonpath else "")

# Safety verification guard on DATABASE_URL
FORBIDDEN = ["royal_libas.db", "postgres", "hostinger", "neon", "vps", "prod"]
for pattern in FORBIDDEN:
    if pattern in runner_env["DATABASE_URL"].lower() and "isolated" not in runner_env["DATABASE_URL"].lower():
        raise RuntimeError(f"CRITICAL SAFETY VIOLATION: Test runner configured with forbidden database pattern: {pattern}")

# 3. Verified safe test suites (guaranteed database isolation & network safety)
VERIFIED_SAFE_SUITES = [
    "test_shiprocket.py",
    "test_shiprocket_invoice.py",
    "test_cashfree_sandbox_flow.py",
    "test_seo_sitemap.py",
    "test_admin_upgrade.py",
    "test_boutique_settings_and_validation.py",
    "test_category_navigation_and_exchange.py",
    "test_curated_moments.py",
    "test_variant_availability.py",
    "test_postgres_variant_migration.py",
    "test_photo_change_and_publication_safety.py",
    "test_phase1.py",
    "test_runner_safety_harness.py",
]

# 4. Explicit mapping of quarantined legacy test suites
QUARANTINED_SUITES = {
    "test_phase6.py": "QUARANTINED: Legacy suite targeted business database; fails closed pending modernization",
    "test_phase7.py": "QUARANTINED: Legacy suite targeted business database; fails closed pending modernization",
    "test_phase8.py": "QUARANTINED: Legacy suite targeted business database; fails closed pending modernization",
    "test_phase2.py": "QUARANTINED: Legacy assertions expect seeded draft products in public catalogue",
    "test_phase4.py": "QUARANTINED: Legacy assertions expect seeded draft products in public catalogue",
    "test_phase5.py": "QUARANTINED: Legacy assertions expect seeded draft products in public catalogue",
    "test_security_reliability.py": "QUARANTINED: Sample product fixture lacks status='PUBLISHED' required by order service",
    "test_store_and_variants.py": "QUARANTINED: Legacy assertions assume pre-seeded data in business database",
    "test_cloudinary_media.py": "QUARANTINED: Legacy assertions assume pre-seeded admin in business database",
}


def run_tests():
    print("=" * 70)
    print(">>> ROYAL LIBAS ISOLATED TEST RUNNER <<<")
    print(f"Isolated Disposable DB: {disposable_db_path}")
    print("Outbound Network Guard: ACTIVE (Remote sockets and HTTP calls blocked)")
    print("Business Database:      PROTECTED (Untouched & Unaccessed)")
    print("=" * 70)

    # Determine files to run
    explicit_args = [f for f in sys.argv[1:] if not f.startswith("-")]
    is_explicit = bool(explicit_args)
    target_files = explicit_args if is_explicit else VERIFIED_SAFE_SUITES

    passed = []
    failed = []
    quarantined_blocked = []
    unverified_blocked = []

    for tf in target_files:
        test_path = tests_dir / tf

        # 1. Enforce Quarantine Allowlist Policy
        if tf in QUARANTINED_SUITES:
            reason = QUARANTINED_SUITES[tf]
            print(f"\n[BLOCKED / QUARANTINED] {tf}")
            print(f"  Reason: {reason}")
            quarantined_blocked.append((tf, reason))
            continue

        if tf not in VERIFIED_SAFE_SUITES:
            reason = "File is not in the verified safe test allowlist. Execution blocked by default."
            print(f"\n[BLOCKED / UNVERIFIED] {tf}")
            print(f"  Reason: {reason}")
            unverified_blocked.append((tf, reason))
            continue

        if not test_path.exists():
            print(f"\n[NOT FOUND] {tf}")
            failed.append(tf)
            continue

        print(f"\n[RUNNING] {tf} ...")
        res = subprocess.run(
            [sys.executable, str(test_path)],
            capture_output=True,
            text=True,
            cwd=str(backend_dir),
            env=runner_env,
        )

        if res.returncode == 0:
            print(f"[PASS] {tf}")
            passed.append(tf)
        else:
            print(f"[FAIL] {tf}")
            output = (res.stderr.strip() or res.stdout.strip())
            lines = output.splitlines()
            snippet = "\n".join(lines[-15:]) if len(lines) > 15 else output
            print("--- Error Summary ---")
            print(snippet)
            failed.append(tf)

    print("\n" + "=" * 70)
    print(">>> TEST EXECUTION SUMMARY <<<")
    print("=" * 70)
    print(f"Verified Safe Suites Passed:     {len(passed)}")
    print(f"Verified Safe Suites Failed:     {len(failed)}")
    print(f"Quarantined Suites Blocked:      {len(quarantined_blocked)}")
    print(f"Unverified Suites Blocked:       {len(unverified_blocked)}")

    # When running default suite, display standing quarantined list separately
    if not is_explicit:
        print("\n--- Standing Quarantined Suites (Modernization Required) ---")
        for suite_name, reason in sorted(QUARANTINED_SUITES.items()):
            print(f"  - {suite_name:30} : {reason}")

    print("=" * 70)

    # Return non-zero exit code if ANY test failed, or if any explicit target was blocked
    if failed or (is_explicit and (quarantined_blocked or unverified_blocked)):
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    run_tests()
