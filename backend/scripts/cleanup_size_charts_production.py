"""Production-Safe Size Charts Audit & Targeted Cleanup Tool.

CRITICAL ARCHITECTURAL SAFEGUARDS:
1. AUDIT BY DEFAULT: Running without explicit arguments performs a comprehensive read-only audit.
   It NEVER deletes records based on matching names or values alone. Matching values do not prove test data.
2. EXPLICIT REVIEW REQUIRED: Deletion strictly requires BOTH --chart-ids <id1> [id2 ...] AND --confirm.
   Unreviewed or unlisted charts are always preserved.
3. TRANSACTIONAL PRODUCT REFERENCE CHECK: Inside the database transaction, every requested chart ID
   is checked against the products table. If ANY product references the chart (size_chart_id == id),
   the entire operation is immediately aborted and rolled back.
4. BACKUP PRE-REQUISITE: Fresh verified backup must be taken prior to running on production.

PostgreSQL Production Backup & Restore Test Instructions:
---------------------------------------------------------
Step 1: Take fresh binary backup on VPS host:
    pg_dump -U <user> -h <host> -d royal_libas_prod -Fc -f "/var/backups/royal_libas_pre_sizechart_$(date +%Y%m%d_%H%M%S).dump"

Step 2: Test restore on an isolated disposable test database:
    createdb -U <user> -h <host> royal_libas_test_restore
    pg_restore -U <user> -h <host> -d royal_libas_test_restore "/var/backups/royal_libas_pre_sizechart_*.dump"

Step 3: Run audit on the restored test database first:
    DATABASE_URL="postgresql://<user>:<pw>@<host>/royal_libas_test_restore" python cleanup_size_charts_production.py

Step 4: Execute targeted cleanup on restored test database to verify:
    DATABASE_URL="postgresql://<user>:<pw>@<host>/royal_libas_test_restore" python cleanup_size_charts_production.py --chart-ids <ids> --confirm
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
    """Perform a read-only audit of all size charts and their product references."""
    rows = conn.execute(text("""
        SELECT id, name, category, measurements, created_at, updated_at 
        FROM size_charts 
        ORDER BY id ASC
    """)).fetchall()

    logger.info(f"Total size charts found in database: {len(rows)}")

    clusters = {}
    chart_records = []

    for r in rows:
        cid, name, category, measurements, created_at, updated_at = r
        linked_prods = conn.execute(
            text("SELECT id, name, slug FROM products WHERE size_chart_id = :id ORDER BY id ASC"),
            {"id": cid}
        ).fetchall()

        parsed_rows = None
        try:
            parsed_rows = json.loads(measurements)
        except Exception:
            pass

        record = {
            "id": cid,
            "name": name,
            "category": category or "Uncategorized",
            "linked_count": len(linked_prods),
            "linked_products": [{"id": p[0], "name": p[1], "slug": p[2]} for p in linked_prods],
            "created_at": str(created_at),
            "updated_at": str(updated_at),
            "sizes": [row.get("size") for row in parsed_rows] if isinstance(parsed_rows, list) else None,
            "measurements_raw": measurements,
        }
        chart_records.append(record)

        key = (name.strip(), (category or "").strip(), measurements.strip())
        clusters.setdefault(key, []).append(record)

    return chart_records, clusters


def print_audit_report(chart_records, clusters):
    print("\n" + "=" * 78)
    print(">>> ROYAL LIBAS SIZE CHARTS AUDIT REPORT <<<")
    print("=" * 78)
    print(f"Total charts in database: {len(chart_records)}")
    print(f"Distinct measurement clusters: {len(clusters)}")
    print("-" * 78)

    for record in chart_records:
        status_tag = f"LINKED ({record['linked_count']} products)" if record["linked_count"] > 0 else "UNLINKED (0 products)"
        print(f"ID {record['id']:<4} | {record['name']:<40} | Cat: {record['category']:<12} | {status_tag}")
        if record["linked_products"]:
            for lp in record["linked_products"]:
                print(f"       -> Linked Product: [ID {lp['id']}] {lp['name']} ({lp['slug']})")

    # Report clusters with duplicates
    duplicate_clusters = [g for g in clusters.values() if len(g) > 1]
    print("\n" + "-" * 78)
    print(f"Duplicate / Identical Measurement Clusters Found: {len(duplicate_clusters)}")
    print("-" * 78)
    if duplicate_clusters:
        for idx, group in enumerate(duplicate_clusters, 1):
            print(f"Cluster #{idx}: \"{group[0]['name']}\" ({len(group)} charts with identical values)")
            for c in group:
                print(f"   - Chart ID {c['id']}: Created {c['created_at']}, Linked Products: {c['linked_count']}")
    else:
        print("No identical measurement clusters found.")

    print("=" * 78)
    print("SAFETY NOTICE:")
    print("1. Automatic deletion based on matching values is DISABLED to protect business data.")
    print("2. To delete confirmed test records, you MUST specify the reviewed IDs:")
    print("   python cleanup_size_charts_production.py --chart-ids <id1> <id2> ... --confirm")
    print("=" * 78 + "\n")


def execute_targeted_cleanup(chart_ids_to_delete, confirm: bool, engine_to_use=None):
    """Execute targeted deletion of explicitly reviewed size chart IDs with full transactional safety."""
    if not chart_ids_to_delete:
        logger.error("No chart IDs specified. Provide --chart-ids <id1> <id2> ...")
        return False

    if not confirm:
        logger.warning(f"DRY-RUN: Chart IDs {chart_ids_to_delete} requested for cleanup, but --confirm was not passed.")
        logger.warning("No changes made. To execute, append --confirm.")
        return False

    active_engine = engine_to_use or engine
    with active_engine.begin() as conn:
        logger.info(f"Beginning atomic transaction to clean up chart IDs: {chart_ids_to_delete}")

        # Step 1: Validate every single requested ID inside the transaction
        for cid in chart_ids_to_delete:
            row = conn.execute(
                text("SELECT id, name FROM size_charts WHERE id = :id"),
                {"id": cid}
            ).fetchone()

            if not row:
                raise ValueError(f"ABORT: Size chart ID {cid} does not exist in database. Aborting transaction.")

            # Step 2: Check product references
            ref_count = conn.execute(
                text("SELECT count(*) FROM products WHERE size_chart_id = :id"),
                {"id": cid}
            ).scalar()

            if ref_count > 0:
                raise ValueError(
                    f"CRITICAL SAFETY ABORT: Size chart ID {cid} ('{row[1]}') is linked to {ref_count} product(s)! "
                    "Cannot delete. Transaction rolled back with ZERO changes."
                )

        # Step 3: All requested IDs confirmed unlinked. Execute delete.
        placeholders = ", ".join(str(i) for i in chart_ids_to_delete)
        res = conn.execute(text(f"DELETE FROM size_charts WHERE id IN ({placeholders})"))
        logger.info(f"TRANSACTION COMMITTED: Successfully deleted {res.rowcount} size chart records: {chart_ids_to_delete}")
        return True


def main():
    parser = argparse.ArgumentParser(description="Audit and targeted cleanup for size charts.")
    parser.add_argument(
        "--chart-ids",
        nargs="+",
        type=int,
        help="Explicit list of chart IDs to clean up after review (e.g. --chart-ids 2 3 4).",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Confirm execution of deletion for the specified --chart-ids.",
    )
    args = parser.parse_args()

    # Always perform read-only audit first
    with engine.connect() as conn:
        chart_records, clusters = audit_size_charts(conn)
        print_audit_report(chart_records, clusters)

    if args.chart_ids:
        execute_targeted_cleanup(args.chart_ids, confirm=args.confirm)
    elif args.confirm:
        logger.error(
            "REJECTED: --confirm was passed without --chart-ids. "
            "Automated bulk deletion without an explicit reviewed list of IDs is strictly prohibited."
        )


if __name__ == "__main__":
    main()
