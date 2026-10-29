from pathlib import Path
from datetime import datetime, date, time, timedelta, timezone
from decimal import Decimal
import io
import csv
import json
import random
import string
from typing import List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File, Query, Form
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_admin, verify_password, hash_password, create_access_token, require_roles
from app.config import (
    is_shiprocket_configured,
    SHIPROCKET_PICKUP_LOCATION,
    SHIPROCKET_PICKUP_PINCODE,
)
from app.database import get_db
from app.models import (
    Admin,
    Order,
    OrderItem,
    Address,
    Product,
    ProductVariant,
    ProductImage,
    Collection,
    StoreSetting,
    StockAdjustment,
    ReturnRequest,
    ContactInquiry,
    ActivityLog,
    MediaAsset,
    SizeChart,
)
from app.schemas import (
    AdminLogin,
    AdminResponse,
    TokenResponse,
    AdminDashboardResponse,
    AdminLowStockVariant,
    AdminCustomerResponse,
    OrderResponse,
    OrderStatusUpdateRequest,
    ProductCreate,
    ProductUpdate,
    ProductDetailResponse,
    ProductVariantCreate,
    ProductVariantUpdate,
    ProductVariantResponse,
    FulfillmentConfigResponse,
    FulfillmentServiceabilityRequest,
    FulfillmentServiceabilityResponse,
    FulfillmentCourierOption,
    FulfillmentShipRequest,
    StoreSettingResponse,
    StoreSettingUpdate,
    AdminUserResponse,
    AdminCreate,
    AdminRoleUpdate,
    ActivityLogResponse,
    StockAdjustmentCreate,
    StockAdjustmentResponse,
    ReturnRequestCreate,
    ReturnStatusUpdateRequest,
    ReturnRequestResponse,
    SizeChartCreate,
    SizeChartUpdate,
    SizeChartResponse,
    MediaAssetResponse,
    MediaAssetProductUsage,
    MediaUploadFailure,
    MediaUploadBatchResponse,
    ContactInquiryDetail,
    ContactInquiryReply,
    PaymentRecordResponse,
    ShipmentRecordResponse,
    ReportSummaryResponse,
)
from app.services import shiprocket
from app.services.cloudinary_service import (
    upload_to_cloudinary,
    delete_from_cloudinary,
    get_video_poster_url,
    detect_resource_type,
    is_cloudinary_configured,
    read_bounded_file,
    validate_media_file,
    MAX_BATCH_FILES,
    MAX_VIDEO_SIZE_BYTES,
)
from app.services.payment_service import sync_cashfree_payment_status
from app.services.product_service import build_product_detail_response, build_variant_response

router = APIRouter(prefix="/admin", tags=["admin"])


# ==========================================
# Activity Logging Helper
# ==========================================

def log_activity(
    db: Session,
    admin: Admin,
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    details: Optional[str] = None,
):
    """Safely log critical administrative operations for auditability."""
    try:
        entry = ActivityLog(
            actor_email=admin.email,
            actor_role=admin.role or "OWNER",
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            details=details,
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        db.rollback()
        # Fallback print to prevent breaking primary workflow if logging encounters transient issue
        print(f"[ActivityLog Error] {e}")


# ==========================================
# Admin Authentication & Rate Limiting
# ==========================================

_login_failed_attempts: dict = {}
LOGIN_MAX_FAILED_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 300  # 5 minutes lockout


@router.post("/login", response_model=TokenResponse)
def admin_login(payload: AdminLogin, request: Request, db: Session = Depends(get_db)):
    """Authenticate admin and return JWT access token with brute-force rate limit protection."""
    now_ts = datetime.now().timestamp()
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{payload.email.lower().strip()}"

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

    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is inactive. Please contact store owner.",
        )

    if rate_key in _login_failed_attempts:
        del _login_failed_attempts[rate_key]

    token = create_access_token(data={"sub": str(admin.id), "email": admin.email, "role": admin.role or "OWNER"})
    log_activity(db, admin, "ADMIN_LOGIN", "admin", admin.id, f"Successful login from {client_ip}")
    return TokenResponse(access_token=token, token_type="bearer")


@router.get("/me", response_model=AdminResponse)
def get_admin_profile(current_admin: Admin = Depends(get_current_admin)):
    """Retrieve currently authenticated admin profile with role information."""
    return current_admin


# ==========================================
# Dashboard Endpoint (Real Database Metrics)
# ==========================================

