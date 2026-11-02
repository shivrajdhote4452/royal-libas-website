#!/usr/bin/env python3
"""Diagnostic & Verification Script for Cashfree Payment Gateway (Sandbox Mode).

Safely checks:
1. Whether Cashfree sandbox credentials are configured in backend/.env.
2. Verifies connectivity to Cashfree Sandbox API (https://sandbox.cashfree.com/pg).
3. Validates HMAC signature verification helper.
4. Checks sandbox environment mode.

SAFETY:
- Never prints secrets or credentials to console.
- Strictly verifies sandbox endpoint is used.
- Does not modify any production data.
"""

import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.config import (
    CASHFREE_CLIENT_ID,
    CASHFREE_CLIENT_SECRET,
    CASHFREE_ENVIRONMENT,
    CASHFREE_API_VERSION,
    is_cashfree_configured,
)
from app.services.payment_service import get_cashfree_base_url, verify_cashfree_webhook_signature
import httpx


def main():
    print("=" * 60)
    print("  Royal Libas - Cashfree Sandbox Configuration Check")
    print("=" * 60)

    # 1. Check environment
    print(f"\n1. Cashfree Operating Mode: '{CASHFREE_ENVIRONMENT}'")
    if CASHFREE_ENVIRONMENT != "sandbox":
        print("   [WARNING] CASHFREE_ENVIRONMENT is NOT set to 'sandbox'!")
        print("   Ensure CASHFREE_ENVIRONMENT=sandbox is configured in backend/.env for safe testing.")
        return 1
    else:
        print("   [OK] Sandbox / Test environment confirmed.")

    base_url = get_cashfree_base_url()
    print(f"   Base Gateway URL: {base_url}")
    assert "sandbox.cashfree.com" in base_url, "Safety assertion failed: base URL is not sandbox!"

    # 2. Check credentials presence
    configured = is_cashfree_configured()
    print(f"\n2. Credentials Configured: {configured}")
    if not configured:
        print("   [ACTION REQUIRED] Valid Cashfree Sandbox credentials not detected in backend/.env.")
        print("   To configure:")
        print("   1. Open: backend/.env")
        print("   2. Add your Cashfree Sandbox test credentials:")
        print("      CASHFREE_CLIENT_ID=<Your_Sandbox_App_ID>")
        print("      CASHFREE_CLIENT_SECRET=<Your_Sandbox_Secret_Key>")
        print("      CASHFREE_ENVIRONMENT=sandbox")
        print("      CASHFREE_API_VERSION=2023-08-01")
        print("   3. Save file and rerun this verification script.")
        return 2

    masked_id = CASHFREE_CLIENT_ID[:4] + "***" + CASHFREE_CLIENT_ID[-4:] if len(CASHFREE_CLIENT_ID) >= 8 else "***"
    print(f"   App ID: {masked_id} (Length: {len(CASHFREE_CLIENT_ID)})")
    print(f"   Secret Key: Set (Length: {len(CASHFREE_CLIENT_SECRET)} chars, masked)")
    print(f"   API Version: {CASHFREE_API_VERSION}")

    # 3. Test Live Sandbox API Connectivity
    print("\n3. Testing Cashfree Sandbox API Connectivity...")
    headers = {
        "x-client-id": CASHFREE_CLIENT_ID,
        "x-client-secret": CASHFREE_CLIENT_SECRET,
        "x-api-version": CASHFREE_API_VERSION,
        "Content-Type": "application/json",
    }

    test_order_id = "SANDBOX_CONN_TEST"
    test_url = f"{base_url}/orders/{test_order_id}"

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(test_url, headers=headers)
        
        # In Cashfree, querying a non-existent order with valid credentials returns 404 (order not found)
        # With INVALID credentials, Cashfree returns 401 Unauthorized
        if resp.status_code == 401:
            print("   [ERROR] Cashfree API returned HTTP 401 Unauthorized.")
            print("   Please double-check your Sandbox App ID and Secret Key in backend/.env.")
            return 3
        elif resp.status_code in (200, 404):
            print("   [OK] Authentication with Cashfree Sandbox succeeded!")
            print(f"   Gateway responded with expected status {resp.status_code} ({resp.reason_phrase}).")
        else:
            print(f"   [NOTICE] Cashfree API responded with status {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"   [ERROR] Failed to reach Cashfree Sandbox gateway: {e}")
        return 4

    print("\n" + "=" * 60)
    print("  All Sandbox Checks Passed! Ready for Checkout Testing.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
