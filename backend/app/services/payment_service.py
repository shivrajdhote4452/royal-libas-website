import base64
import hashlib
import hmac
from decimal import Decimal
from typing import Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
import httpx

from app.config import (
    CASHFREE_CLIENT_ID,
    CASHFREE_CLIENT_SECRET,
    CASHFREE_ENVIRONMENT,
    CASHFREE_API_VERSION,
    BACKEND_PUBLIC_URL,
    FRONTEND_URL,
    is_cashfree_configured,
)
from app.models import Order
from app.schemas import CashfreeCreateOrderResponse


def get_cashfree_base_url() -> str:
    """Return Cashfree Payment Gateway base URL based on environment."""
    if CASHFREE_ENVIRONMENT == "production":
        return "https://api.cashfree.com/pg"
    return "https://sandbox.cashfree.com/pg"


def create_cashfree_order(db: Session, order_code: str) -> CashfreeCreateOrderResponse:
    """Creates a Cashfree order tied strictly to the server-computed total of an existing PENDING order.
    
    Critical rules:
    - Only accepts existing order with status PENDING and payment_method PREPAID
    - Uses server-computed order.total only (in INR rupees, never paise)
    - Uses order_code as Cashfree order_id, customer_id, etc.
    - Never returns the client secret
    """
    order = db.query(Order).filter(Order.order_code == order_code).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order '{order_code}' not found.",
        )

    if order.status != "PENDING" or order.payment_method != "PREPAID":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order '{order_code}' is not awaiting prepaid payment (status: {order.status}).",
        )

    if not is_cashfree_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway not configured",
        )

    # Server-computed total in INR rupees (not paise)
    order_amount = float(Decimal(str(order.total)))

    order_meta = {
        "return_url": f"{FRONTEND_URL}/order-success/{order.order_code}",
    }
    if BACKEND_PUBLIC_URL:
        order_meta["notify_url"] = f"{BACKEND_PUBLIC_URL.rstrip('/')}/payments/cashfree/webhook"

    order_payload = {
        "order_id": order.order_code,
        "order_amount": order_amount,
        "order_currency": "INR",
        "customer_details": {
            "customer_id": order.order_code,
            "customer_name": order.customer_name,
            "customer_phone": order.phone,
        },
        "order_meta": order_meta,
    }

    headers = {
        "x-client-id": CASHFREE_CLIENT_ID,
        "x-client-secret": CASHFREE_CLIENT_SECRET,
        "x-api-version": CASHFREE_API_VERSION,
        "Content-Type": "application/json",
    }

    url = f"{get_cashfree_base_url()}/orders"

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(url, json=order_payload, headers=headers)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Cashfree gateway connection error: {str(e)}",
        )

    if response.status_code not in (200, 201):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Cashfree API error: {response.text}",
        )

    data = response.json()
    payment_session_id = data.get("payment_session_id")
    cf_order_id = data.get("cf_order_id")

    if not payment_session_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cashfree response missing payment_session_id",
        )

    # Store cf_order_id on order
    order.cashfree_order_id = str(cf_order_id) if cf_order_id is not None else None
    db.commit()
    db.refresh(order)

    return CashfreeCreateOrderResponse(
        payment_session_id=payment_session_id,
        order_id=order.order_code,
        order_code=order.order_code,
        amount=order.total,
        currency="INR",
        mode=CASHFREE_ENVIRONMENT,
    )


def verify_cashfree_webhook_signature(
    timestamp: str,
    raw_body_bytes: bytes,
    received_signature: str,
) -> bool:
    """Cryptographically verify the Cashfree webhook signature using HMAC SHA256 and Base64.
    
    Signed payload format (Cashfree API 2023-08-01):
    timestamp + raw_body
    """
    if not timestamp or not received_signature:
        return False

    secret = CASHFREE_CLIENT_SECRET.encode("utf-8")
    signed_data = timestamp.encode("utf-8") + raw_body_bytes
    expected_signature = base64.b64encode(
        hmac.new(secret, signed_data, hashlib.sha256).digest()
    ).decode("utf-8")

    return hmac.compare_digest(expected_signature, received_signature)


def process_cashfree_webhook(db: Session, event_payload: dict) -> Tuple[bool, str]:
    """Process verified Cashfree webhook idempotently.
    
    Critical rules:
    - Only a verified webhook marks an order PAID. Browser callbacks or return visits must NEVER mark an order PAID.
    - Idempotent: duplicate webhook requests do not change order twice.
    - Server-computed order.total must strictly match webhook payment amount; otherwise reject and do not mark PAID.
    """
    data = event_payload.get("data", {})
    order_info = data.get("order", {})
    order_code = order_info.get("order_id")

    if not order_code:
        return False, "Missing order_id in webhook payload"

    order = db.query(Order).filter(Order.order_code == order_code).first()
    if not order:
        return False, f"No matching order found for order_id '{order_code}'"

    # IDEMPOTENCY CHECK: If already processed, return success without duplicate modification
    if order.payment_status == "PAID":
        return True, f"Order '{order.order_code}' already marked PAID (idempotent duplicate request)"

    payment_info = data.get("payment", {})
    payment_status = payment_info.get("payment_status", "")
    payment_amount = payment_info.get("payment_amount", order_info.get("order_amount"))

    # AMOUNT VERIFICATION: Server-computed total must strictly match webhook payment amount
    if payment_amount is None:
        return False, "Missing payment amount in webhook payload"

    try:
        webhook_amount = Decimal(str(payment_amount))
        server_total = Decimal(str(order.total))
        if webhook_amount != server_total:
            return False, f"Payment amount mismatch: expected {server_total}, received {webhook_amount}"
    except Exception as e:
        return False, f"Invalid payment amount: {str(e)}"

    event_type = event_payload.get("type", "")

    if payment_status == "SUCCESS" or event_type == "PAYMENT_SUCCESS_WEBHOOK":
        order.status = "PAID"
        order.payment_status = "PAID"
        db.commit()
        return True, f"Order '{order.order_code}' successfully marked PAID"
    elif payment_status == "FAILED" or event_type == "PAYMENT_FAILED_WEBHOOK":
        order.payment_status = "FAILED"
        db.commit()
        return True, f"Order '{order.order_code}' payment recorded as FAILED"

    return True, f"Unhandled event '{event_type}' ignored safely"
