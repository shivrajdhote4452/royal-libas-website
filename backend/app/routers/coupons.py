from typing import List
from decimal import Decimal
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Coupon
from app.schemas import CouponValidateRequest, CouponValidateResponse, CouponPublicResponse
from app.services.order_service import calculate_coupon_discount

router = APIRouter(prefix="/coupons", tags=["coupons"])


@router.get("", response_model=List[CouponPublicResponse])
def list_active_coupons(
    public_only: bool = True,
    db: Session = Depends(get_db),
):
    """List currently active promotional coupons.
    Exclusively returns coupons designated for public storefront promotion (is_public=True).
    Private/VIP coupons (is_public=False) are never exposed via unauthenticated public listings,
    even if active. Direct validation via POST /coupons/validate remains available for private codes.
    """
    now = datetime.now(timezone.utc)
    # Public storefront listings strictly require is_active=True and is_public=True
    query = db.query(Coupon).filter(
        Coupon.is_active == True,
        Coupon.is_public == True,
    )
    all_coupons = query.order_by(Coupon.id.asc()).all()
    active_coupons = []
    for c in all_coupons:
        if c.valid_from:
            vf = c.valid_from if c.valid_from.tzinfo else c.valid_from.replace(tzinfo=timezone.utc)
            if vf > now:
                continue
        if c.valid_until:
            vu = c.valid_until if c.valid_until.tzinfo else c.valid_until.replace(tzinfo=timezone.utc)
            if vu < now:
                continue
        if c.usage_limit is not None and (c.used_count or 0) >= c.usage_limit:
            continue
        active_coupons.append(c)
    return active_coupons


@router.post("/validate", response_model=CouponValidateResponse)
def validate_coupon(payload: CouponValidateRequest, db: Session = Depends(get_db)):
    """Validate a coupon code and return calculated discount for the current subtotal."""
    clean_code = payload.code.strip().upper()
    now = datetime.now(timezone.utc)
    coupon = (
        db.query(Coupon)
        .filter(func.upper(Coupon.code) == clean_code)
        .first()
    )

    if not coupon or not coupon.is_active:
        return CouponValidateResponse(
            valid=False,
            code=clean_code,
            discount=Decimal("0.00"),
            message="Invalid or inactive coupon code.",
        )

    if coupon.valid_from:
        vf = coupon.valid_from if coupon.valid_from.tzinfo else coupon.valid_from.replace(tzinfo=timezone.utc)
        if vf > now:
            return CouponValidateResponse(
                valid=False,
                code=clean_code,
                discount=Decimal("0.00"),
                message="This coupon is not active yet.",
            )

    if coupon.valid_until:
        vu = coupon.valid_until if coupon.valid_until.tzinfo else coupon.valid_until.replace(tzinfo=timezone.utc)
        if vu < now:
            return CouponValidateResponse(
                valid=False,
                code=clean_code,
                discount=Decimal("0.00"),
                message="This coupon has expired.",
            )

    if coupon.usage_limit is not None and (coupon.used_count or 0) >= coupon.usage_limit:
        return CouponValidateResponse(
            valid=False,
            code=clean_code,
            discount=Decimal("0.00"),
            message="This coupon has reached its maximum usage limit.",
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
