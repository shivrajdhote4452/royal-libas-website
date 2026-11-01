import os
import sys
import json

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models import StoreSetting

def restore():
    backup_file = os.path.join(backend_dir, "backups", "settings_reviews_backup_20261101_121149.json")
    with open(backup_file, "r", encoding="utf-8") as f:
        backup_data = json.load(f)

    backup_reviews = json.loads(backup_data.get("boutique_reviews_json") or "[]")
    backup_rev_map = {r["id"]: r for r in backup_reviews}

    db = SessionLocal()
    try:
        setting = db.query(StoreSetting).first()
        if not setting:
            print("No StoreSetting found!")
            return

        current_reviews = []
        if setting.boutique_reviews_json:
            try:
                current_reviews = json.loads(setting.boutique_reviews_json)
            except Exception:
                current_reviews = []

        current_rev_map = {r.get("id"): r for r in current_reviews}

        restored_reviews = []
        for r_id, b_rev in backup_rev_map.items():
            restored = {
                "id": b_rev["id"],
                "author_name": b_rev["author_name"],
                "rating": b_rev["rating"],
                "review_text": b_rev["review_text"],
                "review_date": b_rev.get("review_date"),
                "source": "google",
                "source_url": b_rev.get("source_url") or "https://share.google/rdahckZ4nVz7Bgu2H",
                "is_verified": False,
                "owner_approved": True,
                "verified_date": None,
                "is_published": True,
                "sort_order": b_rev.get("sort_order", len(restored_reviews)),
            }
            restored_reviews.append(restored)

        # Retain any newer owner-added reviews
        for r in current_reviews:
            r_id = r.get("id")
            if r_id and r_id not in backup_rev_map:
                restored_reviews.append(r)

        restored_reviews.sort(key=lambda x: x.get("sort_order", 0))

        setting.boutique_reviews_json = json.dumps(restored_reviews)
        setting.boutique_reviews_visible = True
        setting.boutique_section_visible = True

        # Populate showcase gallery photos if empty
        current_gallery = json.loads(setting.boutique_gallery_json or "[]")
        if not current_gallery:
            showcase_gallery = [
                {"id": "b-craft-1", "url": "/images/editorial/brand_story_hero.jpg", "caption": "Royal Libas Boutique Atelier"},
                {"id": "b-craft-2", "url": "/images/editorial/brand_craft_1.jpg", "caption": "Handcrafted Zardozi Details"},
                {"id": "b-craft-3", "url": "/images/editorial/brand_craft_2.jpg", "caption": "Artisanal Weaving & Silks"},
                {"id": "b-craft-4", "url": "/images/editorial/brand_craft_3.jpg", "caption": "Bespoke Tailoring & Styling"},
            ]
            setting.boutique_gallery_json = json.dumps(showcase_gallery)

        db.commit()
        db.refresh(setting)

        print("[Success] Targeted restoration complete.")
        print(f"  - boutique_reviews_visible: {setting.boutique_reviews_visible}")
        print(f"  - boutique_section_visible: {setting.boutique_section_visible}")
        print(f"  - Restored reviews count: {len(restored_reviews)}")
        for r in restored_reviews:
            print(f"    * {r['id']}: {r['author_name']} ({r['rating']} stars, is_published={r['is_published']}, owner_approved={r.get('owner_approved')})")
        print(f"  - Gallery photos count: {len(json.loads(setting.boutique_gallery_json))}")
    finally:
        db.close()

if __name__ == "__main__":
    restore()
