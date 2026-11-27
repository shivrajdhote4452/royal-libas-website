import json
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from typing import Optional
from app.database import get_db
from app.models import Order
from app.config import CASHFREE_ENVIRONMENT, is_cashfree_configured
from app.schemas import (
    CashfreeConfigResponse,
    CashfreeCreateOrderRequest,
    CashfreeCreateOrderResponse,
    CashfreeCustomerSyncRequest,
    CashfreeSyncResponse,
)
from app.services.order_service import order_tokens_match
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
    x_webhook_attempt: Optional[str] = Header(None, alias="x-webhook-attempt"),
    db: Session = Depends(get_db),
):
    """Verify cryptographic HMAC-SHA256 signature and mark order PAID idempotently.
    
    Critical rules:
    - Raw request body must be read before any JSON parsing.
    - Verified using timestamp + raw body with client secret via HMAC-SHA256 Base64.
    - Constant-time signature comparison.
    - Server-computed order.total must match webhook amount.
    - Only a verified SUCCESS webhook marks an order PAID.
    - Idempotent: duplicate webhook requests do not change order twice and return HTTP 200.
    - Cashfree retry attempts reuse timestamp & signature; deduplicated via PaymentEvent ledger.
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

    res = process_cashfree_webhook(db, event_payload, raw_body_bytes=body_bytes)
    success, message = res[0], res[1]
    is_duplicate = getattr(res, "is_duplicate", False)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    if is_duplicate:
        return {
            "status": "ok",
            "message": "Duplicate event already processed",
            "detail": message,
        }

    return {"status": "ok", "detail": message}


@router.post("/cashfree/sync/{order_code}", response_model=CashfreeSyncResponse)
def sync_payment_status(
    order_code: str,
    payload: Optional[CashfreeCustomerSyncRequest] = None,
    db: Session = Depends(get_db),
):
    """Reconcile payment status directly from Cashfree's server-side API.
    
    Protected customer endpoint: requires the matching customer order_token
    in the POST JSON request body.
    For missing, malformed, or mismatched tokens:
    - Rejects before any Cashfree API call
    - Does not reveal order or payment status
    - Returns a generic HTTP 403 Forbidden to prevent order-code enumeration
    - Never logs the raw token
    """
    clean_code = order_code.strip().upper()
    order = db.query(Order).filter(Order.order_code == clean_code).first()

    provided_token = payload.token.strip() if (payload and payload.token) else None

    # Constant-time comparison; generic rejection prevents order-code enumeration
    if not order or not provided_token or not order_tokens_match(provided_token, order.order_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: valid customer order token required.",
        )

    ok, msg, updated_order = sync_cashfree_payment_status(db, clean_code)
    return CashfreeSyncResponse(
        order_code=updated_order.order_code,
        payment_status=updated_order.payment_status,
        order_status=updated_order.status,
        message=msg,
        is_paid=updated_order.payment_status == "PAID",
    )

