#!/usr/bin/env python3
"""Script to securely create the first admin user for Royal Libas.

Usage:
  # Interactive mode (prompts securely for password):
  python create_admin.py

  # Direct argument mode:
  python create_admin.py --email admin@royallibas.com --password mysecurepassword
"""

import argparse
import getpass
import sys
from app.auth import hash_password
from app.database import SessionLocal, engine, Base
from app.models import Admin


def main():
    parser = argparse.ArgumentParser(description="Create a Royal Libas Admin User")
    parser.add_argument("--email", help="Admin email address", default=None)
    parser.add_argument("--password", help="Admin password", default=None)
    args = parser.parse_args()

    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    email = args.email
    if not email:
        email = input("Enter admin email: ").strip()

    if not email or "@" not in email:
        print("Error: A valid email address is required.", file=sys.stderr)
        sys.exit(1)

    password = args.password
    if not password:
        password = getpass.getpass("Enter admin password: ")
        confirm_password = getpass.getpass("Confirm admin password: ")
        if password != confirm_password:
            print("Error: Passwords do not match.", file=sys.stderr)
            sys.exit(1)

    if len(password) < 6:
        print("Error: Password must be at least 6 characters long.", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        existing_admin = db.query(Admin).filter(Admin.email == email.lower()).first()
        if existing_admin:
            print(f"Error: Admin with email '{email}' already exists.", file=sys.stderr)
            sys.exit(1)

        password_hash = hash_password(password)
        admin = Admin(
            email=email.lower(),
            password_hash=password_hash,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        print(f"Success: Admin '{admin.email}' created successfully (ID: {admin.id})!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
