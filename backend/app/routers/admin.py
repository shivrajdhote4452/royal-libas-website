from datetime import datetime, date, time
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_admin, verify_password, create_access_token
from app.config import (
    is_shiprocket_configured,
    SHIPROCKET_PICKUP_LOCATION,
    SHIPROCKET_PICKUP_PINCODE,
)
from app.database import get_db
from app.models import Admin, Order, Product, ProductVariant
from app.schemas import (
    AdminLogin,
    AdminResponse,
    TokenResponse,
    AdminDashboardResponse,
    AdminLowStockVariant,
    AdminCustomerResponse,
    OrderResponse,
    OrderStatusUpdateRequest,
    ProductDetailResponse,
    FulfillmentConfigResponse,
    FulfillmentServiceabilityRequest,
    FulfillmentServiceabilityResponse,
    FulfillmentCourierOption,
    FulfillmentShipRequest,
)
from app.services import shiprocket
from app.services.product_service import build_product_detail_response

router = APIRouter(prefix="/admin", tags=["admin"])


# ==========================================
# Admin Authentication & Rate Limiting
# ==========================================

# In-memory sliding window rate limiter for admin login
# Key: client_ip:email, Value: list of failed timestamps
_login_failed_attempts: dict = {}
LOGIN_MAX_FAILED_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 300  # 5 minutes lockout


@router.post("/login", response_model=TokenResponse)
def admin_login(payload: AdminLogin, request: Request, db: Session = Depends(get_db)):
    """Authenticate admin and return JWT access token with brute-force rate limit protection."""
    now_ts = datetime.now().timestamp()
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{payload.email.lower().strip()}"

    # Filter attempts within sliding lockout window
    window_start = now_ts - LOGIN_LOCKOUT_SECONDS
    recent_attempts = [t for t in _login_failed_attempts.get(rate_key, []) if t > window_start]
    _login_failed_attempts[rate_key] = recent_attempts

    if len(recent_attempts) >= LOGIN_MAX_FAILED_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Account temporarily locked for 5 minutes for security. Please try again later.",
            headers={"Retry-After": str(LOGIN_LOCKOUT_SECONDS)},
        )

    admin = db.query(Admin).filter(Admin.email == payload.email.lower().strip()).first()
    if not admin or not verify_password(payload.password, admin.password_hash):
        _login_failed_attempts[rate_key].append(now_ts)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Clear failed attempts on successful login
    if rate_key in _login_failed_attempts:
        del _login_failed_attempts[rate_key]

    token = create_access_token(data={"sub": str(admin.id), "email": admin.email})
    return TokenResponse(access_token=token, token_type="bearer")


@router.get("/me", response_model=AdminResponse)
def get_admin_profile(current_admin: Admin = Depends(get_current_admin)):
    """Retrieve currently authenticated admin profile."""
    return current_admin


# ==========================================
# Dashboard Endpoint
# ==========================================

