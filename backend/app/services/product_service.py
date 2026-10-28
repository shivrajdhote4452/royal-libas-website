from datetime import datetime, timezone, timedelta
from typing import List, Optional
from app.models import Product
from app.schemas import (
    ProductListResponse,
    ProductDetailResponse,
    ProductVariantResponse,
    ProductImageResponse,
)


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

    # Get primary image (sort_order == 0 or first image)
    primary_img_url: Optional[str] = None
    if product.images:
        sorted_images = sorted(product.images, key=lambda img: img.sort_order)
        primary_img_url = sorted_images[0].url

    collection_names = [c.name for c in product.collections]
    images_list = [
        ProductImageResponse(
            id=img.id,
            url=img.url,
            sort_order=img.sort_order,
            alt_text=img.alt_text,
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
        fit=getattr(product, 'fit', None),
        size_chart_id=getattr(product, 'size_chart_id', None),
        status=getattr(product, 'status', 'PUBLISHED') or ('PUBLISHED' if product.is_active else 'DRAFT'),
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
