import random
import secrets
import string
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models import Product, ProductVariant, Order, OrderItem, Address, Coupon, StoreSetting
from app.schemas import OrderCreateRequest, CartItemValidateRequest, CartValidateResponse, CartValidatedItem


def mask_name(name: str) -> str:
    """Mask customer name for public display, e.g. 'Tanya Sharma' -> 'T**** S****'."""
    if not name:
        return "Customer"
    parts = name.strip().split()
    masked = []
    for p in parts:
        if len(p) <= 2:
            masked.append(p[0] + "*")
        else:
            masked.append(p[0] + "*" * (len(p) - 1))
    return " ".join(masked)


def mask_phone(phone: str) -> str:
    """Mask phone number, e.g. '9876543210' -> '******3210'."""
    clean = "".join(filter(str.isdigit, phone or ""))
    if len(clean) >= 4:
        return "*" * (len(clean) - 4) + clean[-4:]
    return "******"


def generate_order_token() -> str:
    """Generate a secure, unguessable 43-character URL-safe crypto token."""
    return secrets.token_urlsafe(32)


def generate_order_code(db: Session) -> str:
    """Generate a unique human-readable order code, e.g. RL-2026-4829."""
    for _ in range(10):
        suffix = "".join(random.choices(string.digits, k=4))
        code = f"RL-2026-{suffix}"
        exists = db.query(Order).filter(Order.order_code == code).first()
        if not exists:
            return code
    # Fallback with longer random alphanumeric if collision
    fallback_suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"RL-2026-{fallback_suffix}"



def calculate_coupon_discount(coupon: Optional[Coupon], subtotal: Decimal) -> Decimal:
    """Compute discount strictly on the server based on coupon rules."""
    if not coupon or not coupon.is_active:
        return Decimal("0.00")

    if subtotal < coupon.min_order_value:
        return Decimal("0.00")

    if coupon.type == "PERCENT":
        discount = (subtotal * coupon.value) / Decimal("100.00")
    else:  # FLAT
        discount = coupon.value

    # Discount cannot exceed subtotal
    return min(discount.quantize(Decimal("0.01")), subtotal)


def validate_cart_lines(db: Session, items: List[CartItemValidateRequest]) -> CartValidateResponse:
    """Re-check every cart item against live stock and database prices."""
    validated_items: List[CartValidatedItem] = []
    subtotal = Decimal("0.00")
    unavailable_lines: List[str] = []
    is_valid = True

    for item in items:
        variant = (
            db.query(ProductVariant)
            .join(Product)
            .filter(ProductVariant.id == item.variant_id)
            .first()
        )

        if not variant:
            unavailable_lines.append(f"Variant ID {item.variant_id} does not exist.")
            is_valid = False
            continue

        product = variant.product
        unit_price = Decimal(str(variant.selling_price))
        available_stock = variant.stock
        requested_qty = max(1, item.quantity)
        has_sufficient_stock = available_stock >= requested_qty and available_stock > 0

        line_error: Optional[str] = None
        if not product.is_active:
            line_error = f"{product.name} is currently inactive."
            unavailable_lines.append(line_error)
            is_valid = False
        elif available_stock <= 0:
            line_error = f"{product.name} (Size {variant.size}) is sold out."
            unavailable_lines.append(line_error)
            is_valid = False
        elif available_stock < requested_qty:
            line_error = f"Only {available_stock} in stock for {product.name} (Size {variant.size})."
            unavailable_lines.append(line_error)
            is_valid = False

        line_total = (unit_price * Decimal(requested_qty)).quantize(Decimal("0.01"))
        if is_valid and has_sufficient_stock:
            subtotal += line_total

        validated_items.append(
            CartValidatedItem(
                variant_id=variant.id,
                product_id=product.id,
                product_name=product.name,
                slug=product.slug,
                size=variant.size,
                colour=variant.colour,
                unit_price=unit_price,
                quantity=requested_qty,
                line_total=line_total,
                available_stock=available_stock,
                is_available=has_sufficient_stock,
                error=line_error,
            )
        )

    return CartValidateResponse(
        items=validated_items,
        subtotal=subtotal.quantize(Decimal("0.01")),
        is_valid=is_valid,
        unavailable_lines=unavailable_lines,
    )


