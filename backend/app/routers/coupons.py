from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Coupon
from app.schemas import CouponValidateRequest, CouponValidateResponse
from app.services.order_service import calculate_coupon_discount

router = APIRouter(prefix="/coupons", tags=["coupons"])


@router.post("/validate", response_model=CouponValidateResponse)
def validate_coupon(payload: CouponValidateRequest, db: Session = Depends(get_db)):
    """Validate a coupon code and return calculated discount for the current subtotal."""
    clean_code = payload.code.strip().upper()
    coupon = (
        db.query(Coupon)
        .filter(Coupon.code == clean_code, Coupon.is_active == True)
        .first()
    )

    if not coupon:
        return CouponValidateResponse(
            valid=False,
            code=clean_code,
            discount=Decimal("0.00"),
            message="Invalid or expired coupon code.",
        )

    if payload.subtotal < coupon.min_order_value:
        return CouponValidateResponse(
            valid=False,
            code=clean_code,
            discount=Decimal("0.00"),
            message=f"Minimum order value of Rs. {coupon.min_order_value} required for this coupon.",
        )

    discount = calculate_coupon_discount(coupon, payload.subtotal)
    return CouponValidateResponse(
        valid=True,
        code=coupon.code,
        discount=discount,
        message=f"Coupon applied! You saved Rs. {discount}",
    )