@router.get("/dashboard", response_model=AdminDashboardResponse)
def get_admin_dashboard(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve real database-backed metrics for the boutique owner.
    
    Truthful revenue calculation:
      - Prepaid revenue strictly counts PAID orders.
      - COD pending amounts are tracked separately and not presented as collected revenue.
    """
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist_tz)
    today_start_ist = datetime.combine(now_ist.date(), time.min).replace(tzinfo=ist_tz)
    today_end_ist = datetime.combine(now_ist.date(), time.max).replace(tzinfo=ist_tz)
    utc_start = today_start_ist.astimezone(timezone.utc).replace(tzinfo=None)
    utc_end = today_end_ist.astimezone(timezone.utc).replace(tzinfo=None)

    # Orders today
    orders_today = (
        db.query(func.count(Order.id))
        .filter(Order.created_at >= utc_start, Order.created_at <= utc_end)
        .scalar()
        or 0
    )

    # Orders to pack
    to_pack_count = (
        db.query(func.count(Order.id))
        .filter(Order.status.in_(["PLACED", "CONFIRMED", "PACKED"]))
        .scalar()
        or 0
    )

    total_orders = db.query(func.count(Order.id)).scalar() or 0

    # Pending / failed payment checks
    pending_prepaid_count = (
        db.query(func.count(Order.id))
        .filter(Order.payment_method == "PREPAID", Order.payment_status == "PENDING", Order.status != "CANCELLED")
        .scalar()
        or 0
    )
    failed_payment_count = (
        db.query(func.count(Order.id))
        .filter(Order.payment_status == "FAILED")
        .scalar()
        or 0
    )

    # Shipments awaiting creation or pickup
    awaiting_shipment_count = (
        db.query(func.count(Order.id))
        .filter(
            Order.status.in_(["CONFIRMED", "PACKED"]),
            or_(Order.awb_code == None, Order.awb_code == ""),
            Order.status != "CANCELLED",
        )
        .scalar()
        or 0
    )
    awaiting_pickup_count = (
        db.query(func.count(Order.id))
        .filter(
            Order.status == "SHIPPED",
            Order.awb_code != None,
            or_(Order.pickup_status == None, Order.pickup_status.in_(["SCHEDULED", "SCHEDULE_PENDING", ""])),
        )
        .scalar()
        or 0
    )

    # Low-stock (<= 5) and out-of-stock variants
    low_stock_count = (
        db.query(func.count(ProductVariant.id))
        .join(Product)
        .filter(Product.is_active == True, ProductVariant.stock > 0, ProductVariant.stock <= 5)
        .scalar()
        or 0
    )
    out_of_stock_count = (
        db.query(func.count(ProductVariant.id))
        .join(Product)
        .filter(Product.is_active == True, ProductVariant.stock == 0)
        .scalar()
        or 0
    )

    # Truthful Revenue metrics today
    today_paid_prepaid = (
        db.query(func.sum(Order.total))
        .filter(
            Order.created_at >= utc_start,
            Order.created_at <= utc_end,
            Order.payment_method == "PREPAID",
            Order.payment_status == "PAID",
        )
        .scalar()
        or Decimal("0.00")
    )
    today_pending_cod = (
        db.query(func.sum(Order.total))
        .filter(
            Order.created_at >= utc_start,
            Order.created_at <= utc_end,
            Order.payment_method == "COD",
            Order.payment_status != "PAID",
            Order.status != "CANCELLED",
        )
        .scalar()
        or Decimal("0.00")
    )

    # Recent orders (latest 10)
    recent_orders = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.address))
        .order_by(Order.created_at.desc())
        .limit(10)
        .all()
    )

    # Low stock variant list
    low_stock_records = (
        db.query(ProductVariant)
        .join(Product)
        .filter(Product.is_active == True, ProductVariant.stock <= 5)
        .order_by(ProductVariant.stock.asc())
        .limit(10)
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
        pending_prepaid_count=pending_prepaid_count,
        failed_payment_count=failed_payment_count,
        awaiting_shipment_count=awaiting_shipment_count,
        awaiting_pickup_count=awaiting_pickup_count,
        low_stock_count=low_stock_count,
        out_of_stock_count=out_of_stock_count,
        today_revenue_prepaid=today_paid_prepaid,
        today_pending_cod=today_pending_cod,
        recent_orders=recent_orders,
        low_stock_variants=low_stock_variants,
    )


# ==========================================
# Orders Management Endpoints
# ==========================================

@router.get("/orders", response_model=List[OrderResponse])
def admin_list_orders(
    status: Optional[str] = None,
    payment_status: Optional[str] = None,
    payment_method: Optional[str] = None,
    search: Optional[str] = None,
    date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """List orders with filters for search, status, payment state, and date."""
    query = db.query(Order).options(joinedload(Order.items), joinedload(Order.address))

    if status and status.upper() != "ALL":
        query = query.filter(Order.status == status.upper())

    if payment_status and payment_status.upper() != "ALL":
        query = query.filter(Order.payment_status == payment_status.upper())

    if payment_method and payment_method.upper() != "ALL":
        query = query.filter(Order.payment_method == payment_method.upper())

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Order.order_code.ilike(s),
                Order.customer_name.ilike(s),
                Order.phone.ilike(s),
            )
        )

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
    """Retrieve complete order details for fulfillment, payment reconciliation, and audit."""
    order = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.address))
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
    """Update order status with strict business transitions and inventory restocking on cancellation."""
    order = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.address))
        .filter(Order.id == id)
        .first()
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order #{id} not found.",
        )

    target_status = payload.status.upper().strip()
    old_status = order.status

    # Prevent invalid transitions
    if old_status == "CANCELLED" and target_status != "CANCELLED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reactivate an order that has already been cancelled and restocked.",
        )

    if old_status == "DELIVERED" and target_status in ("PENDING", "PLACED", "CONFIRMED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order is already delivered. Cannot regress back to unfulfilled states.",
        )

    if target_status == "SHIPPED":
        tracking = (payload.tracking_url or order.tracking_url or "").strip()
        if not tracking and not order.awb_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Courier tracking link is required when marking an order Shipped.",
            )

    # Restock inventory atomically and cancel Shiprocket shipment if order is cancelled
    if target_status == "CANCELLED" and order.status != "CANCELLED":
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
                except Exception as cancel_err:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"Shiprocket cancellation failed ({str(cancel_err)}). Please cancel the shipment directly in the Shiprocket dashboard before restocking.",
                    )

        # Restock variants
        for item in order.items:
            if item.variant_id:
                variant = db.query(ProductVariant).with_for_update().filter(ProductVariant.id == item.variant_id).first()
                if variant:
                    prev_stock = variant.stock
                    variant.stock += item.quantity
                    adj = StockAdjustment(
                        variant_id=variant.id,
                        previous_stock=prev_stock,
                        new_stock=variant.stock,
                        change_amount=item.quantity,
                        reason="ORDER_CANCELLED",
                        note=f"Restocked {item.quantity} units from cancelled order {order.order_code}",
                        actor_email=current_admin.email,
                    )
                    db.add(adj)

    order.status = target_status
    if payload.courier_name is not None:
        order.courier_name = payload.courier_name.strip() or None
    if payload.tracking_url is not None:
        order.tracking_url = payload.tracking_url.strip() or None

    db.commit()
    db.refresh(order)
    log_activity(
        db,
        current_admin,
        "ORDER_STATUS_UPDATED",
        "order",
        order.id,
        f"Status changed from {old_status} to {target_status}",
    )
    return order


@router.patch("/orders/{id}/notes", response_model=OrderResponse)
def admin_update_order_notes(
    id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Save staff internal notes on an order."""
    order = db.query(Order).filter(Order.id == id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order #{id} not found.")

    notes_text = payload.get("notes", "").strip()
    order.admin_notes = notes_text
    db.commit()
    db.refresh(order)
    log_activity(db, current_admin, "ORDER_NOTE_UPDATED", "order", order.id, "Staff note updated")
    return order


# ==========================================
# Payments Management Page Endpoints
# ==========================================

@router.get("/payments", response_model=List[PaymentRecordResponse])
def admin_list_payments(
    status: Optional[str] = None,
    method: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """List all payment records derived truthfully from orders."""
    query = db.query(Order)

    if status and status.upper() != "ALL":
        query = query.filter(Order.payment_status == status.upper())

    if method and method.upper() != "ALL":
        query = query.filter(Order.payment_method == method.upper())

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Order.order_code.ilike(s),
                Order.customer_name.ilike(s),
                Order.phone.ilike(s),
                Order.cashfree_order_id.ilike(s),
            )
        )

    orders = query.order_by(Order.created_at.desc()).all()
    results = []
    for o in orders:
        results.append(
            PaymentRecordResponse(
                order_id=o.id,
                order_code=o.order_code,
                customer_name=o.customer_name,
                customer_phone=o.phone,
                amount=o.total,
                payment_method=o.payment_method,
                payment_status=o.payment_status,
                cashfree_order_id=o.cashfree_order_id,
                order_status=o.status,
                created_at=o.created_at,
                is_reconciled=(o.payment_status == "PAID"),
            )
        )
    return results


@router.post("/payments/sync/{order_code}")
def admin_sync_payment_status(
    order_code: str,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Perform server-side Cashfree reconciliation for an order."""
    ok, msg, order = sync_cashfree_payment_status(db, order_code.strip().upper())
    log_activity(
        db,
        current_admin,
        "PAYMENT_RECONCILED",
        "payment",
        order.id,
        f"Reconciled Cashfree status for {order.order_code}: {order.payment_status} ({msg})",
    )
    return {
        "status": "success" if ok else "error",
        "order_code": order.order_code,
        "payment_status": order.payment_status,
        "order_status": order.status,
        "message": msg,
        "is_paid": (order.payment_status == "PAID"),
    }


@router.post("/payments/cod-collect/{order_id}", response_model=OrderResponse)
def admin_record_cod_collection(
    order_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Mark a COD order as successfully collected/paid by courier or boutique delivery."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order #{order_id} not found.")

    if order.payment_method != "COD":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only COD orders can have cash collection recorded.")

    note_text = payload.get("staff_notes", "").strip() or "COD cash received and confirmed."
    order.payment_status = "PAID"
    timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    current_notes = order.admin_notes or ""
    note_entry = f"[{timestamp_str} by {current_admin.email}] COD Collected: {note_text}"
    order.admin_notes = f"{current_notes}\n{note_entry}".strip() if current_notes else note_entry

    db.commit()
    db.refresh(order)
    log_activity(
        db,
        current_admin,
        "COD_PAYMENT_COLLECTED",
        "payment",
        order.id,
        f"Recorded cash collection of ₹{order.total} for {order.order_code}",
    )
    return order


# ==========================================
# Shipping & Pickups Page Endpoints
# ==========================================

@router.get("/shipping", response_model=List[ShipmentRecordResponse])
def admin_list_shipments(
    tab: Optional[str] = "all",
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """List shipment records with courier, AWB, pickup status, and label links."""
    query = db.query(Order).options(joinedload(Order.address))

    if tab == "awaiting_shipment":
        query = query.filter(
            Order.status.in_(["CONFIRMED", "PACKED"]),
            or_(Order.awb_code == None, Order.awb_code == ""),
            Order.status != "CANCELLED",
        )
    elif tab == "active_shipments":
        query = query.filter(
            Order.awb_code != None,
            Order.awb_code != "",
            Order.status.in_(["SHIPPED", "CONFIRMED", "PACKED"]),
        )
    elif tab == "delivered":
        query = query.filter(Order.status == "DELIVERED")

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Order.order_code.ilike(s),
                Order.customer_name.ilike(s),
                Order.phone.ilike(s),
                Order.awb_code.ilike(s),
                Order.courier_name.ilike(s),
            )
        )

    orders = query.order_by(Order.created_at.desc()).all()
    results = []
    for o in orders:
        results.append(
            ShipmentRecordResponse(
                order_id=o.id,
                order_code=o.order_code,
                customer_name=o.customer_name,
                customer_phone=o.phone,
                delivery_pincode=o.address.pincode if o.address else None,
                delivery_city=o.address.city if o.address else None,
                status=o.status,
                payment_method=o.payment_method,
                shiprocket_order_id=o.shiprocket_order_id,
                shipment_id=o.shipment_id,
                awb_code=o.awb_code,
                courier_name=o.courier_name,
                pickup_status=o.pickup_status,
                tracking_url=o.tracking_url,
                label_url=o.label_url,
                manifest_url=o.manifest_url,
                created_at=o.created_at,
            )
        )
    return results


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
    """Execute Shiprocket fulfillment flow for an order."""
    if not is_shiprocket_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Shiprocket not configured — use manual tracking",
        )

    order = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.address))
        .filter(Order.id == id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order #{id} not found.")

    if order.status == "CANCELLED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot ship a cancelled order.")

    if order.payment_method == "PREPAID" and order.payment_status != "PAID":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prepaid order is not confirmed paid yet. Cannot ship unpaid orders.",
        )

    if order.payment_method == "COD" and order.status not in ("CONFIRMED", "PACKED", "READY_FOR_PICKUP", "SHIPPED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="COD orders must be verified with customer and marked CONFIRMED before fulfilling shipment.",
        )

    if payload.length <= 0 or payload.breadth <= 0 or payload.height <= 0 or payload.weight <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter the packed parcel's weight and dimensions",
        )

    # Step 1: Create Order in Shiprocket
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
        db.commit()

    # Step 2: Assign AWB
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
    log_activity(
        db,
        current_admin,
        "SHIPMENT_CREATED",
        "order",
        order.id,
        f"Shiprocket AWB: {order.awb_code}, Courier: {order.courier_name}",
    )
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
    log_activity(db, current_admin, "TRACKING_REFRESHED", "order", order.id, f"Current status: {curr_status}")
    return order


# ==========================================
# Inventory Management & Adjustments
# ==========================================

@router.get("/inventory")
def admin_list_inventory(
    filter: Optional[str] = "all",
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve variant-level inventory with stock levels and filtering."""
    query = (
        db.query(ProductVariant)
        .join(Product)
        .options(joinedload(ProductVariant.product).joinedload(Product.images))
    )

    if filter == "low_stock":
        query = query.filter(ProductVariant.stock > 0, ProductVariant.stock <= 5)
    elif filter == "out_of_stock":
        query = query.filter(ProductVariant.stock == 0)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Product.name.ilike(s),
                ProductVariant.sku.ilike(s),
                ProductVariant.colour.ilike(s),
            )
        )

    variants = query.order_by(ProductVariant.stock.asc()).all()
    results = []
    for v in variants:
        img_url = None
        if v.product.images:
            img_url = sorted(v.product.images, key=lambda i: i.sort_order)[0].url

        results.append({
            "variant_id": v.id,
            "product_id": v.product.id,
            "product_name": v.product.name,
            "product_slug": v.product.slug,
            "category": v.product.category,
            "primary_image": img_url,
            "size": v.size,
            "colour": v.colour,
            "sku": v.sku,
            "mrp": float(v.mrp) if v.mrp else None,
            "selling_price": float(v.selling_price),
            "stock": v.stock,
            "is_available": (v.stock > 0),
            "is_product_active": v.product.is_active,
        })
    return results


