"""
Targeted cleanup script for built-in sample boutique reviews.
Backs up store settings before applying targeted modifications.
Unpublishes unverified sample records and preserves all other settings.
"""
import os
import sys
import json
from datetime import datetime

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models import StoreSetting

SAMPLE_AUTHORS = {
    "Pooja Agarwal",
    "Neha Sengar",
    "Shalini Verma",
    "Ananya Dixit",
    "Ritu Bundela",
}

def perform_cleanup():
    db = SessionLocal()
    try:
        setting = db.query(StoreSetting).first()
        if not setting:
            print("No StoreSetting record found.")
            return

        # 1. Back up settings
        backup_dir = os.path.join(backend_dir, "backups")
        os.makedirs(backup_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = os.path.join(backup_dir, f"settings_reviews_backup_{timestamp}.json")

        backup_data = {
            "timestamp": timestamp,
            "setting_id": setting.id,
            "boutique_reviews_json": setting.boutique_reviews_json,
            "boutique_reviews_visible": setting.boutique_reviews_visible,
            "boutique_name": setting.boutique_name,
            "boutique_address": setting.boutique_address,
            "boutique_phone": setting.boutique_phone,
            "boutique_whatsapp": setting.boutique_whatsapp,
            "boutique_opening_hours": setting.boutique_opening_hours,
            "boutique_weekly_holiday": setting.boutique_weekly_holiday,
            "boutique_special_notice": setting.boutique_special_notice,
            "boutique_embed_url": setting.boutique_embed_url,
            "boutique_directions_url": setting.boutique_directions_url,
            "boutique_reviews_url": setting.boutique_reviews_url,
            "boutique_main_image": setting.boutique_main_image,
            "boutique_gallery_json": setting.boutique_gallery_json,
            "boutique_section_visible": setting.boutique_section_visible,
        }

        with open(backup_file, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, indent=2)
        print(f"[Backup] Successfully saved backup to: {backup_file}")

        # 2. Inspect and target sample records
        current_reviews = []
        if setting.boutique_reviews_json:
            try:
                current_reviews = json.loads(setting.boutique_reviews_json)
            except Exception as e:
                print(f"[Error] Failed to parse existing reviews: {e}")
                current_reviews = []

        unverified_count = 0
        preserved_count = 0
        cleaned_reviews = []

        for r in current_reviews:
            author = r.get("author_name", "").strip()
            # If matches one of the sample built-in authors
            if author in SAMPLE_AUTHORS:
                r["is_published"] = False
                r["is_verified"] = False
                r["verified_date"] = None
                r["source"] = "unverified_sample"
                unverified_count += 1
            else:
                # Retain owner custom review
                preserved_count += 1
            cleaned_reviews.append(r)

        setting.boutique_reviews_json = json.dumps(cleaned_reviews)
        # Ensure section is hidden until owner provides verified Google reviews
        setting.boutique_reviews_visible = False

        db.commit()
        db.refresh(setting)
        print(f"[Success] Targeted review cleanup complete.")
        print(f"  - Built-in sample reviews unpublished/unverified: {unverified_count}")
        print(f"  - Other records preserved: {preserved_count}")
        print(f"  - boutique_reviews_visible set to: {setting.boutique_reviews_visible}")
        print(f"  - Backup stored at: {backup_file}")
    finally:
        db.close()

if __name__ == "__main__":
    perform_cleanup()

