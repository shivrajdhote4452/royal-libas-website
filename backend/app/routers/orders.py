from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Order
from app.schemas import OrderCreateRequest, OrderResponse, OrderTrackResponse
from app.services.order_service import create_order_transaction

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def place_order(payload: OrderCreateRequest, db: Session = Depends(get_db)):
    """Place a guest order with server-calculated totals and atomic stock decrement."""
    order = create_order_transaction(db, payload)
    return order


@router.get("/track", response_model=OrderTrackResponse)
def track_order(
    order_code: Optional[str] = None,
    phone: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Public customer order tracking supporting order_code lookup.
    
    CRITICAL SECURITY & PRIVACY RULES:
    1. Lookup by order code alone returns tracking details.
    2. Lookup with both order code and phone validates that the phone matches the order.
    3. Phone-alone lookup is strictly blocked to protect customer privacy.
    """
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

    # When phone is provided, validate length
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
            detail="Order not found. Please check your order code.",
        )

    # If phone was provided, verify phone matches
    if has_phone:
        stored_phone = "".join(filter(str.isdigit, order.phone))
        if len(stored_phone) == 12 and stored_phone.startswith("91"):
            stored_phone = stored_phone[2:]

        if stored_phone != clean_phone:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found. Please check your order code and the phone number used at checkout.",
            )

    return order


@router.get("/{order_code}", response_model=OrderResponse)
def get_order_by_code(order_code: str, db: Session = Depends(get_db)):
    """Retrieve order details for the customer order confirmation screen."""
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items),
            joinedload(Order.address),
        )
        .filter(Order.order_code == order_code)
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order '{order_code}' not found.",
        )

    return order
