#!/usr/bin/env python3
"""Seed script for Royal Libas Phase 2 catalogue.

Creates exactly 5 dummy products, each with at least 3 sizes and distinct stock levels:
- Including one sold-out size on an active product (Ivory Everyday Cotton Co-ord has size S at 0 stock)
- Including one fully sold-out product (Pink Cotton Kurti Set has all sizes at 0 stock)
- Named unmistakably with "DUMMY — ..."

Idempotency:
This script checks existing slugs and can run repeatedly without duplicating or crashing.
"""

import json
from decimal import Decimal
from app.database import SessionLocal, Base, engine
from app.models import Product, ProductVariant, ProductImage, Collection

# Ensure all database tables exist
Base.metadata.create_all(bind=engine)

COLLECTIONS_DATA = [
    {
        "name": "Festive Edit",
        "slug": "festive-edit",
        "description": "Luxurious celebratory attire crafted for weddings, festivals, and evening occasions.",
    },
    {
        "name": "Everyday Cotton",
        "slug": "everyday-cotton",
        "description": "Breathable, lightweight sets and co-ords for effortless daily comfort.",
    },
    {
        "name": "Bestsellers",
        "slug": "bestsellers",
        "description": "Our most loved boutique silhouettes and festive signature sets.",
    },
]

SIZE_CHART_CM = json.dumps(
    {
        "unit": "cm",
        "measurements": {
            "S": {"bust": 91.5, "waist": 76.2, "hip": 99.0, "length": 114.3},
            "M": {"bust": 96.5, "waist": 81.3, "hip": 104.1, "length": 114.3},
            "L": {"bust": 101.6, "waist": 86.4, "hip": 109.2, "length": 114.3},
            "XL": {"bust": 106.7, "waist": 91.4, "hip": 114.3, "length": 114.3},
        },
    }
)

