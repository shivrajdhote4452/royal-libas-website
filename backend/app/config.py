import os
from pathlib import Path
from typing import Mapping, Optional
from urllib.parse import urlparse
from dotenv import load_dotenv

# Search for .env in current working dir, parent dir, or root
root_dir = Path(__file__).resolve().parent.parent.parent
dotenv_paths = [
    root_dir / ".env",
    Path(__file__).resolve().parent.parent / ".env",
    Path(".env"),
]
for p in dotenv_paths:
    if p.exists():
        load_dotenv(p)
        break


MIN_JWT_SECRET_LENGTH = 32

_ENV_CANONICAL_MAP = {
    "prod": "production",
    "production": "production",
    "staging": "staging",
    "stage": "staging",
    "dev": "development",
    "development": "development",
    "local": "local",
    "test": "test",
    "testing": "test",
}
_DEV_LIKE_MODES = frozenset({"development", "local", "test"})
_PRODUCTION_CASHFREE_MODES = frozenset({"production", "prod", "live"})
_PRODUCTION_DOMAIN_MARKERS = ("royallibasbytanya.com",)
_PRODUCTION_PATH_MARKERS = ("/var/www/royal-libas",)
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})

_KNOWN_WEAK_JWT_SECRETS = frozenset({
    "royal_libas_dev_secret_key_change_in_prod",
    "your_jwt_secret_here",
    "your-jwt-secret-here",
    "changeme",
    "change_me",
    "change-me",
    "secret",
    "jwt_secret",
    "jwt-secret",
    "default",
    "dev_secret",
    "dev-secret",
    "test_secret",
    "test-secret",
    "placeholder",
    "none",
    "null",
    "password",
    "admin",
    "royallibas",
    "royal_libas",
})
_PLACEHOLDER_PATTERNS = (
    "your_jwt_secret",
    "your-jwt-secret",
    "change_in_prod",
    "change-in-prod",
    "replace_me",
    "replace-me",
    "placeholder",
)
_SEQUENTIAL_PATTERNS = (
    "0123456789abcdefghijklmnopqrstuvwxyz",
    "abcdefghijklmnopqrstuvwxyz0123456789",
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789abcdef",
    "0123456789",
)


