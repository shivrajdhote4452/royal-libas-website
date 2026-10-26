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
