import base64
import hashlib
import hmac
import json
import logging
from decimal import Decimal
from typing import Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
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
from datetime import datetime, timezone
from app.models import Order, ProductVariant, StoreSetting, PaymentEvent
from app.schemas import CashfreeCreateOrderResponse

logger = logging.getLogger("royal_libas.payments")

SUPPORTED_CASHFREE_EVENTS = frozenset({
    "PAYMENT_SUCCESS_WEBHOOK",
    "PAYMENT_FAILED_WEBHOOK",
    "PAYMENT_USER_DROPPED_WEBHOOK",
})


class ProcessWebhookResult(tuple):
    """Result tuple (success, message) with an is_duplicate attribute for backward compatibility."""

    def __new__(cls, success: bool, message: str, is_duplicate: bool = False):
        return super().__new__(cls, (success, message))

    def __init__(self, success: bool, message: str, is_duplicate: bool = False):
        self.success = success
        self.message = message
        self.is_duplicate = is_duplicate


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

    store_setting = db.query(StoreSetting).first()
    if store_setting and not store_setting.online_payment_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Online payments are currently disabled by store settings.",
        )

    if not is_cashfree_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway not configured",
        )

    # Server-computed total in INR rupees (not paise)
    order_amount = float(Decimal(str(order.total)))

    # Clean customer details for Cashfree API compliance (strict 10-digit phone)
    raw_phone = "".join(filter(str.isdigit, order.phone or ""))
    if len(raw_phone) == 12 and raw_phone.startswith("91"):
        clean_phone = raw_phone[2:]
    elif len(raw_phone) >= 10:
        clean_phone = raw_phone[-10:]
    else:
        clean_phone = raw_phone.ljust(10, "0") if raw_phone else "9999999999"

    clean_name = (order.customer_name or "Guest Customer").strip() or "Guest Customer"

    token_param = f"?token={order.order_token}" if order.order_token else ""
    order_meta = {
        "return_url": f"{FRONTEND_URL}/order-success/{order.order_code}{token_param}",
    }
    if BACKEND_PUBLIC_URL:
        order_meta["notify_url"] = f"{BACKEND_PUBLIC_URL.rstrip('/')}/payments/cashfree/webhook"

    order_payload = {
        "order_id": order.order_code,
        "order_amount": order_amount,
        "order_currency": "INR",
        "customer_details": {
            "customer_id": order.order_code,
            "customer_name": clean_name,
            "customer_phone": clean_phone,
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


def process_cashfree_webhook(
    db: Session,
    event_payload: dict,
    raw_body_bytes: Optional[bytes] = None,
) -> ProcessWebhookResult:
    """Process verified Cashfree webhook idempotently with row locking and audit ledger.

    Locking & Concurrency Invariants:
    1. Lock Order row FIRST with with_for_update() to serialize all operations on this order.
    2. Check PaymentEvent ledger for (provider, payment_id, event_type). If exists, return safe duplicate 200.
    3. If order is CANCELLED/EXPIRED, lock all affected ProductVariant rows in STRICTLY ASCENDING ID ORDER
       to prevent deadlocks with other transactions.
    4. Record sanitized event in PaymentEvent inside the same database transaction.
    5. Never store raw webhook JSON, customer details, phone, email, address, card, UPI data, tokens or secrets.
    """
    data = event_payload.get("data", {})
    order_info = data.get("order", {})
    order_code = str(order_info.get("order_id") or "").strip().upper()

    if not order_code:
        return ProcessWebhookResult(False, "Missing order_id in webhook payload", False)

    payment_info = data.get("payment", {})
    payment_id = str(payment_info.get("cf_payment_id") or "").strip()
    if not payment_id:
        payment_id = str(order_info.get("order_id") or "")
        if not payment_id:
            return ProcessWebhookResult(False, "Missing cf_payment_id in webhook payload", False)

    event_type = str(event_payload.get("type") or "").strip()
    payment_status = str(payment_info.get("payment_status") or "").strip().upper()
    payment_amount = payment_info.get("payment_amount", order_info.get("order_amount"))
    currency = str(payment_info.get("payment_currency") or "INR").strip().upper()

    # Calculate payload fingerprint without storing raw JSON
    if raw_body_bytes:
        payload_hash = hashlib.sha256(raw_body_bytes).hexdigest()
    else:
        canonical_json = json.dumps(event_payload, sort_keys=True).encode("utf-8")
        payload_hash = hashlib.sha256(canonical_json).hexdigest()

    # Parse gateway event_time safely if present
    parsed_event_time = None
    event_time_raw = event_payload.get("event_time")
    if event_time_raw:
        try:
            parsed_event_time = datetime.fromisoformat(str(event_time_raw))
        except Exception:
            pass

    # 1. LOCK ORDER ROW FIRST (Hierarchy: Order -> ProductVariants in ascending ID order)
    order = (
        db.query(Order)
        .populate_existing()
        .with_for_update()
        .filter(Order.order_code == order_code)
        .first()
    )
    if not order:
        return ProcessWebhookResult(False, f"No matching order found for order_id '{order_code}'", False)

    # 2. CHECK PAYMENT EVENT LEDGER FOR DUPLICATES
    if payment_id and event_type:
        existing_event = (
            db.query(PaymentEvent)
            .filter(
                PaymentEvent.provider == "cashfree",
                PaymentEvent.payment_id == payment_id,
                PaymentEvent.event_type == event_type,
            )
            .first()
        )
        if existing_event:
            return ProcessWebhookResult(
                True,
                f"Event '{event_type}' for payment '{payment_id}' already processed (duplicate ignored)",
                is_duplicate=True,
            )

    # 3. AMOUNT VERIFICATION: Server-computed total must strictly match webhook payment amount
    if payment_amount is None:
        return ProcessWebhookResult(False, "Missing payment amount in webhook payload", False)

    try:
        webhook_amount = Decimal(str(payment_amount))
        server_total = Decimal(str(order.total))
        if webhook_amount != server_total:
            return ProcessWebhookResult(
                False,
                f"Payment amount mismatch: expected {server_total}, received {webhook_amount}",
                False,
            )
    except Exception as e:
        return ProcessWebhookResult(False, f"Invalid payment amount: {str(e)}", False)

    # Check for unverified event types (e.g. deferred refund, dispute, settlement events)
    if event_type and event_type not in SUPPORTED_CASHFREE_EVENTS:
        return ProcessWebhookResult(True, f"Unhandled event '{event_type}' ignored safely", False)

    outcome = "PROCESSED"
    msg = ""

    # 4. PROCESS EVENT LOGIC
    if payment_status == "SUCCESS" or event_type == "PAYMENT_SUCCESS_WEBHOOK":
        if order.payment_status == "PAID":
            outcome = "DUPLICATE_PAID_ALREADY"
            payment_event = PaymentEvent(
                order_id=order.id,
                provider="cashfree",
                payment_id=payment_id,
                event_type=event_type or "PAYMENT_SUCCESS_WEBHOOK",
                payment_status=payment_status or "SUCCESS",
                amount=webhook_amount,
                currency=currency,
                payload_hash=payload_hash,
                outcome=outcome,
                event_time=parsed_event_time,
            )
            db.add(payment_event)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
            return ProcessWebhookResult(
                True,
                f"Order '{order.order_code}' already marked PAID (idempotent duplicate request)",
                is_duplicate=True,
            )

        # SPECIAL SCENARIO: Payment received for CANCELLED or EXPIRED order
        if order.status in ("CANCELLED", "EXPIRED"):
            variant_quantities = {}
            for item in order.items:
                if item.variant_id:
                    variant_quantities[item.variant_id] = (
                        variant_quantities.get(item.variant_id, 0) + item.quantity
                    )

            # Lock variants in STRICTLY ASCENDING ID ORDER to guarantee no deadlocks
            locked_variants = {}
            for vid in sorted(variant_quantities.keys()):
                v = (
                    db.query(ProductVariant)
                    .populate_existing()
                    .with_for_update()
                    .filter(ProductVariant.id == vid)
                    .first()
                )
                if v:
                    locked_variants[vid] = v

            can_reclaim = True
            for vid, qty in variant_quantities.items():
                v = locked_variants.get(vid)
                if not v or v.stock < qty:
                    can_reclaim = False
                    break

            now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            if can_reclaim:
                for vid, qty in variant_quantities.items():
                    locked_variants[vid].stock -= qty
                order.status = "PAID"
                order.payment_status = "PAID"
                note = f"[{now_str}] Reconciled: Delayed payment arrived after cancellation. Inventory successfully re-reserved."
                order.admin_notes = f"{order.admin_notes}\n{note}" if order.admin_notes else note
                outcome = "RECONCILED_POST_CANCELLATION"
                msg = f"Order '{order.order_code}' reconciled and marked PAID"
            else:
                order.payment_status = "PAID_RECONCILIATION_REQUIRED"
                order.status = "ACTION_REQUIRED_REFUND"
                note = (
                    f"[{now_str}] ALERT - INVENTORY CONFLICT: Successful payment of ₹{webhook_amount} received, "
                    f"but items were already sold out following cancellation. "
                    f"ACTION REQUIRED: Initiate customer refund via Cashfree Dashboard or customer concierge."
                )
                order.admin_notes = f"{order.admin_notes}\n{note}" if order.admin_notes else note
                outcome = "INVENTORY_CONFLICT_REFUND_REQUIRED"
                msg = f"Order '{order.order_code}' flagged for refund due to overselling conflict"
        else:
            order.status = "PAID"
            order.payment_status = "PAID"
            outcome = "SUCCESS"
            msg = f"Order '{order.order_code}' successfully marked PAID"

    elif payment_status == "FAILED" or event_type == "PAYMENT_FAILED_WEBHOOK":
        if order.payment_status != "PAID":
            order.payment_status = "FAILED"
        outcome = "FAILED"
        msg = f"Order '{order.order_code}' payment recorded as FAILED"

    elif payment_status == "USER_DROPPED" or event_type == "PAYMENT_USER_DROPPED_WEBHOOK":
        if order.payment_status != "PAID":
            order.payment_status = "FAILED"
        outcome = "USER_DROPPED"
        msg = f"Order '{order.order_code}' payment recorded as USER_DROPPED"

    else:
        return ProcessWebhookResult(True, f"Unhandled event '{event_type}' ignored safely", False)

    # 5. INSERT PAYMENT EVENT RECORD INSIDE THE SAME TRANSACTION
    payment_event = PaymentEvent(
        order_id=order.id,
        provider="cashfree",
        payment_id=payment_id,
        event_type=event_type or f"PAYMENT_{payment_status}_EVENT",
        payment_status=payment_status or "UNKNOWN",
        amount=webhook_amount,
        currency=currency,
        payload_hash=payload_hash,
        outcome=outcome,
        event_time=parsed_event_time,
    )
    db.add(payment_event)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return ProcessWebhookResult(
            True,
            f"Event '{event_type}' for payment '{payment_id}' already processed (concurrent duplicate)",
            is_duplicate=True,
        )

    return ProcessWebhookResult(True, msg, False)


def sync_cashfree_payment_status(db: Session, order_code: str) -> Tuple[bool, str, Order]:
    """Server-to-server query to Cashfree to reconcile delayed or missing webhooks."""
    clean_code = order_code.strip().upper()
    order = db.query(Order).filter(Order.order_code == clean_code).with_for_update().first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order '{order_code}' not found.",
        )

    if order.payment_status == "PAID":
        return True, "Order is already confirmed paid.", order

    if not is_cashfree_configured():
        return False, "Cashfree gateway not configured in this environment.", order

    headers = {
        "x-client-id": CASHFREE_CLIENT_ID,
        "x-client-secret": CASHFREE_CLIENT_SECRET,
        "x-api-version": CASHFREE_API_VERSION,
        "Content-Type": "application/json",
    }
    url = f"{get_cashfree_base_url()}/orders/{order.order_code}/payments"

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(url, headers=headers)
    except Exception as e:
        return False, f"Error communicating with Cashfree: {str(e)}", order

    if resp.status_code != 200:
        return False, f"Cashfree returned status {resp.status_code}", order

    payments_list = resp.json()
    if not isinstance(payments_list, list):
        return False, "Unexpected Cashfree payments response format", order

    # Look for any successful payment attempt matching order amount
    for p in payments_list:
        p_status = p.get("payment_status")
        p_amount = p.get("payment_amount")
        p_id = str(p.get("cf_payment_id") or "").strip()
        if p_status == "SUCCESS" and p_amount is not None:
            if Decimal(str(p_amount)) == Decimal(str(order.total)):
                synthetic_payload = {
                    "type": "PAYMENT_SUCCESS_WEBHOOK",
                    "data": {
                        "order": {"order_id": order.order_code, "order_amount": float(order.total)},
                        "payment": {
                            "cf_payment_id": p_id or f"cf_sync_{order.order_code}",
                            "payment_status": "SUCCESS",
                            "payment_amount": float(p_amount),
                            "payment_currency": p.get("payment_currency", "INR"),
                        },
                    },
                }
                ok, msg = process_cashfree_webhook(db, synthetic_payload)
                db.refresh(order)
                return ok, msg, order

    # Check for failed attempts
    if any(p.get("payment_status") == "FAILED" for p in payments_list):
        order.payment_status = "FAILED"
        db.commit()
        db.refresh(order)
        return False, "Payment attempt was declined or failed.", order

    return False, "Payment is still awaiting confirmation from Cashfree.", order

