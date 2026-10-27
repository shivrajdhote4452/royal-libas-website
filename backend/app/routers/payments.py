import json
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import RazorpayCreateOrderRequest, RazorpayCreateOrderResponse
from app.services.payment_service import (
    create_razorpay_order,
    verify_webhook_signature,
    process_payment_webhook,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/razorpay/config")
def get_payment_gateway_config():
    """Return whether Razorpay gateway credentials are configured."""
    from app.services.payment_service import is_live_razorpay_configured
    from app.config import RAZORPAY_KEY_ID
    configured = is_live_razorpay_configured()
    return {
        "configured": configured,
        "key_id": RAZORPAY_KEY_ID if configured else None,
    }


@router.post("/razorpay/create-order", response_model=RazorpayCreateOrderResponse)
def create_payment_order(
    payload: RazorpayCreateOrderRequest,
    db: Session = Depends(get_db),
):
    """Create a Razorpay order tied strictly to the server-computed total of an existing PENDING order."""
    return create_razorpay_order(db, payload.order_code)


@router.post("/razorpay/webhook")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(None, alias="X-Razorpay-Signature"),
    db: Session = Depends(get_db),
):
    """Verify cryptographic HMAC signature and mark order PAID idempotently.
    
    CRITICAL:
    - Only a verified webhook marks an order PAID.
    - Browser callbacks are never proof of payment.
    - Idempotent: duplicate webhook requests do not double process.
    """
    body_bytes = await request.body()

    if not x_razorpay_signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-Razorpay-Signature header",
        )

    # Verify signature
    is_valid = verify_webhook_signature(body_bytes, x_razorpay_signature)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Razorpay webhook signature",
        )

    try:
        event_payload = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload in webhook body",
        )

    success, message = process_payment_webhook(db, event_payload)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    return {"status": "ok", "detail": message}