DUMMY_PRODUCTS_DATA = [
    {
        "name": "DUMMY — Maroon Festive Kurti Set",
        "slug": "dummy-maroon-festive-kurti-set",
        "description": "DUMMY ITEM ONLY: Rich maroon kurti set with delicate gold zari embroidery and straight pants.",
        "fabric": "Dummy Mulberry Silk",
        "care": "Dry clean only to maintain gold zari finish",
        "category": "Festive Sets",
        "is_bestseller": True,
        "is_active": True,
        "collections": ["festive-edit", "bestsellers"],
        "images": [
            {"url": "https://picsum.photos/seed/royal-libas-1/800/1000", "sort_order": 0, "alt_text": "Maroon kurti front view"},
            {"url": "https://picsum.photos/seed/royal-libas-1b/800/1000", "sort_order": 1, "alt_text": "Maroon kurti back view"},
            {"url": "https://picsum.photos/seed/royal-libas-1c/800/1000", "sort_order": 2, "alt_text": "Maroon kurti embroidery detail"},
        ],
        "variants": [
            {"size": "S", "colour": "Maroon", "sku": "DUMMY-MRN-S", "mrp": Decimal("3999.00"), "selling_price": Decimal("2999.00"), "stock": 4},
            {"size": "M", "colour": "Maroon", "sku": "DUMMY-MRN-M", "mrp": Decimal("3999.00"), "selling_price": Decimal("2999.00"), "stock": 8},
            {"size": "L", "colour": "Maroon", "sku": "DUMMY-MRN-L", "mrp": Decimal("3999.00"), "selling_price": Decimal("2999.00"), "stock": 6},
            {"size": "XL", "colour": "Maroon", "sku": "DUMMY-MRN-XL", "mrp": Decimal("3999.00"), "selling_price": Decimal("2999.00"), "stock": 2},
        ],
    },
    {
        "name": "DUMMY — Ivory Everyday Cotton Co-ord",
        "slug": "dummy-ivory-everyday-cotton-co-ord",
        "description": "DUMMY ITEM ONLY: Minimalist ivory co-ord set crafted from breathable cotton for daily elegance. Features one sold-out size (S) for testing.",
        "fabric": "Dummy Pure Cotton",
        "care": "Gentle machine wash with like colours",
        "category": "Co-ord Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["everyday-cotton"],
        "images": [
            {"url": "https://picsum.photos/seed/royal-libas-2/800/1000", "sort_order": 0, "alt_text": "Ivory co-ord front view"},
            {"url": "https://picsum.photos/seed/royal-libas-2b/800/1000", "sort_order": 1, "alt_text": "Ivory co-ord back view"},
            {"url": "https://picsum.photos/seed/royal-libas-2c/800/1000", "sort_order": 2, "alt_text": "Ivory co-ord fabric detail"},
        ],
        "variants": [
            # NOTE: Size S has 0 stock (One sold-out size demonstration)
            {"size": "S", "colour": "Ivory", "sku": "DUMMY-IVR-S", "mrp": Decimal("2499.00"), "selling_price": Decimal("1999.00"), "stock": 0},
            {"size": "M", "colour": "Ivory", "sku": "DUMMY-IVR-M", "mrp": Decimal("2499.00"), "selling_price": Decimal("1999.00"), "stock": 7},
            {"size": "L", "colour": "Ivory", "sku": "DUMMY-IVR-L", "mrp": Decimal("2499.00"), "selling_price": Decimal("1999.00"), "stock": 5},
            {"size": "XL", "colour": "Ivory", "sku": "DUMMY-IVR-XL", "mrp": Decimal("2499.00"), "selling_price": Decimal("1999.00"), "stock": 3},
        ],
    },
    {
        "name": "DUMMY — Gold Festive Co-ord Set",
        "slug": "dummy-gold-festive-co-ord-set",
        "description": "DUMMY ITEM ONLY: Opulent gold co-ord set with subtle festive sheen. Low stock threshold demonstration (total stock = 5).",
        "fabric": "Dummy Chanderi Silk",
        "care": "Dry clean recommended",
        "category": "Co-ord Sets",
        "is_bestseller": True,
        "is_active": True,
        "collections": ["festive-edit", "bestsellers"],
        "images": [
            {"url": "https://picsum.photos/seed/royal-libas-3/800/1000", "sort_order": 0, "alt_text": "Gold co-ord front view"},
            {"url": "https://picsum.photos/seed/royal-libas-3b/800/1000", "sort_order": 1, "alt_text": "Gold co-ord trousers view"},
            {"url": "https://picsum.photos/seed/royal-libas-3c/800/1000", "sort_order": 2, "alt_text": "Gold co-ord button detail"},
        ],
        "variants": [
            # NOTE: Total stock is 5 across all sizes (Low Stock badge demonstration)
            {"size": "S", "colour": "Gold", "sku": "DUMMY-GLD-S", "mrp": Decimal("4499.00"), "selling_price": Decimal("3499.00"), "stock": 1},
            {"size": "M", "colour": "Gold", "sku": "DUMMY-GLD-M", "mrp": Decimal("4499.00"), "selling_price": Decimal("3499.00"), "stock": 2},
            {"size": "L", "colour": "Gold", "sku": "DUMMY-GLD-L", "mrp": Decimal("4499.00"), "selling_price": Decimal("3499.00"), "stock": 1},
            {"size": "XL", "colour": "Gold", "sku": "DUMMY-GLD-XL", "mrp": Decimal("4499.00"), "selling_price": Decimal("3499.00"), "stock": 1},
        ],
    },
    {
        "name": "DUMMY — Green Everyday Kurti Set",
        "slug": "dummy-green-everyday-kurti-set",
        "description": "DUMMY ITEM ONLY: Refreshing emerald everyday kurti set made from soft premium cotton with comfortable straight palazzos.",
        "fabric": "Dummy Slub Cotton",
        "care": "Machine wash cold with mild detergent",
        "category": "Kurti Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["everyday-cotton"],
        "images": [
            {"url": "https://picsum.photos/seed/royal-libas-4/800/1000", "sort_order": 0, "alt_text": "Green kurti front view"},
            {"url": "https://picsum.photos/seed/royal-libas-4b/800/1000", "sort_order": 1, "alt_text": "Green kurti palazzos detail"},
            {"url": "https://picsum.photos/seed/royal-libas-4c/800/1000", "sort_order": 2, "alt_text": "Green kurti neckline detail"},
        ],
        "variants": [
            {"size": "S", "colour": "Emerald Green", "sku": "DUMMY-GRN-S", "mrp": Decimal("2299.00"), "selling_price": Decimal("1799.00"), "stock": 6},
            {"size": "M", "colour": "Emerald Green", "sku": "DUMMY-GRN-M", "mrp": Decimal("2299.00"), "selling_price": Decimal("1799.00"), "stock": 9},
            {"size": "L", "colour": "Emerald Green", "sku": "DUMMY-GRN-L", "mrp": Decimal("2299.00"), "selling_price": Decimal("1799.00"), "stock": 7},
            {"size": "XL", "colour": "Emerald Green", "sku": "DUMMY-GRN-XL", "mrp": Decimal("2299.00"), "selling_price": Decimal("1799.00"), "stock": 4},
        ],
    },
    {
        "name": "DUMMY — Pink Cotton Kurti Set (Sold Out)",
        "slug": "dummy-pink-cotton-kurti-set-sold-out",
        "description": "DUMMY ITEM ONLY: Subtle blush pink kurti set with floral threadwork. Fully sold-out product demonstration (all sizes at 0 stock).",
        "fabric": "Dummy Cotton Voile",
        "care": "Hand wash separately in cold water",
        "category": "Kurti Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["everyday-cotton"],
        "images": [
            {"url": "https://picsum.photos/seed/royal-libas-5/800/1000", "sort_order": 0, "alt_text": "Pink kurti set front view"},
            {"url": "https://picsum.photos/seed/royal-libas-5b/800/1000", "sort_order": 1, "alt_text": "Pink kurti set hemline detail"},
            {"url": "https://picsum.photos/seed/royal-libas-5c/800/1000", "sort_order": 2, "alt_text": "Pink kurti set dupatta view"},
        ],
        "variants": [
            # NOTE: Fully sold out product (all variants at 0 stock)
            {"size": "S", "colour": "Blush Pink", "sku": "DUMMY-PNK-S", "mrp": Decimal("2999.00"), "selling_price": Decimal("2499.00"), "stock": 0},
            {"size": "M", "colour": "Blush Pink", "sku": "DUMMY-PNK-M", "mrp": Decimal("2999.00"), "selling_price": Decimal("2499.00"), "stock": 0},
            {"size": "L", "colour": "Blush Pink", "sku": "DUMMY-PNK-L", "mrp": Decimal("2999.00"), "selling_price": Decimal("2499.00"), "stock": 0},
            {"size": "XL", "colour": "Blush Pink", "sku": "DUMMY-PNK-XL", "mrp": Decimal("2999.00"), "selling_price": Decimal("2499.00"), "stock": 0},
        ],
    },
]


def seed_database(session_factory=None):
    """Seed collections and dummy products idempotently."""
    factory = session_factory or SessionLocal
    db = factory()
    try:
        print("Starting catalogue seed process...")

        # 1. Seed or retrieve collections
        collections_map = {}
        for cdata in COLLECTIONS_DATA:
            col = db.query(Collection).filter(Collection.slug == cdata["slug"]).first()
            if not col:
                col = Collection(
                    name=cdata["name"],
                    slug=cdata["slug"],
                    description=cdata["description"],
                )
                db.add(col)
                db.flush()
                print(f"  [+] Created collection: {col.name}")
            else:
                col.name = cdata["name"]
                col.description = cdata["description"]
                print(f"  [*] Updated collection: {col.name}")
            collections_map[cdata["slug"]] = col

        # 2. Seed or update 5 dummy products
        for pdata in DUMMY_PRODUCTS_DATA:
            product = db.query(Product).filter(Product.slug == pdata["slug"]).first()
            if not product:
                product = Product(
                    name=pdata["name"],
                    slug=pdata["slug"],
                    description=pdata["description"],
                    fabric=pdata["fabric"],
                    care=pdata["care"],
                    size_chart=SIZE_CHART_CM,
                    category=pdata["category"],
                    is_bestseller=pdata["is_bestseller"],
                    is_active=pdata["is_active"],
                )
                db.add(product)
                db.flush()
                print(f"  [+] Created product: {product.name} (slug: {product.slug})")
            else:
                product.name = pdata["name"]
                product.description = pdata["description"]
                product.fabric = pdata["fabric"]
                product.care = pdata["care"]
                product.size_chart = SIZE_CHART_CM
                product.category = pdata["category"]
                product.is_bestseller = pdata["is_bestseller"]
                product.is_active = pdata["is_active"]
                print(f"  [*] Updated product: {product.name} (slug: {product.slug})")

            # Associate collections
            target_cols = [collections_map[cslug] for cslug in pdata["collections"] if cslug in collections_map]
            product.collections = target_cols

            # Upsert variants
            for vdata in pdata["variants"]:
                variant = (
                    db.query(ProductVariant)
                    .filter(
                        ProductVariant.product_id == product.id,
                        ProductVariant.size == vdata["size"],
                    )
                    .first()
                )
                if not variant:
                    variant = ProductVariant(
                        product_id=product.id,
                        size=vdata["size"],
                        colour=vdata["colour"],
                        sku=vdata["sku"],
                        mrp=vdata["mrp"],
                        selling_price=vdata["selling_price"],
                        stock=vdata["stock"],
                    )
                    db.add(variant)
                else:
                    variant.colour = vdata["colour"]
                    variant.sku = vdata["sku"]
                    variant.mrp = vdata["mrp"]
                    variant.selling_price = vdata["selling_price"]
                    variant.stock = vdata["stock"]

            # Upsert images
            existing_urls = {img.url for img in product.images}
            for imgdata in pdata["images"]:
                if imgdata["url"] not in existing_urls:
                    image = ProductImage(
                        product_id=product.id,
                        url=imgdata["url"],
                        sort_order=imgdata["sort_order"],
                        alt_text=imgdata["alt_text"],
                    )
                    db.add(image)

        db.commit()
        print("Success: Database catalogue seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
