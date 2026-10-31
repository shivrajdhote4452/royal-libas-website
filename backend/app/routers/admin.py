from pathlib import Path
from datetime import datetime, date, time, timedelta, timezone
from decimal import Decimal
import os
import io
import re
import csv
import hashlib
import json
import random
import string
import threading
from typing import List, Optional, Tuple, Dict, Any
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
    MediaFolder,
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
    ProductImageCreate,
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
    MediaFolderCreate,
    MediaFolderUpdate,
    MediaFolderResponse,
    BulkMoveMediaRequest,
    BulkMoveMediaFailure,
    BulkMoveMediaResponse,
    BulkAttachToProductRequest,
    BulkAttachToProductResponse,
    FolderConflictMapping,
    PrepareCollectionFoldersPreviewResponse,
    PrepareCollectionFoldersResponse,
    MediaUsageLocation,
    MediaCheckUsageResponse,
    BulkDeleteMediaRequest,
    BulkDeleteMediaResponse,
    CloudinarySyncResponse,
    CloudinaryStatusResponse,
    MediaAssetUpdate,
    MediaCleanupPreviewResponse,
    MediaCleanupExecuteRequest,
    MediaCleanupExecuteResponse,
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
    list_cloudinary_folders,
    list_cloudinary_folders_recursive,
    create_cloudinary_folder,
    rename_cloudinary_folder,
    delete_cloudinary_folder,
    move_cloudinary_asset_folder,
    update_cloudinary_asset_metadata,
    fetch_cloudinary_resources,
    get_cloudinary_status,
    detect_cloudinary_folder_mode,
    CLOUDINARY_CLOUD_NAME,
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

    # Low-stock (<= 5) and out-of-stock variants (only published sellable products trigger alerts)
    low_stock_count = (
        db.query(func.count(ProductVariant.id))
        .join(Product)
        .filter(Product.is_active == True, Product.status == "PUBLISHED", ProductVariant.stock > 0, ProductVariant.stock <= 5)
        .scalar()
        or 0
    )
    out_of_stock_count = (
        db.query(func.count(ProductVariant.id))
        .join(Product)
        .filter(Product.is_active == True, Product.status == "PUBLISHED", ProductVariant.stock == 0)
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

    # Low stock variant list (only published sellable products)
    low_stock_records = (
        db.query(ProductVariant)
        .join(Product)
        .filter(Product.is_active == True, Product.status == "PUBLISHED", ProductVariant.stock <= 5)
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
    filter: Optional[str] = "working",
    status: Optional[str] = None,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
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

    norm_filter = (filter or "working").lower().strip()
    if status:
        query = query.filter(Product.status == status.upper().strip())
    elif norm_filter == "archived":
        query = query.filter(Product.status == "ARCHIVED")
    elif norm_filter == "published":
        query = query.filter(Product.status == "PUBLISHED", Product.is_active == True)
    elif norm_filter == "draft":
        query = query.filter(Product.status == "DRAFT")
    elif norm_filter == "low_stock":
        # Only published live products trigger real low-stock alerts (<=5)
        query = query.filter(
            Product.status == "PUBLISHED",
            Product.is_active == True,
            ProductVariant.stock > 0,
            ProductVariant.stock <= 5,
        )
    elif norm_filter == "out_of_stock":
        # Out of stock published live products
        query = query.filter(
            Product.status == "PUBLISHED",
            Product.is_active == True,
            ProductVariant.stock == 0,
        )
    elif norm_filter in ("working", "all"):
        # Default working inventory excludes ARCHIVED legacy items
        query = query.filter(Product.status != "ARCHIVED")

    if category:
        query = query.filter(Product.category.ilike(category.strip()))
    if subcategory:
        query = query.filter(Product.subcategory.ilike(subcategory.strip()))

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
            sorted_imgs = sorted(v.product.images, key=lambda i: i.sort_order)
            first_img = next((img for img in sorted_imgs if getattr(img, "resource_type", "image") == "image"), None)
            img_url = first_img.url if first_img else sorted_imgs[0].url

        is_draft = (v.product.status == "DRAFT")
        is_archived = (v.product.status == "ARCHIVED")
        results.append({
            "variant_id": v.id,
            "product_id": v.product.id,
            "product_name": v.product.name,
            "product_slug": v.product.slug,
            "category": v.product.category,
            "subcategory": getattr(v.product, "subcategory", None),
            "primary_image": img_url,
            "size": v.size,
            "colour": v.colour,
            "sku": v.sku,
            "mrp": float(v.mrp) if v.mrp else None,
            "selling_price": float(v.selling_price),
            "stock": v.stock,
            "status": v.product.status,
            "is_draft": is_draft,
            "is_archived": is_archived,
            "is_available": (v.stock > 0 and v.product.is_active and v.product.status == "PUBLISHED"),
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

from app.services.media_usage_service import (
    match_asset_to_url,
    get_asset_usage_references,
)


def _matches_asset(img_url: Optional[str], asset: MediaAsset) -> bool:
    return match_asset_to_url(img_url, asset)


def _check_asset_references(asset: MediaAsset, db: Session) -> Tuple[List[MediaAssetProductUsage], List[str]]:
    """Helper to find all locations across products and editorial content referencing an asset."""
    prod_usages, editorial_usages = get_asset_usage_references(asset, db)
    product_usages = [MediaAssetProductUsage(id=m["id"], name=m["name"], slug=m["slug"]) for m in prod_usages]
    return product_usages, editorial_usages


def _is_sample_asset(asset: MediaAsset) -> bool:
    """Determine whether an asset is a Cloudinary demo/sample asset."""
    pub_lower = (asset.public_id or "").lower()
    folder_lower = (asset.folder or "").lower()
    url_lower = (asset.url or "").lower()
    return (
        folder_lower.startswith("samples")
        or pub_lower.startswith("samples/")
        or "cloudinary.com/demo/" in url_lower
    )


def _is_test_record(asset: MediaAsset) -> Tuple[bool, Optional[str]]:
    """Identify demo/mock/test artifacts (photo.jpg, test_artisan.jpg, zkgaklhl demo accounts)."""
    url_lower = (asset.url or "").lower()
    pub_lower = (asset.public_id or "").lower()
    fn_lower = (asset.filename or "").lower()
    folder_lower = (asset.folder or "").lower()

    if "cloudinary.com/demo/" in url_lower:
        return True, "Cloudinary demo sample URL"
    if "cloudinary.com/zkgaklhl/" in url_lower:
        return True, "Legacy mock cloud (zkgaklhl) record"
    if folder_lower.startswith("samples") or pub_lower.startswith("samples/"):
        return True, "Cloudinary account sample asset"
    if "test_mock_asset" in pub_lower or "test_artisan" in pub_lower:
        return True, "Automated mock test asset ID"
    if fn_lower in ("test_artisan.jpg", "photo.jpg") and (asset.file_size or 0) <= 1024:
        return True, "Unit test dummy file"
    if (asset.url or "").startswith("/uploads/") and (asset.file_size or 0) <= 50:
        return True, "Legacy empty test stub"
    return False, None


_sync_lock = threading.Lock()


def escape_like(s: str) -> str:
    """Escape special characters in SQL LIKE pattern (_ and %)."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


BOUTIQUE_TARGET_FOLDER_PATHS: List[str] = [
    # Top-level collection root
    "Photos for royal libas",
    
    # Heavy Dress branch
    "Photos for royal libas/Heavy Dress",
    "Photos for royal libas/Heavy Dress/Designer Wear",
    "Photos for royal libas/Heavy Dress/Designer Wear/01 - Gulnaar Ruby Red Designer Set",
    "Photos for royal libas/Heavy Dress/Designer Wear/2",
    "Photos for royal libas/Heavy Dress/Designer Wear/03 - Meher Purple Designer Suit",
    "Photos for royal libas/Heavy Dress/Designer Wear/04 - Meher Teal Designer Suit",
    "Photos for royal libas/Heavy Dress/Designer Wear/05 - Meher Rani Pink Designer Suit",
    "Photos for royal libas/Heavy Dress/Designer Wear/Combination Photos",
    "Photos for royal libas/Heavy Dress/Lehenga",
    "Photos for royal libas/Heavy Dress/Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/01 - Sunehri Mustard Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/02 - Riwayat Wine Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/03 - Zumurrud Emerald Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/04 - Gulabo Fuchsia Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/05 - Mehrun Blush Pink Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/06 - Mehtab Sage Green Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/07 - Aabha Champagne Palazzo Set",
    "Photos for royal libas/Heavy Dress/Sharara Gharara",
    "Photos for royal libas/Heavy Dress/Short Kurta",

    # Suit Set branch
    "Photos for royal libas/Suit Set",
    "Photos for royal libas/Suit Set/Party Wear",
    "Photos for royal libas/Suit Set/Party Wear/01 - Gulbahar Champagne Floral Party Set",
    "Photos for royal libas/Suit Set/Party Wear/02 - Noor Ivory Floral Party Set",
    "Photos for royal libas/Suit Set/Semi-party Wear",
    "Photos for royal libas/Suit Set/Semi-party Wear/01 - Nazakat Wine Festive Suit",
    "Photos for royal libas/Suit Set/Semi-party Wear/02 - Shabnam Navy Embellished Suit",
    "Photos for royal libas/Suit Set/Semi-party Wear/03 - Rangrez Coral Floral Cape Set",
    "Photos for royal libas/Suit Set/Semi-party Wear/04 - Rangrez Golden Beige Floral Cape Set",
    "Photos for royal libas/Suit Set/Semi-party Wear/05 - Rangrez Pink Floral Cape Set",
    "Photos for royal libas/Suit Set/Semi-party Wear/06 - Rangrez Navy Floral Cape Set",
    "Photos for royal libas/Suit Set/Semi-party Wear/Combination Photos",
    "Photos for royal libas/Suit Set/Three Pieces",
    "Photos for royal libas/Suit Set/Three Pieces/01 - Bahaar Lime Green Three-Piece Suit",
    "Photos for royal libas/Suit Set/Three Pieces/02 - Adaa Black Stripe Three-Piece Suit",
    "Photos for royal libas/Suit Set/Three Pieces/03 - Aafreen Beige Botanical Three-Piece Suit",
    "Photos for royal libas/Suit Set/Three Pieces/Combination Photos",

    # Two Pieces branch
    "Photos for royal libas/Two Pieces",
    "Photos for royal libas/Two Pieces/Co-ord Sets",
    "Photos for royal libas/Two Pieces/Kurta Pant",
]


def ensure_ancestor_folders(db: Session, folder_path: str, known_paths: set) -> int:
    """Ensure all ancestor folders exist in MediaFolder for a given folder path."""
    if not folder_path:
        return 0
    parts = [p.strip() for p in folder_path.strip("/").split("/") if p.strip()]
    created = 0
    current_path = ""
    for idx, part in enumerate(parts):
        current_path = f"{current_path}/{part}" if current_path else part
        if current_path not in known_paths:
            parent = "/".join(parts[:idx]) if idx > 0 else None
            db.add(MediaFolder(name=part, path=current_path, parent_path=parent))
            known_paths.add(current_path)
            created += 1
    return created


@router.get("/media/folders", response_model=List[MediaFolderResponse])
def admin_list_media_folders(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """List all media folders with recursive asset counts and subfolder counts."""
    folders = db.query(MediaFolder).order_by(MediaFolder.path.asc()).all()
    results = []
    for f in folders:
        escaped_p = escape_like(f.path)
        asset_count = (
            db.query(MediaAsset)
            .filter(or_(MediaAsset.folder == f.path, MediaAsset.folder.like(f"{escaped_p}/%", escape="\\")))
            .count()
        )
        subfolder_count = (
            db.query(MediaFolder)
            .filter(MediaFolder.parent_path == f.path)
            .count()
        )
        results.append(
            MediaFolderResponse(
                id=f.id,
                name=f.name,
                path=f.path,
                parent_path=f.parent_path,
                asset_count=asset_count,
                subfolder_count=subfolder_count,
                created_at=f.created_at,
                updated_at=f.updated_at,
            )
        )
    return results


@router.get("/media/folders/prepare-preview", response_model=PrepareCollectionFoldersPreviewResponse)
def admin_preview_prepare_collection_folders(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Preview the boutique collection and product folder hierarchy before creating missing folders.
    
    Shows existing folders, missing folders to be created, and conflicts/mappings so the
    owner can review safely without unexpected moves or renames.
    """
    existing_paths = {row[0] for row in db.query(MediaFolder.path).all()}
    missing_folders = [p for p in BOUTIQUE_TARGET_FOLDER_PATHS if p not in existing_paths]
    existing_matching = [p for p in BOUTIQUE_TARGET_FOLDER_PATHS if p in existing_paths]

    conflicts: List[FolderConflictMapping] = []
    # Check for root folders that exist and should not be moved automatically
    for root_name in ["Heavy Dress", "royal_libas", "samples"]:
        if root_name in existing_paths:
            conflicts.append(
                FolderConflictMapping(
                    folder=root_name,
                    status="preserved_root",
                    message=(
                        f"Root folder '{root_name}' already exists. It will remain preserved with all its assets; "
                        f"no automatic rename or move will be applied."
                    ),
                )
            )

    return PrepareCollectionFoldersPreviewResponse(
        total_target=len(BOUTIQUE_TARGET_FOLDER_PATHS),
        existing_count=len(existing_matching),
        to_create_count=len(missing_folders),
        missing_folders=missing_folders,
        existing_matching_folders=existing_matching,
        conflicts_and_mappings=conflicts,
    )


@router.post("/media/folders/prepare", response_model=PrepareCollectionFoldersResponse)
def admin_prepare_collection_folders(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Create only missing collection and product folders after owner confirmation.
    
    Creates empty folders in DB and Cloudinary without modifying or deleting existing folders/assets.
    Preserves intentional empty folders (such as '2').
    """
    known_paths = {row[0] for row in db.query(MediaFolder.path).all()}
    created_list = []

    for folder_path in BOUTIQUE_TARGET_FOLDER_PATHS:
        if folder_path not in known_paths:
            # Ensure ancestors are registered
            ensure_ancestor_folders(db, folder_path, known_paths)
            
            # Create remotely in Cloudinary if configured
            if is_cloudinary_configured():
                create_cloudinary_folder(folder_path)
            
            created_list.append(folder_path)

    db.commit()
    log_activity(
        db,
        current_admin,
        "COLLECTION_FOLDERS_PREPARED",
        "media_folder",
        None,
        f"Prepared boutique folder tree: created {len(created_list)} missing folders.",
    )

    return PrepareCollectionFoldersResponse(
        status="success",
        created_count=len(created_list),
        created_folders=created_list,
        message=f"Successfully prepared {len(created_list)} missing boutique folder(s).",
    )


@router.get("/media/cleanup-preview", response_model=MediaCleanupPreviewResponse)
def admin_media_cleanup_preview(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Preview safe reconciliation of obsolete old numbered folders and sample assets without modifying any data."""
    from scripts.media_cleanup_maintenance import audit_cleanup_candidates
    audit = audit_cleanup_candidates(db)
    safe_count = len([f for f in audit["obsolete_folders"] if f["is_safe_to_reconcile"]])
    unsafe_count = len([f for f in audit["obsolete_folders"] if not f["is_safe_to_reconcile"]])

    return MediaCleanupPreviewResponse(
        dry_run=True,
        protected_folders_count=len(audit["protected_empty_folders"]),
        total_obsolete_candidates=len(audit["obsolete_folders"]),
        safe_to_reconcile_count=safe_count,
        unsafe_count=unsafe_count,
        sample_assets_count=len(audit["sample_assets"]),
        protected_empty_folders=audit["protected_empty_folders"],
        obsolete_folders=audit["obsolete_folders"],
        sample_assets=audit["sample_assets"],
    )


@router.post("/media/cleanup-execute", response_model=MediaCleanupExecuteResponse)
def admin_media_cleanup_execute(
    payload: MediaCleanupExecuteRequest,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER")),
):
    """Safely reconcile obsolete empty folders with explicit owner confirmation.
    
    Protected empty folders (e.g. Designer Wear/2, Lehenga) are never touched.
    Cloudinary media assets are never deleted.
    """
    if not payload.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit owner confirmation is required to execute folder reconciliation. Pass confirm=true.",
        )

    from scripts.media_cleanup_maintenance import run_cleanup_maintenance
    result = run_cleanup_maintenance(
        dry_run=False,
        remove_remote_folders=payload.clean_remote_folders,
        db_session=db,
    )

    log_activity(
        db,
        current_admin,
        "MEDIA_FOLDERS_RECONCILED",
        "media_folder",
        None,
        f"Reconciled {result['reconciled_local_folders']} obsolete empty folder records.",
    )

    return MediaCleanupExecuteResponse(
        status=result.get("status", "success"),
        reconciled_local_folders=result["reconciled_local_folders"],
        reconciled_remote_folders=result["reconciled_remote_folders"],
        remote_folder_errors=result["remote_folder_errors"],
        message=f"Reconciled {result['reconciled_local_folders']} obsolete empty folder records.",
    )


@router.post("/media/folders", response_model=MediaFolderResponse)
def admin_create_media_folder(
    payload: MediaFolderCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Create a new media folder in the database and Cloudinary storage."""
    raw_name = payload.name.strip()
    clean_name = re.sub(r'[\\/:*?"<>|]', '_', raw_name)
    if not clean_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder name cannot be empty or invalid.")

    parent = payload.parent_path.strip().strip("/") if payload.parent_path else None
    new_path = f"{parent}/{clean_name}" if parent else clean_name

    existing = db.query(MediaFolder).filter(MediaFolder.path == new_path).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Folder '{new_path}' already exists.")

    known_paths = {row[0] for row in db.query(MediaFolder.path).all()}
    if parent:
        ensure_ancestor_folders(db, parent, known_paths)

    # Create remotely in Cloudinary if configured
    remote_ok = True
    if is_cloudinary_configured():
        c_res = create_cloudinary_folder(new_path)
        if not c_res.get("success"):
            admin_media_logger.error(f"Cloudinary provider rejected folder creation for '{new_path}': {c_res.get('error')}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Cloudinary provider rejected folder creation: {c_res.get('error') or 'Provider rejected folder creation'}",
            )
        remote_ok = True

    folder = MediaFolder(
        name=clean_name,
        path=new_path,
        parent_path=parent,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)

    log_activity(db, current_admin, "FOLDER_CREATED", "media_folder", folder.id, f"Created folder '{folder.path}'")
    return MediaFolderResponse(
        id=folder.id,
        name=folder.name,
        path=folder.path,
        parent_path=folder.parent_path,
        asset_count=0,
        subfolder_count=0,
        remote_created=remote_ok,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


@router.put("/media/folders/{id}", response_model=MediaFolderResponse)
def admin_rename_media_folder(
    id: int,
    payload: MediaFolderUpdate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Rename a media folder and safely update nested subfolders and asset folder paths.
    
    Verifies Cloudinary provider response before modifying local records, and respects
    fixed vs dynamic folder mode limitations.
    """
    folder = db.query(MediaFolder).filter(MediaFolder.id == id).first()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found.")

    raw_name = payload.name.strip()
    clean_name = re.sub(r'[\\/:*?"<>|]', '_', raw_name)
    if not clean_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder name cannot be empty or invalid.")

    old_path = folder.path
    new_path = f"{folder.parent_path}/{clean_name}" if folder.parent_path else clean_name

    escaped_old = escape_like(old_path)

    if old_path == new_path:
        return MediaFolderResponse(
            id=folder.id,
            name=folder.name,
            path=folder.path,
            parent_path=folder.parent_path,
            asset_count=db.query(MediaAsset).filter(or_(MediaAsset.folder == folder.path, MediaAsset.folder.like(f"{escape_like(folder.path)}/%", escape="\\"))).count(),
            subfolder_count=db.query(MediaFolder).filter(MediaFolder.parent_path == folder.path).count(),
            created_at=folder.created_at,
            updated_at=folder.updated_at,
        )

    conflict = db.query(MediaFolder).filter(MediaFolder.path == new_path).first()
    if conflict:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"A folder with path '{new_path}' already exists.")

    # Check Cloudinary folder mode and remote rename capability
    if is_cloudinary_configured():
        mode = detect_cloudinary_folder_mode()
        if mode != "dynamic":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cloudinary is in {mode} folder mode. Renaming folders is restricted to prevent breaking delivery URLs.",
            )
        c_res = rename_cloudinary_folder(old_path, new_path)
        if not c_res.get("success"):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Cloudinary rejected folder rename: {c_res.get('error')}",
            )

    folder.name = clean_name
    folder.path = new_path

    # Update descendant folders with escaped SQL LIKE
    descendants = db.query(MediaFolder).filter(MediaFolder.path.like(f"{escaped_old}/%", escape="\\")).all()
    for d in descendants:
        d.path = new_path + d.path[len(old_path):]
        if d.parent_path and d.parent_path.startswith(old_path):
            d.parent_path = new_path + d.parent_path[len(old_path):]

    # Update asset folder references
    assets = db.query(MediaAsset).filter(or_(MediaAsset.folder == old_path, MediaAsset.folder.like(f"{escaped_old}/%", escape="\\"))).all()
    for a in assets:
        old_a_folder = a.folder or ""
        new_a_folder = new_path + old_a_folder[len(old_path):] if old_a_folder.startswith(old_path) else new_path
        a.folder = new_a_folder

    db.commit()
    db.refresh(folder)
    log_activity(db, current_admin, "FOLDER_RENAMED", "media_folder", folder.id, f"Renamed folder from '{old_path}' to '{new_path}'")

    escaped_new = escape_like(folder.path)
    asset_count = db.query(MediaAsset).filter(or_(MediaAsset.folder == folder.path, MediaAsset.folder.like(f"{escaped_new}/%", escape="\\"))).count()
    subfolder_count = db.query(MediaFolder).filter(MediaFolder.parent_path == folder.path).count()

    return MediaFolderResponse(
        id=folder.id,
        name=folder.name,
        path=folder.path,
        parent_path=folder.parent_path,
        asset_count=asset_count,
        subfolder_count=subfolder_count,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


@router.delete("/media/folders/{id}")
def admin_delete_media_folder(
    id: int,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER")),
):
    """Safely delete an empty media folder.
    
    Rejects if it contains assets or subfolders. Does not delete local record if
    Cloudinary provider deletion fails.
    """
    folder = db.query(MediaFolder).filter(MediaFolder.id == id).first()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found.")

    subfolder_count = db.query(MediaFolder).filter(MediaFolder.parent_path == folder.path).count()
    if subfolder_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Folder '{folder.name}' cannot be deleted because it contains {subfolder_count} subfolder(s). Delete or move them first.",
        )

    escaped_p = escape_like(folder.path)
    asset_count = db.query(MediaAsset).filter(or_(MediaAsset.folder == folder.path, MediaAsset.folder.like(f"{escaped_p}/%", escape="\\"))).count()
    if asset_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Folder '{folder.name}' cannot be deleted because it contains {asset_count} asset(s). Move or delete the assets first.",
        )

    # Delete remotely from Cloudinary before deleting local record
    if is_cloudinary_configured():
        c_res = delete_cloudinary_folder(folder.path)
        if not c_res.get("success") and not c_res.get("already_missing"):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Cloudinary rejected folder deletion: {c_res.get('error')}. Local folder record was preserved.",
            )

    folder_path = folder.path
    db.delete(folder)
    db.commit()

    log_activity(db, current_admin, "FOLDER_DELETED", "media_folder", id, f"Deleted empty folder '{folder_path}'")
    return {"status": "success", "message": f"Folder '{folder_path}' successfully deleted."}


