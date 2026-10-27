from datetime import datetime, date, time
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_admin, verify_password, create_access_token
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
)
from app.services.product_service import build_product_detail_response

router = APIRouter(prefix="/admin", tags=["admin"])


# ==========================================
# Admin Authentication
# ==========================================

@router.post("/login", response_model=TokenResponse)
def admin_login(payload: AdminLogin, db: Session = Depends(get_db)):
    """Authenticate admin and return JWT access token."""
    admin = db.query(Admin).filter(Admin.email == payload.email.lower().strip()).first()
    if not admin or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

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

    order.status = target_status
    if payload.courier_name is not None:
        order.courier_name = payload.courier_name.strip() or None
    if payload.tracking_url is not None:
        order.tracking_url = payload.tracking_url.strip() or None

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