@router.get("/dashboard", response_model=AdminDashboardResponse)
def get_admin_dashboard(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve shop operations overview: today's orders, to-pack count, and low-stock variants."""
    today_start = datetime.combine(date.today(), time.min)
    today_end = datetime.combine(date.today(), time.max)

    # Orders placed today
    orders_today = (
        db.query(func.count(Order.id))
        .filter(Order.created_at >= today_start, Order.created_at <= today_end)
        .scalar()
        or 0
    )

    # Orders waiting to be packed/shipped
    to_pack_count = (
        db.query(func.count(Order.id))
        .filter(Order.status.in_(["PLACED", "CONFIRMED", "PACKED"]))
        .scalar()
        or 0
    )

    # Total lifetime orders
    total_orders = db.query(func.count(Order.id)).scalar() or 0

    # Low stock variants on active products (stock <= 5)
    low_stock_records = (
        db.query(ProductVariant)
        .join(Product)
        .filter(Product.is_active == True, ProductVariant.stock <= 5)
        .order_by(ProductVariant.stock.asc())
        .all()
    )

    low_stock_variants = [
        AdminLowStockVariant(
            variant_id=v.id,
            product_id=v.product.id,
            product_name=v.product.name,
            product_slug=v.product.slug,
            size=v.size,
            colour=v.colour,
            stock=v.stock,
            selling_price=v.selling_price,
        )
        for v in low_stock_records
    ]

    return AdminDashboardResponse(
        orders_today=orders_today,
        to_pack_count=to_pack_count,
        total_orders=total_orders,
        low_stock_variants=low_stock_variants,
    )


# ==========================================
# Order Management Endpoints
# ==========================================

@router.get("/orders", response_model=List[OrderResponse])
def admin_list_orders(
    status: Optional[str] = None,
    date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """List orders with optional status or date filters, sorted newest first."""
    query = (
        db.query(Order)
        .options(
            joinedload(Order.items),
            joinedload(Order.address),
        )
    )

    if status and status.upper() != "ALL":
        query = query.filter(Order.status == status.upper())

    if date:
        try:
            filter_date = datetime.strptime(date.strip(), "%Y-%m-%d").date()
            d_start = datetime.combine(filter_date, time.min)
            d_end = datetime.combine(filter_date, time.max)
            query = query.filter(Order.created_at >= d_start, Order.created_at <= d_end)
        except ValueError:
            pass

    return query.order_by(Order.created_at.desc()).all()


@router.get("/orders/{id}", response_model=OrderResponse)
def admin_get_order(
    id: int,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve single order details for admin inspection and fulfillment."""
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items),
            joinedload(Order.address),
        )
        .filter(Order.id == id)
        .first()
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order #{id} not found.",
        )
    return order


@router.patch("/orders/{id}/status", response_model=OrderResponse)
def admin_update_order_status(
    id: int,
    payload: OrderStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Update order status and optionally attach courier details.
    
    Rule: Marking an order SHIPPED requires a valid courier tracking link.
    """
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items),
            joinedload(Order.address),
        )
        .filter(Order.id == id)
        .first()
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order #{id} not found.",
        )

    target_status = payload.status.upper().strip()

    if target_status == "SHIPPED":
        tracking = (payload.tracking_url or order.tracking_url or "").strip()
        if not tracking:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Courier tracking link is required when marking an order Shipped.",
            )

    # Restock inventory atomically in the same transaction if order is cancelled
    if target_status == "CANCELLED" and order.status != "CANCELLED":
        # Cancellation rule:
        # If order is cancelled BEFORE pickup and it has a Shiprocket shipment, call cancel_order.
        # If already picked up, show "already picked up — cannot cancel via Shiprocket" and do not call cancel.
        if order.shiprocket_order_id:
            curr_pickup = (order.pickup_status or "").upper().strip()
            is_picked_up = any(p in curr_pickup for p in ("PICKED_UP", "PICKED", "IN_TRANSIT", "DELIVERED"))
            if not is_picked_up and order.awb_code:
                try:
                    tr = shiprocket.track(order.awb_code)
                    c_stat = (tr.get("current_status") or "").upper().strip()
                    if any(p in c_stat for p in ("PICKED", "IN TRANSIT", "OUT FOR DELIVERY", "DELIVERED")):
                        is_picked_up = True
                except Exception:
                    pass

            if is_picked_up:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="already picked up — cannot cancel via Shiprocket",
                )
            else:
                try:
                    shiprocket.cancel_order(order.shiprocket_order_id)
                except Exception:
                    pass

        for item in order.items:
            if item.variant_id:
                variant = db.query(ProductVariant).filter(ProductVariant.id == item.variant_id).first()
                if variant:
                    variant.stock += item.quantity

    order.status = target_status
    if payload.courier_name is not None:
        order.courier_name = payload.courier_name.strip() or None
    if payload.tracking_url is not None:
        order.tracking_url = payload.tracking_url.strip() or None

    db.commit()
    db.refresh(order)
    return order


# ==========================================
# Shiprocket Fulfillment Endpoints
# ==========================================

@router.get("/fulfillment/config", response_model=FulfillmentConfigResponse)
def admin_get_fulfillment_config(
    current_admin: Admin = Depends(get_current_admin),
):
    """Return Shiprocket integration status and configuration state for admin."""
    configured = is_shiprocket_configured()
    return FulfillmentConfigResponse(
        is_configured=configured,
        provider_name="Shiprocket",
        button_label="Ship via Shiprocket",
        disabled_reason=None if configured else "Shiprocket not configured — use manual tracking",
    )


