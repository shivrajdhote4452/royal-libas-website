#!/usr/bin/env python3
"""Seed script for Royal Libas Sample Catalogue.

SAMPLE ONLY — all 16 products are placeholders made by tinting/cropping 3 base images, to be replaced with Tanya's real photos, prices and stock before launch.
- 16 sample boutique designs across Festive Edit, Everyday Cotton, Kurti Sets, and Co-ord Sets
- Sample local imagery (front, back, detail, worn shots) for every product
- Sample prices (MRP and Selling Price in INR)
- Sample size-wise stock per variant (S, M, L, XL, XXL)
- One sold-out size demonstration (Chandni Raat Co-ord has size S at 0 stock)
- One low-stock demonstration (Zari Mahal Anarkali has 5 total units)
- Sample fabric, care instructions, and centimeter-accurate size charts

Idempotency:
Safely updates existing products or creates new ones.
"""

import json
import os
import sys
import argparse
from decimal import Decimal
from app.database import SessionLocal, Base, engine
from app.models import Product, ProductVariant, ProductImage, Collection, Coupon, product_collections

# Ensure all database tables exist
Base.metadata.create_all(bind=engine)

COLLECTIONS_DATA = [
    {
        "name": "Festive Edit",
        "slug": "festive-edit",
        "description": "Luxurious celebratory attire crafted for weddings, festive occasions, and intimate soirees.",
    },
    {
        "name": "Everyday Cotton",
        "slug": "everyday-cotton",
        "description": "Breathable, lightweight pure cotton sets and co-ords for effortless daily comfort.",
    },
    {
        "name": "Bestsellers",
        "slug": "bestsellers",
        "description": "Our most loved boutique silhouettes, repeat-ordered for superior fit and grace.",
    },
]

COUPONS_DATA = [
    {
        "code": "ROYAL10",
        "type": "PERCENT",
        "value": Decimal("10.00"),
        "min_order_value": Decimal("1999.00"),
        "is_active": True,
    },
    {
        "code": "FESTIVE200",
        "type": "FLAT",
        "value": Decimal("200.00"),
        "min_order_value": Decimal("2999.00"),
        "is_active": True,
    },
    {
        "code": "WELCOME10",
        "type": "PERCENT",
        "value": Decimal("10.00"),
        "min_order_value": Decimal("1500.00"),
        "is_active": True,
    },
    {
        "code": "FESTIVE100",
        "type": "FLAT",
        "value": Decimal("100.00"),
        "min_order_value": Decimal("1000.00"),
        "is_active": True,
    },
]

SIZE_CHART_CM = json.dumps(
    {
        "unit": "cm",
        "measurements": {
            "XS": {"bust": 86.4, "waist": 71.1, "hip": 94.0, "length": 114.3},
            "S": {"bust": 91.5, "waist": 76.2, "hip": 99.0, "length": 114.3},
            "M": {"bust": 96.5, "waist": 81.3, "hip": 104.1, "length": 114.3},
            "L": {"bust": 101.6, "waist": 86.4, "hip": 109.2, "length": 114.3},
            "XL": {"bust": 106.7, "waist": 91.4, "hip": 114.3, "length": 114.3},
            "XXL": {"bust": 111.8, "waist": 96.5, "hip": 119.4, "length": 114.3},
        },
    }
)

