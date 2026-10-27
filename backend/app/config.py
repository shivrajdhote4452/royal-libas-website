import os
from pathlib import Path
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


def get_database_url() -> str:
    raw_url = os.getenv("DATABASE_URL", "")
    # If not configured or contains placeholder, fall back to SQLite for local development
    if not raw_url or "YOUR_NEON_DATABASE_URL_HERE" in raw_url:
        db_path = Path(__file__).resolve().parent.parent / "royal_libas.db"
        return f"sqlite:///{db_path.as_posix()}"
    return raw_url


DATABASE_URL = get_database_url()
JWT_SECRET = os.getenv("JWT_SECRET", "royal_libas_dev_secret_key_change_in_prod")
if "YOUR_JWT_SECRET_HERE" in JWT_SECRET:
    JWT_SECRET = "royal_libas_dev_secret_key_change_in_prod"

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# Cashfree Payment Gateway Configuration
CASHFREE_CLIENT_ID = os.getenv("CASHFREE_CLIENT_ID", "cf_test_placeholder")
CASHFREE_CLIENT_SECRET = os.getenv("CASHFREE_CLIENT_SECRET", "cf_secret_placeholder")
CASHFREE_ENVIRONMENT = os.getenv("CASHFREE_ENVIRONMENT", "sandbox").strip().lower()
CASHFREE_API_VERSION = os.getenv("CASHFREE_API_VERSION", "2023-08-01").strip()
BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL", "").strip()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


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