@router.post("/orders/{id}/fulfillment/serviceability", response_model=FulfillmentServiceabilityResponse)
def admin_check_fulfillment_serviceability(
    id: int,
    payload: FulfillmentServiceabilityRequest,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Check courier serviceability and rates for an order via Shiprocket."""
    if not is_shiprocket_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Shiprocket not configured — use manual tracking",
        )

    order = db.query(Order).options(joinedload(Order.address)).filter(Order.id == id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order #{id} not found.")

    if order.status == "CANCELLED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot check serviceability for a cancelled order.")

    if payload.length <= 0 or payload.breadth <= 0 or payload.height <= 0 or payload.weight <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter the packed parcel's weight and dimensions",
        )

    delivery_pincode = (order.address.pincode if order.address else "").strip() or "452001"
    cod = (order.payment_method == "COD")

    result = shiprocket.check_serviceability(
        pickup_pincode=SHIPROCKET_PICKUP_PINCODE,
        delivery_pincode=delivery_pincode,
        weight_kg=payload.weight,
        cod=cod,
    )

    couriers = []
    rec_id = result.get("recommended_courier_company_id")
    for c in result.get("available_courier_companies", []):
        cid = c.get("courier_company_id")
        cname = c.get("courier_name") or f"Courier #{cid}"
        rate = float(c.get("rate") or c.get("freight_charge") or 0.0)
        etd = c.get("etd") or c.get("estimated_delivery_days")
        couriers.append(
            FulfillmentCourierOption(
                courier_company_id=cid,
                courier_name=cname,
                rate=rate,
                etd=str(etd) if etd else None,
                is_recommended=(cid == rec_id),
            )
        )

    return FulfillmentServiceabilityResponse(
        available_couriers=couriers,
        recommended_courier_id=rec_id,
    )


@router.post("/orders/{id}/fulfillment/ship", response_model=OrderResponse)
def admin_ship_order_via_shiprocket(
    id: int,
    payload: FulfillmentShipRequest,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Execute Shiprocket fulfillment flow for an order.
    
    Order: create_order -> assign_awb -> generate_pickup -> generate_label -> generate_manifest.
    Idempotent: resumes from existing shipment_id or awb_code on retry.
    """
    if not is_shiprocket_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Shiprocket not configured — use manual tracking",
        )

    order = (
        db.query(Order)
        .options(
            joinedload(Order.items),
            joinedload(Order.address),
        )
        .filter(Order.id == id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order #{id} not found.")

    if order.status == "CANCELLED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot ship a cancelled order.")

    # Only shippable orders: prepaid-confirmed (PAID) or COD
    if order.payment_method == "PREPAID" and order.payment_status != "PAID":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prepaid order is not confirmed paid yet. Cannot ship unpaid orders.",
        )

    # Required parcel length, breadth, height, weight
    if payload.length <= 0 or payload.breadth <= 0 or payload.height <= 0 or payload.weight <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter the packed parcel's weight and dimensions",
        )

    # Step 1: Create Order in Shiprocket (if not already created)
    if not order.shipment_id:
        items_payload = []
        for it in order.items:
            sku = f"RL-V{it.variant_id}" if it.variant_id else f"RL-I{it.id}"
            items_payload.append({
                "name": it.product_name_snapshot,
                "sku": sku,
                "units": it.quantity,
                "selling_price": float(it.unit_price_snapshot),
                "discount": 0,
            })

        addr = order.address
        created_str = (
            order.created_at.strftime("%Y-%m-%d %H:%M")
            if order.created_at
            else datetime.now().strftime("%Y-%m-%d %H:%M")
        )
        pm = "COD" if order.payment_method == "COD" else "Prepaid"

        sr_order_payload = {
            "order_id": order.order_code,
            "order_date": created_str,
            "pickup_location": SHIPROCKET_PICKUP_LOCATION,
            "billing_customer_name": order.customer_name,
            "billing_last_name": "",
            "billing_address": addr.line1 if addr else "Atelier",
            "billing_address_2": addr.line2 or "" if addr else "",
            "billing_city": addr.city if addr else "City",
            "billing_pincode": addr.pincode if addr else "000000",
            "billing_state": addr.state if addr else "State",
            "billing_country": "India",
            "billing_email": "concierge@royallibas.com",
            "billing_phone": order.phone,
            "shipping_is_billing": True,
            "order_items": items_payload,
            "payment_method": pm,
            "sub_total": float(order.total),
            "length": payload.length,
            "breadth": payload.breadth,
            "height": payload.height,
            "weight": payload.weight,
        }

        created = shiprocket.create_order(sr_order_payload)
        order.shiprocket_order_id = created["shiprocket_order_id"]
        order.shipment_id = created["shipment_id"]
        db.commit()  # Persist IDs immediately to enable resume on retry!

    # Step 2: Assign AWB (if not already assigned)
    if not order.awb_code:
        awb_res = shiprocket.assign_awb(order.shipment_id, payload.courier_id)
        order.awb_code = awb_res["awb_code"]
        order.courier_name = awb_res["courier_name"]
        order.tracking_url = f"https://shiprocket.co/tracking/{order.awb_code}"
        db.commit()

    # Step 3: Schedule Pickup
    if not order.pickup_status or order.pickup_status in ("SCHEDULE_FAILED", ""):
        try:
            pickup_res = shiprocket.generate_pickup(order.shipment_id)
            order.pickup_status = pickup_res.get("pickup_status", "SCHEDULED")
            db.commit()
        except Exception:
            order.pickup_status = "SCHEDULE_PENDING"
            db.commit()

    # Step 4: Generate Label
    if not order.label_url:
        try:
            label_res = shiprocket.generate_label(order.shipment_id)
            if label_res.get("label_url"):
                order.label_url = label_res["label_url"]
                db.commit()
        except Exception:
            pass

    # Step 5: Generate Manifest
    if not order.manifest_url:
        try:
            manifest_res = shiprocket.generate_manifest(order.shipment_id)
            if manifest_res.get("manifest_url"):
                order.manifest_url = manifest_res["manifest_url"]
                db.commit()
        except Exception:
            pass

    # Step 6: Mark order status as SHIPPED
    order.status = "SHIPPED"
    db.commit()
    db.refresh(order)
    return order


