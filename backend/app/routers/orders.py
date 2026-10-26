from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Order
from app.schemas import OrderCreateRequest, OrderResponse
from app.services.order_service import create_order_transaction

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def place_order(payload: OrderCreateRequest, db: Session = Depends(get_db)):
    """Place a guest order with server-calculated totals and atomic stock decrement.
    
    CRITICAL:
    - Server calculates all totals from database prices.
    - Decrements variant stock atomically.
    - If PREPAID, sets status PENDING.
    - If COD, sets status PLACED.
    """
    order = create_order_transaction(db, payload)
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
