"""Reconcile Royal Libas catalogue with real design folders and Cloudinary Media Library.

Replaces the legacy sample catalogue with the 22 authentic dress designs discovered
in the MediaAsset registry under 'Photos for royal libas'.
Safely archives legacy sample products without breaking existing orders,
seeds the 3 canonical boutique collections, and applies temporary setup values.

Usage:
    python backend/reconcile_catalogue.py --dry-run
    python backend/reconcile_catalogue.py --confirm
"""

import argparse
import os
import re
import sys
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from sqlalchemy import create_engine, func, case
from sqlalchemy.orm import Session, sessionmaker

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.config import DATABASE_URL
from app.models import (
    Collection,
    MediaAsset,
    Product,
    ProductImage,
    ProductVariant,
    StockAdjustment,
    product_collections,
)

# Canonical Taxonomy Mapping
TOP_CATEGORY_MAP: Dict[str, str] = {
    "two pieces": "TWO PIECES",
    "two-pieces": "TWO PIECES",
    "two_pieces": "TWO PIECES",
    "suit set": "SUIT SET",
    "suit-set": "SUIT SET",
    "suit_set": "SUIT SET",
    "heavy dress": "HEAVY DRESS",
    "heavy-dress": "HEAVY DRESS",
    "heavy_dress": "HEAVY DRESS",
}

SUBCATEGORY_MAP: Dict[str, str] = {
    # Two Pieces
    "co-ord sets": "Co-ord Sets",
    "coord sets": "Co-ord Sets",
    "co ord sets": "Co-ord Sets",
    "kurta pant": "Kurta Pant",
    "kurta-pant": "Kurta Pant",
    # Suit Set
    "three pieces": "Three Pieces",
    "three-pieces": "Three Pieces",
    "semi-party wear": "Semi-party Wear",
    "semi party wear": "Semi-party Wear",
    "party wear": "Party Wear",
    # Heavy Dress
    "lehenga": "Lehenga",
    "short kurta": "Short Kurta",
    "palazzo set": "Palazzo Set",
    "designer wear": "Designer Wear",
    "sharara / gharara": "Sharara / Gharara",
    "sharara gharara": "Sharara / Gharara",
    "sharara-gharara": "Sharara / Gharara",
}

CATEGORY_TO_COLLECTION_SLUG: Dict[str, str] = {
    "TWO PIECES": "two-pieces",
    "SUIT SET": "suit-set",
    "HEAVY DRESS": "heavy-dress",
}

CANONICAL_COLLECTIONS: List[Tuple[str, str, str]] = [
    (
        "TWO PIECES",
        "two-pieces",
        "Chic two-piece silhouettes including curated co-ord sets and contemporary kurta pant ensembles.",
    ),
    (
        "SUIT SET",
        "suit-set",
        "Handcrafted festive three-piece ensembles, semi-party wear, and opulent party wear suit sets.",
    ),
    (
        "HEAVY DRESS",
        "heavy-dress",
        "Opulent statement occasionwear: artisanal lehengas, designer sets, palazzo ensembles, and shararas.",
    ),
]

LEGACY_COLLECTION_SLUGS = ["festive-edit", "everyday-cotton", "bestsellers"]

DEFAULT_SIZES = ["S", "M", "L", "XL", "XXL"]
DEFAULT_PRICE = Decimal("1999.00")
DEFAULT_MRP = Decimal("2499.00")
DEFAULT_STOCK = 5

CAT_CODE_MAP = {
    "TWO PIECES": "TP",
    "SUIT SET": "SS",
    "HEAVY DRESS": "HD",
}

SUBCAT_CODE_MAP = {
    "Co-ord Sets": "CS",
    "Kurta Pant": "KP",
    "Three Pieces": "3P",
    "Semi-party Wear": "SPW",
    "Party Wear": "PW",
    "Lehenga": "LH",
    "Short Kurta": "SK",
    "Palazzo Set": "PS",
    "Designer Wear": "DW",
    "Sharara / Gharara": "SG",
}


def clean_name_from_folder(folder_leaf: str) -> str:
    """Strip leading numbers, hyphens, and underscores to derive clean product name."""
    cleaned = re.sub(r"^\d+\s*[-_–—]?\s*", "", folder_leaf).strip()
    return cleaned


def slugify(text: str) -> str:
    """Generate URL-friendly slug."""
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s.strip("-")


def parse_folder_taxonomy(folder_path: str) -> Optional[Tuple[str, str, str]]:
    """Parse folder path like 'Photos for royal libas/Heavy Dress/Palazzo Set/01 - Sunehri Mustard Palazzo Set'.

    Returns (canonical_category, canonical_subcategory, design_folder_name) or None if not an individual design folder.
    """
    parts = [p.strip() for p in folder_path.replace("\\", "/").split("/") if p.strip()]

    # Must be under Photos for royal libas
    if not parts:
        return None

    # Handle optional leading 'Photos for royal libas'
    if parts[0].lower() == "photos for royal libas":
        parts = parts[1:]

    if len(parts) < 3:
        # Parent or subcategory folder, not a leaf design folder
        return None

    raw_cat = parts[0].lower()
    raw_subcat = parts[1].lower()
    leaf = parts[2]

    # Exclude Combination Photos and parent folders
    if "combination photo" in leaf.lower() or "combination photos" in raw_subcat:
        return None

    canonical_cat = TOP_CATEGORY_MAP.get(raw_cat)
    canonical_subcat = SUBCATEGORY_MAP.get(raw_subcat)

    if not canonical_cat or not canonical_subcat:
        return None

    return (canonical_cat, canonical_subcat, leaf)


def reconcile_catalogue(db: Session, dry_run: bool = True) -> Dict[str, any]:
    """Execute or simulate catalogue reconciliation."""
    summary = {
        "legacy_products_archived": 0,
        "legacy_products_already_archived": 0,
        "canonical_collections_ensured": 0,
        "legacy_collections_deactivated": 0,
        "designs_discovered": 0,
        "products_created": 0,
        "products_already_existing": 0,
        "variants_created": 0,
        "images_attached": 0,
        "dry_run": dry_run,
        "created_products_list": [],
    }

    # 1. Reconcile Collections
    print("\n--- 1. Reconciling Collections ---")
    canonical_col_map: Dict[str, Collection] = {}

    for name, slug, desc in CANONICAL_COLLECTIONS:
        col = db.query(Collection).filter(Collection.slug == slug).first()
        if not col:
            col = db.query(Collection).filter(Collection.name.ilike(name)).first()
        if col:
            if not getattr(col, "is_active", True):
                if not dry_run:
                    col.is_active = True
                print(f"  [Collection] Reactivated canonical collection: {col.name} ({slug})")
            else:
                print(f"  [Collection] Verified canonical collection: {col.name} ({slug})")
            canonical_col_map[slug] = col
            summary["canonical_collections_ensured"] += 1
        else:
            if not dry_run:
                new_col = Collection(name=name, slug=slug, description=desc, is_active=True)
                db.add(new_col)
                db.flush()
                canonical_col_map[slug] = new_col
            print(f"  [Collection] Created canonical collection: {name} ({slug})")
            summary["canonical_collections_ensured"] += 1

    for legacy_slug in LEGACY_COLLECTION_SLUGS:
        leg_col = db.query(Collection).filter(Collection.slug == legacy_slug).first()
        if leg_col:
            if getattr(leg_col, "is_active", True):
                if not dry_run:
                    leg_col.is_active = False
                print(f"  [Collection] Marked legacy collection inactive/archived: {leg_col.name} ({legacy_slug})")
                summary["legacy_collections_deactivated"] += 1
            else:
                print(f"  [Collection] Legacy collection already archived: {leg_col.name} ({legacy_slug})")

    # 2. Archive Legacy Sample Products
    print("\n--- 2. Archiving Legacy Sample Products ---")
    legacy_sample_products = (
        db.query(Product)
        .filter(
            (Product.source_folder == None) | (~Product.source_folder.like("Photos for royal libas/%"))
        )
        .all()
    )

    for prod in legacy_sample_products:
        if prod.status == "ARCHIVED" and not prod.is_active:
            summary["legacy_products_already_archived"] += 1
        else:
            if not dry_run:
                prod.status = "ARCHIVED"
                prod.is_active = False
            summary["legacy_products_archived"] += 1
            print(f"  [Archive] Product #{prod.id} '{prod.name}' -> ARCHIVED (is_active=False)")

    # 3. Discover Design Folders and Attached Assets
    print("\n--- 3. Discovering Design Folders from Media Registry ---")
    folders_query = (
        db.query(MediaAsset.folder)
        .filter(MediaAsset.folder.like("Photos for royal libas/%"))
        .group_by(MediaAsset.folder)
        .all()
    )

    discovered_folders = [f[0] for f in folders_query if f[0]]
    design_folders: Dict[str, Tuple[str, str, str]] = {}

    for folder_path in sorted(discovered_folders):
        parsed = parse_folder_taxonomy(folder_path)
        if parsed:
            design_folders[folder_path] = parsed
        else:
            print(f"  [Skip] Non-product or combination folder: {folder_path}")

    summary["designs_discovered"] = len(design_folders)
    print(f"  Total valid individual design folders discovered: {len(design_folders)}")

    # 4. Create or Verify Real Design Products
    print("\n--- 4. Creating Real Design Products in DRAFT Status ---")

    for folder_path, (cat, subcat, leaf) in sorted(design_folders.items()):
        clean_name = clean_name_from_folder(leaf)
        base_slug = slugify(clean_name)

        # Check if already reconciled
        existing_prod = db.query(Product).filter(Product.source_folder == folder_path).first()
        if not existing_prod:
            existing_prod = db.query(Product).filter(Product.slug == base_slug).first()

        if existing_prod:
            summary["products_already_existing"] += 1
            print(f"  [Exists] Design #{existing_prod.id} '{existing_prod.name}' already present (status={existing_prod.status})")
            continue

        # Extract design number for SKU (e.g. '01' from '01 - Gulnaar...')
        num_match = re.match(r"^(\d+)", leaf)
        num_code = num_match.group(1) if num_match else "01"
        cat_code = CAT_CODE_MAP.get(cat, "RL")
        subcat_code = SUBCAT_CODE_MAP.get(subcat, "GEN")

        col_slug = CATEGORY_TO_COLLECTION_SLUG.get(cat, "suit-set")
        target_col = canonical_col_map.get(col_slug)
        if not target_col and not dry_run:
            target_col = db.query(Collection).filter(Collection.slug == col_slug).first()

        desc = (
            f"Artisanal {clean_name} handcrafted for Royal Libas. "
            f"Exquisitely tailored in our signature atelier with intricate detailing, "
            f"luxurious drape, and timeless silhouette. Details subject to owner review."
        )

        fabric = "Pure Silk / Artisan Chanderi"
        care = "Dry clean only to preserve artisanal texture and embroidery"
        fit = "Tailored Regular Fit"

        if not dry_run:
            new_prod = Product(
                name=clean_name,
                slug=base_slug,
                description=desc,
                fabric=fabric,
                care=care,
                fit=fit,
                category=cat,
                subcategory=subcat,
                source_folder=folder_path,
                status="DRAFT",
                is_active=False,
                is_bestseller=False,
            )
            if target_col:
                new_prod.collections = [target_col]
            db.add(new_prod)
            db.flush()

            # Attach Media Assets
            assets = (
                db.query(MediaAsset)
                .filter(MediaAsset.folder == folder_path)
                .order_by(
                    # Images first, then videos
                    case((MediaAsset.resource_type == "image", 1), else_=2),
                    MediaAsset.filename.asc(),
                )
                .all()
            )

            primary_img_url = None
            sort_order = 1
            for asset in assets:
                img_url = asset.secure_url or asset.url
                if not primary_img_url and asset.resource_type == "image":
                    primary_img_url = img_url

                p_img = ProductImage(
                    product_id=new_prod.id,
                    media_asset_id=asset.id,
                    url=img_url,
                    public_id=asset.public_id,
                    resource_type=asset.resource_type,
                    width=asset.width,
                    height=asset.height,
                    duration=asset.duration,
                    sort_order=sort_order,
                    alt_text=f"{clean_name} - {asset.display_name or asset.filename}",
                )
                db.add(p_img)
                sort_order += 1
                summary["images_attached"] += 1

            # Create 5 Variants with Initial Stock and Audit Log
            for size in DEFAULT_SIZES:
                sku = f"RL-{cat_code}-{subcat_code}-{num_code}-{size}"
                variant = ProductVariant(
                    product_id=new_prod.id,
                    size=size,
                    colour=None,
                    sku=sku,
                    selling_price=DEFAULT_PRICE,
                    mrp=DEFAULT_MRP,
                    stock=DEFAULT_STOCK,
                )
                db.add(variant)
                db.flush()
                summary["variants_created"] += 1

                # Record Initial Stock Audit
                adj = StockAdjustment(
                    variant_id=variant.id,
                    previous_stock=0,
                    new_stock=DEFAULT_STOCK,
                    change_amount=DEFAULT_STOCK,
                    reason="INITIAL_SETUP",
                    note="Catalogue setup initial temporary stock",
                    actor_email="system",
                )
                db.add(adj)

            db.flush()
            summary["products_created"] += 1
            summary["created_products_list"].append({
                "id": new_prod.id,
                "name": clean_name,
                "category": cat,
                "subcategory": subcat,
                "slug": base_slug,
                "images_count": len(assets),
            })
            print(f"  [Created] #{new_prod.id} '{clean_name}' ({cat} › {subcat}) with {len(assets)} assets and 5 variants")
        else:
            summary["products_created"] += 1
            summary["variants_created"] += 5
            assets_count = db.query(MediaAsset).filter(MediaAsset.folder == folder_path).count()
            summary["images_attached"] += assets_count
            summary["created_products_list"].append({
                "name": clean_name,
                "category": cat,
                "subcategory": subcat,
                "slug": base_slug,
                "images_count": assets_count,
            })
            print(f"  [Dry-Run Create] '{clean_name}' ({cat} › {subcat}) - {assets_count} assets, 5 variants")

    if not dry_run:
        db.commit()
        print("\nAll changes successfully committed to the database.")
    else:
        print("\nDRY RUN complete. No changes were saved.")

    return summary


def main():
    parser = argparse.ArgumentParser(description="Reconcile Royal Libas catalogue with real design folders.")
    parser.add_argument("--confirm", action="store_true", help="Execute changes and commit to database")
    parser.add_argument("--dry-run", action="store_true", help="Simulate changes without modifying database")
    args = parser.parse_args()

    if not args.confirm and not args.dry_run:
        print("Please specify either --dry-run or --confirm")
        sys.exit(1)

    dry_run = not args.confirm

    engine = create_engine(DATABASE_URL)
    from app.migrations import run_migrations
    run_migrations(engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        summary = reconcile_catalogue(db, dry_run=dry_run)
        print("\n=== SUMMARY ===")
        for k, v in summary.items():
            if k != "created_products_list":
                print(f"  {k}: {v}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
