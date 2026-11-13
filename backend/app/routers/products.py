from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func

from app.auth import get_current_admin_optional, require_roles
from app.database import get_db
from app.models import Admin, Product, ProductVariant, ProductImage, Collection, StockAdjustment
from app.schemas import (
    ProductListResponse,
    ProductDetailResponse,
    ProductVariantCreate,
    ProductVariantUpdate,
    ProductVariantResponse,
    BulkVariantUpdateRequest,
    BulkVariantUpdateResponse,
)
from app.services.product_service import (
    build_product_list_response,
    build_product_detail_response,
    build_variant_response,
    sync_product_category_and_collections,
    normalize_variant_size,
)

router = APIRouter(tags=["products"])


# ==========================================
# Public Endpoints
# ==========================================

@router.get("/products", response_model=List[ProductListResponse])
def list_products(
    response: Response,
    category: Optional[str] = Query(None, description="Filter by category"),
    subcategory: Optional[str] = Query(None, description="Filter by subcategory"),
    collection: Optional[str] = Query(None, description="Filter by collection slug or name"),
    size: Optional[str] = Query(None, description="Filter by available variant size"),
    sort: Optional[str] = Query("newest", description="Sort order: newest, price_asc, price_desc"),
    include_inactive: bool = Query(False, description="Include inactive products (admin only)"),
    db: Session = Depends(get_db),
    admin: Optional[Admin] = Depends(get_current_admin_optional),
):
    """List products with filters (category, subcategory, collection, size) and sorting (newest, price_asc, price_desc).
    
    SECURITY RULE:
    Unauthenticated customers can NEVER see draft, inactive, or archived products, even if they pass include_inactive=True.
    Only an authenticated, active admin with a valid Bearer token who explicitly passes include_inactive=True may see them.
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    query = (
        db.query(Product)
        .options(
            joinedload(Product.variants),
            joinedload(Product.images),
            joinedload(Product.collections),
        )
    )

    is_admin = admin is not None and admin.is_active
    if not (is_admin and include_inactive):
        query = query.filter(Product.is_active == True, Product.status == "PUBLISHED")

    if category:
        clean_cat = category.strip()
        query = query.filter(Product.category.ilike(clean_cat))

    if subcategory:
        clean_sub = subcategory.strip()
        query = query.filter(Product.subcategory.ilike(clean_sub))

    if collection:
        clean_col = collection.strip().lower()
        if clean_col in ("festive-edit", "festive"):
            query = query.filter(
                or_(
                    Product.collections.any(or_(Collection.slug == collection, Collection.name.ilike(collection))),
                    Product.category.in_(["HEAVY DRESS", "SUIT SET"]),
                )
            )
        elif clean_col in ("everyday-cotton", "cotton"):
            query = query.filter(
                or_(
                    Product.collections.any(or_(Collection.slug == collection, Collection.name.ilike(collection))),
                    Product.category == "TWO PIECES",
                )
            )
        elif clean_col in ("bestsellers", "bestseller"):
            query = query.filter(
                or_(
                    Product.collections.any(or_(Collection.slug == collection, Collection.name.ilike(collection))),
                    Product.is_bestseller == True,
                )
            )
        else:
            query = query.filter(
                Product.collections.any(or_(Collection.slug == collection, Collection.name.ilike(collection)))
            )

    products = query.all()

    # In-memory filter for size if specified (ensure variant with that size is active and has stock > 0)
    if size:
        filtered = []
        for p in products:
            matching = [v for v in p.variants if v.size.upper() == size.upper() and getattr(v, "is_active", True) and v.stock > 0]
            if matching:
                filtered.append(p)
        products = filtered

    # Transform to response models with derived prices and badges
    responses = [build_product_list_response(p) for p in products]

    # Sorting
    if sort == "price_asc":
        # Sort by min_price ascending (None values last)
        responses.sort(key=lambda x: (x.min_price is None, x.min_price or Decimal(0)))
    elif sort == "price_desc":
        # Sort by min_price descending
        responses.sort(key=lambda x: (x.min_price is None, -(x.min_price or Decimal(0))))
    elif sort == "newest":
        responses.sort(key=lambda x: x.id, reverse=True)

    return responses


@router.get("/products/{slug}", response_model=ProductDetailResponse)
def get_product_by_slug(
    slug: str,
    response: Response,
    db: Session = Depends(get_db),
    admin: Optional[Admin] = Depends(get_current_admin_optional),
):
    """Retrieve complete product details, ordered images, live variant stock, and fabric info by slug or ID."""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    clean_slug = slug.strip()
    norm_slug = clean_slug.replace(" ", "-").lower()

    query = (
        db.query(Product)
        .options(
            joinedload(Product.variants),
            joinedload(Product.images),
            joinedload(Product.collections),
        )
    )

    product = (
        query.filter(
            (Product.slug == clean_slug)
            | (Product.slug == norm_slug)
            | (Product.name.ilike(clean_slug))
        ).first()
    )

    if not product and clean_slug.isdigit():
        product = query.filter(Product.id == int(clean_slug)).first()

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with slug '{slug}' not found",
        )

    # Protect draft, inactive, and archived products from public visibility
    is_admin = admin is not None and admin.is_active
    if (product.status != "PUBLISHED" or not product.is_active) and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with slug '{slug}' not found",
        )

    return build_product_detail_response(product)


# ==========================================
# Admin Endpoints (Product Variants Management)
# Note: Primary product CRUD (POST /admin/products, PATCH /admin/products/{id},
# and DELETE /admin/products/{id}) is authoritatively handled with activity logging
# and RBAC in app.routers.admin.
# ==========================================


@router.post(
    "/admin/products/{id}/variants",
    response_model=ProductVariantResponse,
    status_code=status.HTTP_201_CREATED,
)
def admin_add_variant(
    id: int,
    payload: ProductVariantCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Add a new variant (size, colour, prices, stock) to an existing product."""
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {id} not found",
        )

    # Validate price and MRP
    if payload.selling_price <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selling price must be greater than 0.",
        )
    if payload.mrp is not None:
        if payload.mrp <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MRP must be greater than 0 when supplied.",
            )
        if payload.selling_price > payload.mrp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Selling price (₹{payload.selling_price}) cannot exceed MRP (₹{payload.mrp}).",
            )

    clean_size = normalize_variant_size(payload.size)
    clean_colour = payload.colour.strip() if payload.colour else None

    # Check unique constraint on product + size + colour (normalizing legacy formats like FS, freesize, etc.)
    colour_filter = (
        ProductVariant.colour.is_(None)
        if clean_colour is None
        else func.lower(ProductVariant.colour) == clean_colour.lower()
    )
    existing_variants = (
        db.query(ProductVariant)
        .filter(
            ProductVariant.product_id == id,
            colour_filter,
        )
        .all()
    )
    for ev in existing_variants:
        if normalize_variant_size(ev.size).lower() == clean_size.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Variant for size '{clean_size}' already exists on this product",
            )

    # SKU uniqueness check if provided
    if payload.sku:
        sku_exists = db.query(ProductVariant).filter(ProductVariant.sku == payload.sku).first()
        if sku_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Variant with SKU '{payload.sku}' already exists",
            )

    variant = ProductVariant(
        product_id=id,
        size=clean_size,
        colour=clean_colour,
        sku=payload.sku,
        mrp=payload.mrp,
        selling_price=payload.selling_price,
        stock=payload.stock,
        is_active=payload.is_active if payload.is_active is not None else True,
    )
    db.add(variant)
    db.flush()

    if variant.stock > 0:
        adj = StockAdjustment(
            variant_id=variant.id,
            previous_stock=0,
            new_stock=variant.stock,
            change_amount=variant.stock,
            reason="INITIAL_SETUP",
            note="Initial stock on variant creation",
            actor_email=current_admin.email,
        )
        db.add(adj)

    db.commit()
    db.refresh(variant)

    return build_variant_response(variant)


