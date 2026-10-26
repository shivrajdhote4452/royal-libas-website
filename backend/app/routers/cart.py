from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import CartValidateRequest, CartValidateResponse
from app.services.order_service import validate_cart_lines

router = APIRouter(prefix="/cart", tags=["cart"])


@router.post("/validate", response_model=CartValidateResponse)
def validate_cart(payload: CartValidateRequest, db: Session = Depends(get_db)):
    """Re-check every cart line against live stock and database prices.
    
    Returns corrected unit prices, line totals, server subtotal, and any unavailable lines.
    """
    return validate_cart_lines(db, payload.items)
