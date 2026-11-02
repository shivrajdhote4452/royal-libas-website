"""Targeted Safe Cleanup Script for Duplicate Size Charts (Production & Staging).

Safety Rules:
1. Defaults to --dry-run. Will never delete records unless --confirm is explicitly passed.
2. Inspects all size charts and their associated products.
3. NEVER deletes any chart linked to one or more products.
4. Identifies duplicate unlinked charts with identical names and measurements created by repeat test runs.
5. Retains the original/earliest chart (lowest ID) as an unverified template.
6. Operates inside an explicit database transaction; rolls back completely on any unexpected error.

PostgreSQL Production Backup Instruction (Run before --confirm):
    pg_dump -U <user> -h <host> -d <dbname> -Fc -f "royal_libas_backup_$(date +%Y%m%d_%H%M%S).dump"
"""

import argparse
import json
import logging
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.database import engine
from sqlalchemy import text

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cleanup_size_charts")


def audit_size_charts(conn):
    """Inspect all size charts and report product references and duplicates."""
    rows = conn.execute(text("""
        SELECT id, name, category, measurements, created_at 
        FROM size_charts 
        ORDER BY id ASC
    """)).fetchall()

    logger.info(f"Total size charts found: {len(rows)}")
    
    charts_by_key = {}
    chart_info = []

    for r in rows:
        cid, name, category, measurements, created_at = r
        linked_count = conn.execute(
            text("SELECT count(*) FROM products WHERE size_chart_id = :id"),
            {"id": cid}
        ).scalar()
        
        info = {
            "id": cid,
            "name": name,
            "category": category,
            "linked_products": linked_count,
            "created_at": str(created_at),
            "measurements_raw": measurements,
        }
        chart_info.append(info)

        key = (name.strip(), category or "", measurements.strip())
        charts_by_key.setdefault(key, []).append(info)

    duplicates_to_remove = []
    charts_to_keep = []

    for key, group in charts_by_key.items():
        # Keep the lowest ID (earliest record)
        keep = group[0]
        charts_to_keep.append(keep)
        for dup in group[1:]:
            if dup["linked_products"] == 0:
                duplicates_to_remove.append(dup)
            else:
                logger.warning(
                    f"Duplicate chart ID {dup['id']} ('{dup['name']}') is linked to {dup['linked_products']} products! "
                    "It will NOT be deleted."
                )
                charts_to_keep.append(dup)

    return chart_info, charts_to_keep, duplicates_to_remove


def run_cleanup(dry_run: bool = True, confirm: bool = False):
    logger.info(f"Starting size charts audit (dry_run={dry_run}, confirm={confirm})...")

    with engine.begin() as conn:
        all_charts, to_keep, duplicates = audit_size_charts(conn)

        print("\n" + "=" * 60)
        print(">>> SIZE CHARTS AUDIT SUMMARY <<<")
        print("=" * 60)
        print(f"Total charts in database: {len(all_charts)}")
        print(f"Charts to retain:         {len(to_keep)}")
        print(f"Duplicates to remove:     {len(duplicates)}")
        print("=" * 60)

        for c in to_keep:
            print(f"  [KEEP] ID {c['id']}: \"{c['name']}\" (Category: {c['category']}, Linked: {c['linked_products']})")

        for d in duplicates:
            print(f"  [DELETE CANDIDATE] ID {d['id']}: \"{d['name']}\" (Category: {d['category']}, Linked: {d['linked_products']})")
        print("=" * 60 + "\n")

        if dry_run or not confirm:
            logger.info("DRY-RUN COMPLETE: No changes were made to the database.")
            logger.info("To execute cleanup, run with: python cleanup_size_charts_production.py --confirm")
            return

        if not duplicates:
            logger.info("No unlinked duplicate charts found. Nothing to clean.")
            return

        dup_ids = [d["id"] for d in duplicates]
        placeholders = ", ".join(str(i) for i in dup_ids)
        res = conn.execute(text(f"DELETE FROM size_charts WHERE id IN ({placeholders})"))
        logger.info(f"SUCCESS: Deleted {res.rowcount} duplicate size chart rows.")

        # Final verification
        remaining = conn.execute(text("SELECT count(*) FROM size_charts")).scalar()
        logger.info(f"Remaining size charts in database: {remaining}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Safely inspect and clean up duplicate size charts.")
    parser.add_argument("--confirm", action="store_true", help="Confirm execution of deletion (dry-run without this).")
    args = parser.parse_args()

    run_cleanup(dry_run=not args.confirm, confirm=args.confirm)