@router.post("/orders/{id}/fulfillment/refresh-tracking", response_model=OrderResponse)
def admin_refresh_fulfillment_tracking(
    id: int,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Live refresh tracking details for an order with an active AWB code."""
    order = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.address))
        .filter(Order.id == id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order #{id} not found.")

    if not order.awb_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order does not have an active AWB code to track.",
        )

    track_res = shiprocket.track(order.awb_code)
    curr_status = (track_res.get("current_status") or "").upper().strip()

    if "DELIVERED" in curr_status:
        order.status = "DELIVERED"
    elif any(s in curr_status for s in ("IN TRANSIT", "OUT FOR DELIVERY", "SHIPPED", "PICKED UP")):
        order.status = "SHIPPED"

    db.commit()
    db.refresh(order)
    return order


# ==========================================
# Customer List Endpoint (Read-Only)
# ==========================================

@router.get("/customers", response_model=List[AdminCustomerResponse])
def admin_list_customers(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Read-only customer list built from orders: name, phone, order count, total spent."""
    orders = db.query(Order).order_by(Order.created_at.desc()).all()
    cust_map = {}
    for o in orders:
        clean_phone = o.phone.strip()
        if clean_phone not in cust_map:
            cust_map[clean_phone] = {
                "name": o.customer_name,
                "phone": clean_phone,
                "order_count": 0,
                "total_spent": Decimal("0.00"),
                "last_order_date": o.created_at,
            }
        cust_map[clean_phone]["order_count"] += 1
        cust_map[clean_phone]["total_spent"] += o.total

    return [
        AdminCustomerResponse(
            name=c["name"],
            phone=c["phone"],
            order_count=c["order_count"],
            total_spent=c["total_spent"].quantize(Decimal("0.01")),
            last_order_date=c["last_order_date"],
        )
        for c in cust_map.values()
    ]


# ==========================================
# Products Management Endpoint for Admin
# ==========================================

@router.get("/products", response_model=List[ProductDetailResponse])
def admin_list_products(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve all products (active and inactive) with all variants for admin catalogue management."""
    products = (
        db.query(Product)
        .options(
            joinedload(Product.variants),
            joinedload(Product.images),
            joinedload(Product.collections),
        )
        .order_by(Product.id.desc())
        .all()
    )
    return [build_product_detail_response(p) for p in products]
