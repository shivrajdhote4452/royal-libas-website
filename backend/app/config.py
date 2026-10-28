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