def create_order_transaction(db: Session, payload: OrderCreateRequest) -> Order:
    """Creates the order with server-calculated totals and atomic stock decrement.
    
    CRITICAL ENGINEERING RULES:
    1. Server calculates subtotal, discount, shipping, and total from database prices.
    2. Stock decrement and order creation happen in one atomic transaction.
    3. Never trust a price or total sent by the client.
    """
    if not payload.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order must contain at least one item.",
        )

    # Lazy cleanup of expired unpaid reservations to reclaim stock
    try:
        expire_unpaid_prepaid_reservations(db)
    except Exception:
        pass

    # Begin transaction
    try:
        subtotal = Decimal("0.00")
        order_items_to_create: List[OrderItem] = []

        # Lock rows or re-verify each variant stock & price directly from DB
        for req_item in payload.items:
            variant = (
                db.query(ProductVariant)
                .with_for_update()  # Row-level lock to prevent race condition / overselling
                .filter(ProductVariant.id == req_item.variant_id)
                .first()
            )

            if not variant:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Selected item (variant ID {req_item.variant_id}) does not exist.",
                )

            product = variant.product
            if not product.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"'{product.name}' is no longer available.",
                )

            if variant.stock < req_item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"That size just sold out! Only {variant.stock} left in stock for '{product.name}' ({variant.size}).",
                )

            # Atomic stock decrement
            variant.stock -= req_item.quantity

            # Server-authoritative unit price from database
            unit_price = Decimal(str(variant.selling_price))
            line_total = (unit_price * Decimal(req_item.quantity)).quantize(Decimal("0.01"))
            subtotal += line_total

            # Snapshot item at order time
            order_item = OrderItem(
                variant_id=variant.id,
                product_name_snapshot=product.name,
                size_snapshot=variant.size,
                colour_snapshot=variant.colour,
                quantity=req_item.quantity,
                unit_price_snapshot=unit_price,
                line_total=line_total,
            )
            order_items_to_create.append(order_item)

        # Shipping charge rule (Backend is single source of truth using StoreSetting):
        payment_method = payload.payment_method.upper().strip()
        shipping_method = (payload.shipping_method or "STANDARD").upper().strip()

        # Query dynamic store settings and enforce payment controls
        store_setting = db.query(StoreSetting).first()
        cod_enabled = bool(store_setting.cod_enabled) if store_setting else False
        online_payment_enabled = bool(store_setting.online_payment_enabled) if store_setting else True

        if not cod_enabled and not online_payment_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Store checkout is currently paused as no payment methods are active. Please check back shortly.",
            )

        if payment_method == "COD":
            if not cod_enabled:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cash on Delivery (COD) is currently unavailable.",
                )
        elif payment_method == "PREPAID":
            if not online_payment_enabled:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Online payment is currently unavailable.",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported payment method '{payload.payment_method}'.",
            )
        cod_threshold = (
            Decimal(str(store_setting.standard_cod_free_threshold))
            if store_setting
            else Decimal("1500.00")
        )
        std_fee = (
            Decimal(str(store_setting.standard_shipping_fee))
            if store_setting
            else Decimal("99.00")
        )
        express_fee = (
            Decimal(str(store_setting.express_shipping_fee))
            if store_setting
            else Decimal("99.00")
        )

        if shipping_method == "EXPRESS":
            shipping_charge = express_fee
        elif payment_method == "PREPAID":
            shipping_charge = Decimal("0.00")
        else:  # COD Standard
            shipping_charge = Decimal("0.00") if subtotal >= cod_threshold else std_fee

        if payment_method == "PREPAID":
            initial_status = "PENDING"
            initial_payment_status = "PENDING"
        else:  # COD
            initial_status = "PLACED"
            initial_payment_status = "PENDING"

        # Validate Coupon if provided
        discount = Decimal("0.00")
        if payload.coupon_code:
            clean_code = payload.coupon_code.strip().upper()
            coupon = (
                db.query(Coupon)
                .filter(Coupon.code == clean_code, Coupon.is_active == True)
                .first()
            )
            if coupon:
                discount = calculate_coupon_discount(coupon, subtotal)

        # Authoritative total calculated by single function
        total = (subtotal - discount + shipping_charge).quantize(Decimal("0.01"))
        order_code = generate_order_code(db)
        order_token = generate_order_token()

        now_utc = datetime.now(timezone.utc)
        reservation_expires_at = (
            now_utc + timedelta(minutes=20) if payment_method == "PREPAID" else None
        )

        # Create Order record
        order = Order(
            order_code=order_code,
            order_token=order_token,
            reservation_expires_at=reservation_expires_at,
            customer_name=payload.customer_name.strip(),
            phone=payload.phone.strip(),
            status=initial_status,
            payment_method=payment_method,
            payment_status=initial_payment_status,
            subtotal=subtotal.quantize(Decimal("0.01")),
            shipping_charge=shipping_charge,
            discount=discount,
            total=total,
        )
        db.add(order)
        db.flush()  # Flush to get order.id

        # Attach OrderItems
        for o_item in order_items_to_create:
            o_item.order_id = order.id
            db.add(o_item)

        # Attach Address
        addr = payload.address
        address = Address(
            order_id=order.id,
            name=addr.name.strip(),
            phone=addr.phone.strip(),
            pincode=addr.pincode.strip(),
            line1=addr.line1.strip(),
            line2=addr.line2.strip() if addr.line2 else None,
            city=addr.city.strip(),
            state=addr.state.strip(),
        )
        db.add(address)

        # Commit entire transaction atomically
        db.commit()
        db.refresh(order)
        return order

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to place order: {str(e)}",
        )