REAL_PRODUCTS_DATA = [
    {
        "name": "Noorani Chanderi Kurti Set",
        "slug": "noorani-chanderi-kurti-set",
        "description": "Regal deep maroon Chanderi silk kurti set highlighted with intricate hand-embroidered gold metallic zari work along the neckline and cuffs. Paired with tailored straight cigarette pants and a delicate scalloped organza dupatta with golden buti accents.",
        "fabric": "Pure Chanderi Silk with 100% Cotton Shantoon Lining",
        "care": "Professional dry clean only to preserve gold zari and silk texture",
        "category": "Kurti Sets",
        "is_bestseller": True,
        "is_active": True,
        "collections": ["festive-edit", "bestsellers"],
        "img_key": "noorani_maroon",
        "variants": [
            {"size": "S", "colour": "Deep Maroon", "sku": "RL-NOOR-MRN-S", "mrp": Decimal("4499.00"), "selling_price": Decimal("3499.00"), "stock": 6},
            {"size": "M", "colour": "Deep Maroon", "sku": "RL-NOOR-MRN-M", "mrp": Decimal("4499.00"), "selling_price": Decimal("3499.00"), "stock": 12},
            {"size": "L", "colour": "Deep Maroon", "sku": "RL-NOOR-MRN-L", "mrp": Decimal("4499.00"), "selling_price": Decimal("3499.00"), "stock": 8},
            {"size": "XL", "colour": "Deep Maroon", "sku": "RL-NOOR-MRN-XL", "mrp": Decimal("4499.00"), "selling_price": Decimal("3499.00"), "stock": 4},
            {"size": "XXL", "colour": "Deep Maroon", "sku": "RL-NOOR-MRN-XXL", "mrp": Decimal("4499.00"), "selling_price": Decimal("3499.00"), "stock": 2},
        ],
    },
    {
        "name": "Chandni Raat Modal Silk Co-ord",
        "slug": "chandni-raat-modal-silk-co-ord",
        "description": "Understated ivory and pearl monochrome co-ord set designed for effortless grace. Tailored from lustrous modal satin silk with delicate hand-stitched pintucks, natural mother-of-pearl buttons, and flowy relaxed wide-leg trousers. Features a sold-out size S to demonstrate live inventory checks.",
        "fabric": "Lustrous Modal Satin Silk Blend with Natural Shell Buttons",
        "care": "Gentle hand wash in cold water with mild detergent or dry clean",
        "category": "Co-ord Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["everyday-cotton"],
        "img_key": "chandni_ivory",
        "variants": [
            {"size": "S", "colour": "Ivory Pearl", "sku": "RL-CHND-IVR-S", "mrp": Decimal("3299.00"), "selling_price": Decimal("2499.00"), "stock": 0},
            {"size": "M", "colour": "Ivory Pearl", "sku": "RL-CHND-IVR-M", "mrp": Decimal("3299.00"), "selling_price": Decimal("2499.00"), "stock": 9},
            {"size": "L", "colour": "Ivory Pearl", "sku": "RL-CHND-IVR-L", "mrp": Decimal("3299.00"), "selling_price": Decimal("2499.00"), "stock": 6},
            {"size": "XL", "colour": "Ivory Pearl", "sku": "RL-CHND-IVR-XL", "mrp": Decimal("3299.00"), "selling_price": Decimal("2499.00"), "stock": 3},
        ],
    },
    {
        "name": "Zari Mahal Velvet Anarkali Suit",
        "slug": "zari-mahal-velvet-anarkali-suit",
        "description": "Opulent royal emerald micro-velvet Anarkali suit featuring ornate hand-worked gold gotta patti borders and mirror motifs. Floor-grazing flared silhouette accompanied by churidar trousers and an ethereal net dupatta with latkan tassels. High-demand festive collection with low total stock (5 units).",
        "fabric": "Heavy Pure Micro-Velvet with Sheer Embroidered Net Dupatta",
        "care": "Professional dry clean only; steam iron gently on reverse",
        "category": "Kurti Sets",
        "is_bestseller": True,
        "is_active": True,
        "collections": ["festive-edit", "bestsellers"],
        "img_key": "zari_mahal_emerald",
        "variants": [
            {"size": "S", "colour": "Emerald Green", "sku": "RL-ZARI-EMR-S", "mrp": Decimal("6999.00"), "selling_price": Decimal("5499.00"), "stock": 2},
            {"size": "M", "colour": "Emerald Green", "sku": "RL-ZARI-EMR-M", "mrp": Decimal("6999.00"), "selling_price": Decimal("5499.00"), "stock": 2},
            {"size": "L", "colour": "Emerald Green", "sku": "RL-ZARI-EMR-L", "mrp": Decimal("6999.00"), "selling_price": Decimal("5499.00"), "stock": 1},
        ],
    },
    {
        "name": "Gulabi Rooh Handblock Cotton Set",
        "slug": "gulabi-rooh-handblock-cotton-set",
        "description": "Enchanting dusty rose kurti and palazzo set adorned with traditional Jaipur Sanganeri handblock floral prints. Made from 100% fine mulmul cotton, providing unparalleled daytime comfort and timeless ethnic charm.",
        "fabric": "100% Sanganeri Handblock Printed Mulmul Cotton",
        "care": "Hand wash separately in cold water using mild soap; dry in shade",
        "category": "Kurti Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["everyday-cotton"],
        "img_key": "gulabi_rooh_rose",
        "variants": [
            {"size": "S", "colour": "Dusty Rose", "sku": "RL-GLB-RS-S", "mrp": Decimal("2799.00"), "selling_price": Decimal("1999.00"), "stock": 8},
            {"size": "M", "colour": "Dusty Rose", "sku": "RL-GLB-RS-M", "mrp": Decimal("2799.00"), "selling_price": Decimal("1999.00"), "stock": 14},
            {"size": "L", "colour": "Dusty Rose", "sku": "RL-GLB-RS-L", "mrp": Decimal("2799.00"), "selling_price": Decimal("1999.00"), "stock": 10},
            {"size": "XL", "colour": "Dusty Rose", "sku": "RL-GLB-RS-XL", "mrp": Decimal("2799.00"), "selling_price": Decimal("1999.00"), "stock": 6},
            {"size": "XXL", "colour": "Dusty Rose", "sku": "RL-GLB-RS-XXL", "mrp": Decimal("2799.00"), "selling_price": Decimal("1999.00"), "stock": 3},
        ],
    },
    {
        "name": "Sitara Tissue Silk Kurti Set",
        "slug": "sitara-tissue-silk-kurti-set",
        "description": "Luminous champagne gold tissue silk kurti set with hand-applied cutdana, sequins, and fine seed pearls around the split collar. Paired with coordinating straight trousers and a featherlight zari border dupatta.",
        "fabric": "Luminous Tissue Silk with Soft Cotton Lining",
        "care": "Dry clean only to maintain sheen and prevent metallic friction",
        "category": "Festive Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["festive-edit"],
        "img_key": "sitara_gold",
        "variants": [
            {"size": "S", "colour": "Champagne Gold", "sku": "RL-STR-GLD-S", "mrp": Decimal("5499.00"), "selling_price": Decimal("4299.00"), "stock": 4},
            {"size": "M", "colour": "Champagne Gold", "sku": "RL-STR-GLD-M", "mrp": Decimal("5499.00"), "selling_price": Decimal("4299.00"), "stock": 8},
            {"size": "L", "colour": "Champagne Gold", "sku": "RL-STR-GLD-L", "mrp": Decimal("5499.00"), "selling_price": Decimal("4299.00"), "stock": 6},
            {"size": "XL", "colour": "Champagne Gold", "sku": "RL-STR-GLD-XL", "mrp": Decimal("5499.00"), "selling_price": Decimal("4299.00"), "stock": 2},
        ],
    },
    {
        "name": "Bagicha Muslin Tiered Angrakha",
        "slug": "bagicha-muslin-tiered-angrakha",
        "description": "Earthy sage green tiered Angrakha style kurti set handcrafted from feather-soft organic muslin cotton. Features traditional Rajasthani dori ties with handmade fabric potli tassels and comfortable straight cotton palazzos.",
        "fabric": "Organic Muslin Cotton with Hand Crochet Lace Trims",
        "care": "Gentle hand wash in cold water or mild cycle machine wash",
        "category": "Kurti Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["festive-edit", "everyday-cotton"],
        "img_key": "bagicha_sage",
        "variants": [
            {"size": "S", "colour": "Sage Green", "sku": "RL-BGC-SG-S", "mrp": Decimal("3999.00"), "selling_price": Decimal("2999.00"), "stock": 5},
            {"size": "M", "colour": "Sage Green", "sku": "RL-BGC-SG-M", "mrp": Decimal("3999.00"), "selling_price": Decimal("2999.00"), "stock": 9},
            {"size": "L", "colour": "Sage Green", "sku": "RL-BGC-SG-L", "mrp": Decimal("3999.00"), "selling_price": Decimal("2999.00"), "stock": 7},
            {"size": "XL", "colour": "Sage Green", "sku": "RL-BGC-SG-XL", "mrp": Decimal("3999.00"), "selling_price": Decimal("2999.00"), "stock": 4},
        ],
    },
    {
        "name": "Mehtab Georgette Gharara Suit",
        "slug": "mehtab-georgette-gharara-suit",
        "description": "Dramatic midnight navy georgette kurti set featuring intricate tone-on-tone Chikankari embroidery and luminous mukaish highlights. Accompanied by a two-tiered flared gharara and a flowy dupatta.",
        "fabric": "Premium Viscose Georgette with Butter Crepe Lining",
        "care": "Professional dry clean only",
        "category": "Festive Sets",
        "is_bestseller": True,
        "is_active": True,
        "collections": ["festive-edit", "bestsellers"],
        "img_key": "mehtab_navy",
        "variants": [
            {"size": "S", "colour": "Midnight Navy", "sku": "RL-MHT-NVY-S", "mrp": Decimal("5999.00"), "selling_price": Decimal("4799.00"), "stock": 3},
            {"size": "M", "colour": "Midnight Navy", "sku": "RL-MHT-NVY-M", "mrp": Decimal("5999.00"), "selling_price": Decimal("4799.00"), "stock": 6},
            {"size": "L", "colour": "Midnight Navy", "sku": "RL-MHT-NVY-L", "mrp": Decimal("5999.00"), "selling_price": Decimal("4799.00"), "stock": 5},
            {"size": "XL", "colour": "Midnight Navy", "sku": "RL-MHT-NVY-XL", "mrp": Decimal("5999.00"), "selling_price": Decimal("4799.00"), "stock": 2},
        ],
    },
    {
        "name": "Roza Pure Mulmul Everyday Co-ord",
        "slug": "roza-pure-mulmul-everyday-co-ord",
        "description": "Refreshing powder blue two-piece co-ord set crafted from 100s count combed mulmul cotton. Featuring clean tailored side slits, discreet in-seam pockets, and cropped ankle trousers for summer daytime ease.",
        "fabric": "100s Count Pure Combed Mulmul Cotton",
        "care": "Machine wash cold with similar colors; warm iron if needed",
        "category": "Co-ord Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["everyday-cotton"],
        "img_key": "roza_powder_blue",
        "variants": [
            {"size": "S", "colour": "Powder Blue", "sku": "RL-ROZA-BLU-S", "mrp": Decimal("2599.00"), "selling_price": Decimal("1899.00"), "stock": 7},
            {"size": "M", "colour": "Powder Blue", "sku": "RL-ROZA-BLU-M", "mrp": Decimal("2599.00"), "selling_price": Decimal("1899.00"), "stock": 11},
            {"size": "L", "colour": "Powder Blue", "sku": "RL-ROZA-BLU-L", "mrp": Decimal("2599.00"), "selling_price": Decimal("1899.00"), "stock": 8},
            {"size": "XL", "colour": "Powder Blue", "sku": "RL-ROZA-BLU-XL", "mrp": Decimal("2599.00"), "selling_price": Decimal("1899.00"), "stock": 5},
        ],
    },
    {
        "name": "Afreen Organza Embroidered Suit",
        "slug": "afreen-organza-embroidered-suit",
        "description": "Delicate pastel peach bloom sheer silk organza suit adorned with pastel resham threadwork floral vines and scalloped hand-cut borders. Paired with pure cotton shantoon cigarette trousers.",
        "fabric": "Fine Silk Organza with Pure Shantoon Lining",
        "care": "Dry clean only",
        "category": "Kurti Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["festive-edit"],
        "img_key": "afreen_peach",
        "variants": [
            {"size": "S", "colour": "Peach Bloom", "sku": "RL-AFRN-PCH-S", "mrp": Decimal("4999.00"), "selling_price": Decimal("3899.00"), "stock": 4},
            {"size": "M", "colour": "Peach Bloom", "sku": "RL-AFRN-PCH-M", "mrp": Decimal("4999.00"), "selling_price": Decimal("3899.00"), "stock": 7},
            {"size": "L", "colour": "Peach Bloom", "sku": "RL-AFRN-PCH-L", "mrp": Decimal("4999.00"), "selling_price": Decimal("3899.00"), "stock": 5},
            {"size": "XL", "colour": "Peach Bloom", "sku": "RL-AFRN-PCH-XL", "mrp": Decimal("4999.00"), "selling_price": Decimal("3899.00"), "stock": 2},
        ],
    },
    {
        "name": "Dastaan Raw Silk Straight Kurti Set",
        "slug": "dastaan-raw-silk-straight-kurti-set",
        "description": "Stately deep wine handloom raw silk kurti set with a crisp regal silhouette, notched neckline, and subtle dull-gold antique resham hand embroidery. Paired with coordinating silk trousers.",
        "fabric": "Handloom Raw Silk with Soft Cotton Lining",
        "care": "Dry clean only to maintain fabric body and luster",
        "category": "Kurti Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["festive-edit"],
        "img_key": "dastaan_wine",
        "variants": [
            {"size": "S", "colour": "Deep Wine", "sku": "RL-DSTN-WIN-S", "mrp": Decimal("4799.00"), "selling_price": Decimal("3699.00"), "stock": 3},
            {"size": "M", "colour": "Deep Wine", "sku": "RL-DSTN-WIN-M", "mrp": Decimal("4799.00"), "selling_price": Decimal("3699.00"), "stock": 5},
            {"size": "L", "colour": "Deep Wine", "sku": "RL-DSTN-WIN-L", "mrp": Decimal("4799.00"), "selling_price": Decimal("3699.00"), "stock": 4},
            {"size": "XL", "colour": "Deep Wine", "sku": "RL-DSTN-WIN-XL", "mrp": Decimal("4799.00"), "selling_price": Decimal("3699.00"), "stock": 2},
        ],
    },
    {
        "name": "Firdaus Chanderi Peplum & Sharara",
        "slug": "firdaus-chanderi-peplum-sharara",
        "description": "Festive mustard ochre peplum style short kurti paired with voluminous tiered sharara pants. Woven with traditional Chanderi motifs and finished with delicate gold kiran lace trims.",
        "fabric": "Chanderi Brocade Silk with Mulmul Lining",
        "care": "Dry clean only",
        "category": "Festive Sets",
        "is_bestseller": True,
        "is_active": True,
        "collections": ["festive-edit", "bestsellers"],
        "img_key": "firdaus_ochre",
        "variants": [
            {"size": "S", "colour": "Mustard Ochre", "sku": "RL-FRD-OCH-S", "mrp": Decimal("4999.00"), "selling_price": Decimal("3999.00"), "stock": 5},
            {"size": "M", "colour": "Mustard Ochre", "sku": "RL-FRD-OCH-M", "mrp": Decimal("4999.00"), "selling_price": Decimal("3999.00"), "stock": 8},
            {"size": "L", "colour": "Mustard Ochre", "sku": "RL-FRD-OCH-L", "mrp": Decimal("4999.00"), "selling_price": Decimal("3999.00"), "stock": 6},
            {"size": "XL", "colour": "Mustard Ochre", "sku": "RL-FRD-OCH-XL", "mrp": Decimal("4999.00"), "selling_price": Decimal("3999.00"), "stock": 3},
        ],
    },
    {
        "name": "Ruhaniyat Handwoven Cotton Kurti Set",
        "slug": "ruhaniyat-handwoven-cotton-kurti-set",
        "description": "Rich terracotta rust everyday ethnic set crafted from handspun slub cotton with wooden button accents and delicate hand-kantha stitching on the yoke. Includes breathable cropped palazzos.",
        "fabric": "Handspun Slub Cotton with Hand-Kantha Stitches",
        "care": "Hand wash cold separately; do not wring",
        "category": "Kurti Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["everyday-cotton"],
        "img_key": "ruhaniyat_rust",
        "variants": [
            {"size": "S", "colour": "Terracotta Rust", "sku": "RL-RHN-RST-S", "mrp": Decimal("2899.00"), "selling_price": Decimal("2199.00"), "stock": 6},
            {"size": "M", "colour": "Terracotta Rust", "sku": "RL-RHN-RST-M", "mrp": Decimal("2899.00"), "selling_price": Decimal("2199.00"), "stock": 10},
            {"size": "L", "colour": "Terracotta Rust", "sku": "RL-RHN-RST-L", "mrp": Decimal("2899.00"), "selling_price": Decimal("2199.00"), "stock": 8},
            {"size": "XL", "colour": "Terracotta Rust", "sku": "RL-RHN-RST-XL", "mrp": Decimal("2899.00"), "selling_price": Decimal("2199.00"), "stock": 4},
        ],
    },
    {
        "name": "Subah Pintuck Everyday Co-ord",
        "slug": "subah-pintuck-everyday-co-ord",
        "description": "Breezy lilac frost daily co-ord set designed with geometric ladder lace inserts and fine horizontal pintucks. Cut in an easy relaxed fit for comfortable work-from-home or casual daytime outings.",
        "fabric": "Breathable 60s Count Cambric Cotton",
        "care": "Machine wash cold with gentle detergent",
        "category": "Co-ord Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["everyday-cotton"],
        "img_key": "subah_lilac",
        "variants": [
            {"size": "S", "colour": "Lilac Frost", "sku": "RL-SBH-LLC-S", "mrp": Decimal("2699.00"), "selling_price": Decimal("1999.00"), "stock": 7},
            {"size": "M", "colour": "Lilac Frost", "sku": "RL-SBH-LLC-M", "mrp": Decimal("2699.00"), "selling_price": Decimal("1999.00"), "stock": 12},
            {"size": "L", "colour": "Lilac Frost", "sku": "RL-SBH-LLC-L", "mrp": Decimal("2699.00"), "selling_price": Decimal("1999.00"), "stock": 9},
            {"size": "XL", "colour": "Lilac Frost", "sku": "RL-SBH-LLC-XL", "mrp": Decimal("2699.00"), "selling_price": Decimal("1999.00"), "stock": 5},
        ],
    },
    {
        "name": "Nazm Silk Blend Tunic & Cigarette Pant",
        "slug": "nazm-silk-blend-tunic-cigarette-pant",
        "description": "Contemporary emerald jewel co-ord set tailored from a soft silk-blend twill. Featuring an asymmetric high-low tunic silhouette, Mandarin collar with hidden mother-of-pearl placket, and tapered trousers.",
        "fabric": "Modal Silk Twill Blend with Subtle Luster",
        "care": "Dry clean recommended or gentle hand wash in cold water",
        "category": "Co-ord Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["festive-edit"],
        "img_key": "nazm_emerald",
        "variants": [
            {"size": "S", "colour": "Emerald Jewel", "sku": "RL-NZM-EMR-S", "mrp": Decimal("3499.00"), "selling_price": Decimal("2699.00"), "stock": 4},
            {"size": "M", "colour": "Emerald Jewel", "sku": "RL-NZM-EMR-M", "mrp": Decimal("3499.00"), "selling_price": Decimal("2699.00"), "stock": 8},
            {"size": "L", "colour": "Emerald Jewel", "sku": "RL-NZM-EMR-L", "mrp": Decimal("3499.00"), "selling_price": Decimal("2699.00"), "stock": 5},
            {"size": "XL", "colour": "Emerald Jewel", "sku": "RL-NZM-EMR-XL", "mrp": Decimal("3499.00"), "selling_price": Decimal("2699.00"), "stock": 2},
        ],
    },
    {
        "name": "Ishqiyya Chiffon Printed Kurti Set",
        "slug": "ishqiyya-chiffon-printed-kurti-set",
        "description": "Flowing sea green chiffon kurti set featuring delicate botanical water-color prints, flared sleeves with lace hems, and comfortable matching stretch palazzos.",
        "fabric": "Lightweight Poly-Viscose Chiffon with Soft Crepe Lining",
        "care": "Hand wash gently in cold water; hang to dry",
        "category": "Kurti Sets",
        "is_bestseller": False,
        "is_active": True,
        "collections": ["everyday-cotton"],
        "img_key": "ishqiyya_sea_green",
        "variants": [
            {"size": "S", "colour": "Sea Green", "sku": "RL-ISHQ-GRN-S", "mrp": Decimal("3199.00"), "selling_price": Decimal("2399.00"), "stock": 5},
            {"size": "M", "colour": "Sea Green", "sku": "RL-ISHQ-GRN-M", "mrp": Decimal("3199.00"), "selling_price": Decimal("2399.00"), "stock": 9},
            {"size": "L", "colour": "Sea Green", "sku": "RL-ISHQ-GRN-L", "mrp": Decimal("3199.00"), "selling_price": Decimal("2399.00"), "stock": 6},
            {"size": "XL", "colour": "Sea Green", "sku": "RL-ISHQ-GRN-XL", "mrp": Decimal("3199.00"), "selling_price": Decimal("2399.00"), "stock": 3},
        ],
    },
    {
        "name": "Riwayat Brocade Festive Kurti & Palazzo",
        "slug": "riwayat-brocade-festive-kurti-palazzo",
        "description": "Traditional Benarasi woven zari brocade kurti in royal plum with gold floral jaal work. Completed with a grand flared palazzo and a pure silk tissue dupatta with tasseled pallu.",
        "fabric": "Benarasi Woven Zari Brocade with Pure Mulmul Lining",
        "care": "Dry clean only to maintain brocade weaves",
        "category": "Festive Sets",
        "is_bestseller": True,
        "is_active": True,
        "collections": ["festive-edit", "bestsellers"],
        "img_key": "riwayat_plum",
        "variants": [
            {"size": "S", "colour": "Royal Plum", "sku": "RL-RWYT-PLM-S", "mrp": Decimal("5899.00"), "selling_price": Decimal("4599.00"), "stock": 3},
            {"size": "M", "colour": "Royal Plum", "sku": "RL-RWYT-PLM-M", "mrp": Decimal("5899.00"), "selling_price": Decimal("4599.00"), "stock": 6},
            {"size": "L", "colour": "Royal Plum", "sku": "RL-RWYT-PLM-L", "mrp": Decimal("5899.00"), "selling_price": Decimal("4599.00"), "stock": 4},
            {"size": "XL", "colour": "Royal Plum", "sku": "RL-RWYT-PLM-XL", "mrp": Decimal("5899.00"), "selling_price": Decimal("4599.00"), "stock": 2},
        ],
    },
]


