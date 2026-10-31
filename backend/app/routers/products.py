from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from app.auth import get_current_admin, get_current_admin_optional, require_roles
from app.database import get_db
from app.models import Admin, Product, ProductVariant, ProductImage, Collection, StockAdjustment
from app.schemas import (
    ProductCreate,
    ProductUpdate,
    ProductListResponse,
    ProductDetailResponse,
    ProductVariantCreate,
    ProductVariantUpdate,
    ProductVariantResponse,
)
from app.services.product_service import (
    build_product_list_response,
    build_product_detail_response,
    build_variant_response,
)

router = APIRouter(tags=["products"])


# ==========================================
# Public Endpoints
# ==========================================

@router.get("/products", response_model=List[ProductListResponse])
def list_products(
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

    # In-memory filter for size if specified (ensure variant with that size has stock > 0)
    if size:
        filtered = []
        for p in products:
            matching = [v for v in p.variants if v.size.upper() == size.upper() and v.stock > 0]
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
    db: Session = Depends(get_db),
    admin: Optional[Admin] = Depends(get_current_admin_optional),
):
    """Retrieve complete product details, ordered images, live variant stock, and fabric info by slug or ID."""
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
# Admin Endpoints (Requires Admin Token)
# ==========================================

@router.post("/admin/products", response_model=ProductDetailResponse, status_code=status.HTTP_201_CREATED)
def admin_create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Create a new product with optional initial variants and images. Admin auth required."""
    existing = db.query(Product).filter(Product.slug == payload.slug).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A product with slug '{payload.slug}' already exists",
        )

    status_val = (payload.status or "DRAFT").upper().strip()
    is_active_val = payload.is_active if payload.is_active is not None else (status_val == "PUBLISHED")
    if status_val != "PUBLISHED":
        is_active_val = False

    product = Product(
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        fabric=payload.fabric,
        care=payload.care,
        fit=getattr(payload, "fit", None),
        size_chart=payload.size_chart,
        size_chart_id=getattr(payload, "size_chart_id", None),
        category=payload.category,
        subcategory=payload.subcategory,
        status=status_val,
        is_bestseller=payload.is_bestseller,
        is_active=is_active_val,
    )

    # Attach collections
    if payload.collection_ids:
        collections = (
            db.query(Collection)
            .filter(Collection.id.in_(payload.collection_ids))
            .all()
        )
        product.collections = collections

    # Attach variants
    if payload.variants:
        for v in payload.variants:
            variant = ProductVariant(
                size=v.size,
                colour=v.colour,
                sku=v.sku,
                mrp=v.mrp,
                selling_price=v.selling_price,
                stock=v.stock,
            )
            product.variants.append(variant)

    # Attach images
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

    return build_product_detail_response(product)


@router.patch("/admin/products/{id}", response_model=ProductDetailResponse)
def admin_update_product(
    id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Update product fields, active status, or collection associations."""
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {id} not found",
        )

    # Check slug uniqueness if changing
    if payload.slug and payload.slug != product.slug:
        existing = db.query(Product).filter(Product.slug == payload.slug).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A product with slug '{payload.slug}' already exists",
            )
        product.slug = payload.slug

    if payload.name is not None:
        product.name = payload.name
    if payload.description is not None:
        product.description = payload.description
    if payload.fabric is not None:
        product.fabric = payload.fabric
    if payload.care is not None:
        product.care = payload.care
    if payload.size_chart is not None:
        product.size_chart = payload.size_chart
    if payload.category is not None:
        product.category = payload.category
    if payload.subcategory is not None:
        product.subcategory = payload.subcategory
    if payload.fit is not None:
        product.fit = payload.fit
    if payload.size_chart_id is not None:
        product.size_chart_id = payload.size_chart_id
    if payload.is_bestseller is not None:
        product.is_bestseller = payload.is_bestseller

    if payload.status is not None:
        clean_status = payload.status.upper().strip()
        product.status = clean_status
        product.is_active = (clean_status == "PUBLISHED")
    elif payload.is_active is not None:
        product.is_active = payload.is_active
        product.status = "PUBLISHED" if payload.is_active else "DRAFT"

    if payload.collection_ids is not None:
        collections = (
            db.query(Collection)
            .filter(Collection.id.in_(payload.collection_ids))
            .all()
        )
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

    return build_product_detail_response(product)


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

    # Check unique constraint on product + size + colour
    existing_variant = (
        db.query(ProductVariant)
        .filter(
            ProductVariant.product_id == id,
            ProductVariant.size == payload.size,
            ProductVariant.colour == payload.colour,
        )
        .first()
    )
    if existing_variant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Variant for size '{payload.size}' and colour '{payload.colour}' already exists on this product",
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
        size=payload.size,
        colour=payload.colour,
        sku=payload.sku,
        mrp=payload.mrp,
        selling_price=payload.selling_price,
        stock=payload.stock,
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
            actor_admin_id=current_admin.id,
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
    variant = db.query(ProductVariant).filter(ProductVariant.id == id).first()
    if not variant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Variant with id {id} not found",
        )

    fields_set = payload.model_fields_set

    # Validate final effective pricing combination
    effective_price = payload.selling_price if payload.selling_price is not None else variant.selling_price
    effective_mrp = payload.mrp if "mrp" in fields_set else variant.mrp

    if effective_price <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selling price must be greater than 0.",
        )

    if effective_mrp is not None:
        if effective_mrp <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MRP must be greater than 0 when supplied.",
            )
        if effective_price > effective_mrp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Selling price (₹{effective_price}) cannot exceed MRP (₹{effective_mrp}).",
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
            actor_admin_id=current_admin.id,
            actor_email=current_admin.email,
        )
        db.add(adj)
        variant.stock = new_stock

    if payload.sku is not None:
        variant.sku = payload.sku
    if payload.colour is not None:
        variant.colour = payload.colour
    if payload.size is not None:
        variant.size = payload.size

    db.commit()
    db.refresh(variant)

    return build_variant_response(variant)