def cancel_order_atomic(
    db: Session,
    order: Order,
    reason: str = "Order cancelled",
    restock: bool = True,
) -> Order:
    """Atomically cancel an order and restock inventory with strict idempotency.
    
    Guarantees:
    - If order is ALREADY cancelled, returns order immediately without duplicate restocking.
    - Locks product variant rows with with_for_update() to prevent concurrent race conditions.
    - Appends audit trail to admin_notes.
    """
    if order.status == "CANCELLED":
        return order  # Strictly idempotent: do NOT restock twice!

    if restock:
        for item in order.items:
            if item.variant_id:
                variant = (
                    db.query(ProductVariant)
                    .with_for_update()
                    .filter(ProductVariant.id == item.variant_id)
                    .first()
                )
                if variant:
                    variant.stock += item.quantity

    order.status = "CANCELLED"
    if order.payment_status in ("PENDING", "FAILED"):
        order.payment_status = "CANCELLED"

    timestamp_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    note_entry = f"[{timestamp_str}] Order cancelled. Reason: {reason}"
    if order.admin_notes:
        order.admin_notes = f"{order.admin_notes}\n{note_entry}"
    else:
        order.admin_notes = note_entry

    db.commit()
    db.refresh(order)
    return order


def expire_unpaid_prepaid_reservations(db: Session) -> int:
    """Find and safely cancel expired prepaid orders whose payment window passed.
    
    Frees up reserved stock for other shoppers without manual intervention.
    """
    now_utc = datetime.now(timezone.utc)
    expired_orders = (
        db.query(Order)
        .filter(
            Order.status == "PENDING",
            Order.payment_method == "PREPAID",
            Order.payment_status == "PENDING",
            Order.reservation_expires_at != None,
            Order.reservation_expires_at < now_utc,
        )
        .all()
    )

    count = 0
    for order in expired_orders:
        cancel_order_atomic(
            db,
            order,
            reason="Unpaid prepaid reservation expired automatically (20-minute timeout)",
            restock=True,
        )
        count += 1

    return count