def is_production_environment() -> bool:
    """Detect whether the current runtime is configured for production."""
    env = os.getenv("ENV", "").strip().lower()
    app_env = os.getenv("APP_ENV", "").strip().lower()
    db_url = os.getenv("DATABASE_URL", "").strip().lower()
    return (
        env in ("production", "prod")
        or app_env in ("production", "prod")
        or "postgres" in db_url
        or "neon" in db_url
        or "supabase" in db_url
    )


def clean_dummy_products(db, confirm: bool = False):
    """Explicit separate utility to inspect and optionally remove dummy products. Never run during routine seeding."""
    dummy_products = (
        db.query(Product)
        .filter(
            (Product.slug.like("dummy%"))
            | (Product.name.like("%DUMMY%"))
        )
        .all()
    )
    if not dummy_products:
        print("  [i] No products matching 'dummy' found in database.")
        return

    print(f"\n[DUMMY CLEANUP] Found {len(dummy_products)} product(s) matching 'dummy':")
    for dp in dummy_products:
        print(f"    - ID {dp.id}: '{dp.name}' (slug: {dp.slug}, status: {dp.status})")

    if not confirm:
        print("  [!] DRY-RUN ONLY: No products were deleted. Use --clean-dummy-products --confirm to execute deletion.\n")
        return

    for dp in dummy_products:
        db.delete(dp)
    db.commit()
    print(f"  [-] Successfully deleted {len(dummy_products)} dummy product(s).\n")


