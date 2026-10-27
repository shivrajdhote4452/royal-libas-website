import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Order
from app.schemas import (
    AddressResponse,
    OrderCancelRequest,
    OrderCreateRequest,
    OrderResponse,
    OrderTrackResponse,
)
from app.services.order_service import (
    cancel_order_atomic,
    create_order_transaction,
    mask_name,
    mask_phone,
)

router = APIRouter(prefix="/orders", tags=["orders"])

# In-memory rate limiter for public order lookups: client_ip -> list of timestamps
_order_lookup_attempts: dict = {}
LOOKUP_WINDOW_SECONDS = 60
LOOKUP_MAX_PER_WINDOW = 25  # Limit to 25 requests per minute per IP to prevent brute-force


def enforce_lookup_rate_limit(request: Request):
    """Prevent automated enumeration or guessing of order codes."""
    client_ip = request.client.host if request.client else "unknown"
    now_ts = time.time()
    window_start = now_ts - LOOKUP_WINDOW_SECONDS
    attempts = [t for t in _order_lookup_attempts.get(client_ip, []) if t > window_start]
    attempts.append(now_ts)
    _order_lookup_attempts[client_ip] = attempts

    if len(attempts) > LOOKUP_MAX_PER_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many lookup attempts. Please wait a minute before trying again.",
            headers={"Retry-After": str(LOOKUP_WINDOW_SECONDS)},
        )


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def place_order(payload: OrderCreateRequest, db: Session = Depends(get_db)):
    """Place a guest order with server-calculated totals, secure order_token, and atomic stock decrement."""
    order = create_order_transaction(db, payload)
    return order