def _has_repeating_cycle(value: str, max_period: int = 12) -> bool:
    """Return True if value is a short repeating substring cycle."""
    length = len(value)
    upper = min(max_period, length // 2)
    for period in range(1, upper + 1):
        prefix = value[:period]
        if (prefix * ((length // period) + 1))[:length] == value:
            return True
    return False


def _detect_production_indicators(
    environ: Mapping[str, str],
    config_path: Optional[Path] = None,
) -> list[str]:
    """Identify runtime signals indicating a production deployment without assuming localhost Postgres is prod."""
    indicators: list[str] = []

    cashfree_env = (environ.get("CASHFREE_ENVIRONMENT") or "").strip().lower()
    if cashfree_env in _PRODUCTION_CASHFREE_MODES:
        indicators.append("cashfree_production")

    for var_name in ("FRONTEND_URL", "BACKEND_PUBLIC_URL", "BACKEND_URL"):
        url_val = (environ.get(var_name) or "").strip().lower()
        if url_val and any(domain in url_val for domain in _PRODUCTION_DOMAIN_MARKERS):
            indicators.append(f"domain:{var_name}")

    resolved_path = str(config_path or Path(__file__).resolve()).replace("\\", "/").lower()
    if any(marker in resolved_path for marker in _PRODUCTION_PATH_MARKERS):
        indicators.append("production_release_path")

    raw_db_url = (environ.get("DATABASE_URL") or "").strip()
    if raw_db_url and "YOUR_NEON_DATABASE_URL_HERE" not in raw_db_url:
        try:
            parsed = urlparse(raw_db_url)
            if parsed.scheme.lower().startswith("postgres"):
                host = (parsed.hostname or "").strip().lower()
                if host and host not in _LOOPBACK_HOSTS:
                    indicators.append("remote_postgresql")
        except ValueError:
            pass

    return indicators


def resolve_environment_mode(
    environ: Optional[Mapping[str, str]] = None,
    config_path: Optional[Path] = None,
) -> str:
    """Resolve explicit environment mode and fail closed on conflicting or unsafe dev flags."""
    env = os.environ if environ is None else environ
    app_env_raw = (env.get("APP_ENV") or "").strip().lower()
    env_raw = (env.get("ENV") or "").strip().lower()

    app_env = _ENV_CANONICAL_MAP.get(app_env_raw, app_env_raw) if app_env_raw else ""
    env_val = _ENV_CANONICAL_MAP.get(env_raw, env_raw) if env_raw else ""

    if app_env and env_val and app_env != env_val:
        raise RuntimeError(
            "Royal Libas startup blocked: Conflicting environment configuration between APP_ENV and ENV."
        )

    effective_mode = app_env or env_val or "unset"
    if effective_mode in _DEV_LIKE_MODES and _detect_production_indicators(env, config_path=config_path):
        raise RuntimeError(
            "Royal Libas startup blocked: Development or test environment flag conflicts with production runtime indicators."
        )

    return effective_mode


def validate_jwt_secret(raw_secret: Optional[str]) -> str:
    """Validate that JWT_SECRET is present, non-placeholder, and meets minimum strength rules.

    Error messages intentionally omit secret values, substrings, lengths, and hashes.
    """
    if raw_secret is None or not isinstance(raw_secret, str):
        raise RuntimeError(
            "Royal Libas startup blocked: JWT_SECRET is not configured. "
            "Set a strong uniquely generated JWT_SECRET (minimum 32 characters)."
        )

    stripped = raw_secret.strip()
    if not stripped:
        raise RuntimeError(
            "Royal Libas startup blocked: JWT_SECRET is empty or whitespace-only. "
            "Configure a strong uniquely generated JWT_SECRET (minimum 32 characters)."
        )

    lowered = stripped.lower()
    if lowered in _KNOWN_WEAK_JWT_SECRETS:
        raise RuntimeError(
            "Royal Libas startup blocked: JWT_SECRET uses a known default or weak value. "
            "Replace it with a uniquely generated secret."
        )

    if any(pattern in lowered for pattern in _PLACEHOLDER_PATTERNS) or (
        lowered.startswith("your_") and lowered.endswith("_here")
    ):
        raise RuntimeError(
            "Royal Libas startup blocked: JWT_SECRET matches a placeholder pattern. "
            "Replace it with a uniquely generated secret."
        )

    if len(stripped) < MIN_JWT_SECRET_LENGTH or len(stripped.encode("utf-8")) < MIN_JWT_SECRET_LENGTH:
        raise RuntimeError(
            "Royal Libas startup blocked: JWT_SECRET does not meet minimum strength requirements "
            "(minimum 32 characters)."
        )

    if (
        len(set(stripped)) < 6
        or _has_repeating_cycle(stripped)
        or any(lowered in (seq * 4) for seq in _SEQUENTIAL_PATTERNS)
    ):
        raise RuntimeError(
            "Royal Libas startup blocked: JWT_SECRET is too weak or repetitive. "
            "Configure a randomly generated secret (minimum 32 characters)."
        )

    return raw_secret


def validate_jwt_startup_config(
    environ: Optional[Mapping[str, str]] = None,
    config_path: Optional[Path] = None,
) -> str:
    """Enforce fail-closed environment and JWT_SECRET validation across all startup modes."""
    env = os.environ if environ is None else environ
    resolve_environment_mode(environ=env, config_path=config_path)
    return validate_jwt_secret(env.get("JWT_SECRET"))


def get_database_url() -> str:
    raw_url = os.getenv("DATABASE_URL", "")
    # If not configured or contains placeholder, fall back to SQLite for local development
    if not raw_url or "YOUR_NEON_DATABASE_URL_HERE" in raw_url:
        db_path = Path(__file__).resolve().parent.parent / "royal_libas.db"
        return f"sqlite:///{db_path.as_posix()}"
    return raw_url


DATABASE_URL = get_database_url()
APP_ENV_MODE = resolve_environment_mode()
JWT_SECRET = validate_jwt_startup_config()



JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# Cashfree Payment Gateway Configuration
CASHFREE_CLIENT_ID = os.getenv("CASHFREE_CLIENT_ID", "cf_test_placeholder")
CASHFREE_CLIENT_SECRET = os.getenv("CASHFREE_CLIENT_SECRET", "cf_secret_placeholder")
CASHFREE_ENVIRONMENT = os.getenv("CASHFREE_ENVIRONMENT", "sandbox").strip().lower()
CASHFREE_API_VERSION = os.getenv("CASHFREE_API_VERSION", "2023-08-01").strip()
BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL", "").strip()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Canonical Store Domain for SEO & Sitemap
CANONICAL_BASE_URL = os.getenv("CANONICAL_BASE_URL", "https://royallibasbytanya.com").strip().rstrip("/")
if not CANONICAL_BASE_URL:
    CANONICAL_BASE_URL = "https://royallibasbytanya.com"


def is_cashfree_configured() -> bool:
    """Check if valid non-placeholder Cashfree credentials are provided."""
    client_id = CASHFREE_CLIENT_ID.strip()
    secret = CASHFREE_CLIENT_SECRET.strip()
    return bool(
        client_id
        and secret
        and not client_id.startswith("YOUR_")
        and not secret.startswith("YOUR_")
        and "placeholder" not in client_id.lower()
        and "placeholder" not in secret.lower()
    )


# ==========================================
# Shiprocket Fulfillment API Configuration (Admin Triggered Only)
# ==========================================
SHIPROCKET_API_EMAIL = os.getenv("SHIPROCKET_API_EMAIL", "").strip()
SHIPROCKET_API_PASSWORD = os.getenv("SHIPROCKET_API_PASSWORD", "").strip()
SHIPROCKET_PICKUP_LOCATION = os.getenv("SHIPROCKET_PICKUP_LOCATION", "Primary").strip() or "Primary"
SHIPROCKET_PICKUP_PINCODE = os.getenv("SHIPROCKET_PICKUP_PINCODE", "452001").strip() or "452001"
SHIPROCKET_WEBHOOK_TOKEN = os.getenv("SHIPROCKET_WEBHOOK_TOKEN", "").strip()



def is_shiprocket_configured() -> bool:
    """Check if valid non-placeholder Shiprocket credentials are provided."""
    email = SHIPROCKET_API_EMAIL
    pwd = SHIPROCKET_API_PASSWORD
    return bool(
        email
        and pwd
        and not email.startswith("YOUR_")
        and not pwd.startswith("YOUR_")
        and "placeholder" not in email.lower()
        and "placeholder" not in pwd.lower()
    )



# ==========================================
# Cloudinary Media Storage Configuration
# ==========================================
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "").strip()
CLOUDINARY_URL = os.getenv("CLOUDINARY_URL", "").strip()


def is_cloudinary_configured() -> bool:
    """Check if valid non-placeholder Cloudinary credentials are provided."""
    name = CLOUDINARY_CLOUD_NAME
    key = CLOUDINARY_API_KEY
    secret = CLOUDINARY_API_SECRET
    has_keys = bool(
        name
        and key
        and secret
        and not name.startswith("YOUR_")
        and not key.startswith("YOUR_")
        and not secret.startswith("YOUR_")
        and "placeholder" not in name.lower()
        and "placeholder" not in key.lower()
        and "placeholder" not in secret.lower()
    )
    has_url = bool(
        CLOUDINARY_URL
        and "YOUR_" not in CLOUDINARY_URL
        and "placeholder" not in CLOUDINARY_URL.lower()
    )
    return has_keys or has_url
