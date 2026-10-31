"""Shared Media Usage Checking Service
Single source of truth for identifying all product and editorial references
to media assets across Royal Libas by Tanya.
"""
import re
from typing import List, Tuple, Dict, Any, Optional
from urllib.parse import urlparse
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models import MediaAsset, Product, ProductImage, StoreSetting


def extract_cloudinary_public_id(url: Optional[str]) -> str:
    """Safely extract Cloudinary public_id from delivery URLs, stripping transformations and versions."""
    if not url:
        return ""
    url = url.strip().split("?")[0].split("#")[0]
    m = re.search(r"/(?:upload|authenticated|private)/", url)
    if not m:
        return url.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    
    after_upload = url[m.end():]
    parts = after_upload.split("/")
    idx = 0
    while idx < len(parts):
        part = parts[idx]
        if re.match(r"^v\d+$", part):
            idx += 1
            break
        elif "," in part or re.match(r"^[a-z]_[a-zA-Z0-9_]+", part):
            idx += 1
        else:
            break
            
    pub_with_ext = "/".join(parts[idx:])
    return re.sub(r"\.[a-zA-Z0-9]+$", "", pub_with_ext).strip()


def normalize_media_url(url: Optional[str]) -> str:
    """Normalize a media URL for safe, exact comparisons."""
    if not url:
        return ""
    clean = url.strip()
    clean = re.sub(r"^https?://", "", clean)
    clean = clean.split("?")[0].split("#")[0]
    clean = re.sub(r"/upload/(?:[a-zA-Z0-9_,:]+/)+(v\d+/)", r"/upload/\1", clean)
    return clean.rstrip("/").lower()


def match_asset_to_url(target_url: Optional[str], asset: MediaAsset) -> bool:
    """Safely match a target URL against an asset using exact normalized URLs or extracted public IDs.
    
    Prevents false substring matches (e.g. 'cat' matching 'samples/cat.jpg').
    """
    if not target_url or not asset:
        return False

    norm_target = normalize_media_url(target_url)
    norm_asset_url = normalize_media_url(asset.url)
    norm_secure_url = normalize_media_url(asset.secure_url)

    # 1. Exact normalized URL match
    if norm_target and (norm_target == norm_asset_url or (norm_secure_url and norm_target == norm_secure_url)):
        return True

    # 2. Match by exact Cloudinary public_id extraction
    if asset.public_id:
        extracted_pub = extract_cloudinary_public_id(target_url)
        clean_asset_pub = asset.public_id.strip().strip("/")
        if extracted_pub and extracted_pub.lower() == clean_asset_pub.lower():
            return True

    return False


def get_asset_usage_references(asset: MediaAsset, db: Session) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Inspect all product galleries, covers, and store settings for asset usage.

    Returns:
        (product_usages, editorial_usages)
        where product_usages is a list of {"id": int, "name": str, "slug": str}
        and editorial_usages is a list of location descriptions (e.g. 'Homepage Hero Banner')
    """
    # 1. Check ProductImage references (exact URL or public_id)
    prod_filters = [ProductImage.url == asset.url]
    if asset.secure_url:
        prod_filters.append(ProductImage.url == asset.secure_url)
    if asset.public_id:
        prod_filters.append(ProductImage.public_id == asset.public_id)

    matches = (
        db.query(Product.id, Product.name, Product.slug)
        .join(ProductImage, ProductImage.product_id == Product.id)
        .filter(or_(*prod_filters))
        .distinct()
        .all()
    )
    product_usages = [{"id": m.id, "name": m.name, "slug": m.slug} for m in matches]

    # 2. Check StoreSetting references across all 8 editorial & poster fields
    editorial_usages = []
    setting = db.query(StoreSetting).first()
    if setting:
        editorial_fields = [
            ("hero_image_url", "Homepage Hero Banner"),
            ("category_two_pieces_image", "Category Card: Two Pieces"),
            ("category_suit_set_image", "Category Card: Suit Set"),
            ("category_heavy_dress_image", "Category Card: Heavy Dress"),
            ("festive_banner_image", "Festive Announcement Banner"),
            ("poster_occasion_image", "Editorial Poster: Occasion Wear"),
            ("poster_everyday_image", "Editorial Poster: Everyday Luxury"),
            ("poster_story_image", "Editorial Poster: Tanya's Heritage Story"),
        ]
        for field_name, label in editorial_fields:
            val = getattr(setting, field_name, None)
            if val and match_asset_to_url(val, asset):
                editorial_usages.append(label)

    return product_usages, editorial_usages