def reset_sample_products(db, confirm: bool = False, allow_production: bool = False) -> dict:
    """Explicit separate maintenance utility to safely review and reset sample product metadata.

    SAFETY RULES:
    1. Default behavior is ALWAYS a DRY RUN: lists every affected product and every field that would change.
    2. No database changes occur unless confirm=True is explicitly passed (e.g., via --confirm).
    3. Products containing client data, active inventory (stock > 0), custom prices, or ANY photos/videos
       are strictly PROTECTED and skipped. We NEVER assume a product is safe to reset simply because
       it has no Cloudinary photo.
    4. Blocked in production environments unless allow_production=True.
    """
    if is_production_environment() and not allow_production:
        print("\n[SAFETY GUARD] Production database detected.")
        print("  Sample product metadata reset is BLOCKED in production to protect real client products and business data.")
        return {"status": "blocked", "eligible": 0, "reset": 0, "protected": 0}

    print("\n" + "=" * 75)
    print("ROYAL LIBAS - SAMPLE PRODUCT METADATA RESET AUDIT" + (" (DRY RUN)" if not confirm else " (EXECUTION)"))
    print("=" * 75)

    eligible_updates = []
    protected_count = 0
    missing_count = 0

    for pdata in REAL_PRODUCTS_DATA:
        slug = pdata["slug"]
        product = db.query(Product).filter(Product.slug == slug).first()
        if not product:
            missing_count += 1
            continue

        # PROTECTION CHECK:
        # 1. Has any attached images or videos (Cloudinary, local, or external)
        has_media = len(product.images) > 0

        # 2. Has customized client data or active business inventory
        sample_variant_skus = {v["sku"] for v in pdata["variants"]}
        has_active_stock = any(v.stock > 0 for v in product.variants)
        has_custom_variants = (
            len(product.variants) != len(pdata["variants"])
            or any(v.sku not in sample_variant_skus for v in product.variants)
        )

        # Check if product attributes have been customized by the client (e.g. renamed or moved category)
        is_customized_text = (
            product.name != pdata["name"]
            or (product.category and product.category != pdata["category"])
        )

        if has_media or has_active_stock or has_custom_variants or is_customized_text:
            reason_parts = []
            if has_media:
                reason_parts.append(f"{len(product.images)} attached media asset(s)")
            if has_active_stock:
                total_stock = sum(v.stock for v in product.variants)
                reason_parts.append(f"active inventory (total stock: {total_stock})")
            if has_custom_variants:
                reason_parts.append("customized variants/SKUs")
            if is_customized_text:
                reason_parts.append("client customized details (name/fabric/category)")

            reasons = ", ".join(reason_parts)
            print(f"  [!] PROTECTED: '{product.name}' (ID: {product.id}, slug: {product.slug})")
            print(f"      Reason: Contains {reasons}. Reset is SKIPPED to protect client data.")
            protected_count += 1
            continue

        # Product is an unmodified sample placeholder. Inspect field differences:
        field_diffs = []
        if product.name != pdata["name"]:
            field_diffs.append(("name", product.name, pdata["name"]))
        if product.description != pdata["description"]:
            field_diffs.append(("description", f"{product.description[:30]}..." if product.description else "None", f"{pdata['description'][:30]}..."))
        if product.fabric != pdata["fabric"]:
            field_diffs.append(("fabric", product.fabric, pdata["fabric"]))
        if product.care != pdata["care"]:
            field_diffs.append(("care", product.care, pdata["care"]))
        if product.category != pdata["category"]:
            field_diffs.append(("category", product.category, pdata["category"]))

        if field_diffs:
            eligible_updates.append((product, pdata, field_diffs))
            print(f"  [*] CANDIDATE: '{product.name}' (ID: {product.id}, slug: {product.slug})")
            for field, old_val, new_val in field_diffs:
                print(f"      • {field}: '{old_val}' -> '{new_val}'")
        else:
            print(f"  [-] IN SYNC: '{product.name}' (ID: {product.id}, slug: {product.slug}) already matches seed metadata.")

    print("\nAudit Summary:")
    print(f"  • Total sample candidates checked: {len(REAL_PRODUCTS_DATA)}")
    print(f"  • Protected client/active records: {protected_count}")
    print(f"  • Eligible for metadata reset:     {len(eligible_updates)}")
    print(f"  • Missing from database:           {missing_count}")

    if not eligible_updates:
        print("\nNo eligible sample products require metadata reset.")
        return {"status": "noop", "eligible": 0, "reset": 0, "protected": protected_count}

    if not confirm:
        print("\n" + "=" * 75)
        print("DRY-RUN COMPLETE: 0 database records were modified.")
        print(f"To execute these {len(eligible_updates)} metadata update(s), re-run with:")
        print("  python seed.py --reset-sample-data --confirm")
        print("=" * 75 + "\n")
        return {"status": "dry_run", "eligible": len(eligible_updates), "reset": 0, "protected": protected_count}

    # Execute changes with confirmation
    for product, pdata, diffs in eligible_updates:
        product.name = pdata["name"]
        product.description = pdata["description"]
        product.fabric = pdata["fabric"]
        product.care = pdata["care"]
        product.size_chart = SIZE_CHART_CM
        product.category = pdata["category"]

    db.commit()
    print(f"\n[+] SUCCESS: Successfully updated metadata for {len(eligible_updates)} sample product(s).\n")
    return {"status": "executed", "eligible": len(eligible_updates), "reset": len(eligible_updates), "protected": protected_count}


