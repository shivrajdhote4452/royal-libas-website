from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Set, Tuple
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.services.cloudinary_service import get_video_poster_url
from app.models import Product
from app.schemas import (
    ProductListResponse,
    ProductDetailResponse,
    ProductVariantResponse,
    ProductImageResponse,
)

CANONICAL_TAXONOMY: Dict[str, List[str]] = {
    "TWO PIECES": ["Co-ord Sets", "Kurta Pant"],
    "SUIT SET": ["Three Pieces", "Semi-party Wear", "Party Wear"],
    "HEAVY DRESS": ["Lehenga", "Short Kurta", "Palazzo Set", "Designer Wear", "Sharara / Gharara"],
}

CATEGORY_TO_COLLECTION_SLUG: Dict[str, str] = {
    "TWO PIECES": "two-pieces",
    "SUIT SET": "suit-set",
    "HEAVY DRESS": "heavy-dress",
}

CANONICAL_COLLECTION_SLUGS: Set[str] = set(CATEGORY_TO_COLLECTION_SLUG.values())
CANONICAL_COLLECTION_NAMES: Set[str] = set(CATEGORY_TO_COLLECTION_SLUG.keys())


def validate_category_and_subcategory(
    category: Optional[str], subcategory: Optional[str]
) -> Tuple[Optional[str], Optional[str]]:
    """Validate and normalize category and subcategory against canonical taxonomy.
    Raises HTTPException(400) if an invalid category/subcategory combination is supplied.
    """
    if not category:
        return category, subcategory

    clean_cat = category.strip().upper()
    if clean_cat not in CANONICAL_TAXONOMY:
        valid_cats = ", ".join(CANONICAL_TAXONOMY.keys())
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category '{category}'. Valid categories are: {valid_cats}",
        )

    clean_sub = None
    if subcategory is not None and subcategory.strip():
        sub_raw = subcategory.strip()
        valid_subs = CANONICAL_TAXONOMY[clean_cat]
        matched = next((s for s in valid_subs if s.lower() == sub_raw.lower()), None)
        if not matched:
            valid_subs_str = ", ".join(valid_subs)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid subcategory '{subcategory}' for category '{clean_cat}'. Valid subcategories are: {valid_subs_str}",
            )
        clean_sub = matched

    return clean_cat, clean_sub


def sync_product_category_and_collections(
    product: Product,
    category: Optional[str],
    subcategory: Optional[str],
    explicit_collection_ids: Optional[List[int]],
    db: Session,
) -> None:
    """Synchronize category, subcategory, and ensure correct canonical collection membership.

    Guarantees:
    - Normalizes category & subcategory according to canonical taxonomy.
    - Resolves explicit_collection_ids while ensuring canonical collection membership cannot be undone.
    - Replaces any previous canonical main-group membership when category changes.
    - Preserves unrelated editorial/marketing collection memberships.
    """
    clean_cat, clean_sub = validate_category_and_subcategory(category, subcategory)

    if clean_cat is not None:
        product.category = clean_cat
    if subcategory is not None:
        product.subcategory = clean_sub

    # Determine base collections
    from app.models import Collection

    if explicit_collection_ids is not None:
        base_cols = db.query(Collection).filter(Collection.id.in_(explicit_collection_ids)).all()
    else:
        base_cols = list(product.collections)

    # Filter out existing canonical collection memberships
    editorial_cols = [
        c
        for c in base_cols
        if c.slug not in CANONICAL_COLLECTION_SLUGS
        and (c.name or "").upper() not in CANONICAL_COLLECTION_NAMES
    ]

    effective_cat = (product.category or "").strip().upper()
    if effective_cat in CATEGORY_TO_COLLECTION_SLUG:
        target_slug = CATEGORY_TO_COLLECTION_SLUG[effective_cat]
        canonical_col = db.query(Collection).filter(Collection.slug == target_slug).first()
        if not canonical_col:
            canonical_col = db.query(Collection).filter(Collection.name.ilike(effective_cat)).first()
        if canonical_col:
            product.collections = editorial_cols + [canonical_col]
        else:
            product.collections = editorial_cols
    else:
        product.collections = base_cols



def derive_badges(product: Product, total_stock: int) -> List[str]:
    """Derive product badges based on stock level, bestseller flag, and recency.
    
    Badges:
    - 'Sold Out': total stock across all variants is 0.
    - 'Low Stock': total stock is between 1 and 5 inclusive.
    - 'Bestseller': product.is_bestseller flag is True.
    - 'New': product was added within the last 14 days.
    """
    badges: List[str] = []

    if total_stock == 0:
        badges.append("Sold Out")
    elif total_stock <= 5:
        badges.append("Low Stock")

    if product.is_bestseller:
        badges.append("Bestseller")

    # Check recency (within 14 days)
    if product.created_at:
        now = datetime.now(timezone.utc)
        created = product.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if (now - created) <= timedelta(days=14):
            badges.append("New")

    return badges


