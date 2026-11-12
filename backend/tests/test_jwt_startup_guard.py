"""Isolated Startup Security Test Suite for JWT_SECRET Configuration Guard.

Verifies:
1. Valid strong secrets succeed across unset (VPS), production, staging, local dev, and isolated Postgres CI modes.
2. Missing, empty, whitespace-only, known default, placeholder, and clearly weak secrets fail closed.
3. Accidentally set development/test flags cannot bypass JWT validation or coexist with production indicators.
4. Loopback PostgreSQL (e.g., CI TEST_POSTGRES_URL) is NOT misclassified as production.
5. Conflicting APP_ENV / ENV configurations fail closed.
6. Error messages and startup output never expose secret values, substrings, hashes, or secret lengths.
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

# Setup isolated disposable SQLite database and explicit test secret BEFORE importing app modules
_TEMP_DIR = tempfile.mkdtemp(prefix="rl_jwt_guard_isolated_")
_ISOLATED_DB_PATH = os.path.join(_TEMP_DIR, "isolated_jwt_guard.db").replace(os.sep, "/")
os.environ["DATABASE_URL"] = f"sqlite:///{_ISOLATED_DB_PATH}"
os.environ.setdefault("JWT_SECRET", "isolated-test-jwt-secret-key-startup-guard-32b")


def _cleanup_temp():
    if os.path.exists(_TEMP_DIR):
        try:
            shutil.rmtree(_TEMP_DIR, ignore_errors=True)
        except Exception:
            pass


atexit.register(_cleanup_temp)

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.config import (  # noqa: E402
    is_cashfree_configured,
    is_shiprocket_configured,
    resolve_environment_mode,
    validate_jwt_secret,
    validate_jwt_startup_config,
)


VALID_TEST_SECRET_A = "rl-prod-guard-valid-test-secret-9f8e7d6c5b4a"
VALID_TEST_SECRET_HEX32 = "a1b2c3d4e5f60718293a4b5c6d7e8f90"


class TestJwtStartupGuard(unittest.TestCase):
    """Isolated tests for fail-closed JWT startup validation and environment strategy."""

    def _run_clean_import(
        self,
        env_overrides: dict,
        import_main: bool = False,
        temp_dotenv_content: str | None = None,
    ) -> subprocess.CompletedProcess:
        """Import app.config (and optionally app.main) in an isolated subprocess without reading repo .env."""
        clean_env = {
            key: val
            for key, val in os.environ.items()
            if key in ("PATH", "SYSTEMROOT", "COMSPEC", "WINDIR", "TMP", "TEMP", "HOME", "LANG", "LC_ALL")
        }
        clean_env["DATABASE_URL"] = f"sqlite:///{_ISOLATED_DB_PATH}"
        clean_env["PYTHONPATH"] = str(backend_dir)
        for k, v in env_overrides.items():
            if v is None:
                clean_env.pop(k, None)
            else:
                clean_env[k] = v

        temp_dotenv_path = ""
        if temp_dotenv_content is not None:
            fd, temp_dotenv_path = tempfile.mkstemp(prefix="rl_test_env_", suffix=".env", dir=_TEMP_DIR)
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(temp_dotenv_content)

        script = f"""
import sys
from unittest.mock import patch
import dotenv

temp_dotenv = {temp_dotenv_path!r}
def _isolated_load_dotenv(*args, **kwargs):
    if temp_dotenv:
        return dotenv.dotenv_values and _orig_load(temp_dotenv, **{{k: v for k, v in kwargs.items() if k != 'dotenv_path'}})
    return False

_orig_load = dotenv.load_dotenv
with patch("dotenv.load_dotenv", side_effect=lambda *a, **kw: _orig_load(temp_dotenv, **kw) if temp_dotenv else False):
    import app.config as cfg
    assert cfg.JWT_SECRET
    if {import_main!r}:
        from fastapi.testclient import TestClient
        import app.main as main_mod
        from app.auth import create_access_token
        token = create_access_token({{"sub": "1"}})
        assert isinstance(token, str) and len(token) > 20
        client = TestClient(main_mod.app)
        res = client.get("/health")
        assert res.status_code == 200
print("SUBPROCESS_STARTUP_OK")
"""
        return subprocess.run(
            [sys.executable, "-c", script],
            env=clean_env,
            capture_output=True,
            text=True,
            cwd=_TEMP_DIR,
        )

    def _assert_no_secret_leak(self, text: str, secret: str):
        if not secret:
            return
        self.assertNotIn(secret, text)
        digest = hashlib.sha256(secret.encode("utf-8")).hexdigest()
        self.assertNotIn(digest, text.lower())
        if len(secret) >= 6:
            self.assertNotIn(secret[:6], text)
            self.assertNotIn(secret[-6:], text)
        # Ensure exact non-32 length numbers (like 17 or 29) are not leaked in messages
        if len(secret) != 32:
            self.assertNotIn(str(len(secret)), text)

    def test_01_valid_vps_simulation_unset_env_postgres_sandbox_cashfree_succeeds(self):
        """Actual VPS state (APP_ENV=unset, ENV=unset, CASHFREE_ENVIRONMENT=sandbox, Postgres) must pass with strong secret."""
        env = {
            "CASHFREE_ENVIRONMENT": "sandbox",
            "DATABASE_URL": "postgresql+psycopg2://user:pass@ep-demo.us-east-2.aws.neon.tech/royal_libas",
            "JWT_SECRET": VALID_TEST_SECRET_A,
        }
        self.assertEqual(resolve_environment_mode(env), "unset")
        self.assertEqual(validate_jwt_startup_config(env), VALID_TEST_SECRET_A)

    def test_02_valid_isolated_subprocess_full_app_and_auth_roundtrip(self):
        """Clean subprocess import of app.config + app.main + FastAPI /health + JWT signing passes with valid secret."""
        res = self._run_clean_import(
            {
                "APP_ENV": None,
                "ENV": None,
                "CASHFREE_ENVIRONMENT": "sandbox",
                "JWT_SECRET": VALID_TEST_SECRET_A,
            },
            import_main=True,
        )
        self.assertEqual(res.returncode, 0, f"Valid startup failed:\nSTDOUT:{res.stdout}\nSTDERR:{res.stderr}")
        self.assertIn("SUBPROCESS_STARTUP_OK", res.stdout)
        self._assert_no_secret_leak(res.stdout + res.stderr, VALID_TEST_SECRET_A)

    def test_03_valid_dotenv_loaded_secret_without_app_env_succeeds(self):
        """Simulated backend/.env loading with unset APP_ENV/ENV succeeds cleanly."""
        res = self._run_clean_import(
            {"APP_ENV": None, "ENV": None, "JWT_SECRET": None},
            temp_dotenv_content=f"CASHFREE_ENVIRONMENT=sandbox\nJWT_SECRET={VALID_TEST_SECRET_HEX32}\n",
        )
        self.assertEqual(res.returncode, 0, f"Dotenv startup failed:\nSTDOUT:{res.stdout}\nSTDERR:{res.stderr}")
        self.assertIn("SUBPROCESS_STARTUP_OK", res.stdout)

    def test_04_missing_empty_whitespace_jwt_secret_fails_closed(self):
        """Missing, empty, and whitespace-only JWT_SECRET must fail closed in unset, production, and dev modes."""
        for mode_env in ({}, {"APP_ENV": "production"}, {"APP_ENV": "development"}):
            for bad_secret in (None, "", "   ", "\t\n   " + " " * 36):
                env = {**mode_env}
                if bad_secret is not None:
                    env["JWT_SECRET"] = bad_secret
                with self.assertRaises(RuntimeError, msg=f"Should fail for mode={mode_env}, secret={bad_secret!r}"):
                    validate_jwt_startup_config(env)

        proc = self._run_clean_import({"APP_ENV": None, "ENV": None, "JWT_SECRET": None})
        self.assertNotEqual(proc.returncode, 0)
        self.assertNotIn("SUBPROCESS_STARTUP_OK", proc.stdout)

    def test_05_known_defaults_and_placeholders_fail_closed(self):
        """Known fallback default and placeholders must fail closed everywhere."""
        placeholders = [
            "royal_libas_dev_secret_key_change_in_prod",
            "YOUR_JWT_SECRET_HERE",
            "your_jwt_secret_here",
            "YOUR_CUSTOM_SECRET_VALUE_HERE",
            "changeme",
            "sentinel_placeholder_long_secret_string_for_testing_1234",
            "sentinel_change_in_prod_long_secret_string_value_1234",
        ]
        for secret in placeholders:
            for env in ({}, {"APP_ENV": "production"}, {"APP_ENV": "development"}):
                test_env = {**env, "JWT_SECRET": secret}
                with self.assertRaises(RuntimeError) as ctx:
                    validate_jwt_startup_config(test_env)
                self._assert_no_secret_leak(str(ctx.exception), secret)

    def test_06_clearly_weak_and_low_entropy_secrets_fail_closed(self):
        """Short, padded, repetitive, and sequential secrets must be rejected without leaking secret/length."""
        weak_secrets = [
            "short123",
            "too-short-17chars",  # length 17
            "12345678901234567890123456789",  # length 29
            "   " + "shortsecret_only_19" + "   ",  # whitespace-padded
            "a" * 40,
            "0" * 64,
            "ab" * 20,
            "123456" * 7,
            "deadbeef" * 5,
            "01234567890123456789012345678901",
            "abcdefghijklmnopqrstuvwxyzabcdef",
        ]
        for weak in weak_secrets:
            with self.assertRaises(RuntimeError) as ctx:
                validate_jwt_secret(weak)
            self._assert_no_secret_leak(str(ctx.exception), weak.strip())

        probe_17 = "LeakyShortSecret7"  # 17 chars
        proc = self._run_clean_import({"JWT_SECRET": probe_17})
        self.assertNotEqual(proc.returncode, 0)
        self._assert_no_secret_leak(proc.stdout + proc.stderr, probe_17)

    def test_07_development_flag_cannot_bypass_or_coexist_with_prod_indicators(self):
        """Accidental dev/test flag must never allow weak secret or coexist with prod signals."""
        # Dev flag + weak secret -> blocked
        with self.assertRaises(RuntimeError):
            validate_jwt_startup_config({"APP_ENV": "development", "JWT_SECRET": "weak"})

        # Dev flag + strong secret + production indicators -> blocked
        prod_indicator_cases = [
            {"CASHFREE_ENVIRONMENT": "production"},
            {"FRONTEND_URL": "https://royallibasbytanya.com"},
            {"BACKEND_PUBLIC_URL": "https://api.royallibasbytanya.com"},
            {"BACKEND_URL": "https://royallibasbytanya.com"},
            {"DATABASE_URL": "postgresql+psycopg2://user:pass@ep-live.us-east-2.aws.neon.tech/royal_libas"},
        ]
        for extra in prod_indicator_cases:
            env = {"APP_ENV": "development", "JWT_SECRET": VALID_TEST_SECRET_A, **extra}
            with self.assertRaises(RuntimeError, msg=f"Dev flag bypassed prod check for {extra}"):
                validate_jwt_startup_config(env)

        # Deployed VPS filesystem path + dev flag -> blocked even with valid secret
        vps_path = Path("/var/www/royal-libas-releases/release-abcd1234/backend/app/config.py")
        with self.assertRaises(RuntimeError):
            validate_jwt_startup_config(
                {"APP_ENV": "development", "JWT_SECRET": VALID_TEST_SECRET_A},
                config_path=vps_path,
            )

    def test_08_conflicting_app_env_and_env_vars_fail_closed(self):
        """Disagreeing APP_ENV and ENV fail closed; synonymous prod/production succeed."""
        conflicts = [
            {"APP_ENV": "development", "ENV": "production"},
            {"APP_ENV": "production", "ENV": "development"},
            {"APP_ENV": "test", "ENV": "staging"},
            {"APP_ENV": "local", "ENV": "production"},
        ]
        for pair in conflicts:
            with self.assertRaises(RuntimeError):
                validate_jwt_startup_config({**pair, "JWT_SECRET": VALID_TEST_SECRET_A})

        # Equivalent synonyms normalize consistently without conflict
        self.assertEqual(
            resolve_environment_mode({"APP_ENV": "prod", "ENV": "production"}),
            "production",
        )
        self.assertEqual(
            resolve_environment_mode({"APP_ENV": "dev", "ENV": "development"}),
            "development",
        )

    def test_09_isolated_loopback_postgresql_is_allowed_in_test_and_dev_modes(self):
        """PostgreSQL on localhost/127.0.0.1 (CI TEST_POSTGRES_URL) must NOT be falsely rejected as production."""
        for mode in (None, "test", "testing", "development"):
            env = {
                "DATABASE_URL": "postgresql+psycopg2://test_user:test_password@127.0.0.1:5432/royal_libas_test_db",
                "CASHFREE_ENVIRONMENT": "sandbox",
                "JWT_SECRET": VALID_TEST_SECRET_A,
            }
            if mode is not None:
                env["APP_ENV"] = mode
            self.assertEqual(validate_jwt_startup_config(env), VALID_TEST_SECRET_A)

    def test_10_unknown_environment_value_fails_closed(self):
        """Unrecognized APP_ENV/ENV names remain fail-closed."""
        with self.assertRaises(RuntimeError):
            validate_jwt_startup_config({"APP_ENV": "preview_typo", "JWT_SECRET": "short"})
        self.assertEqual(
            validate_jwt_startup_config({"APP_ENV": "preview_typo", "JWT_SECRET": VALID_TEST_SECRET_A}),
            VALID_TEST_SECRET_A,
        )

    def test_11_cashfree_and_shiprocket_helpers_remain_callable(self):
        """Sanity check that Cashfree/Shiprocket configuration helpers remain intact."""
        self.assertIsInstance(is_cashfree_configured(), bool)
        self.assertIsInstance(is_shiprocket_configured(), bool)


if __name__ == "__main__":
    unittest.main(verbosity=2)
