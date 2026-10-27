import json
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import CASHFREE_ENVIRONMENT, is_cashfree_configured
from app.schemas import (
    CashfreeConfigResponse,
    CashfreeCreateOrderRequest,
    CashfreeCreateOrderResponse,
)
from app.services.payment_service import (
    create_cashfree_order,
    verify_cashfree_webhook_signature,
    process_cashfree_webhook,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/cashfree/config", response_model=CashfreeConfigResponse)
def get_payment_gateway_config():
    """Return whether Cashfree gateway credentials are configured and the operating mode."""
    return CashfreeConfigResponse(
        configured=is_cashfree_configured(),
        mode=CASHFREE_ENVIRONMENT,
    )


@router.post("/cashfree/create-order", response_model=CashfreeCreateOrderResponse)
def create_payment_order(
    payload: CashfreeCreateOrderRequest,
    db: Session = Depends(get_db),
):
    """Create a Cashfree order tied strictly to the server-computed total of an existing PENDING order."""
    return create_cashfree_order(db, payload.order_code)


@router.post("/cashfree/webhook")
async def cashfree_webhook(
    request: Request,
    x_webhook_signature: str = Header(None, alias="x-webhook-signature"),
    x_webhook_timestamp: str = Header(None, alias="x-webhook-timestamp"),
    db: Session = Depends(get_db),
):
    """Verify cryptographic HMAC-SHA256 signature and mark order PAID idempotently.
    
    Critical rules:
    - Raw request body must be read before any JSON parsing.
    - Verified using timestamp + raw body with client secret via HMAC-SHA256 Base64.
    - Constant-time signature comparison.
    - Server-computed order.total must match webhook amount.
    - Only a verified SUCCESS webhook marks an order PAID.
    - Idempotent: duplicate webhook requests do not change order twice.
    - Browser callbacks or return-url visits must NEVER mark an order PAID.
    """
    body_bytes = await request.body()

    if not x_webhook_signature or not x_webhook_timestamp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required Cashfree webhook headers (x-webhook-signature or x-webhook-timestamp)",
        )

    # Verify signature using pinned Cashfree 2023-08-01 algorithm
    is_valid = verify_cashfree_webhook_signature(
        timestamp=x_webhook_timestamp,
        raw_body_bytes=body_bytes,
        received_signature=x_webhook_signature,
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Cashfree webhook signature",
        )

    try:
        event_payload = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload in webhook body",
        )

    success, message = process_cashfree_webhook(db, event_payload)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    return {"status": "ok", "detail": message}