@router.post("/inventory/adjust", response_model=StockAdjustmentResponse)
def admin_adjust_stock(
    payload: StockAdjustmentCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Adjust variant stock with an audit reason and history recording."""
    variant = (
        db.query(ProductVariant)
        .with_for_update()
        .options(joinedload(ProductVariant.product))
        .filter(ProductVariant.id == payload.variant_id)
        .first()
    )
    if not variant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Variant ID {payload.variant_id} not found.",
        )

    previous_stock = variant.stock
    new_stock = payload.new_stock
    change_amount = new_stock - previous_stock

    variant.stock = new_stock

    adj = StockAdjustment(
        variant_id=variant.id,
        previous_stock=previous_stock,
        new_stock=new_stock,
        change_amount=change_amount,
        reason=payload.reason.upper().strip(),
        note=payload.note.strip() if payload.note else None,
        actor_email=current_admin.email,
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)

    log_activity(
        db,
        current_admin,
        "STOCK_ADJUSTMENT",
        "variant",
        variant.id,
        f"{variant.product.name} ({variant.size}): {previous_stock} -> {new_stock} ({payload.reason})",
    )

    return StockAdjustmentResponse(
        id=adj.id,
        variant_id=variant.id,
        product_name=variant.product.name,
        product_slug=variant.product.slug,
        size=variant.size,
        colour=variant.colour,
        sku=variant.sku,
        previous_stock=adj.previous_stock,
        new_stock=adj.new_stock,
        change_amount=adj.change_amount,
        reason=adj.reason,
        note=adj.note,
        actor_email=adj.actor_email,
        created_at=adj.created_at,
    )


@router.get("/inventory/adjustments", response_model=List[StockAdjustmentResponse])
def admin_list_stock_adjustments(
    variant_id: Optional[int] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve audit history of stock adjustments."""
    query = (
        db.query(StockAdjustment)
        .join(ProductVariant)
        .join(Product)
        .options(
            joinedload(StockAdjustment.variant).joinedload(ProductVariant.product)
        )
    )
    if variant_id:
        query = query.filter(StockAdjustment.variant_id == variant_id)

    adjustments = query.order_by(StockAdjustment.created_at.desc()).limit(limit).all()
    results = []
    for a in adjustments:
        v = a.variant
        p = v.product
        results.append(
            StockAdjustmentResponse(
                id=a.id,
                variant_id=v.id,
                product_name=p.name,
                product_slug=p.slug,
                size=v.size,
                colour=v.colour,
                sku=v.sku,
                previous_stock=a.previous_stock,
                new_stock=a.new_stock,
                change_amount=a.change_amount,
                reason=a.reason,
                note=a.note,
                actor_email=a.actor_email,
                created_at=a.created_at,
            )
        )
    return results


# ==========================================
# Returns, Exchanges & Refunds Endpoints
# ==========================================

@router.get("/returns", response_model=List[ReturnRequestResponse])
def admin_list_returns(
    status: Optional[str] = None,
    request_type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """List customer return, exchange, and refund requests."""
    query = (
        db.query(ReturnRequest)
        .join(Order)
        .options(
            joinedload(ReturnRequest.order),
            joinedload(ReturnRequest.order_item),
        )
    )

    if status and status.upper() != "ALL":
        query = query.filter(ReturnRequest.status == status.upper())

    if request_type and request_type.upper() != "ALL":
        query = query.filter(ReturnRequest.request_type == request_type.upper())

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                ReturnRequest.return_code.ilike(s),
                Order.order_code.ilike(s),
                Order.customer_name.ilike(s),
                Order.phone.ilike(s),
            )
        )

    records = query.order_by(ReturnRequest.created_at.desc()).all()
    results = []
    for r in records:
        it = r.order_item
        results.append(
            ReturnRequestResponse(
                id=r.id,
                return_code=r.return_code,
                order_id=r.order_id,
                order_code=r.order.order_code,
                customer_name=r.order.customer_name,
                customer_phone=r.order.phone,
                item_name=it.product_name_snapshot if it else None,
                item_size=it.size_snapshot if it else None,
                item_colour=it.colour_snapshot if it else None,
                request_type=r.request_type,
                reason=r.reason,
                customer_comment=r.customer_comment,
                requested_resolution=r.requested_resolution,
                exchange_size=r.exchange_size,
                status=r.status,
                pickup_awb=r.pickup_awb,
                pickup_courier=r.pickup_courier,
                refund_amount=r.refund_amount,
                refund_status=r.refund_status,
                refund_reference=r.refund_reference,
                staff_notes=r.staff_notes,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )
    return results


@router.post("/returns", response_model=ReturnRequestResponse)
def admin_create_return_request(
    payload: ReturnRequestCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Initiate a return or exchange request on behalf of a customer."""
    order = db.query(Order).filter(Order.id == payload.order_id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    item = None
    if payload.order_item_id:
        item = db.query(OrderItem).filter(OrderItem.id == payload.order_item_id, OrderItem.order_id == order.id).first()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order item not found on this order.")

    rand_code = "".join(random.choices(string.digits, k=6))
    return_code = f"RET-2026-{rand_code}"

    ret = ReturnRequest(
        return_code=return_code,
        order_id=order.id,
        order_item_id=item.id if item else None,
        request_type=payload.request_type.upper().strip(),
        reason=payload.reason.strip(),
        customer_comment=payload.customer_comment.strip() if payload.customer_comment else None,
        requested_resolution=payload.requested_resolution.upper().strip(),
        exchange_size=payload.exchange_size.strip() if payload.exchange_size else None,
        status="REQUESTED",
    )
    db.add(ret)
    db.commit()
    db.refresh(ret)

    log_activity(db, current_admin, "RETURN_REQUESTED", "return", ret.id, f"Created {return_code} for order {order.order_code}")

    return ReturnRequestResponse(
        id=ret.id,
        return_code=ret.return_code,
        order_id=order.id,
        order_code=order.order_code,
        customer_name=order.customer_name,
        customer_phone=order.phone,
        item_name=item.product_name_snapshot if item else None,
        item_size=item.size_snapshot if item else None,
        item_colour=item.colour_snapshot if item else None,
        request_type=ret.request_type,
        reason=ret.reason,
        customer_comment=ret.customer_comment,
        requested_resolution=ret.requested_resolution,
        exchange_size=ret.exchange_size,
        status=ret.status,
        pickup_awb=ret.pickup_awb,
        pickup_courier=ret.pickup_courier,
        refund_amount=ret.refund_amount,
        refund_status=ret.refund_status,
        refund_reference=ret.refund_reference,
        staff_notes=ret.staff_notes,
        created_at=ret.created_at,
        updated_at=ret.updated_at,
    )


@router.patch("/returns/{id}/status", response_model=ReturnRequestResponse)
def admin_update_return_status(
    id: int,
    payload: ReturnStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Update return status, pickup logistics, refund records, and staff notes."""
    ret = (
        db.query(ReturnRequest)
        .options(joinedload(ReturnRequest.order), joinedload(ReturnRequest.order_item))
        .filter(ReturnRequest.id == id)
        .first()
    )
    if not ret:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Return #{id} not found.")

    old_status = ret.status
    ret.status = payload.status.upper().strip()

    if payload.pickup_awb is not None:
        ret.pickup_awb = payload.pickup_awb.strip() or None
    if payload.pickup_courier is not None:
        ret.pickup_courier = payload.pickup_courier.strip() or None
    if payload.refund_amount is not None:
        ret.refund_amount = payload.refund_amount
    if payload.refund_status is not None:
        ret.refund_status = payload.refund_status.upper().strip() or None
    if payload.refund_reference is not None:
        ret.refund_reference = payload.refund_reference.strip() or None
    if payload.staff_notes is not None:
        ret.staff_notes = payload.staff_notes.strip() or None

    db.commit()
    db.refresh(ret)

    log_activity(
        db,
        current_admin,
        "RETURN_STATUS_UPDATED",
        "return",
        ret.id,
        f"{ret.return_code}: {old_status} -> {ret.status}",
    )

    it = ret.order_item
    return ReturnRequestResponse(
        id=ret.id,
        return_code=ret.return_code,
        order_id=ret.order.id,
        order_code=ret.order.order_code,
        customer_name=ret.order.customer_name,
        customer_phone=ret.order.phone,
        item_name=it.product_name_snapshot if it else None,
        item_size=it.size_snapshot if it else None,
        item_colour=it.colour_snapshot if it else None,
        request_type=ret.request_type,
        reason=ret.reason,
        customer_comment=ret.customer_comment,
        requested_resolution=ret.requested_resolution,
        exchange_size=ret.exchange_size,
        status=ret.status,
        pickup_awb=ret.pickup_awb,
        pickup_courier=ret.pickup_courier,
        refund_amount=ret.refund_amount,
        refund_status=ret.refund_status,
        refund_reference=ret.refund_reference,
        staff_notes=ret.staff_notes,
        created_at=ret.created_at,
        updated_at=ret.updated_at,
    )


# ==========================================
# Customers & Support Inbox Endpoints
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


@router.get("/customers/{phone}")
def admin_get_customer_detail(
    phone: str,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve full customer dossier: order history, returns, and support contact messages."""
    clean_phone = phone.strip()
    orders = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.address))
        .filter(Order.phone == clean_phone)
        .order_by(Order.created_at.desc())
        .all()
    )
    if not orders:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    first_order = orders[0]
    total_spent = sum(o.total for o in orders if o.status != "CANCELLED")
    cancelled_count = sum(1 for o in orders if o.status == "CANCELLED")

    # Fetch customer returns
    order_ids = [o.id for o in orders]
    returns = db.query(ReturnRequest).filter(ReturnRequest.order_id.in_(order_ids)).all()

    # Fetch customer support inquiries
    inquiries = (
        db.query(ContactInquiry)
        .filter(or_(ContactInquiry.phone == clean_phone, ContactInquiry.name == first_order.customer_name))
        .all()
    )

    return {
        "name": first_order.customer_name,
        "phone": clean_phone,
        "total_orders": len(orders),
        "cancelled_orders": cancelled_count,
        "total_spent": float(total_spent),
        "orders": [
            {
                "id": o.id,
                "order_code": o.order_code,
                "status": o.status,
                "payment_method": o.payment_method,
                "payment_status": o.payment_status,
                "total": float(o.total),
                "created_at": o.created_at.isoformat(),
                "items_count": len(o.items),
            }
            for o in orders
        ],
        "returns": [
            {
                "id": r.id,
                "return_code": r.return_code,
                "status": r.status,
                "request_type": r.request_type,
                "reason": r.reason,
            }
            for r in returns
        ],
        "inquiries": [
            {
                "id": i.id,
                "subject": i.subject,
                "message": i.message,
                "status": i.status,
                "created_at": i.created_at.isoformat(),
            }
            for i in inquiries
        ],
    }


@router.get("/inquiries", response_model=List[ContactInquiryDetail])
def admin_list_inquiries(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve customer concierge and contact form inquiries."""
    query = db.query(ContactInquiry)
    if status and status.upper() != "ALL":
        query = query.filter(ContactInquiry.status == status.upper())

    return query.order_by(ContactInquiry.created_at.desc()).all()


@router.patch("/inquiries/{id}", response_model=ContactInquiryDetail)
def admin_reply_inquiry(
    id: int,
    payload: ContactInquiryReply,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Record staff response and update inquiry resolution state."""
    inquiry = db.query(ContactInquiry).filter(ContactInquiry.id == id).first()
    if not inquiry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found.")

    inquiry.admin_reply = payload.reply_text.strip()
    if payload.status:
        inquiry.status = payload.status.upper().strip()
    inquiry.responded_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(inquiry)
    log_activity(db, current_admin, "INQUIRY_RESPONDED", "inquiry", inquiry.id, f"Replied to {inquiry.email}")
    return inquiry


# ==========================================
# Reports & Analytics (Real Records & CSV Export)
# ==========================================

@router.get("/reports", response_model=ReportSummaryResponse)
def admin_get_reports(
    period: Optional[str] = "30d",
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Compute truthful date-filtered metrics, separating prepaid collected from pending COD."""
    now = datetime.now()
    if period == "today":
        start_date = datetime.combine(now.date(), time.min)
    elif period == "7d":
        start_date = now - timedelta(days=7)
    elif period == "this_month":
        start_date = datetime(now.year, now.month, 1)
    else:  # 30d default or all
        start_date = now - timedelta(days=30) if period == "30d" else datetime(2020, 1, 1)

    orders_query = db.query(Order).filter(Order.created_at >= start_date)
    orders = orders_query.all()

    total_orders = len(orders)
    prepaid_count = sum(1 for o in orders if o.payment_method == "PREPAID")
    prepaid_revenue_paid = sum(o.total for o in orders if o.payment_method == "PREPAID" and o.payment_status == "PAID")

    cod_count = sum(1 for o in orders if o.payment_method == "COD")
    cod_revenue_pending = sum(
        o.total for o in orders if o.payment_method == "COD" and o.payment_status != "PAID" and o.status != "CANCELLED"
    )
    cod_revenue_collected = sum(
        o.total for o in orders if o.payment_method == "COD" and o.payment_status == "PAID"
    )

    cancelled_count = sum(1 for o in orders if o.status == "CANCELLED")
    cancelled_amount = sum(o.total for o in orders if o.status == "CANCELLED")

    refunded_count = sum(1 for o in orders if o.payment_status == "REFUNDED")
    refunded_amount = sum(o.total for o in orders if o.payment_status == "REFUNDED")

    status_breakdown = {}
    for o in orders:
        status_breakdown[o.status] = status_breakdown.get(o.status, 0) + 1

    payment_breakdown = {
        "PREPAID": prepaid_count,
        "COD": cod_count,
        "PAID": sum(1 for o in orders if o.payment_status == "PAID"),
        "PENDING": sum(1 for o in orders if o.payment_status == "PENDING"),
        "FAILED": sum(1 for o in orders if o.payment_status == "FAILED"),
        "REFUNDED": refunded_count,
    }

    # Popular products
    order_ids = [o.id for o in orders]
    items = db.query(OrderItem).filter(OrderItem.order_id.in_(order_ids)).all() if order_ids else []
    prod_map = {}
    for it in items:
        pname = it.product_name_snapshot
        if pname not in prod_map:
            prod_map[pname] = {"units": 0, "revenue": Decimal("0.00")}
        prod_map[pname]["units"] += it.quantity
        prod_map[pname]["revenue"] += it.line_total

    top_products = [
        {"name": k, "units": v["units"], "revenue": float(v["revenue"])}
        for k, v in sorted(prod_map.items(), key=lambda x: x[1]["units"], reverse=True)[:10]
    ]

    return ReportSummaryResponse(
        total_orders=total_orders,
        prepaid_count=prepaid_count,
        prepaid_revenue_paid=prepaid_revenue_paid,
        cod_count=cod_count,
        cod_revenue_pending=cod_revenue_pending,
        cod_revenue_collected=cod_revenue_collected,
        cancelled_count=cancelled_count,
        cancelled_amount=cancelled_amount,
        refunded_count=refunded_count,
        refunded_amount=refunded_amount,
        status_breakdown=status_breakdown,
        payment_breakdown=payment_breakdown,
        top_products=top_products,
        coupon_stats=[],
    )


@router.get("/reports/export-orders-csv")
def admin_export_orders_csv(
    status: Optional[str] = None,
    payment_method: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Export real orders to standard CSV format."""
    query = db.query(Order).options(joinedload(Order.items), joinedload(Order.address))

    if status and status.upper() != "ALL":
        query = query.filter(Order.status == status.upper())
    if payment_method and payment_method.upper() != "ALL":
        query = query.filter(Order.payment_method == payment_method.upper())

    orders = query.order_by(Order.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Order Code",
        "Date",
        "Customer Name",
        "Phone",
        "City",
        "State",
        "Payment Method",
        "Payment Status",
        "Subtotal",
        "Shipping Charge",
        "Discount",
        "Total",
        "Status",
        "Courier",
        "AWB Code",
    ])

    for o in orders:
        city = o.address.city if o.address else ""
        state = o.address.state if o.address else ""
        date_str = o.created_at.strftime("%Y-%m-%d %H:%M") if o.created_at else ""
        writer.writerow([
            o.order_code,
            date_str,
            o.customer_name,
            o.phone,
            city,
            state,
            o.payment_method,
            o.payment_status,
            str(o.subtotal),
            str(o.shipping_charge),
            str(o.discount),
            str(o.total),
            o.status,
            o.courier_name or "",
            o.awb_code or "",
        ])

    output.seek(0)
    filename = f"royal_libas_orders_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    log_activity(db, current_admin, "CSV_EXPORT", "orders", None, f"Exported {len(orders)} orders")

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ==========================================
# Media Library & Cloudinary Uploads
# ==========================================

import logging
admin_media_logger = logging.getLogger("royal_libas.admin.media")


def _check_asset_references(asset: MediaAsset, db: Session) -> Tuple[List[MediaAssetProductUsage], List[str]]:
    """Helper to find all locations across products and editorial content referencing an asset."""
    filters = [ProductImage.url == asset.url]
    if asset.public_id:
        filters.append(ProductImage.public_id == asset.public_id)

    matches = (
        db.query(Product.id, Product.name, Product.slug)
        .join(ProductImage, ProductImage.product_id == Product.id)
        .filter(or_(*filters))
        .distinct()
        .all()
    )
    product_usages = [MediaAssetProductUsage(id=m.id, name=m.name, slug=m.slug) for m in matches]

    editorial_usages = []
    # Check StoreSetting hero_image_url
    setting = db.query(StoreSetting).first()
    if setting and setting.hero_image_url:
        if asset.url == setting.hero_image_url or (asset.public_id and asset.public_id in setting.hero_image_url):
            editorial_usages.append("Homepage Hero Banner")

    return product_usages, editorial_usages


@router.get("/media", response_model=List[MediaAssetResponse])
def admin_list_media(
    resource_type: Optional[str] = Query(None, description="Filter by resource type: 'image' or 'video'"),
    search: Optional[str] = Query(None, description="Search by filename or alt text"),
    product_id: Optional[int] = Query(None, description="Filter by product ID"),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve all uploaded persistent media assets with filtering and product usage."""
    query = db.query(MediaAsset)

    if resource_type:
        query = query.filter(MediaAsset.resource_type == resource_type.strip().lower())

    if search:
        pattern = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(MediaAsset.filename).like(pattern),
                func.lower(MediaAsset.alt_text).like(pattern),
                func.lower(MediaAsset.public_id).like(pattern),
            )
        )

    if product_id is not None:
        subq = db.query(ProductImage.url).filter(ProductImage.product_id == product_id)
        query = query.filter(MediaAsset.url.in_(subq))

    assets = query.order_by(MediaAsset.created_at.desc()).all()

    results = []
    for a in assets:
        used_products, _ = _check_asset_references(a, db)
        asset_dict = {
            "id": a.id,
            "filename": a.filename,
            "public_id": a.public_id,
            "url": a.url,
            "secure_url": a.secure_url or a.url,
            "resource_type": getattr(a, "resource_type", "image") or "image",
            "format": a.format,
            "width": a.width,
            "height": a.height,
            "duration": float(a.duration) if a.duration is not None else None,
            "file_size": a.file_size or 0,
            "mime_type": a.mime_type or "image/jpeg",
            "alt_text": a.alt_text,
            "folder": a.folder,
            "created_at": a.created_at,
            "used_in_products": used_products,
        }
        results.append(MediaAssetResponse(**asset_dict))

    return results


@router.post("/media/upload-batch", response_model=MediaUploadBatchResponse)
async def admin_upload_media_batch(
    files: List[UploadFile] = File(...),
    client_ids: Optional[List[str]] = Form(None),
    client_ids_json: Optional[str] = Form(None),
    folder: Optional[str] = Query("royal_libas/products"),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Upload multiple photos or videos to Cloudinary in a single batch operation with client ID mapping and safe DB rollback."""
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files provided for upload.")

    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum batch size exceeded. You can upload up to {MAX_BATCH_FILES} files per request.",
        )

    # Parse client IDs to support duplicate filenames accurately
    parsed_client_ids: List[str] = []
    if client_ids_json:
        try:
            parsed = json.loads(client_ids_json)
            if isinstance(parsed, list):
                parsed_client_ids = [str(c) for c in parsed]
        except Exception:
            pass
    elif client_ids:
        parsed_client_ids = [str(c) for c in client_ids]

    uploaded: List[MediaAssetResponse] = []
    failed: List[MediaUploadFailure] = []

    for idx, file in enumerate(files):
        filename = file.filename or "uploaded_media"
        cid = parsed_client_ids[idx] if idx < len(parsed_client_ids) else f"cid_{idx}_{filename}"

        # 1. Bounded read and strict server-side content validation
        try:
            contents = await read_bounded_file(file, max_bytes=MAX_VIDEO_SIZE_BYTES)
            if not contents or len(contents) == 0:
                failed.append(MediaUploadFailure(client_id=cid, filename=filename, error="File is empty (0 bytes)."))
                continue
            res_type, detected_fmt, mime_type = validate_media_file(contents, filename)
        except HTTPException as http_e:
            failed.append(MediaUploadFailure(client_id=cid, filename=filename, error=http_e.detail))
            continue
        except Exception as read_e:
            failed.append(MediaUploadFailure(client_id=cid, filename=filename, error="Failed to read file content."))
            continue

        # 2. Remote Cloudinary upload
        try:
            c_res = upload_to_cloudinary(
                file_bytes=contents,
                original_filename=filename,
                folder=folder or "royal_libas/products",
                resource_type_override=res_type,
            )
        except HTTPException as http_e:
            failed.append(MediaUploadFailure(client_id=cid, filename=filename, error=http_e.detail))
            continue
        except Exception as up_e:
            failed.append(MediaUploadFailure(client_id=cid, filename=filename, error="Upload to Cloudinary failed."))
            continue

        # 3. Database transaction boundary
        try:
            asset = MediaAsset(
                filename=filename,
                public_id=c_res["public_id"],
                url=c_res["secure_url"],
                secure_url=c_res["secure_url"],
                resource_type=c_res["resource_type"],
                format=c_res.get("format") or detected_fmt,
                width=c_res.get("width"),
                height=c_res.get("height"),
                duration=c_res.get("duration"),
                file_size=c_res.get("file_size", len(contents)),
                mime_type=mime_type or file.content_type or ("video/mp4" if c_res["resource_type"] == "video" else "image/jpeg"),
                alt_text=filename,
                folder=c_res.get("folder", folder),
            )
            db.add(asset)
            db.commit()
        except Exception as db_err:
            db.rollback()
            admin_media_logger.error(
                f"Database registration failure for '{filename}' (public_id: {c_res['public_id']}): {db_err}",
                exc_info=True,
            )
            # Safe rollback: Check remote cleanup result
            cleanup_res = delete_from_cloudinary(c_res["public_id"], resource_type=c_res["resource_type"])
            if cleanup_res.get("success"):
                admin_media_logger.info(f"Cleaned up remote asset '{c_res['public_id']}' after DB registration failure.")
                error_msg = "Database registration failed. Remote upload was rolled back."
            else:
                admin_media_logger.critical(
                    f"ORPHAN_CLEANUP_FAILED: Failed to delete Cloudinary asset '{c_res['public_id']}' after DB failure. "
                    f"Action required: manually remove orphan '{c_res['public_id']}' from Cloudinary."
                )
                error_msg = (
                    "Database registration failed and remote asset cleanup could not be confirmed. "
                    f"Asset ID '{c_res['public_id']}' may require manual cleanup."
                )

            failed.append(MediaUploadFailure(client_id=cid, filename=filename, error=error_msg))
            continue

        # 4. Post-commit operations (asset IS COMMITTED: MUST NOT delete remote asset if these fail!)
        try:
            db.refresh(asset)
        except Exception as ref_err:
            admin_media_logger.warning(
                f"Post-commit refresh failed for media asset {asset.id} ('{filename}', public_id: {c_res['public_id']}): {ref_err}"
            )

        try:
            log_activity(db, current_admin, "MEDIA_UPLOADED", "media", asset.id, f"{filename} ({c_res['resource_type']})")
        except Exception as log_err:
            admin_media_logger.warning(f"Activity logging failed for media {asset.id}: {log_err}")

        uploaded.append(
            MediaAssetResponse(
                id=asset.id,
                filename=asset.filename,
                client_id=cid,
                public_id=asset.public_id,
                url=asset.url,
                secure_url=asset.secure_url,
                resource_type=asset.resource_type,
                format=asset.format,
                width=asset.width,
                height=asset.height,
                duration=float(asset.duration) if asset.duration is not None else None,
                file_size=asset.file_size,
                mime_type=asset.mime_type,
                alt_text=asset.alt_text,
                folder=asset.folder,
                created_at=asset.created_at,
                used_in_products=[],
            )
        )

    return MediaUploadBatchResponse(
        status="success" if not failed else ("partial" if uploaded else "failure"),
        uploaded=uploaded,
        failed=failed,
        total=len(files),
        success_count=len(uploaded),
        failure_count=len(failed),
    )


@router.post("/media/upload", response_model=MediaAssetResponse)
async def admin_upload_media_asset(
    file: UploadFile = File(...),
    folder: Optional[str] = Query("royal_libas/products"),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Upload a single product photo or video asset directly to Cloudinary with safe rollback."""
    filename = file.filename or "media_upload"
    contents = await read_bounded_file(file, max_bytes=MAX_VIDEO_SIZE_BYTES)
    if not contents or len(contents) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File content is empty (0 bytes).")
    res_type, detected_fmt, mime_type = validate_media_file(contents, filename)

    c_res = upload_to_cloudinary(
        file_bytes=contents,
        original_filename=filename,
        folder=folder or "royal_libas/products",
        resource_type_override=res_type,
    )

    try:
        asset = MediaAsset(
            filename=filename,
            public_id=c_res["public_id"],
            url=c_res["secure_url"],
            secure_url=c_res["secure_url"],
            resource_type=c_res["resource_type"],
            format=c_res.get("format") or detected_fmt,
            width=c_res.get("width"),
            height=c_res.get("height"),
            duration=c_res.get("duration"),
            file_size=c_res.get("file_size", len(contents)),
            mime_type=mime_type or file.content_type or ("video/mp4" if c_res["resource_type"] == "video" else "image/jpeg"),
            alt_text=filename,
            folder=c_res.get("folder", folder),
        )
        db.add(asset)
        db.commit()
    except Exception as db_err:
        db.rollback()
        admin_media_logger.error(f"Database registration failure for '{filename}': {db_err}", exc_info=True)
        cleanup_res = delete_from_cloudinary(c_res["public_id"], resource_type=c_res["resource_type"])
        if cleanup_res.get("success"):
            admin_media_logger.info(f"Cleaned up remote asset '{c_res['public_id']}' after DB registration failure.")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database registration failed. Remote upload was rolled back.",
            )
        else:
            admin_media_logger.critical(
                f"ORPHAN_CLEANUP_FAILED: Failed to delete Cloudinary asset '{c_res['public_id']}' after DB failure. "
                f"Action required: manually remove orphan '{c_res['public_id']}' from Cloudinary."
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database registration failed and remote asset cleanup could not be confirmed. Asset ID '{c_res['public_id']}' may require manual cleanup.",
            )

    # Post-commit operations (asset IS COMMITTED: MUST NOT delete remote asset if these fail!)
    try:
        db.refresh(asset)
    except Exception as ref_err:
        admin_media_logger.warning(
            f"Post-commit refresh failed for media asset {asset.id} ('{filename}', public_id: {c_res['public_id']}): {ref_err}"
        )

    try:
        log_activity(db, current_admin, "MEDIA_UPLOADED", "media", asset.id, f"{filename} ({c_res['resource_type']})")
    except Exception as log_err:
        admin_media_logger.warning(f"Activity logging failed for media {asset.id}: {log_err}")

    return MediaAssetResponse(
        id=asset.id,
        filename=asset.filename,
        public_id=asset.public_id,
        url=asset.url,
        secure_url=asset.secure_url,
        resource_type=asset.resource_type,
        format=asset.format,
        width=asset.width,
        height=asset.height,
        duration=float(asset.duration) if asset.duration is not None else None,
        file_size=asset.file_size,
        mime_type=asset.mime_type,
        alt_text=asset.alt_text,
        folder=asset.folder,
        created_at=asset.created_at,
        used_in_products=[],
    )


@router.delete("/media/{id}")
def admin_delete_media(
    id: int,
    force: bool = Query(False, description="Force delete even if attached to products or editorial content"),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER")),
):
    """Remove a media asset from library and Cloudinary storage with rigorous usage checking and fail-safe remote verification."""
    asset = db.query(MediaAsset).filter(MediaAsset.id == id).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media asset not found.")

    used_products, used_editorial = _check_asset_references(asset, db)
    total_usages = len(used_products) + len(used_editorial)

    if total_usages > 0 and not force:
        usage_labels = [f"Product: '{p.name}'" for p in used_products] + used_editorial
        locations_str = ", ".join(usage_labels)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete asset because it is currently used in {total_usages} location(s): {locations_str}. Remove it from those locations first, or confirm force deletion.",
        )

    # 1. Cloudinary Remote Deletion with explicit failure handling
    if asset.public_id:
        res_type = getattr(asset, "resource_type", "image") or "image"
        del_res = delete_from_cloudinary(asset.public_id, resource_type=res_type)

        if del_res.get("result") == "not_configured":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Cloudinary is not configured on this server. Remote asset cannot be deleted and database record is preserved.",
            )

        if not del_res.get("success"):
            error_msg = del_res.get("error") or "Remote deletion rejected."
            admin_media_logger.error(f"Failed to delete Cloudinary asset '{asset.public_id}': {error_msg}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Cloudinary deletion failed. Database record and product associations were preserved.",
            )

        if del_res.get("already_missing"):
            # Cloudinary reported 'not found'. Documented behavior: Considered successfully absent from remote storage.
            admin_media_logger.info(f"Cloudinary asset '{asset.public_id}' was already absent remotely. Proceeding with database record deletion.")

    # 2. Local disk legacy cleanup if applicable
    legacy_path = Path(__file__).resolve().parent.parent.parent / "uploads" / "products" / asset.filename
    if legacy_path.exists():
        try:
            legacy_path.unlink()
        except Exception:
            pass

    # 3. Clean up associated references if forced
    if force:
        if used_editorial:
            setting = db.query(StoreSetting).first()
            if setting and setting.hero_image_url and (asset.url in setting.hero_image_url or (asset.public_id and asset.public_id in setting.hero_image_url)):
                setting.hero_image_url = None

        if used_products:
            filters = [ProductImage.url == asset.url]
            if asset.public_id:
                filters.append(ProductImage.public_id == asset.public_id)
            db.query(ProductImage).filter(or_(*filters)).delete(synchronize_session=False)

    db.delete(asset)
    db.commit()
    log_activity(db, current_admin, "MEDIA_DELETED", "media", id, asset.filename)
    return {"status": "success", "message": f"Media asset '{asset.filename}' deleted successfully."}


@router.post("/products/upload-image")
async def admin_upload_product_image(
    file: UploadFile = File(...),
    folder: Optional[str] = Query("royal_libas/products"),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Safely upload a product photo or video directly to Cloudinary and register in media library with DB rollback."""
    filename = file.filename or "product_media"
    contents = await read_bounded_file(file, max_bytes=MAX_VIDEO_SIZE_BYTES)
    if not contents or len(contents) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File content is empty (0 bytes).")
    res_type, detected_fmt, mime_type = validate_media_file(contents, filename)

    c_res = upload_to_cloudinary(
        file_bytes=contents,
        original_filename=filename,
        folder=folder or "royal_libas/products",
        resource_type_override=res_type,
    )

    try:
        asset = MediaAsset(
            filename=filename,
            public_id=c_res["public_id"],
            url=c_res["secure_url"],
            secure_url=c_res["secure_url"],
            resource_type=c_res["resource_type"],
            format=c_res.get("format") or detected_fmt,
            width=c_res.get("width"),
            height=c_res.get("height"),
            duration=c_res.get("duration"),
            file_size=c_res.get("file_size", len(contents)),
            mime_type=mime_type or file.content_type or ("video/mp4" if c_res["resource_type"] == "video" else "image/jpeg"),
            alt_text=filename,
            folder=c_res.get("folder", folder),
        )
        db.add(asset)
        db.commit()
    except Exception as db_err:
        db.rollback()
        admin_media_logger.error(f"Database registration failure for product upload '{filename}': {db_err}", exc_info=True)
        cleanup_res = delete_from_cloudinary(c_res["public_id"], resource_type=c_res["resource_type"])
        if cleanup_res.get("success"):
            admin_media_logger.info(f"Cleaned up remote asset '{c_res['public_id']}' after DB registration failure.")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database registration failed. Remote upload was rolled back.",
            )
        else:
            admin_media_logger.critical(
                f"ORPHAN_CLEANUP_FAILED: Failed to delete Cloudinary asset '{c_res['public_id']}' after DB failure. "
                f"Action required: manually remove orphan '{c_res['public_id']}' from Cloudinary."
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database registration failed and remote asset cleanup could not be confirmed. Asset ID '{c_res['public_id']}' may require manual cleanup.",
            )

    # Post-commit operations (asset IS COMMITTED: MUST NOT delete remote asset if these fail!)
    try:
        db.refresh(asset)
    except Exception as ref_err:
        admin_media_logger.warning(
            f"Post-commit refresh failed for product media asset {asset.id} ('{filename}', public_id: {c_res['public_id']}): {ref_err}"
        )

    return {
        "status": "success",
        "id": asset.id,
        "url": asset.url,
        "secure_url": asset.secure_url,
        "public_id": asset.public_id,
        "resource_type": asset.resource_type,
        "filename": filename,
        "width": asset.width,
        "height": asset.height,
        "duration": float(asset.duration) if asset.duration is not None else None,
    }


@router.post("/products/{id}/attach-media", response_model=ProductDetailResponse)
def admin_attach_product_media(
    id: int,
    media_ids: List[int],
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Attach existing media assets from library to a product."""
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    assets = db.query(MediaAsset).filter(MediaAsset.id.in_(media_ids)).all()
    if not assets:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid media assets found.")

    max_order = max([img.sort_order for img in product.images], default=-1)
    for asset in assets:
        max_order += 1
        new_img = ProductImage(
            product_id=product.id,
            url=asset.url,
            sort_order=max_order,
            alt_text=asset.alt_text or product.name,
            resource_type=getattr(asset, "resource_type", "image") or "image",
            public_id=asset.public_id,
            width=asset.width,
            height=asset.height,
            duration=asset.duration,
        )
        product.images.append(new_img)

    db.commit()
    db.refresh(product)
    log_activity(db, current_admin, "PRODUCT_UPDATED", "product", product.id, f"Attached {len(assets)} media assets")
    return build_product_detail_response(product)


# ==========================================
# Size Charts CRUD
# ==========================================

@router.get("/size-charts", response_model=List[SizeChartResponse])
def admin_list_size_charts(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """List all reusable size charts."""
    return db.query(SizeChart).order_by(SizeChart.name.asc()).all()


@router.post("/size-charts", response_model=SizeChartResponse)
def admin_create_size_chart(
    payload: SizeChartCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Create reusable size chart with verified boutique measurements."""
    chart = SizeChart(
        name=payload.name.strip(),
        category=payload.category.strip() if payload.category else None,
        measurements=payload.measurements.strip(),
    )
    db.add(chart)
    db.commit()
    db.refresh(chart)
    log_activity(db, current_admin, "SIZE_CHART_CREATED", "size_chart", chart.id, chart.name)
    return chart


@router.put("/size-charts/{id}", response_model=SizeChartResponse)
def admin_update_size_chart(
    id: int,
    payload: SizeChartUpdate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Update size chart measurements."""
    chart = db.query(SizeChart).filter(SizeChart.id == id).first()
    if not chart:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Size chart not found.")

    if payload.name is not None:
        chart.name = payload.name.strip()
    if payload.category is not None:
        chart.category = payload.category.strip() or None
    if payload.measurements is not None:
        chart.measurements = payload.measurements.strip()

    db.commit()
    db.refresh(chart)
    log_activity(db, current_admin, "SIZE_CHART_UPDATED", "size_chart", chart.id, chart.name)
    return chart


@router.delete("/size-charts/{id}")
def admin_delete_size_chart(
    id: int,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER")),
):
    """Delete a size chart."""
    chart = db.query(SizeChart).filter(SizeChart.id == id).first()
    if not chart:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Size chart not found.")

    db.delete(chart)
    db.commit()
    log_activity(db, current_admin, "SIZE_CHART_DELETED", "size_chart", id, chart.name)
    return {"status": "success", "message": "Size chart removed."}


# ==========================================
# Products Management Endpoints for Admin
# ==========================================

@router.get("/products", response_model=List[ProductDetailResponse])
def admin_list_products(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve all products (active, draft, and archived) for admin catalogue management."""
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


@router.post("/products", response_model=ProductDetailResponse, status_code=status.HTTP_201_CREATED)
def admin_create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Create a new boutique product with full attributes, status, and validation."""
    existing = db.query(Product).filter(Product.slug == payload.slug).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A product with slug '{payload.slug}' already exists.",
        )

    prod_status = (payload.status or "PUBLISHED").upper().strip()
    is_active = (prod_status == "PUBLISHED") if payload.status else payload.is_active

    product = Product(
        name=payload.name.strip(),
        slug=payload.slug.strip(),
        description=payload.description,
        fabric=payload.fabric,
        care=payload.care,
        fit=payload.fit,
        size_chart=payload.size_chart,
        size_chart_id=payload.size_chart_id,
        category=payload.category,
        subcategory=payload.subcategory,
        status=prod_status,
        is_bestseller=payload.is_bestseller,
        is_active=is_active,
    )

    if payload.collection_ids:
        collections = db.query(Collection).filter(Collection.id.in_(payload.collection_ids)).all()
        product.collections = collections

    if payload.variants:
        for v in payload.variants:
            if v.mrp and v.selling_price > v.mrp:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Selling price (₹{v.selling_price}) cannot exceed MRP (₹{v.mrp}) for size {v.size}.",
                )
            variant = ProductVariant(
                size=v.size,
                colour=v.colour,
                sku=v.sku,
                mrp=v.mrp,
                selling_price=v.selling_price,
                stock=v.stock,
            )
            product.variants.append(variant)

    if payload.images:
        for idx, img in enumerate(payload.images):
            r_type = getattr(img, "resource_type", "image") or "image"
            if r_type == "image" and img.url and any(img.url.lower().endswith(ext) for ext in (".mp4", ".webm", ".mov", ".ogg")):
                r_type = "video"
            image = ProductImage(
                url=img.url,
                sort_order=img.sort_order if img.sort_order is not None else idx,
                alt_text=img.alt_text,
                resource_type=r_type,
                public_id=getattr(img, "public_id", None),
                width=getattr(img, "width", None),
                height=getattr(img, "height", None),
                duration=getattr(img, "duration", None),
            )
            product.images.append(image)

    db.add(product)
    db.commit()
    db.refresh(product)

    log_activity(db, current_admin, "PRODUCT_CREATED", "product", product.id, product.name)
    return build_product_detail_response(product)


@router.patch("/products/{id}", response_model=ProductDetailResponse)
def admin_update_product(
    id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Update product fields, draft/published state, fit, or gallery."""
    product = (
        db.query(Product)
        .options(
            joinedload(Product.variants),
            joinedload(Product.images),
            joinedload(Product.collections),
        )
        .filter(Product.id == id)
        .first()
    )
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product with id {id} not found.")

    if payload.slug and payload.slug != product.slug:
        existing = db.query(Product).filter(Product.slug == payload.slug).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A product with slug '{payload.slug}' already exists.",
            )
        product.slug = payload.slug

    if payload.name is not None:
        product.name = payload.name.strip()
    if payload.description is not None:
        product.description = payload.description
    if payload.fabric is not None:
        product.fabric = payload.fabric
    if payload.care is not None:
        product.care = payload.care
    if payload.fit is not None:
        product.fit = payload.fit
    if payload.size_chart is not None:
        product.size_chart = payload.size_chart
    if payload.size_chart_id is not None:
        product.size_chart_id = payload.size_chart_id
    if payload.category is not None:
        product.category = payload.category
    if payload.subcategory is not None:
        product.subcategory = payload.subcategory
    if payload.is_bestseller is not None:
        product.is_bestseller = payload.is_bestseller

    if payload.status is not None:
        new_stat = payload.status.upper().strip()
        product.status = new_stat
        product.is_active = (new_stat == "PUBLISHED")
    elif payload.is_active is not None:
        product.is_active = payload.is_active
        product.status = "PUBLISHED" if payload.is_active else "DRAFT"

    if payload.collection_ids is not None:
        collections = db.query(Collection).filter(Collection.id.in_(payload.collection_ids)).all()
        product.collections = collections

    if payload.images is not None:
        product.images = [
            ProductImage(
                url=img.url,
                sort_order=img.sort_order if img.sort_order is not None else idx + 1,
                alt_text=img.alt_text,
                resource_type="video" if (getattr(img, "resource_type", "image") == "video" or (img.url and any(img.url.lower().endswith(ext) for ext in (".mp4", ".webm", ".mov", ".ogg")))) else "image",
                public_id=getattr(img, "public_id", None),
                width=getattr(img, "width", None),
                height=getattr(img, "height", None),
                duration=getattr(img, "duration", None),
            )
            for idx, img in enumerate(payload.images)
        ]

    db.commit()
    db.refresh(product)
    log_activity(db, current_admin, "PRODUCT_UPDATED", "product", product.id, product.name)
    return build_product_detail_response(product)


@router.delete("/products/{id}")
def admin_delete_product(
    id: int,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER")),
):
    """Safely archive or remove a product."""
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product #{id} not found.")

    # Check if ordered
    variant_ids = [v.id for v in product.variants]
    has_orders = db.query(OrderItem).filter(OrderItem.variant_id.in_(variant_ids)).first() if variant_ids else None

    if has_orders:
        product.is_active = False
        product.status = "ARCHIVED"
        db.commit()
        log_activity(db, current_admin, "PRODUCT_ARCHIVED", "product", id, f"Archived {product.name} (has order history)")
        return {"status": "archived", "message": "Product has order history so it was archived instead of deleted."}

    db.delete(product)
    db.commit()
    log_activity(db, current_admin, "PRODUCT_DELETED", "product", id, product.name)
    return {"status": "deleted", "message": "Product removed successfully."}


# ==========================================
# Store Settings & Homepage CMS
# ==========================================

@router.get("/settings", response_model=StoreSettingResponse)
def admin_get_settings(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve persistent store settings and homepage content."""
    setting = db.query(StoreSetting).first()
    if not setting:
        setting = StoreSetting()
        db.add(setting)
        db.commit()
        db.refresh(setting)

    return StoreSettingResponse(
        standard_cod_free_threshold=float(setting.standard_cod_free_threshold),
        free_shipping_threshold=float(setting.standard_cod_free_threshold),
        standard_shipping_fee=float(setting.standard_shipping_fee),
        express_shipping_fee=float(setting.express_shipping_fee),
        announcement_text=setting.announcement_text,
        announcement_enabled=setting.announcement_enabled,
        hero_title=setting.hero_title,
        hero_subtitle=setting.hero_subtitle,
        hero_cta_text=setting.hero_cta_text,
        hero_cta_link=setting.hero_cta_link,
        hero_image_url=setting.hero_image_url,
        whatsapp_number=setting.whatsapp_number,
        support_email=setting.support_email,
        support_phone=setting.support_phone,
        instagram_handle=setting.instagram_handle,
        shipping_policy_content=setting.shipping_policy_content,
        return_policy_content=setting.return_policy_content,
        cod_enabled=bool(setting.cod_enabled),
        online_payment_enabled=bool(setting.online_payment_enabled),
    )


@router.put("/settings", response_model=StoreSettingResponse)
def admin_update_settings(
    payload: StoreSettingUpdate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER")),
):
    """Update persistent store settings and publish homepage editorial content."""
    setting = db.query(StoreSetting).first()
    if not setting:
        setting = StoreSetting()
        db.add(setting)

    thresh = payload.standard_cod_free_threshold if payload.standard_cod_free_threshold is not None else payload.free_shipping_threshold
    if thresh is not None:
        setting.standard_cod_free_threshold = Decimal(str(thresh))
    if payload.standard_shipping_fee is not None:
        setting.standard_shipping_fee = Decimal(str(payload.standard_shipping_fee))
    if payload.express_shipping_fee is not None:
        setting.express_shipping_fee = Decimal(str(payload.express_shipping_fee))
    if payload.announcement_text is not None:
        setting.announcement_text = payload.announcement_text.strip()
    if payload.announcement_enabled is not None:
        setting.announcement_enabled = payload.announcement_enabled
    if payload.hero_title is not None:
        setting.hero_title = payload.hero_title.strip()
    if payload.hero_subtitle is not None:
        setting.hero_subtitle = payload.hero_subtitle.strip()
    if payload.hero_cta_text is not None:
        setting.hero_cta_text = payload.hero_cta_text.strip()
    if payload.hero_cta_link is not None:
        setting.hero_cta_link = payload.hero_cta_link.strip()
    if payload.hero_image_url is not None:
        setting.hero_image_url = payload.hero_image_url.strip() or None
    if payload.whatsapp_number is not None:
        setting.whatsapp_number = payload.whatsapp_number.strip()
    if payload.support_email is not None:
        setting.support_email = payload.support_email.strip()
    if payload.support_phone is not None:
        setting.support_phone = payload.support_phone.strip()
    if payload.instagram_handle is not None:
        setting.instagram_handle = payload.instagram_handle.strip()
    if payload.shipping_policy_content is not None:
        setting.shipping_policy_content = payload.shipping_policy_content
    if payload.return_policy_content is not None:
        setting.return_policy_content = payload.return_policy_content
    payment_settings_changed = False
    if payload.cod_enabled is not None:
        setting.cod_enabled = payload.cod_enabled
        payment_settings_changed = True
    if payload.online_payment_enabled is not None:
        setting.online_payment_enabled = payload.online_payment_enabled
        payment_settings_changed = True

    db.commit()
    db.refresh(setting)
    if payment_settings_changed:
        log_activity(
            db,
            current_admin,
            "PAYMENT_SETTINGS_UPDATED",
            "settings",
            setting.id,
            f"Payment controls updated: cod_enabled={setting.cod_enabled}, online_payment_enabled={setting.online_payment_enabled}",
        )
    log_activity(db, current_admin, "SETTINGS_UPDATED", "settings", setting.id, "Store & Homepage settings updated")

    return StoreSettingResponse(
        standard_cod_free_threshold=float(setting.standard_cod_free_threshold),
        free_shipping_threshold=float(setting.standard_cod_free_threshold),
        standard_shipping_fee=float(setting.standard_shipping_fee),
        express_shipping_fee=float(setting.express_shipping_fee),
        announcement_text=setting.announcement_text,
        announcement_enabled=setting.announcement_enabled,
        hero_title=setting.hero_title,
        hero_subtitle=setting.hero_subtitle,
        hero_cta_text=setting.hero_cta_text,
        hero_cta_link=setting.hero_cta_link,
        hero_image_url=setting.hero_image_url,
        whatsapp_number=setting.whatsapp_number,
        support_email=setting.support_email,
        support_phone=setting.support_phone,
        instagram_handle=setting.instagram_handle,
        shipping_policy_content=setting.shipping_policy_content,
        return_policy_content=setting.return_policy_content,
        cod_enabled=bool(setting.cod_enabled),
        online_payment_enabled=bool(setting.online_payment_enabled),
    )


# ==========================================
# Staff Roles & RBAC Management
# ==========================================

@router.get("/staff", response_model=List[AdminUserResponse])
def admin_list_staff(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """List staff accounts and roles."""
    return db.query(Admin).order_by(Admin.id.asc()).all()


@router.post("/staff", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def admin_create_staff(
    payload: AdminCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER")),
):
    """Create a new staff account (Owner only)."""
    email_clean = payload.email.lower().strip()
    existing = db.query(Admin).filter(Admin.email == email_clean).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this email already exists.")

    valid_roles = ["OWNER", "STORE_MANAGER", "FULFILLMENT_STAFF"]
    role_clean = payload.role.upper().strip()
    if role_clean not in valid_roles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}")

    new_admin = Admin(
        email=email_clean,
        name=payload.name.strip() if payload.name else None,
        role=role_clean,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(new_admin)
    db.commit()
    db.refresh(new_admin)
    log_activity(db, current_admin, "STAFF_CREATED", "admin", new_admin.id, f"Created {new_admin.email} as {new_admin.role}")
    return new_admin


@router.patch("/staff/{id}", response_model=AdminUserResponse)
def admin_update_staff_role(
    id: int,
    payload: AdminRoleUpdate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER")),
):
    """Update staff role or active state (Owner only)."""
    target = db.query(Admin).filter(Admin.id == id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found.")

    if target.id == current_admin.id and payload.is_active is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account.")

    if payload.role is not None:
        valid_roles = ["OWNER", "STORE_MANAGER", "FULFILLMENT_STAFF"]
        rc = payload.role.upper().strip()
        if rc not in valid_roles:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role.")
        target.role = rc

    if payload.is_active is not None:
        target.is_active = payload.is_active

    if payload.name is not None:
        target.name = payload.name.strip()

    db.commit()
    db.refresh(target)
    log_activity(db, current_admin, "STAFF_UPDATED", "admin", target.id, f"Updated role/status for {target.email}")
    return target


# ==========================================
# Activity Audit Logs
# ==========================================

@router.get("/activity-logs", response_model=List[ActivityLogResponse])
def admin_list_activity_logs(
    action: Optional[str] = None,
    target_type: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Retrieve immutable audit trail of operational actions."""
    query = db.query(ActivityLog)
    if action and action.upper() != "ALL":
        query = query.filter(ActivityLog.action == action.upper())
    if target_type and target_type.lower() != "all":
        query = query.filter(ActivityLog.target_type == target_type.lower())

    return query.order_by(ActivityLog.created_at.desc()).limit(limit).all()
