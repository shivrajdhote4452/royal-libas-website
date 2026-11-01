"""
Idempotent, non-destructive restoration script for boutique reviews.
Safely repairs damaged review records without overwriting newer owner edits.
Default mode: DRY RUN (no writes unless --apply is explicitly specified).
"""
import os
import sys
import json
import argparse
from datetime import datetime

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models import StoreSetting


def restore_reviews(
    db_session=None,
    apply: bool = False,
    backup_file_path: str = None,
    backup_output_dir: str = None,
):
    """
    Idempotent, non-destructive review restoration.
    - Matches by stable record ID.
    - Never overwrites newer owner text, ratings, or custom edits.
    - Repairs cleanup-damaged records (source='unverified_sample').
    - Restores missing baseline records.
    - Preserves all newer owner reviews.
    - Never populates or modifies boutique_gallery_json or unrelated settings.
    - Creates a pre-apply backup before writing.
    """
    should_close_db = False
    if db_session is None:
        db_session = SessionLocal()
        should_close_db = True

    try:
        if not backup_file_path:
            backup_file_path = os.path.join(
                backend_dir, "backups", "settings_reviews_backup_20261101_121149.json"
            )

        if not os.path.exists(backup_file_path):
            raise FileNotFoundError(f"Review backup file not found: {backup_file_path}")

        with open(backup_file_path, "r", encoding="utf-8") as f:
            backup_data = json.load(f)

        backup_reviews = json.loads(backup_data.get("boutique_reviews_json") or "[]")
        backup_rev_map = {r["id"]: r for r in backup_reviews if r.get("id")}

        setting = db_session.query(StoreSetting).first()
        if not setting:
            print("[Warning] No StoreSetting record found in database.")
            return {"applied": False, "status": "no_settings"}

        current_reviews = []
        if setting.boutique_reviews_json:
            try:
                current_reviews = json.loads(setting.boutique_reviews_json)
            except Exception as e:
                print(f"[Warning] Failed to parse existing reviews: {e}")
                current_reviews = []

        current_rev_map = {r.get("id"): r for r in current_reviews if r.get("id")}

        added_count = 0
        repaired_count = 0
        preserved_count = 0
        final_reviews = []

        # 1. Process records present in the recovery backup
        for r_id, b_rev in backup_rev_map.items():
            if r_id in current_rev_map:
                cur = current_rev_map[r_id]
                # Check if this record was damaged by the cleanup script
                is_damaged = (
                    cur.get("source") == "unverified_sample"
                    or (cur.get("is_published") is False and not cur.get("owner_approved") and not cur.get("is_verified"))
                )

                if is_damaged:
                    # Repair provenance and approval, but PRESERVE any custom owner text/rating
                    repaired = dict(cur)
                    repaired["source"] = "google"
                    repaired["owner_approved"] = True
                    # Restore publication if rating is eligible (>= 4)
                    if Number_or_float(cur.get("rating", b_rev.get("rating", 5))) >= 4:
                        repaired["is_published"] = True
                    # Ensure valid source_url
                    if not repaired.get("source_url"):
                        repaired["source_url"] = b_rev.get("source_url") or "https://share.google/rdahckZ4nVz7Bgu2H"
                    final_reviews.append(repaired)
                    repaired_count += 1
                else:
                    # Record is healthy and already active; preserve owner's state completely
                    final_reviews.append(cur)
                    preserved_count += 1
            else:
                # Record is completely missing from database; restore it from backup
                new_rev = {
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
                    "sort_order": b_rev.get("sort_order", len(final_reviews)),
                }
                final_reviews.append(new_rev)
                added_count += 1

        # 2. Retain all newer owner-created reviews not in the backup
        for r in current_reviews:
            r_id = r.get("id")
            if r_id and r_id not in backup_rev_map:
                final_reviews.append(r)
                preserved_count += 1

        final_reviews.sort(key=lambda x: x.get("sort_order", 0))

        # Report planned changes
        print("=== Royal Libas Review Restoration Report ===")
        print(f"Mode: {'APPLY (Database Write)' if apply else 'DRY RUN (Preview Only)'}")
        print(f"  - Missing records restored: {added_count}")
        print(f"  - Cleanup-damaged records repaired: {repaired_count}")
        print(f"  - Healthy / owner-edited records preserved: {preserved_count}")
        print(f"  - Total reviews in target state: {len(final_reviews)}")

        # Safety Check: Never alter gallery or unrelated settings
        print("  - Gallery modification: SKIPPED (Intentionally empty or custom galleries preserved)")

        if apply:
            # 3. Create pre-apply backup before writing
            out_dir = backup_output_dir or os.path.join(backend_dir, "backups")
            os.makedirs(out_dir, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            pre_apply_backup = os.path.join(out_dir, f"settings_pre_apply_backup_{ts}.json")

            backup_snapshot = {
                "timestamp": ts,
                "setting_id": setting.id,
                "boutique_reviews_json": setting.boutique_reviews_json,
                "boutique_reviews_visible": setting.boutique_reviews_visible,
                "boutique_gallery_json": setting.boutique_gallery_json,
            }
            with open(pre_apply_backup, "w", encoding="utf-8") as f:
                json.dump(backup_snapshot, f, indent=2)
            print(f"  - Pre-apply backup saved to: {pre_apply_backup}")

            setting.boutique_reviews_json = json.dumps(final_reviews)
            setting.boutique_reviews_visible = True
            db_session.commit()
            db_session.refresh(setting)
            print("[Success] Changes successfully persisted to database.")
        else:
            print("[Notice] Dry run complete. No database modifications were made. Pass --apply to persist.")

        return {
            "applied": apply,
            "added": added_count,
            "repaired": repaired_count,
            "preserved": preserved_count,
            "total": len(final_reviews),
            "reviews": final_reviews,
        }
    finally:
        if should_close_db:
            db_session.close()


def Number_or_float(val):
    try:
        return float(val)
    except Exception:
        return 0.0


def main():
    parser = argparse.ArgumentParser(
        description="Safe, idempotent restoration of boutique review records."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply changes to the database. If omitted, runs in safe preview (dry-run) mode.",
    )
    parser.add_argument(
        "--backup-file",
        type=str,
        default=None,
        help="Path to recovery backup JSON file.",
    )
    args = parser.parse_args()

    restore_reviews(apply=args.apply, backup_file_path=args.backup_file)


if __name__ == "__main__":
    main()