@router.get("/track", response_model=OrderTrackResponse)
def track_order(
    request: Request,
    order_code: Optional[str] = None,
    phone: Optional[str] = None,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Public customer order tracking with strict privacy verification.
    
    CRITICAL SECURITY & PRIVACY RULES:
    1. Phone-alone lookup is strictly blocked.
    2. Customer verification is required: must supply matching phone number OR order token.
    3. Order code alone without phone or token cannot access tracking details.
    4. Customer name and phone are masked; street address lines and internal labels are never exposed.
    5. Brute-force guessing is throttled by rate limit.
    """
    enforce_lookup_rate_limit(request)

    clean_code = (order_code or "").strip().upper()
    has_phone = bool(phone and phone.strip())
    clean_phone = "".join(filter(str.isdigit, phone or ""))
    if len(clean_phone) == 12 and clean_phone.startswith("91"):
        clean_phone = clean_phone[2:]

    # Phone-alone lookup must NEVER return order details
    if not clean_code and has_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter your order reference (e.g. RL-2026-1001) to track your order.",
        )

    if not clean_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide your order reference (e.g. RL-2026-1001).",
        )

    # Order code alone without verification is rejected
    if not has_phone and not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="To protect your privacy, please enter the 10-digit mobile number used when placing this order.",
        )

    if has_phone and len(clean_phone) != 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid 10-digit mobile number.",
        )

    order = (
        db.query(Order)
        .options(
            joinedload(Order.items),
            joinedload(Order.address),
        )
        .filter(Order.order_code == clean_code)
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found. Please check your order code and registered phone number.",
        )

    # Verify phone or token
    verified = False
    if token and order.order_token and token == order.order_token:
        verified = True
    elif has_phone:
        stored_phone = "".join(filter(str.isdigit, order.phone))
        if len(stored_phone) == 12 and stored_phone.startswith("91"):
            stored_phone = stored_phone[2:]
        if stored_phone == clean_phone:
            verified = True

    if not verified:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found. Please check your order code and the phone number used at checkout.",
        )

    # Build sanitized public tracking response without private street address
    masked_addr = None
    if order.address:
        masked_addr = AddressResponse(
            id=order.address.id,
            name=mask_name(order.address.name),
            phone=mask_phone(order.address.phone),
            pincode=order.address.pincode,
            line1="*** Protected Address ***",
            line2=None,
            city=order.address.city,
            state=order.address.state,
        )

    return OrderTrackResponse(
        order_code=order.order_code,
        customer_name=mask_name(order.customer_name),
        phone_masked=mask_phone(order.phone),
        status=order.status,
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        subtotal=order.subtotal,
        shipping_charge=order.shipping_charge,
        discount=order.discount,
        total=order.total,
        courier_name=order.courier_name,
        tracking_url=order.tracking_url,
        awb_code=order.awb_code,
        delivery_city=order.address.city if order.address else None,
        delivery_state=order.address.state if order.address else None,
        delivery_pincode=order.address.pincode if order.address else None,
        created_at=order.created_at,
        updated_at=order.updated_at,
        items=order.items,
        address=masked_addr,
    )


@router.get("/{order_code}", response_model=OrderResponse)
def get_order_by_code(
    order_code: str,
    request: Request,
    token: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Retrieve order details for confirmation screen with secure access control.
    
    SECURITY RULE:
    - If customer provides matching order_token or verified phone: full confirmation details returned.
    - If neither is provided: private details (street address, phone, internal admin labels) are masked/stripped.
    """
    enforce_lookup_rate_limit(request)

    clean_code = order_code.strip().upper()
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items),
            joinedload(Order.address),
        )
        .filter(Order.order_code == clean_code)
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order '{clean_code}' not found.",
        )

    # Check if request has full customer access verification
    is_authorized = False
    if token and order.order_token and token == order.order_token:
        is_authorized = True
    elif phone:
        clean_phone = "".join(filter(str.isdigit, phone))
        stored_phone = "".join(filter(str.isdigit, order.phone))
        if clean_phone and stored_phone.endswith(clean_phone[-10:]):
            is_authorized = True

    if is_authorized:
        # Legitimate customer: return authorized full view
        return order

    # Public/unauthenticated view: Strip private customer details so guessing order_code exposes nothing
    sanitized_addr = None
    if order.address:
        sanitized_addr = AddressResponse(
            id=order.address.id,
            name=mask_name(order.address.name),
            phone=mask_phone(order.address.phone),
            pincode=order.address.pincode,
            line1="*** Protected ***",
            line2=None,
            city=order.address.city,
            state=order.address.state,
        )

    return OrderResponse(
        id=order.id,
        order_code=order.order_code,
        order_token=None,  # Do not leak token to unverified requester!
        reservation_expires_at=order.reservation_expires_at,
        admin_notes=None,
        customer_name=mask_name(order.customer_name),
        phone=mask_phone(order.phone),
        status=order.status,
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        razorpay_order_id=None,
        cashfree_order_id=None,
        subtotal=order.subtotal,
        shipping_charge=order.shipping_charge,
        discount=order.discount,
        total=order.total,
        courier_name=order.courier_name,
        tracking_url=order.tracking_url,
        shiprocket_order_id=None,  # Never leak internal Shiprocket IDs
        shipment_id=None,
        awb_code=order.awb_code,
        label_url=None,  # Never leak internal shipping labels publicly
        manifest_url=None,
        pickup_status=None,
        created_at=order.created_at,
        updated_at=order.updated_at,
        items=order.items,
        address=sanitized_addr,
    )


@router.post("/{order_code}/cancel", response_model=OrderResponse)
def cancel_order_by_customer(
    order_code: str,
    payload: OrderCancelRequest,
    db: Session = Depends(get_db),
):
    """Safely cancel an unpaid prepaid order and restore stock immediately.
    
    Allowed when:
    - Customer provides matching order_token
    - Order is in PENDING state and unpaid
    - Restocks items atomically with strict idempotency
    """
    clean_code = order_code.strip().upper()
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items),
            joinedload(Order.address),
        )
        .filter(Order.order_code == clean_code)
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order '{clean_code}' not found.",
        )

    # Verification: must match order_token if set
    if order.order_token and payload.token != order.order_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid order token for cancellation.",
        )

    if order.status not in ("PENDING", "PLACED") or order.payment_status == "PAID":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order '{clean_code}' cannot be cancelled in status '{order.status}'. Please contact customer support.",
        )

    cancelled_order = cancel_order_atomic(
        db,
        order,
        reason=payload.reason or "Cancelled by customer before payment",
        restock=True,
    )
    return cancelled_order