def build_variant_response(variant) -> ProductVariantResponse:
    """Transform ProductVariant model into ProductVariantResponse with is_available."""
    return ProductVariantResponse(
        id=variant.id,
        product_id=variant.product_id,
        size=variant.size,
        colour=variant.colour,
        sku=variant.sku,
        mrp=variant.mrp,
        selling_price=variant.selling_price,
        stock=variant.stock,
        is_available=(variant.stock > 0),
    )


def build_product_list_response(product: Product) -> ProductListResponse:
    """Build list response item with derived prices, badges, and primary image."""
    variants = [build_variant_response(v) for v in product.variants]
    total_stock = sum(v.stock for v in variants)
    prices = [v.selling_price for v in variants]
    min_price = min(prices) if prices else None
    max_price = max(prices) if prices else None

    # Get primary image (prefers first image, or video poster if only videos exist)
    primary_img_url: Optional[str] = None
    if product.images:
        sorted_images = sorted(product.images, key=lambda img: img.sort_order)
        # Find first image
        first_img = next((img for img in sorted_images if getattr(img, "resource_type", "image") == "image"), None)
        if first_img:
            primary_img_url = first_img.url
        else:
            # Fall back to video poster
            primary_img_url = get_video_poster_url(sorted_images[0].url)

    collection_names = [c.name for c in product.collections]
    images_list = [
        ProductImageResponse(
            id=img.id,
            url=img.url,
            sort_order=img.sort_order,
            alt_text=img.alt_text,
            resource_type=getattr(img, "resource_type", "image") or "image",
            public_id=getattr(img, "public_id", None),
            width=getattr(img, "width", None),
            height=getattr(img, "height", None),
            duration=float(img.duration) if getattr(img, "duration", None) is not None else None,
            media_asset_id=getattr(img, "media_asset_id", None),
        )
        for img in (sorted(product.images, key=lambda i: i.sort_order) if product.images else [])
    ]

    return ProductListResponse(
        id=product.id,
        name=product.name,
        slug=product.slug,
        description=product.description,
        fabric=product.fabric,
        category=product.category,
        subcategory=getattr(product, 'subcategory', None),
        source_folder=getattr(product, 'source_folder', None),
        status=getattr(product, 'status', 'PUBLISHED') or ('PUBLISHED' if product.is_active else 'DRAFT'),
        is_bestseller=product.is_bestseller,
        is_active=product.is_active,
        min_price=min_price,
        max_price=max_price,
        total_stock=total_stock,
        badges=derive_badges(product, total_stock),
        primary_image=primary_img_url,
        images=images_list,
        collections=collection_names,
        variants=variants,
    )


def build_product_detail_response(product: Product) -> ProductDetailResponse:
    """Build full product detail response with ordered images, variants, and badges."""
    variants = [build_variant_response(v) for v in product.variants]
    total_stock = sum(v.stock for v in variants)

    sorted_images = sorted(product.images, key=lambda img: img.sort_order)
    images = [
        ProductImageResponse(
            id=img.id,
            url=img.url,
            sort_order=img.sort_order,
            alt_text=img.alt_text,
            resource_type=getattr(img, "resource_type", "image") or "image",
            public_id=getattr(img, "public_id", None),
            width=getattr(img, "width", None),
            height=getattr(img, "height", None),
            duration=float(img.duration) if getattr(img, "duration", None) is not None else None,
            media_asset_id=getattr(img, "media_asset_id", None),
        )
        for img in sorted_images
    ]

    collection_names = [c.name for c in product.collections]

    return ProductDetailResponse(
        id=product.id,
        name=product.name,
        slug=product.slug,
        description=product.description,
        fabric=product.fabric,
        care=product.care,
        size_chart=product.size_chart,
        category=product.category,
        subcategory=getattr(product, 'subcategory', None),
        source_folder=getattr(product, 'source_folder', None),
        status=getattr(product, 'status', 'PUBLISHED') or ('PUBLISHED' if product.is_active else 'DRAFT'),
        fit=getattr(product, 'fit', None),
        size_chart_id=getattr(product, 'size_chart_id', None),
        is_bestseller=product.is_bestseller,
        is_active=product.is_active,
        total_stock=total_stock,
        badges=derive_badges(product, total_stock),
        images=images,
        variants=variants,
        collections=collection_names,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )
