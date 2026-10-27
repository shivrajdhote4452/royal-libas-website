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
def track_order(order_code: str, phone: str, db: Session = Depends(get_db)):
    """Public customer order tracking requiring BOTH order_code and matching phone number.
    
    CRITICAL SECURITY RULE:
    Tracking requires both values. A wrong phone number or missing parameter must
    never expose order data, customer details, or phone numbers.
    """
    clean_code = order_code.strip().upper() if order_code else ""
    clean_phone = "".join(filter(str.isdigit, phone or ""))
    if len(clean_phone) == 12 and clean_phone.startswith("91"):
        clean_phone = clean_phone[2:]

    if not clean_code or len(clean_phone) != 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide both your order reference and 10-digit mobile number.",
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

    # Clean stored phone for comparison
    stored_phone = "".join(filter(str.isdigit, order.phone)) if order else ""
    if len(stored_phone) == 12 and stored_phone.startswith("91"):
        stored_phone = stored_phone[2:]

    if not order or stored_phone != clean_phone:
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