@router.get("/media", response_model=List[MediaAssetResponse])
def admin_list_media(
    resource_type: Optional[str] = Query(None, description="Filter by resource type: 'image' or 'video'"),
    search: Optional[str] = Query(None, description="Search by filename, display name, public ID, or alt text"),
    product_id: Optional[int] = Query(None, description="Filter by product ID"),
    folder: Optional[str] = Query(None, description="Filter by folder path (exact or prefix)"),
    hide_samples: bool = Query(True, description="Hide Cloudinary demo samples from normal boutique view"),
    sort_by: Optional[str] = Query("newest", description="Sort order: newest, oldest, largest, name"),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve all uploaded persistent media assets with filtering, folder selection, and product usage."""
    query = db.query(MediaAsset)

    if resource_type:
        query = query.filter(MediaAsset.resource_type == resource_type.strip().lower())

    if search:
        pattern = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(MediaAsset.filename).like(pattern),
                func.lower(MediaAsset.display_name).like(pattern),
                func.lower(MediaAsset.alt_text).like(pattern),
                func.lower(MediaAsset.public_id).like(pattern),
            )
        )

    if product_id is not None:
        subq = db.query(ProductImage.url).filter(ProductImage.product_id == product_id)
        query = query.filter(MediaAsset.url.in_(subq))

    # Hide external Cloudinary demo sample images unless user explicitly opens the samples folder
    if hide_samples and (folder is None or (folder != "samples" and not folder.strip().strip("/").startswith("samples"))):
        query = query.filter(
            and_(
                or_(MediaAsset.folder.is_(None), ~MediaAsset.folder.like("samples%")),
                or_(MediaAsset.public_id.is_(None), ~MediaAsset.public_id.like("samples/%")),
            )
        )

    if folder is not None:
        clean_folder = folder.strip().strip("/")
        if clean_folder == "" or clean_folder.lower() == "root":
            query = query.filter(or_(MediaAsset.folder.is_(None), MediaAsset.folder == ""))
        else:
            escaped_f = escape_like(clean_folder)
            query = query.filter(or_(MediaAsset.folder == clean_folder, MediaAsset.folder.like(f"{escaped_f}/%", escape="\\")))

    if sort_by == "oldest":
        query = query.order_by(MediaAsset.created_at.asc())
    elif sort_by == "largest":
        query = query.order_by(MediaAsset.file_size.desc())
    elif sort_by == "name":
        query = query.order_by(func.lower(MediaAsset.filename).asc())
    else:
        query = query.order_by(MediaAsset.created_at.desc())

    assets = query.all()

    results = []
    for a in assets:
        used_products, used_editorial = _check_asset_references(a, db)
        is_test, reason = _is_test_record(a)
        is_sample = _is_sample_asset(a)
        asset_dict = {
            "id": a.id,
            "filename": a.filename,
            "display_name": getattr(a, "display_name", None) or a.filename,
            "public_id": a.public_id,
            "cloudinary_asset_id": getattr(a, "cloudinary_asset_id", None),
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
            "used_editorial": used_editorial,
            "is_test_record": is_test,
            "test_reason": reason,
            "is_sample": is_sample,
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
            content_hash = hashlib.sha256(contents).hexdigest()
            cloud_name = c_res.get("cloud_name") or CLOUDINARY_CLOUD_NAME
            cloudinary_asset_id = c_res.get("asset_id")
            delivery_type = c_res.get("delivery_type", "upload")

            asset = MediaAsset(
                filename=filename,
                public_id=c_res["public_id"],
                cloudinary_asset_id=cloudinary_asset_id,
                cloud_name=cloud_name,
                delivery_type=delivery_type,
                content_hash=content_hash,
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
                display_name=asset.display_name or asset.filename,
                client_id=cid,
                public_id=asset.public_id,
                cloudinary_asset_id=asset.cloudinary_asset_id,
                cloud_name=asset.cloud_name,
                delivery_type=asset.delivery_type or "upload",
                content_hash=asset.content_hash,
                relative_source_path=asset.relative_source_path,
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
        content_hash = hashlib.sha256(contents).hexdigest()
        cloud_name = c_res.get("cloud_name") or CLOUDINARY_CLOUD_NAME
        cloudinary_asset_id = c_res.get("asset_id")
        delivery_type = c_res.get("delivery_type", "upload")

        asset = MediaAsset(
            filename=filename,
            public_id=c_res["public_id"],
            cloudinary_asset_id=cloudinary_asset_id,
            cloud_name=cloud_name,
            delivery_type=delivery_type,
            content_hash=content_hash,
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
        display_name=asset.display_name or asset.filename,
        public_id=asset.public_id,
        cloudinary_asset_id=asset.cloudinary_asset_id,
        cloud_name=asset.cloud_name,
        delivery_type=asset.delivery_type or "upload",
        content_hash=asset.content_hash,
        relative_source_path=asset.relative_source_path,
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
            if setting:
                if _matches_asset(setting.hero_image_url, asset):
                    setting.hero_image_url = None
                if _matches_asset(setting.category_two_pieces_image, asset):
                    setting.category_two_pieces_image = None
                if _matches_asset(setting.category_suit_set_image, asset):
                    setting.category_suit_set_image = None
                if _matches_asset(setting.category_heavy_dress_image, asset):
                    setting.category_heavy_dress_image = None
                if _matches_asset(setting.festive_banner_image, asset):
                    setting.festive_banner_image = None
                if _matches_asset(setting.poster_occasion_image, asset):
                    setting.poster_occasion_image = None
                if _matches_asset(setting.poster_everyday_image, asset):
                    setting.poster_everyday_image = None
                if _matches_asset(setting.poster_story_image, asset):
                    setting.poster_story_image = None

        if used_products:
            filters = [ProductImage.url == asset.url]
            if asset.public_id:
                filters.append(ProductImage.public_id == asset.public_id)
            db.query(ProductImage).filter(or_(*filters)).delete(synchronize_session=False)

    db.delete(asset)
    db.commit()
    log_activity(db, current_admin, "MEDIA_DELETED", "media", id, asset.filename)
    return {"status": "success", "message": f"Media asset '{asset.filename}' deleted successfully."}


@router.post("/media/check-usage", response_model=MediaCheckUsageResponse)
def admin_check_media_usage(
    payload: BulkDeleteMediaRequest,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Check if the specified media assets are currently referenced by products or editorial sections."""
    if not payload.asset_ids:
        return MediaCheckUsageResponse(total_checked=0, in_use_count=0, safe_count=0, usage_details=[])

    assets = db.query(MediaAsset).filter(MediaAsset.id.in_(payload.asset_ids)).all()
    in_use_details: List[MediaUsageLocation] = []

    for a in assets:
        used_products, used_editorial = _check_asset_references(a, db)
        locations = [f"Product: '{p.name}'" for p in used_products] + used_editorial
        if locations:
            in_use_details.append(
                MediaUsageLocation(
                    asset_id=a.id,
                    filename=a.filename,
                    display_name=getattr(a, "display_name", None) or a.filename,
                    url=a.url,
                    locations=locations,
                )
            )

    return MediaCheckUsageResponse(
        total_checked=len(assets),
        in_use_count=len(in_use_details),
        safe_count=len(assets) - len(in_use_details),
        usage_details=in_use_details,
    )


@router.post("/media/bulk-move", response_model=BulkMoveMediaResponse)
def admin_bulk_move_media(
    payload: BulkMoveMediaRequest,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Move multiple selected assets into a target folder safely using dynamic folder mode.
    
    Verifies Cloudinary provider response per asset and prevents unsafe moves in fixed folder mode.
    """
    if not payload.asset_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No asset IDs provided.")

    # Check Cloudinary folder mode
    if is_cloudinary_configured():
        mode = detect_cloudinary_folder_mode()
        if mode != "dynamic":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cloudinary is in {mode} folder mode. Moving assets without changing public IDs is not supported by Cloudinary in this mode.",
            )

    target_folder = payload.target_folder.strip().strip("/") if payload.target_folder else None

    # If target folder is provided, ensure folder and all ancestors exist in DB
    if target_folder:
        known_paths = {row[0] for row in db.query(MediaFolder.path).all()}
        ensure_ancestor_folders(db, target_folder, known_paths)

    assets = db.query(MediaAsset).filter(MediaAsset.id.in_(payload.asset_ids)).all()
    moved_count = 0
    failures: List[BulkMoveMediaFailure] = []

    for a in assets:
        if a.public_id and is_cloudinary_configured():
            c_res = move_cloudinary_asset_folder(
                public_id=a.public_id,
                new_folder=target_folder or "",
                resource_type=getattr(a, "resource_type", "image") or "image",
            )
            if not c_res.get("success"):
                failures.append(BulkMoveMediaFailure(asset_id=a.id, error=c_res.get("error") or "Move rejected by Cloudinary"))
                continue

        a.folder = target_folder
        moved_count += 1

    db.commit()

    log_activity(
        db,
        current_admin,
        "MEDIA_BULK_MOVED",
        "media",
        None,
        f"Moved {moved_count} assets to folder '{target_folder or 'root'}' (failed: {len(failures)})",
    )

    status_str = "success" if not failures else ("partial_success" if moved_count > 0 else "failed")
    return BulkMoveMediaResponse(
        status=status_str,
        moved_count=moved_count,
        failed_count=len(failures),
        target_folder=target_folder or "root",
        message=f"Successfully moved {moved_count} asset(s) to '{target_folder or 'Root'}'. {len(failures)} failed.",
        failures=failures,
    )


@router.post("/media/bulk-attach", response_model=BulkAttachToProductResponse)
def admin_bulk_attach_media(
    payload: BulkAttachToProductRequest,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Attach multiple selected media assets to a product gallery with cover selection, ordering, and duplicate protection.
    
    In append mode, explicitly selecting a cover promotes that asset to sort_order 0 (the actual cover)
    without duplicating it, and shifts existing gallery images sequentially.
    """
    product = db.query(Product).filter(Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    if not payload.asset_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No asset IDs provided.")

    assets = db.query(MediaAsset).filter(MediaAsset.id.in_(payload.asset_ids)).all()
    if not assets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching media assets found.")

    asset_map = {a.id: a for a in assets}
    unavailable_ids = [aid for aid in payload.asset_ids if aid not in asset_map]

    added_count = 0
    skipped_duplicates = 0

    if payload.replace_gallery:
        # Remove all existing images for this product
        db.query(ProductImage).filter(ProductImage.product_id == product.id).delete()
        
        # Build ordered list with cover asset at position 0
        ordered_assets = []
        if payload.cover_asset_id and payload.cover_asset_id in asset_map:
            ordered_assets.append(asset_map[payload.cover_asset_id])
        for aid in payload.asset_ids:
            if aid in asset_map and (not payload.cover_asset_id or aid != payload.cover_asset_id):
                ordered_assets.append(asset_map[aid])

        for idx, asset in enumerate(ordered_assets):
            asset_url = asset.secure_url or asset.url
            new_img = ProductImage(
                product_id=product.id,
                url=asset_url,
                sort_order=idx,
                alt_text=asset.alt_text or getattr(asset, "display_name", None) or product.name,
                resource_type=getattr(asset, "resource_type", "image") or "image",
                public_id=asset.public_id,
                width=asset.width,
                height=asset.height,
                duration=asset.duration,
            )
            db.add(new_img)
            added_count += 1
    else:
        # Append mode: preserve existing gallery images
        existing_images = (
            db.query(ProductImage)
            .filter(ProductImage.product_id == product.id)
            .order_by(ProductImage.sort_order.asc())
            .all()
        )
        existing_urls = {img.url for img in existing_images}
        existing_pids = {img.public_id for img in existing_images if img.public_id}

        if payload.cover_asset_id and payload.cover_asset_id in asset_map:
            cover_asset = asset_map[payload.cover_asset_id]
            cover_url = cover_asset.secure_url or cover_asset.url
            cover_pid = cover_asset.public_id

            # Check if chosen cover already exists in product gallery
            matching_img = next(
                (img for img in existing_images if img.url == cover_url or (cover_pid and img.public_id == cover_pid)),
                None,
            )
            if matching_img:
                # Promote existing image to sort_order 0, shift other existing images
                matching_img.sort_order = 0
                other_existing = [img for img in existing_images if img.id != matching_img.id]
                for idx, img in enumerate(other_existing):
                    img.sort_order = idx + 1
                next_sort_order = len(other_existing) + 1
            else:
                # Shift all existing images down by 1 to make room at sort_order 0
                for img in existing_images:
                    img.sort_order += 1

                cover_img = ProductImage(
                    product_id=product.id,
                    url=cover_url,
                    sort_order=0,
                    alt_text=cover_asset.alt_text or getattr(cover_asset, "display_name", None) or product.name,
                    resource_type=getattr(cover_asset, "resource_type", "image") or "image",
                    public_id=cover_pid,
                    width=cover_asset.width,
                    height=cover_asset.height,
                    duration=cover_asset.duration,
                )
                db.add(cover_img)
                existing_urls.add(cover_url)
                if cover_pid:
                    existing_pids.add(cover_pid)
                added_count += 1
                next_sort_order = len(existing_images) + 1

            # Append remainder of payload assets
            for aid in payload.asset_ids:
                if aid == payload.cover_asset_id or aid not in asset_map:
                    continue
                a = asset_map[aid]
                a_url = a.secure_url or a.url
                a_pid = a.public_id
                if a_url in existing_urls or (a_pid and a_pid in existing_pids):
                    skipped_duplicates += 1
                    continue

                new_img = ProductImage(
                    product_id=product.id,
                    url=a_url,
                    sort_order=next_sort_order,
                    alt_text=a.alt_text or getattr(a, "display_name", None) or product.name,
                    resource_type=getattr(a, "resource_type", "image") or "image",
                    public_id=a_pid,
                    width=a.width,
                    height=a.height,
                    duration=a.duration,
                )
                db.add(new_img)
                existing_urls.add(a_url)
                if a_pid:
                    existing_pids.add(a_pid)
                next_sort_order += 1
                added_count += 1
        else:
            # No new cover specified: existing images retain their exact sort orders
            base_sort_order = max([img.sort_order for img in existing_images], default=-1) + 1
            for aid in payload.asset_ids:
                if aid not in asset_map:
                    continue
                a = asset_map[aid]
                a_url = a.secure_url or a.url
                a_pid = a.public_id
                if a_url in existing_urls or (a_pid and a_pid in existing_pids):
                    skipped_duplicates += 1
                    continue

                sort_idx = base_sort_order + added_count
                new_img = ProductImage(
                    product_id=product.id,
                    url=a_url,
                    sort_order=sort_idx,
                    alt_text=a.alt_text or getattr(a, "display_name", None) or product.name,
                    resource_type=getattr(a, "resource_type", "image") or "image",
                    public_id=a_pid,
                    width=a.width,
                    height=a.height,
                    duration=a.duration,
                )
                db.add(new_img)
                existing_urls.add(a_url)
                if a_pid:
                    existing_pids.add(a_pid)
                added_count += 1

    db.commit()
    db.refresh(product)

    # Determine cover image URL for product
    cover_image_record = (
        db.query(ProductImage)
        .filter(ProductImage.product_id == product.id)
        .order_by(ProductImage.sort_order.asc())
        .first()
    )
    cover_url = cover_image_record.url if cover_image_record else None

    log_activity(
        db,
        current_admin,
        "PRODUCT_MEDIA_ATTACHED",
        "product",
        product.id,
        f"Attached {added_count} media files to '{product.name}' (replace={payload.replace_gallery}, skipped {skipped_duplicates} duplicates)",
    )

    return BulkAttachToProductResponse(
        status="success",
        product_id=product.id,
        product_name=product.name,
        added_count=added_count,
        skipped_duplicates=skipped_duplicates,
        unavailable_asset_ids=unavailable_ids,
        cover_image_url=cover_url,
        total_gallery_images=len(product.images),
    )


@router.post("/media/bulk-delete", response_model=BulkDeleteMediaResponse)
def admin_bulk_delete_media(
    payload: BulkDeleteMediaRequest,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER")),
):
    """Safely delete multiple media assets from library and Cloudinary.
    
    Protects assets currently referenced in products or editorial banners by default.
    """
    if not payload.asset_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No asset IDs provided.")

    assets = db.query(MediaAsset).filter(MediaAsset.id.in_(payload.asset_ids)).all()
    deleted_ids = []
    skipped_in_use = []
    failed = []

    for asset in assets:
        used_products, used_editorial = _check_asset_references(asset, db)
        is_used = len(used_products) > 0 or len(used_editorial) > 0

        if is_used and not payload.force:
            locations = [f"Product: '{p.name}'" for p in used_products] + used_editorial
            skipped_in_use.append({
                "id": asset.id,
                "filename": asset.filename,
                "locations": locations,
            })
            continue

        # Cloudinary Remote Deletion
        if asset.public_id and is_cloudinary_configured():
            res_type = getattr(asset, "resource_type", "image") or "image"
            del_res = delete_from_cloudinary(asset.public_id, resource_type=res_type)
            if not del_res.get("success") and not del_res.get("already_missing"):
                failed.append({
                    "id": asset.id,
                    "filename": asset.filename,
                    "error": del_res.get("error") or "Remote deletion rejected by Cloudinary.",
                })
                continue

        # If forced, clean up referenced product images and editorial store settings
        if payload.force:
            if used_editorial:
                setting = db.query(StoreSetting).first()
                if setting:
                    for field in [
                        "hero_image_url",
                        "category_two_pieces_image",
                        "category_suit_set_image",
                        "category_heavy_dress_image",
                        "festive_banner_image",
                        "poster_occasion_image",
                        "poster_everyday_image",
                        "poster_story_image",
                    ]:
                        if _matches_asset(getattr(setting, field), asset):
                            setattr(setting, field, None)
            if used_products:
                filters = [ProductImage.url == asset.url]
                if asset.public_id:
                    filters.append(ProductImage.public_id == asset.public_id)
                db.query(ProductImage).filter(or_(*filters)).delete(synchronize_session=False)

        # Delete local file if applicable
        legacy_path = Path(__file__).resolve().parent.parent.parent / "uploads" / "products" / asset.filename
        if legacy_path.exists():
            try:
                legacy_path.unlink()
            except Exception:
                pass

        deleted_ids.append(asset.id)
        db.delete(asset)

    db.commit()

    log_activity(
        db,
        current_admin,
        "MEDIA_BULK_DELETED",
        "media",
        None,
        f"Bulk deleted {len(deleted_ids)} assets (skipped {len(skipped_in_use)} in-use, failed {len(failed)})",
    )

    msg = f"Deleted {len(deleted_ids)} asset(s)."
    if skipped_in_use:
        msg += f" Skipped {len(skipped_in_use)} asset(s) currently in use."
    if failed:
        msg += f" {len(failed)} asset(s) failed remote deletion."

    return BulkDeleteMediaResponse(
        status="success" if not failed else "partial",
        deleted_ids=deleted_ids,
        skipped_in_use=skipped_in_use,
        failed=failed,
        message=msg,
    )


@router.post("/media/sync", response_model=CloudinarySyncResponse)
def admin_sync_cloudinary_media(
    cursor: Optional[str] = Query(None, description="Pagination cursor for batched sync"),
    max_results: int = Query(100, description="Max assets per batch (10-100)"),
    resource_type: str = Query("all", description="Resource type: 'all', 'image', or 'video'"),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Sync media and folders directly uploaded via Cloudinary Console.
    
    Discovers remote folders recursively, creates missing ancestor records, follows
    pagination cursors, reconciles immutable asset IDs and (public_id, resource_type) pairs,
    and handles rate limits and partial failures safely.
    """
    if not is_cloudinary_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary is not configured on this server.",
        )

    # Concurrency guard
    acquired = _sync_lock.acquire(blocking=False)
    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A media sync is already in progress. Please wait for the current sync to complete.",
        )

    try:
        known_folder_paths = {row[0] for row in db.query(MediaFolder.path).all()}
        folders_discovered = 0

        # 1. Discover remote folders recursively (performed on initial batch or when no cursor)
        if not cursor:
            from scripts.media_cleanup_maintenance import OBSOLETE_FOLDER_MAPPINGS
            obsolete_paths = set(OBSOLETE_FOLDER_MAPPINGS.keys())

            remote_folders = list_cloudinary_folders_recursive(None)
            for rf in remote_folders:
                r_path = rf.get("path")
                if r_path and r_path in obsolete_paths:
                    continue
                if r_path:
                    created_ancestors = ensure_ancestor_folders(db, r_path, known_folder_paths)
                    folders_discovered += created_ancestors
            db.commit()

        # 2. Fetch paginated resources with strictly separate cursor tracking for image and video
        scanned_resources = []
        next_cursor = None
        rate_limited = False
        error_message = None

        if resource_type == "image":
            img_c = cursor[4:] if cursor and cursor.startswith("img:") else cursor
            res_dict = fetch_cloudinary_resources(resource_type="image", max_results=max_results, next_cursor=img_c)
            scanned_resources = res_dict.get("resources", [])
            if res_dict.get("next_cursor"):
                next_cursor = res_dict.get("next_cursor")
            if res_dict.get("rate_limited"):
                rate_limited = True
            if res_dict.get("error"):
                error_message = res_dict.get("error")

        elif resource_type == "video":
            vid_c = cursor[4:] if cursor and cursor.startswith("vid:") else cursor
            res_dict = fetch_cloudinary_resources(resource_type="video", max_results=max_results, next_cursor=vid_c)
            scanned_resources = res_dict.get("resources", [])
            if res_dict.get("next_cursor"):
                next_cursor = res_dict.get("next_cursor")
            if res_dict.get("rate_limited"):
                rate_limited = True
            if res_dict.get("error"):
                error_message = res_dict.get("error")

        else:  # resource_type == "all"
            if not cursor or cursor.startswith("img:"):
                img_c = cursor[4:] if cursor and cursor.startswith("img:") else cursor
                res_dict = fetch_cloudinary_resources(resource_type="image", max_results=max_results, next_cursor=img_c)
                scanned_resources = res_dict.get("resources", [])
                if res_dict.get("rate_limited"):
                    rate_limited = True
                if res_dict.get("error"):
                    error_message = res_dict.get("error")

                if res_dict.get("next_cursor"):
                    next_cursor = f"img:{res_dict['next_cursor']}"
                else:
                    # Images are exhausted on this page, fetch initial video page
                    vid_res = fetch_cloudinary_resources(resource_type="video", max_results=max_results, next_cursor=None)
                    scanned_resources.extend(vid_res.get("resources", []))
                    if vid_res.get("rate_limited"):
                        rate_limited = True
                    if vid_res.get("error"):
                        error_message = vid_res.get("error")
                    if vid_res.get("next_cursor"):
                        next_cursor = f"vid:{vid_res['next_cursor']}"
                    else:
                        next_cursor = None
            elif cursor.startswith("vid:"):
                vid_c = cursor[4:]
                vid_res = fetch_cloudinary_resources(resource_type="video", max_results=max_results, next_cursor=vid_c)
                scanned_resources = vid_res.get("resources", [])
                if vid_res.get("rate_limited"):
                    rate_limited = True
                if vid_res.get("error"):
                    error_message = vid_res.get("error")
                if vid_res.get("next_cursor"):
                    next_cursor = f"vid:{vid_res['next_cursor']}"
                else:
                    next_cursor = None
            else:
                # Fallback for plain legacy cursor
                res_dict = fetch_cloudinary_resources(resource_type="image", max_results=max_results, next_cursor=cursor)
                scanned_resources = res_dict.get("resources", [])
                if res_dict.get("next_cursor"):
                    next_cursor = f"img:{res_dict['next_cursor']}"

        total_scanned = len(scanned_resources)
        imported = 0
        updated = 0
        skipped = 0
        failed = 0
        cloud_name = CLOUDINARY_CLOUD_NAME

        for res in scanned_resources:
            try:
                asset_id = res.get("asset_id")
                public_id = res.get("public_id")
                secure_url = res.get("secure_url") or res.get("url")
                res_type = res.get("resource_type", "image")
                fmt = res.get("format")
                file_bytes = res.get("bytes", 0)
                width = res.get("width")
                height = res.get("height")
                duration = res.get("duration")
                raw_asset_folder = res.get("asset_folder")
                if raw_asset_folder is not None:
                    asset_folder = raw_asset_folder.strip().strip("/") if raw_asset_folder.strip() else None
                else:
                    asset_folder = os.path.dirname(public_id) if "/" in public_id else None
                display_name = res.get("display_name") or (os.path.basename(public_id) if public_id else None)

                # Reconcile primarily by immutable asset_id + cloud_name, then fallback to (public_id, resource_type)
                existing_asset = None
                if asset_id:
                    existing_asset = (
                        db.query(MediaAsset)
                        .filter(
                            MediaAsset.cloudinary_asset_id == asset_id,
                            or_(MediaAsset.cloud_name == cloud_name, MediaAsset.cloud_name == None),
                        )
                        .first()
                    )
                if not existing_asset and public_id:
                    existing_asset = (
                        db.query(MediaAsset)
                        .filter(
                            MediaAsset.public_id == public_id,
                            MediaAsset.resource_type == res_type,
                            or_(MediaAsset.cloud_name == cloud_name, MediaAsset.cloud_name == None),
                        )
                        .first()
                    )
                if not existing_asset and secure_url:
                    existing_asset = (
                        db.query(MediaAsset)
                        .filter(
                            MediaAsset.url == secure_url,
                            MediaAsset.resource_type == res_type,
                            or_(MediaAsset.cloud_name == cloud_name, MediaAsset.cloud_name == None),
                        )
                        .first()
                    )

                if existing_asset:
                    changed = False
                    if not existing_asset.cloudinary_asset_id and asset_id:
                        existing_asset.cloudinary_asset_id = asset_id
                        changed = True
                    if not getattr(existing_asset, "cloud_name", None) and cloud_name:
                        existing_asset.cloud_name = cloud_name
                        changed = True
                    if not getattr(existing_asset, "delivery_type", None):
                        existing_asset.delivery_type = res.get("type", "upload")
                        changed = True
                    if not getattr(existing_asset, "display_name", None) and display_name:
                        existing_asset.display_name = display_name
                        changed = True
                    if width and existing_asset.width != width:
                        existing_asset.width = width
                        changed = True
                    if height and existing_asset.height != height:
                        existing_asset.height = height
                        changed = True
                    if duration and existing_asset.duration != duration:
                        existing_asset.duration = duration
                        changed = True
                    if file_bytes and existing_asset.file_size != file_bytes:
                        existing_asset.file_size = file_bytes
                        changed = True
                    # Reconcile moved asset, including moved back to root (asset_folder=None)
                    if existing_asset.folder != asset_folder:
                        existing_asset.folder = asset_folder
                        changed = True

                    if changed:
                        updated += 1
                    else:
                        skipped += 1
                else:
                    ext = f".{fmt}" if fmt else ""
                    clean_filename = f"{os.path.basename(public_id or 'media')}{ext}"
                    mime_type = f"video/{fmt or 'mp4'}" if res_type == "video" else f"image/{'jpeg' if fmt == 'jpg' else (fmt or 'jpeg')}"

                    new_asset = MediaAsset(
                        filename=clean_filename,
                        display_name=display_name or clean_filename,
                        public_id=public_id,
                        cloudinary_asset_id=asset_id,
                        cloud_name=cloud_name,
                        delivery_type=res.get("type", "upload"),
                        url=secure_url,
                        secure_url=secure_url,
                        resource_type=res_type,
                        format=fmt,
                        width=width,
                        height=height,
                        duration=duration,
                        file_size=file_bytes,
                        mime_type=mime_type,
                        alt_text=display_name or clean_filename,
                        folder=asset_folder,
                    )
                    db.add(new_asset)
                    imported += 1

                    if asset_folder:
                        created_anc = ensure_ancestor_folders(db, asset_folder, known_folder_paths)
                        folders_discovered += created_anc

            except Exception as err:
                admin_media_logger.error(f"Error importing Cloudinary resource {res.get('public_id')}: {err}")
                failed += 1

        db.commit()

        has_more = bool(next_cursor)
        is_partial = failed > 0 or rate_limited or (error_message is not None)
        sync_status = "in_progress" if has_more else ("partial_failure" if is_partial else "complete")

        now = datetime.now(timezone.utc)
        if sync_status == "complete":
            log_activity(
                db,
                current_admin,
                "MEDIA_SYNCED",
                "media",
                None,
                f"Cloudinary sync complete: {imported} imported, {updated} updated, {skipped} unchanged, {failed} failed.",
            )
        else:
            log_activity(
                db,
                current_admin,
                "MEDIA_SYNC_PARTIAL",
                "media",
                None,
                f"Cloudinary sync {sync_status}: {imported} imported, {failed} failed (has_more={has_more}).",
            )

        return CloudinarySyncResponse(
            status=sync_status,
            cloud_name=get_cloudinary_status().get("cloud_name") or "configured",
            total_scanned=total_scanned,
            imported=imported,
            updated=updated,
            skipped=skipped,
            failed=failed,
            remaining=0 if not has_more else max(0, total_scanned),
            folders_discovered=folders_discovered,
            has_more=has_more,
            next_cursor=next_cursor,
            last_synced_at=now if sync_status == "complete" else None,
            error_message=error_message,
        )

    finally:
        _sync_lock.release()


@router.get("/media/status", response_model=CloudinaryStatusResponse)
def admin_get_media_status(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Return status of Cloudinary configuration and media library statistics."""
    status_info = get_cloudinary_status()
    total_assets = db.query(MediaAsset).count()
    total_folders = db.query(MediaFolder).count()

    last_success_log = (
        db.query(ActivityLog)
        .filter(ActivityLog.action == "MEDIA_SYNCED")
        .order_by(ActivityLog.created_at.desc())
        .first()
    )
    last_partial_log = (
        db.query(ActivityLog)
        .filter(ActivityLog.action == "MEDIA_SYNC_PARTIAL")
        .order_by(ActivityLog.created_at.desc())
        .first()
    )

    last_sync_time = last_success_log.created_at if last_success_log else None
    last_failed_time = last_partial_log.created_at if last_partial_log else None

    sync_status = "idle"
    if last_success_log and (not last_partial_log or last_success_log.created_at >= last_partial_log.created_at):
        sync_status = "synced"
    elif last_partial_log:
        sync_status = "partial_failure"

    return CloudinaryStatusResponse(
        configured=status_info["configured"],
        cloud_name=status_info.get("cloud_name"),
        total_assets=total_assets,
        total_folders=total_folders,
        folder_mode=status_info.get("folder_mode", "dynamic"),
        last_sync=last_sync_time,
        last_sync_status=sync_status,
        last_failed_sync=last_failed_time,
    )


@router.patch("/media/{id}", response_model=MediaAssetResponse)
def admin_update_media_asset(
    id: int,
    payload: MediaAssetUpdate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Update asset display name, alt text, or folder path."""
    asset = db.query(MediaAsset).filter(MediaAsset.id == id).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media asset not found.")

    if payload.display_name is not None:
        asset.display_name = payload.display_name.strip()
        if asset.public_id:
            update_cloudinary_asset_metadata(asset.public_id, display_name=asset.display_name, resource_type=asset.resource_type)

    if payload.alt_text is not None:
        asset.alt_text = payload.alt_text.strip()

    if payload.folder is not None:
        target_folder = payload.folder.strip().strip("/") if payload.folder else None
        current_folder = (asset.folder or "").strip().strip("/")
        if target_folder != (current_folder or None):
            if is_cloudinary_configured():
                mode = detect_cloudinary_folder_mode()
                if mode != "dynamic":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cloudinary is in {mode} folder mode. Moving assets without changing public IDs is not supported.",
                    )
                if asset.public_id:
                    move_res = move_cloudinary_asset_folder(
                        asset.public_id,
                        target_folder or "",
                        getattr(asset, "resource_type", "image") or "image",
                    )
                    if not move_res.get("success"):
                        raise HTTPException(
                            status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Failed to move asset folder in Cloudinary: {move_res.get('error')}",
                        )
            if target_folder:
                known_paths = {row[0] for row in db.query(MediaFolder.path).all()}
                ensure_ancestor_folders(db, target_folder, known_paths)
            asset.folder = target_folder

    db.commit()
    db.refresh(asset)

    used_products, used_editorial = _check_asset_references(asset, db)
    is_test, reason = _is_test_record(asset)

    return MediaAssetResponse(
        id=asset.id,
        filename=asset.filename,
        display_name=getattr(asset, "display_name", None) or asset.filename,
        public_id=asset.public_id,
        cloudinary_asset_id=getattr(asset, "cloudinary_asset_id", None),
        cloud_name=getattr(asset, "cloud_name", None),
        delivery_type=getattr(asset, "delivery_type", "upload") or "upload",
        content_hash=getattr(asset, "content_hash", None),
        relative_source_path=getattr(asset, "relative_source_path", None),
        url=asset.url,
        secure_url=asset.secure_url or asset.url,
        resource_type=getattr(asset, "resource_type", "image") or "image",
        format=asset.format,
        width=asset.width,
        height=asset.height,
        duration=float(asset.duration) if asset.duration is not None else None,
        file_size=asset.file_size or 0,
        mime_type=asset.mime_type or "image/jpeg",
        alt_text=asset.alt_text,
        folder=asset.folder,
        created_at=asset.created_at,
        used_in_products=used_products,
        used_editorial=used_editorial,
        is_test_record=is_test,
        test_reason=reason,
    )


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

    if not media_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No media IDs provided.")

    assets = db.query(MediaAsset).filter(MediaAsset.id.in_(media_ids)).all()
    found_ids = {a.id for a in assets}
    missing_ids = [mid for mid in media_ids if mid not in found_ids]
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Media assets not found for IDs: {missing_ids}",
        )

    existing_asset_ids = {
        img.media_asset_id for img in product.images if getattr(img, "media_asset_id", None) is not None
    }
    existing_keys = {
        (img.resource_type or "image", img.url.split("?")[0] if img.url else img.public_id)
        for img in product.images
    }
    existing_legacy_pub_keys = {
        (img.resource_type or "image", img.public_id)
        for img in product.images
        if getattr(img, "media_asset_id", None) is None and img.public_id
    }

    max_order = max([img.sort_order for img in product.images], default=-1)
    asset_by_id = {a.id: a for a in assets}
    added_count = 0

    for mid in media_ids:
        asset = asset_by_id[mid]
        if asset.id in existing_asset_ids:
            continue
        r_type = getattr(asset, "resource_type", "image") or "image"
        pub_id = asset.public_id
        url = asset.secure_url or asset.url
        norm_url = url.split("?")[0] if url else ""
        if (r_type, norm_url) in existing_keys:
            continue
        if (r_type, pub_id) in existing_legacy_pub_keys:
            continue
        existing_asset_ids.add(asset.id)
        existing_keys.add((r_type, norm_url))
        max_order += 1
        new_img = ProductImage(
            product_id=product.id,
            url=url,
            sort_order=max_order,
            alt_text=asset.alt_text or getattr(asset, "display_name", None) or product.name,
            resource_type=r_type,
            public_id=pub_id,
            width=asset.width,
            height=asset.height,
            duration=asset.duration,
            media_asset_id=asset.id,
        )
        product.images.append(new_img)
        added_count += 1

    db.commit()
    db.refresh(product)
    log_activity(db, current_admin, "PRODUCT_UPDATED", "product", product.id, f"Attached {added_count} media assets")
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


def _process_product_images(
    images_payload: List[ProductImageCreate],
    db: Session,
    product_name: str,
) -> List[ProductImage]:
    """Validate media assets, derive authoritative registry metadata, deduplicate, and build ProductImage models."""
    processed_images: List[ProductImage] = []
    seen_keys = set()

    for idx, img in enumerate(images_payload):
        trusted_url = img.url
        trusted_public_id = getattr(img, "public_id", None)
        trusted_width = getattr(img, "width", None)
        trusted_height = getattr(img, "height", None)
        trusted_duration = getattr(img, "duration", None)
        trusted_alt = img.alt_text or product_name
        asset_id = getattr(img, "media_asset_id", None)

        # 1. Determine resource_type from payload or infer from url
        r_type = getattr(img, "resource_type", None) or "image"
        if r_type == "image" and trusted_url and any(trusted_url.lower().endswith(ext) for ext in (".mp4", ".webm", ".mov", ".ogg", ".mkv")):
            r_type = "video"
        trusted_resource_type = r_type

        # 2. If media_asset_id is supplied, resolve its URL and metadata from backend MediaAsset registry
        if asset_id is not None:
            asset = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
            if not asset:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Media asset with ID {asset_id} not found.",
                )
            # Authority: MediaAsset registry is source of truth
            trusted_url = asset.secure_url or asset.url
            trusted_public_id = asset.public_id
            trusted_resource_type = getattr(asset, "resource_type", r_type) or r_type
            trusted_width = asset.width
            trusted_height = asset.height
            trusted_duration = asset.duration
            trusted_alt = img.alt_text or asset.alt_text or getattr(asset, "display_name", None) or product_name
        elif trusted_public_id:
            # 3. For legacy entries without an ID, match using public_id AND resource_type. NEVER use public_id alone.
            matching_assets = (
                db.query(MediaAsset)
                .filter(
                    MediaAsset.public_id == trusted_public_id,
                    MediaAsset.resource_type == trusted_resource_type,
                )
                .all()
            )
            if len(matching_assets) == 1:
                # Exactly one record matches -> link it
                asset = matching_assets[0]
                trusted_url = asset.secure_url or asset.url
                trusted_resource_type = getattr(asset, "resource_type", trusted_resource_type) or trusted_resource_type
                trusted_width = asset.width if trusted_width is None else trusted_width
                trusted_height = asset.height if trusted_height is None else trusted_height
                trusted_duration = asset.duration if trusted_duration is None else trusted_duration
                trusted_alt = img.alt_text or asset.alt_text or getattr(asset, "display_name", None) or product_name
                asset_id = asset.id
            elif len(matching_assets) > 1:
                # Multiple records match: do NOT arbitrarily choose the first!
                # A unique exact URL match may resolve the ambiguity.
                url_clean = trusted_url.strip() if trusted_url else ""
                url_norm = url_clean.split("?")[0] if url_clean else ""
                url_matches = []
                seen_duo_ids = set()
                for a in matching_assets:
                    if a.id in seen_duo_ids:
                        continue
                    a_url = a.url.strip() if a.url else ""
                    a_sec = a.secure_url.strip() if a.secure_url else ""
                    a_url_norm = a_url.split("?")[0] if a_url else ""
                    a_sec_norm = a_sec.split("?")[0] if a_sec else ""

                    is_match = False
                    if url_clean and (a_url == url_clean or a_sec == url_clean):
                        is_match = True
                    elif url_norm and (a_url_norm == url_norm or a_sec_norm == url_norm):
                        is_match = True

                    if is_match:
                        seen_duo_ids.add(a.id)
                        url_matches.append(a)

                if len(url_matches) == 1:
                    asset = url_matches[0]
                    trusted_url = asset.secure_url or asset.url
                    trusted_resource_type = getattr(asset, "resource_type", trusted_resource_type) or trusted_resource_type
                    trusted_width = asset.width if trusted_width is None else trusted_width
                    trusted_height = asset.height if trusted_height is None else trusted_height
                    trusted_duration = asset.duration if trusted_duration is None else trusted_duration
                    trusted_alt = img.alt_text or asset.alt_text or getattr(asset, "display_name", None) or product_name
                    asset_id = asset.id
                else:
                    # Otherwise preserve the existing legacy URL, metadata, ordering, and null reference.
                    asset_id = None
            else:
                # No matches in registry: preserve legacy values with null reference
                asset_id = None
        elif trusted_url:
            # Legacy entry without public_id or media_asset_id: attempt unambiguous full URL match
            url_clean = trusted_url.strip() if trusted_url else ""
            url_norm = url_clean.split("?")[0] if url_clean else ""

            candidate_filters = [
                MediaAsset.url == url_clean,
                MediaAsset.secure_url == url_clean,
            ]
            if url_norm:
                candidate_filters.extend([
                    MediaAsset.url == url_norm,
                    MediaAsset.secure_url == url_norm,
                    MediaAsset.url.like(f"{url_norm}?%"),
                    MediaAsset.secure_url.like(f"{url_norm}?%"),
                ])

            candidates = (
                db.query(MediaAsset)
                .filter(
                    MediaAsset.resource_type == trusted_resource_type,
                    or_(*candidate_filters),
                )
                .all()
            )

            matched_assets = []
            seen_match_ids = set()
            for a in candidates:
                if a.id in seen_match_ids:
                    continue
                a_url = a.url.strip() if a.url else ""
                a_sec = a.secure_url.strip() if a.secure_url else ""
                a_url_norm = a_url.split("?")[0] if a_url else ""
                a_sec_norm = a_sec.split("?")[0] if a_sec else ""

                # Full exact URL equality or full normalized URL equality (entire string, NO prefix startswith)
                is_match = False
                if url_clean and (a_url == url_clean or a_sec == url_clean):
                    is_match = True
                elif url_norm and (a_url_norm == url_norm or a_sec_norm == url_norm):
                    is_match = True

                if is_match:
                    seen_match_ids.add(a.id)
                    matched_assets.append(a)

            if len(matched_assets) == 1:
                asset = matched_assets[0]
                trusted_url = asset.secure_url or asset.url
                trusted_public_id = asset.public_id
                trusted_resource_type = getattr(asset, "resource_type", trusted_resource_type) or trusted_resource_type
                trusted_width = asset.width if trusted_width is None else trusted_width
                trusted_height = asset.height if trusted_height is None else trusted_height
                trusted_duration = asset.duration if trusted_duration is None else trusted_duration
                trusted_alt = img.alt_text or asset.alt_text or getattr(asset, "display_name", None) or product_name
                asset_id = asset.id
            else:
                # Zero or multiple matches: preserve the original legacy URL, metadata, ordering, and null media_asset_id
                asset_id = None

        # Normalize resource type if file extension suggests video
        if trusted_resource_type == "image" and trusted_url and any(trusted_url.lower().endswith(ext) for ext in (".mp4", ".webm", ".mov", ".ogg", ".mkv")):
            trusted_resource_type = "video"

        # 4. Deduplicate repeated references to the same asset without collapsing different resource types
        norm_url = trusted_url.split("?")[0] if trusted_url else ""
        if asset_id is not None:
            dedup_key = (trusted_resource_type, f"asset:{asset_id}")
        else:
            dedup_key = (trusted_resource_type, norm_url if norm_url else trusted_public_id)
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)

        p_img = ProductImage(
            url=trusted_url,
            sort_order=img.sort_order if img.sort_order is not None else idx,
            alt_text=trusted_alt,
            resource_type=trusted_resource_type,
            public_id=trusted_public_id,
            width=trusted_width,
            height=trusted_height,
            duration=trusted_duration,
            media_asset_id=asset_id,
        )
        processed_images.append(p_img)

    return processed_images


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
        source_folder=getattr(payload, "source_folder", None),
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
        product.images = _process_product_images(payload.images, db, product.name)

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
        # Automatically keep canonical main-group collection consistent with category
        cat_upper = payload.category.upper().strip()
        canonical_col = db.query(Collection).filter(Collection.name == cat_upper).first()
        if canonical_col and canonical_col not in product.collections:
            # Replace any other canonical main collection with the new one
            canonical_names = {"TWO PIECES", "SUIT SET", "HEAVY DRESS"}
            product.collections = [c for c in product.collections if c.name not in canonical_names] + [canonical_col]
    if payload.subcategory is not None:
        product.subcategory = payload.subcategory
    if payload.source_folder is not None:
        product.source_folder = payload.source_folder
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
        product.images = _process_product_images(payload.images, db, product.name)

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
        category_two_pieces_image=setting.category_two_pieces_image,
        category_suit_set_image=setting.category_suit_set_image,
        category_heavy_dress_image=setting.category_heavy_dress_image,
        festive_banner_image=setting.festive_banner_image,
        poster_occasion_image=setting.poster_occasion_image,
        poster_everyday_image=setting.poster_everyday_image,
        poster_story_image=setting.poster_story_image,
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
    if payload.category_two_pieces_image is not None:
        setting.category_two_pieces_image = payload.category_two_pieces_image.strip() or None
    if payload.category_suit_set_image is not None:
        setting.category_suit_set_image = payload.category_suit_set_image.strip() or None
    if payload.category_heavy_dress_image is not None:
        setting.category_heavy_dress_image = payload.category_heavy_dress_image.strip() or None
    if payload.festive_banner_image is not None:
        setting.festive_banner_image = payload.festive_banner_image.strip() or None
    if payload.poster_occasion_image is not None:
        setting.poster_occasion_image = payload.poster_occasion_image.strip() or None
    if payload.poster_everyday_image is not None:
        setting.poster_everyday_image = payload.poster_everyday_image.strip() or None
    if payload.poster_story_image is not None:
        setting.poster_story_image = payload.poster_story_image.strip() or None
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
        category_two_pieces_image=setting.category_two_pieces_image,
        category_suit_set_image=setting.category_suit_set_image,
        category_heavy_dress_image=setting.category_heavy_dress_image,
        festive_banner_image=setting.festive_banner_image,
        poster_occasion_image=setting.poster_occasion_image,
        poster_everyday_image=setting.poster_everyday_image,
        poster_story_image=setting.poster_story_image,
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
