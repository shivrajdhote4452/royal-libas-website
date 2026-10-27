#!/usr/bin/env python3
"""Generate 64 sample boutique product photos
for the 16 Royal Libas sample products across 4 views: front, back, detail, worn.
"""

import os
from PIL import Image, ImageEnhance, ImageFilter

INPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "images", "products")
OUTPUT_DIR = INPUT_DIR

# Master source images already created:
# maroon_front.jpg, maroon_back.jpg, maroon_detail.jpg, maroon_worn.jpg
# ivory_front.jpg, ivory_back.jpg, ivory_detail.jpg, ivory_worn.jpg
# emerald_front.jpg

PRODUCTS_CONFIG = [
    # 1. Maroon Festive Kurti Set
    {"key": "noorani_maroon", "base": "maroon", "tint": (1.0, 1.0, 1.0), "warmth": 1.0},
    # 2. Chandni Raat Modal Silk Co-ord
    {"key": "chandni_ivory", "base": "ivory", "tint": (1.0, 1.0, 1.0), "warmth": 1.0},
    # 3. Zari Mahal Velvet Anarkali Suit
    {"key": "zari_mahal_emerald", "base": "emerald", "tint": (1.0, 1.0, 1.0), "warmth": 1.0},
    # 4. Gulabi Rooh Handblock Cotton Set
    {"key": "gulabi_rooh_rose", "base": "maroon", "tint": (1.1, 0.85, 0.95), "warmth": 1.1},
    # 5. Sitara Tissue Silk Kurti Set (Champagne Gold)
    {"key": "sitara_gold", "base": "ivory", "tint": (1.1, 1.05, 0.85), "warmth": 1.15},
    # 6. Bagicha Muslin Tiered Angrakha (Sage Green)
    {"key": "bagicha_sage", "base": "emerald", "tint": (0.85, 1.1, 0.9), "warmth": 0.95},
    # 7. Mehtab Georgette Gharara Suit (Midnight Navy)
    {"key": "mehtab_navy", "base": "maroon", "tint": (0.7, 0.8, 1.2), "warmth": 0.85},
    # 8. Roza Pure Mulmul Everyday Co-ord (Powder Blue)
    {"key": "roza_powder_blue", "base": "ivory", "tint": (0.9, 0.95, 1.15), "warmth": 0.9},
    # 9. Afreen Organza Embroidered Suit (Peach Bloom)
    {"key": "afreen_peach", "base": "maroon", "tint": (1.15, 0.9, 0.85), "warmth": 1.1},
    # 10. Dastaan Raw Silk Straight Kurti Set (Deep Wine)
    {"key": "dastaan_wine", "base": "maroon", "tint": (0.9, 0.7, 0.85), "warmth": 0.95},
    # 11. Firdaus Chanderi Peplum & Sharara (Mustard Ochre)
    {"key": "firdaus_ochre", "base": "ivory", "tint": (1.2, 1.05, 0.75), "warmth": 1.2},
    # 12. Ruhaniyat Handwoven Cotton Kurti Set (Terracotta Rust)
    {"key": "ruhaniyat_rust", "base": "maroon", "tint": (1.15, 0.8, 0.7), "warmth": 1.1},
    # 13. Subah Pintuck Everyday Co-ord (Lilac Frost)
    {"key": "subah_lilac", "base": "ivory", "tint": (1.05, 0.95, 1.15), "warmth": 0.95},
    # 14. Nazm Silk Blend Tunic (Emerald Jewel)
    {"key": "nazm_emerald", "base": "emerald", "tint": (0.95, 1.05, 1.0), "warmth": 1.0},
    # 15. Ishqiyya Chiffon Printed Kurti Set (Sea Green)
    {"key": "ishqiyya_sea_green", "base": "emerald", "tint": (0.8, 1.15, 1.05), "warmth": 0.95},
    # 16. Riwayat Brocade Festive Kurti (Royal Plum)
    {"key": "riwayat_plum", "base": "maroon", "tint": (0.95, 0.75, 1.05), "warmth": 0.95},
]


def apply_color_grading(img: Image.Image, tint=(1.0, 1.0, 1.0), warmth=1.0) -> Image.Image:
    """Apply gentle editorial grading to distinguish pieces while preserving realism."""
    if tint == (1.0, 1.0, 1.0) and warmth == 1.0:
        return img.copy()

    # Convert to RGB
    img_rgb = img.convert("RGB")
    r, g, b = img_rgb.split()

    r = r.point(lambda i: min(255, int(i * tint[0])))
    g = g.point(lambda i: min(255, int(i * tint[1])))
    b = b.point(lambda i: min(255, int(i * tint[2])))

    graded = Image.merge("RGB", (r, g, b))
    if warmth != 1.0:
        enhancer = ImageEnhance.Color(graded)
        graded = enhancer.enhance(warmth)
    return graded


def create_views(base_name: str, target_key: str, tint, warmth):
    """Generate front, back, detail, and worn images for target_key."""
    views = ["front", "back", "detail", "worn"]
    for view in views:
        src_path = os.path.join(INPUT_DIR, f"{base_name}_{view}.jpg")
        # If specific view doesn't exist for emerald, fallback to front with smart crop
        if not os.path.exists(src_path):
            fallback_path = os.path.join(INPUT_DIR, f"{base_name}_front.jpg")
            with Image.open(fallback_path) as base_img:
                w, h = base_img.size
                if view == "detail":
                    # Zoom into neckline & embroidery
                    cropped = base_img.crop((int(w * 0.25), int(h * 0.15), int(w * 0.75), int(h * 0.55)))
                elif view == "back":
                    # Upper torso silhouette crop
                    cropped = base_img.crop((int(w * 0.15), int(h * 0.1), int(w * 0.85), int(h * 0.8)))
                elif view == "worn":
                    # Full look crop
                    cropped = base_img.crop((0, int(h * 0.05), w, int(h * 0.95)))
                else:
                    cropped = base_img.copy()

                dest_img = apply_color_grading(cropped, tint, warmth)
                dest_path = os.path.join(OUTPUT_DIR, f"{target_key}_{view}.jpg")
                dest_img.save(dest_path, "JPEG", quality=90, optimize=True)
                print(f"  [+] Generated derived view: {target_key}_{view}.jpg")
                continue

        with Image.open(src_path) as src_img:
            dest_img = apply_color_grading(src_img, tint, warmth)
            dest_path = os.path.join(OUTPUT_DIR, f"{target_key}_{view}.jpg")
            dest_img.save(dest_path, "JPEG", quality=90, optimize=True)
            print(f"  [+] Created {target_key}_{view}.jpg")


def main():
    print(f"Generating 64 sample product photos in {OUTPUT_DIR}...")
    for cfg in PRODUCTS_CONFIG:
        create_views(cfg["base"], cfg["key"], cfg["tint"], cfg["warmth"])
    print("Done! All 64 boutique photos generated successfully.")


if __name__ == "__main__":
    main()
