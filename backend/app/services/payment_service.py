import hmac
import hashlib
import uuid
from decimal import Decimal
from typing import Tuple, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.config import RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
from app.models import Order
from app.schemas import RazorpayCreateOrderResponse

try:
    import razorpay
    razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
except Exception:
    razorpay_client = None


def is_live_razorpay_configured() -> bool:
    """Check if valid non-placeholder Razorpay credentials are provided."""
    return bool(
        RAZORPAY_KEY_ID
        and RAZORPAY_KEY_SECRET
        and not RAZORPAY_KEY_ID.startswith("YOUR_")
        and not RAZORPAY_KEY_SECRET.startswith("YOUR_")
        and "placeholder" not in RAZORPAY_KEY_ID.lower()
        and "placeholder" not in RAZORPAY_KEY_SECRET.lower()
    )


def create_razorpay_order(db: Session, order_code: str) -> RazorpayCreateOrderResponse:
    """Creates a Razorpay order tied strictly to the server-computed total of an existing order."""
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

    # If Razorpay keys are missing or placeholders, reject with 503 Service Unavailable
    if not is_live_razorpay_configured() or not razorpay_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway not configured",
        )

    # Server-computed total in paise (1 INR = 100 paise)
    amount_in_paise = int(Decimal(str(order.total)) * Decimal("100"))

    try:
        rzp_order = razorpay_client.order.create({
            "amount": amount_in_paise,
            "currency": "INR",
            "receipt": order.order_code,
            "notes": {
                "customer_name": order.customer_name,
                "phone": order.phone,
            },
        })
        rzp_order_id = rzp_order["id"]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Payment gateway error: {str(e)}",
        )

    order.razorpay_order_id = rzp_order_id
    db.commit()
    db.refresh(order)

    return RazorpayCreateOrderResponse(
        razorpay_order_id=rzp_order_id,
        order_code=order.order_code,
        amount=amount_in_paise,
        currency="INR",
        key_id=RAZORPAY_KEY_ID,
    )


def verify_webhook_signature(body_bytes: bytes, received_signature: str) -> bool:
    """Cryptographically verify the Razorpay webhook signature using HMAC SHA256."""
    secret = RAZORPAY_WEBHOOK_SECRET.encode("utf-8")
    expected_signature = hmac.new(secret, body_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_signature, received_signature)


def process_payment_webhook(db: Session, event_payload: dict) -> Tuple[bool, str]:
    """Process verified Razorpay webhook idempotently.
    
    Only a verified webhook marks an order PAID. Browser success screens are never payment proof.
    """
    event = event_payload.get("event")
    payload = event_payload.get("payload", {})

    # Extract payment entity and razorpay order id
    payment_entity = payload.get("payment", {}).get("entity", {})
    rzp_order_id = payment_entity.get("order_id") or payload.get("order", {}).get("entity", {}).get("id")

    if not rzp_order_id:
        return False, "Missing order_id in webhook payload"

    order = db.query(Order).filter(Order.razorpay_order_id == rzp_order_id).first()
    if not order:
        return False, f"No matching order found for razorpay_order_id '{rzp_order_id}'"

    # IDEMPOTENCY CHECK: If already processed, return success without duplicate modification
    if order.payment_status == "PAID":
        return True, f"Order '{order.order_code}' already marked PAID (idempotent duplicate request)"

    if event in ("payment.captured", "order.paid"):
        order.status = "PAID"
        order.payment_status = "PAID"
        db.commit()
        return True, f"Order '{order.order_code}' successfully marked PAID"
    elif event == "payment.failed":
        order.payment_status = "FAILED"
        db.commit()
        return True, f"Order '{order.order_code}' payment recorded as FAILED"

    return True, f"Unhandled event '{event}' ignored safely"
