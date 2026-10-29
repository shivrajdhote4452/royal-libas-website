import json
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import CASHFREE_ENVIRONMENT, is_cashfree_configured
from app.schemas import (
    CashfreeConfigResponse,
    CashfreeCreateOrderRequest,
    CashfreeCreateOrderResponse,
    CashfreeSyncResponse,
)
from app.services.payment_service import (
    create_cashfree_order,
    verify_cashfree_webhook_signature,
    process_cashfree_webhook,
    sync_cashfree_payment_status,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/cashfree/config", response_model=CashfreeConfigResponse)
def get_payment_gateway_config(db: Session = Depends(get_db)):
    """Return whether Cashfree gateway credentials are configured and the operating mode."""
    from app.models import StoreSetting
    store_setting = db.query(StoreSetting).first()
    online_enabled = bool(store_setting.online_payment_enabled) if store_setting else True
    return CashfreeConfigResponse(
        configured=is_cashfree_configured() and online_enabled,
        mode=CASHFREE_ENVIRONMENT,
        online_payment_enabled=online_enabled,
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


@router.post("/cashfree/sync/{order_code}", response_model=CashfreeSyncResponse)
def sync_payment_status(
    order_code: str,
    db: Session = Depends(get_db),
):
    """Reconcile payment status directly from Cashfree's server-side API.
    
    Enables instant verification when webhooks are delayed or when customers return
    from the Cashfree checkout sheet.
    """
    ok, msg, order = sync_cashfree_payment_status(db, order_code.strip().upper())
    return CashfreeSyncResponse(
        order_code=order.order_code,
        payment_status=order.payment_status,
        order_status=order.status,
        message=msg,
        is_paid=order.payment_status == "PAID",
    )