def seed_database(session_factory=None, allow_production_sample_seed: bool = False, default_status: str = "DRAFT"):
    """Seed collections, coupons, and sample catalog products safely and non-destructively.

    SAFETY RULES:
    1. Environment check runs FIRST. In production environments, routine seeding is strictly blocked.
    2. Routine seeding is completely non-destructive: it NEVER resets, overwrites, or deletes products.
    3. Existing collections and coupons are preserved without overwriting existing values.
    4. Existing products (matching slug or ID) are 100% preserved: details, variants, stock, and media are untouched.
    5. Newly created sample products default to status='DRAFT', is_active=False, and stock=0, ensuring they never appear to customers.
    6. Destructive resets require explicit separate actions that first display affected records and require confirmation.
    """
    factory = session_factory or SessionLocal
    db = factory()
    try:
        print("Starting Royal Libas Catalogue Seed Process...")

        # 1. Production Environment Guard: check BEFORE any data operations
        if is_production_environment() and not allow_production_sample_seed:
            print("\n[SAFETY GUARD] Production database detected.")
            print("  Routine sample product seeding is BLOCKED in production to protect real client products and business data.")
            print("  Only base collections and essential coupons were verified. Skipping sample product insertion.\n")
            db.commit()
            return

        # 2. Seed or verify collections (non-destructive)
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
                print(f"  [*] Preserved existing collection: {col.name}")
            collections_map[cdata["slug"]] = col

        # 3. Seed or verify coupons (non-destructive)
        for cpdata in COUPONS_DATA:
            coupon = db.query(Coupon).filter(Coupon.code == cpdata["code"]).first()
            if not coupon:
                coupon = Coupon(
                    code=cpdata["code"],
                    type=cpdata["type"],
                    value=cpdata["value"],
                    min_order_value=cpdata["min_order_value"],
                    is_active=cpdata["is_active"],
                )
                db.add(coupon)
                db.flush()
                print(f"  [+] Created coupon: {coupon.code}")
            else:
                print(f"  [*] Preserved existing coupon: {coupon.code}")

        # 4. Safe Sample Product Seeding (Routine: NEVER overwrite existing products or variants, NEVER delete images)
        real_designs_count = db.query(Product).filter(Product.source_folder.like("Photos for royal libas/%")).count()
        if real_designs_count > 0:
            print(f"  [*] Real boutique catalogue detected ({real_designs_count} designs found with source_folder). Skipping sample product insertion.")
            db.commit()
            return
        created_count = 0
        preserved_count = 0

        for pdata in REAL_PRODUCTS_DATA:
            product = db.query(Product).filter(Product.slug == pdata["slug"]).first()
            if product:
                preserved_count += 1
                continue

            # Insert brand new sample product as DRAFT with 0 stock (completely hidden from customers)
            product = Product(
                name=pdata["name"],
                slug=pdata["slug"],
                description=pdata["description"],
                fabric=pdata["fabric"],
                care=pdata["care"],
                size_chart=SIZE_CHART_CM,
                category=pdata["category"],
                status="DRAFT",
                is_bestseller=pdata.get("is_bestseller", False),
                is_active=False,
            )
            db.add(product)
            db.flush()

            # Associate collections
            target_cols = [collections_map[cslug] for cslug in pdata["collections"] if cslug in collections_map]
            product.collections = target_cols

            # Add initial variants with 0 stock
            for vdata in pdata["variants"]:
                variant = ProductVariant(
                    product_id=product.id,
                    size=vdata["size"],
                    colour=vdata["colour"],
                    sku=vdata["sku"],
                    mrp=vdata["mrp"],
                    selling_price=vdata["selling_price"],
                    stock=0,  # Zero test stock for newly seeded draft products
                )
                db.add(variant)

            # Images are intentionally empty: ProductPlaceholder renders until Tanya uploads real photos
            created_count += 1
            print(f"  [+] Created draft sample product: {product.name} (slug: {product.slug})")

        db.commit()
        print(f"Catalogue seed summary: {created_count} created (DRAFT), {preserved_count} preserved untouched, 0 reset.")
    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        raise e
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Royal Libas Safe Catalogue Seeder & Maintenance Utility")
    parser.add_argument(
        "--clean-dummy-products",
        action="store_true",
        help="Inspect and optionally clean products with 'dummy' in slug or name. (Runs in dry-run mode unless --confirm is provided)",
    )
    parser.add_argument(
        "--reset-sample-data",
        "--force-reset-sample-data",
        action="store_true",
        dest="reset_sample_data",
        help="Explicitly review and reset sample product metadata. (Default is DRY RUN listing all changes. Requires --confirm to execute. Products with client data, real stock, or media are always protected.)",
    )
    parser.add_argument(
        "--allow-production-sample-seed",
        action="store_true",
        help="Override production safety guard to permit seeding sample products into a production DB.",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Explicitly confirm execution of maintenance actions (--clean-dummy-products, --reset-sample-data). Without this flag, maintenance utilities run in dry-run mode.",
    )
    args = parser.parse_args()

    if args.clean_dummy_products:
        db = SessionLocal()
        try:
            clean_dummy_products(db, confirm=args.confirm)
        finally:
            db.close()
        return

    if args.reset_sample_data:
        db = SessionLocal()
        try:
            reset_sample_products(db, confirm=args.confirm, allow_production=args.allow_production_sample_seed)
        finally:
            db.close()
        return

    seed_database(
        allow_production_sample_seed=args.allow_production_sample_seed,
    )


if __name__ == "__main__":
    main()