@router.patch("/admin/variants/{id}", response_model=ProductVariantResponse)
def admin_update_variant(
    id: int,
    payload: ProductVariantUpdate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Update price, stock, or attributes for an existing variant with validation and audit trail."""
    variant = db.query(ProductVariant).with_for_update().filter(ProductVariant.id == id).first()
    if not variant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Variant with id {id} not found",
        )

    fields_set = payload.model_fields_set

    # Concurrency check: verify expected_stock matches live database stock
    if payload.expected_stock is not None and variant.stock != payload.expected_stock:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Stock conflict detected! Current stock for size '{variant.size}' is {variant.stock}, "
                f"but request expected {payload.expected_stock}. Live stock has been updated by an order "
                f"or another admin. Please reload before saving."
            ),
        )

    # Relative delta calculation with negative-stock prevention
    if payload.stock_delta is not None:
        target_stock = variant.stock + payload.stock_delta
        if target_stock < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stock cannot be negative (current: {variant.stock}, delta: {payload.stock_delta}).",
            )
        payload.stock = target_stock

    # Validate final effective pricing combination
    effective_price = payload.selling_price if payload.selling_price is not None else variant.selling_price

    if effective_price <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selling price must be greater than 0.",
        )

    # Only validate MRP constraints if MRP was explicitly supplied in the update payload.
    # Existing stored/hidden MRP values in DB must NOT block selling price increases.
    if "mrp" in fields_set and payload.mrp is not None:
        if payload.mrp <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MRP must be greater than 0 when supplied.",
            )
        if effective_price > payload.mrp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Selling price (₹{effective_price}) cannot exceed MRP (₹{payload.mrp}).",
            )

    if payload.selling_price is not None:
        variant.selling_price = payload.selling_price

    if "mrp" in fields_set:
        variant.mrp = payload.mrp

    if payload.stock is not None and payload.stock != variant.stock:
        if payload.stock < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Stock count cannot be negative.",
            )
        previous_stock = variant.stock
        new_stock = payload.stock
        delta = new_stock - previous_stock

        adj = StockAdjustment(
            variant_id=variant.id,
            previous_stock=previous_stock,
            new_stock=new_stock,
            change_amount=delta,
            reason="QUICK_EDIT",
            note="Quick stock adjustment from Products management",
            actor_email=current_admin.email,
        )
        db.add(adj)
        variant.stock = new_stock

    if "sku" in fields_set:
        clean_sku = payload.sku.strip() if payload.sku and payload.sku.strip() else None
        if clean_sku is not None and clean_sku != variant.sku:
            existing_sku = (
                db.query(ProductVariant)
                .filter(ProductVariant.sku == clean_sku, ProductVariant.id != variant.id)
                .first()
            )
            if existing_sku:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"SKU '{clean_sku}' is already assigned to another variant.",
                )
        variant.sku = clean_sku
    if payload.colour is not None:
        variant.colour = payload.colour
    if payload.size is not None:
        clean_size = normalize_variant_size(payload.size)
        if clean_size != variant.size:
            colour_filter = (
                ProductVariant.colour.is_(None)
                if variant.colour is None
                else func.lower(ProductVariant.colour) == variant.colour.lower()
            )
            existing_variants = (
                db.query(ProductVariant)
                .filter(
                    ProductVariant.product_id == variant.product_id,
                    ProductVariant.id != variant.id,
                    colour_filter,
                )
                .all()
            )
            for ev in existing_variants:
                if normalize_variant_size(ev.size).lower() == clean_size.lower():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Variant for size '{clean_size}' already exists on this product",
                    )
        variant.size = clean_size
    if payload.is_active is not None:
        variant.is_active = payload.is_active

    db.commit()
    db.refresh(variant)

    return build_variant_response(variant)


@router.patch("/admin/products/{id}/variants/bulk-update", response_model=BulkVariantUpdateResponse)
def admin_bulk_update_variants(
    id: int,
    payload: BulkVariantUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_roles("OWNER", "STORE_MANAGER")),
):
    """Atomically update prices, MRPs, and SKUs across multiple variants in a single transaction."""
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {id} not found.",
        )

    variants = (
        db.query(ProductVariant)
        .with_for_update()
        .filter(ProductVariant.product_id == id)
        .all()
    )
    v_map = {v.id: v for v in variants}

    # 1. Validation pass: verify all items belong to product and have valid pricing
    for item in payload.items:
        if item.variant_id not in v_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Variant ID {item.variant_id} does not belong to product '{product.name}'.",
            )
        target_v = v_map[item.variant_id]
        item_fields = item.model_fields_set
        effective_price = item.selling_price if ("selling_price" in item_fields and item.selling_price is not None) else target_v.selling_price

        if effective_price <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Size {target_v.size} selling price must be greater than 0.",
            )

        # Only validate MRP constraints if MRP was explicitly supplied in the update payload.
        # Existing stored/hidden MRP values in DB must NOT block selling price increases.
        if "mrp" in item_fields and item.mrp is not None:
            if item.mrp <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Size {target_v.size} MRP must be greater than 0.",
                )
            if effective_price > item.mrp:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Size {target_v.size} selling price (₹{effective_price}) cannot exceed MRP (₹{item.mrp}).",
                )

    # 2. Unique SKU pass: ensure proposed SKUs do not conflict internally or externally
    proposed_skus = {}
    for item in payload.items:
        item_fields = item.model_fields_set
        if "sku" in item_fields and item.sku is not None and item.sku.strip():
            clean = item.sku.strip()
            if clean in proposed_skus:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Duplicate SKU '{clean}' in update payload.",
                )
            proposed_skus[clean] = item.variant_id

    if proposed_skus:
        clashing = (
            db.query(ProductVariant)
            .filter(ProductVariant.sku.in_(list(proposed_skus.keys())))
            .all()
        )
        for c in clashing:
            if c.id != proposed_skus.get(c.sku):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"SKU '{c.sku}' is already assigned to another variant (ID {c.id}).",
                )

    # 3. Execution pass: apply all updates within this single transaction
    for item in payload.items:
        v = v_map[item.variant_id]
        item_fields = item.model_fields_set
        if "selling_price" in item_fields and item.selling_price is not None:
            v.selling_price = item.selling_price
        if "mrp" in item_fields:
            v.mrp = item.mrp
        if "sku" in item_fields:
            v.sku = item.sku.strip() if item.sku and item.sku.strip() else None
        if "is_active" in item_fields and item.is_active is not None:
            v.is_active = item.is_active

    db.commit()

    for v in variants:
        db.refresh(v)

    return BulkVariantUpdateResponse(
        product_id=product.id,
        updated_variants=[build_variant_response(v) for v in variants],
        message=f"Successfully updated {len(payload.items)} variant(s).",
    )
