r"""Royal Libas Media Cleanup & Old Folder Reconciliation Maintenance Tool

Safety Mandates:
- Defaults to DRY-RUN PREVIEW mode. Makes zero changes unless --confirm is explicitly passed.
- Never called automatically by routine import, sync, or app startup.
- Protects intentional empty folders (e.g. Designer Wear/2, Lehenga, etc.).
- Never deletes any folder that contains assets, subfolders, or references.
- Does NOT permanently delete Cloudinary assets.
- Provides explicit old-to-new folder mappings.
- Reconciles remote Cloudinary empty folders upon confirmation to prevent sync reappearance.
"""
import os
import sys
import json
from typing import Dict, Any, List, Tuple, Optional
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.abspath("backend"))

from app.database import SessionLocal
from app.models import MediaAsset, MediaFolder, Product, ProductImage, StoreSetting
from app.services.cloudinary_service import (
    init_cloudinary,
    is_cloudinary_configured,
    list_cloudinary_folders,
    delete_cloudinary_folder,
)
from app.services.media_usage_service import get_asset_usage_references

# Known 25 obsolete numbered/combination folders and their target named equivalents
OBSOLETE_FOLDER_MAPPINGS = {
    "Photos for royal libas/Heavy Dress/Designer Wear/1": "Photos for royal libas/Heavy Dress/Designer Wear/01 - Gulnaar Ruby Red Designer Set",
    "Photos for royal libas/Heavy Dress/Designer Wear/3": "Photos for royal libas/Heavy Dress/Designer Wear/03 - Meher Purple Designer Suit",
    "Photos for royal libas/Heavy Dress/Designer Wear/4": "Photos for royal libas/Heavy Dress/Designer Wear/04 - Meher Teal Designer Suit",
    "Photos for royal libas/Heavy Dress/Designer Wear/5": "Photos for royal libas/Heavy Dress/Designer Wear/05 - Meher Rani Pink Designer Suit",
    "Photos for royal libas/Heavy Dress/Designer Wear/Combination": "Photos for royal libas/Heavy Dress/Designer Wear/Combination Photos",
    "Photos for royal libas/Heavy Dress/Palazzo Set/3": "Photos for royal libas/Heavy Dress/Palazzo Set/03 - Zumurrud Emerald Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/4": "Photos for royal libas/Heavy Dress/Palazzo Set/04 - Gulabo Fuchsia Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/5": "Photos for royal libas/Heavy Dress/Palazzo Set/05 - Mehrun Blush Pink Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/6": "Photos for royal libas/Heavy Dress/Palazzo Set/06 - Mehtab Sage Green Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/7": "Photos for royal libas/Heavy Dress/Palazzo Set/07 - Aabha Champagne Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/Plazoo 1": "Photos for royal libas/Heavy Dress/Palazzo Set/01 - Sunehri Mustard Palazzo Set",
    "Photos for royal libas/Heavy Dress/Palazzo Set/Plazoo Set 2": "Photos for royal libas/Heavy Dress/Palazzo Set/02 - Riwayat Wine Palazzo Set",
    "Photos for royal libas/Suit Set/Party Wear/1": "Photos for royal libas/Suit Set/Party Wear/01 - Gulbahar Champagne Floral Party Set",
    "Photos for royal libas/Suit Set/Party Wear/2": "Photos for royal libas/Suit Set/Party Wear/02 - Noor Ivory Floral Party Set",
    "Photos for royal libas/Suit Set/Semi-party Wear/1": "Photos for royal libas/Suit Set/Semi-party Wear/01 - Nazakat Wine Festive Suit",
    "Photos for royal libas/Suit Set/Semi-party Wear/2": "Photos for royal libas/Suit Set/Semi-party Wear/02 - Shabnam Navy Embellished Suit",
    "Photos for royal libas/Suit Set/Semi-party Wear/3": "Photos for royal libas/Suit Set/Semi-party Wear/03 - Rangrez Coral Floral Cape Set",
    "Photos for royal libas/Suit Set/Semi-party Wear/4": "Photos for royal libas/Suit Set/Semi-party Wear/04 - Rangrez Golden Beige Floral Cape Set",
    "Photos for royal libas/Suit Set/Semi-party Wear/5": "Photos for royal libas/Suit Set/Semi-party Wear/05 - Rangrez Pink Floral Cape Set",
    "Photos for royal libas/Suit Set/Semi-party Wear/6": "Photos for royal libas/Suit Set/Semi-party Wear/06 - Rangrez Navy Floral Cape Set",
    "Photos for royal libas/Suit Set/Semi-party Wear/Combination": "Photos for royal libas/Suit Set/Semi-party Wear/Combination Photos",
    "Photos for royal libas/Suit Set/Three Pieces/1": "Photos for royal libas/Suit Set/Three Pieces/01 - Bahaar Lime Green Three-Piece Suit",
    "Photos for royal libas/Suit Set/Three Pieces/2": "Photos for royal libas/Suit Set/Three Pieces/02 - Adaa Black Stripe Three-Piece Suit",
    "Photos for royal libas/Suit Set/Three Pieces/3": "Photos for royal libas/Suit Set/Three Pieces/03 - Aafreen Beige Botanical Three-Piece Suit",
    "Photos for royal libas/Suit Set/Three Pieces/combination mix photo": "Photos for royal libas/Suit Set/Three Pieces/Combination Photos",
}

# Strictly PROTECTED empty boutique folders that must NEVER be deleted
PROTECTED_EMPTY_FOLDERS = {
    "Photos for royal libas/Heavy Dress/Designer Wear/2",
    "Photos for royal libas/Heavy Dress/Lehenga",
    "Photos for royal libas/Heavy Dress/Sharara Gharara",
    "Photos for royal libas/Heavy Dress/Short Kurta",
    "Photos for royal libas/Two Pieces/Co-ord Sets",
    "Photos for royal libas/Two Pieces/Kurta Pant",
}


def audit_cleanup_candidates(db: Session) -> Dict[str, Any]:
    """Inspect and compile a detailed audit of obsolete folders and sample assets."""
    # 1. Audit Folders
    all_folders = db.query(MediaFolder).all()
    obsolete_folder_candidates = []
    protected_folders = []

    for f in all_folders:
        if f.path in PROTECTED_EMPTY_FOLDERS:
            protected_folders.append({
                "path": f.path,
                "name": f.name,
                "reason": "Intentional empty boutique category or collection folder",
            })
            continue

        if f.path in OBSOLETE_FOLDER_MAPPINGS:
            asset_count = db.query(MediaAsset).filter(MediaAsset.folder == f.path).count()
            subfolder_count = db.query(MediaFolder).filter(MediaFolder.parent_path == f.path).count()
            target_mapping = OBSOLETE_FOLDER_MAPPINGS[f.path]
            
            is_safe = (asset_count == 0 and subfolder_count == 0)
            obsolete_folder_candidates.append({
                "id": f.id,
                "path": f.path,
                "name": f.name,
                "asset_count": asset_count,
                "subfolder_count": subfolder_count,
                "target_named_folder": target_mapping,
                "is_safe_to_reconcile": is_safe,
            })

    # 2. Audit Sample Media Assets
    sample_assets = db.query(MediaAsset).filter(
        (MediaAsset.folder.like("samples%")) | (MediaAsset.public_id.like("samples/%"))
    ).all()

    sample_candidates = []
    for sa in sample_assets:
        prod_usages, editorial_usages = get_asset_usage_references(sa, db)
        prod_names = [p["name"] for p in prod_usages]
        sample_candidates.append({
            "id": sa.id,
            "filename": sa.filename,
            "public_id": sa.public_id,
            "folder": sa.folder,
            "width": sa.width,
            "height": sa.height,
            "format": sa.format,
            "url": sa.url,
            "used_in_products": prod_names,
            "product_usages": prod_usages,
            "used_editorial": editorial_usages,
            "is_in_use": bool(prod_usages or editorial_usages),
            "recommendation": "Preserve in Cloudinary; hide from boutique view via hide_samples toggle",
        })

    return {
        "obsolete_folders": obsolete_folder_candidates,
        "protected_empty_folders": protected_folders,
        "sample_assets": sample_candidates,
    }


def run_cleanup_maintenance(
    dry_run: bool = True,
    remove_remote_folders: bool = False,
    db_session: Optional[Session] = None,
) -> Dict[str, Any]:
    print("=" * 65)
    print(">>> ROYAL LIBAS MEDIA CLEANUP & RECONCILIATION AUDIT <<<")
    print(f"Mode: {'DRY-RUN PREVIEW (No changes)' if dry_run else 'EXECUTION (Confirmed by Owner)'}")
    print(f"Remote Deletion: {'ENABLED' if remove_remote_folders else 'LOCAL-ONLY RECONCILIATION'}")
    print("=" * 65)

    db = db_session or SessionLocal()
    close_db = db_session is None
    init_cloudinary()

    audit = audit_cleanup_candidates(db)
    obsolete_folders = audit["obsolete_folders"]
    protected_folders = audit["protected_empty_folders"]
    sample_assets = audit["sample_assets"]

    print(f"\n[1] Protected Intentional Empty Folders ({len(protected_folders)}):")
    for pf in protected_folders:
        print(f"  [PROTECTED] {pf['path']} -> {pf['reason']}")

    print(f"\n[2] Obsolete Old Numbered / Combination Folders ({len(obsolete_folders)}):")
    safe_to_reconcile = [f for f in obsolete_folders if f["is_safe_to_reconcile"]]
    unsafe = [f for f in obsolete_folders if not f["is_safe_to_reconcile"]]

    for f in obsolete_folders:
        status_tag = "[SAFE]" if f["is_safe_to_reconcile"] else "[UNSAFE - HAS ASSETS/SUBFOLDERS]"
        print(f"  {status_tag} {f['path']}")
        print(f"         Mapped to: {f['target_named_folder']}")
        print(f"         Assets: {f['asset_count']} | Subfolders: {f['subfolder_count']}")

    print(f"\n[3] Cloudinary Sample Assets Outside Curated Import ({len(sample_assets)}):")
    for sa in sample_assets:
        use_str = "IN USE" if sa["is_in_use"] else "Unused"
        print(f"  - ID {sa['id']}: {sa['public_id']} ({sa['width']}x{sa['height']} {sa['format']}) [{use_str}]")
        print(f"    Action: {sa['recommendation']}")

    reconciled_local_folders = 0
    reconciled_remote_folders = 0
    remote_folder_errors = []
    folder_outcomes = []

    if not dry_run:
        print("\n[Step 4] Executing Obsolete Empty Folder Reconciliation...")
        for sf in safe_to_reconcile:
            db_folder = db.query(MediaFolder).filter(MediaFolder.id == sf["id"]).first()
            if not db_folder:
                continue

            folder_path = db_folder.path
            remote_success = False

            if remove_remote_folders:
                if is_cloudinary_configured():
                    c_del = delete_cloudinary_folder(folder_path)
                    if not c_del.get("success"):
                        # Remote deletion failed: PRESERVE local record and record failure
                        err_msg = c_del.get("error", "Cloudinary remote folder deletion failed")
                        remote_folder_errors.append({
                            "folder": folder_path,
                            "error": err_msg,
                            "status": "remote_deletion_failed",
                        })
                        folder_outcomes.append({
                            "folder": folder_path,
                            "local_deleted": False,
                            "remote_deleted": False,
                            "status": "remote_failed_local_preserved",
                            "error": err_msg,
                        })
                        print(f"    [REMOTE FAILED - LOCAL PRESERVED] Could not delete remote folder {folder_path}: {err_msg}")
                        continue
                    else:
                        remote_success = True
                        reconciled_remote_folders += 1
                        print(f"    [REMOTE OK] Deleted remote empty folder in Cloudinary: {folder_path}")

            # Reconcile local DB record (either after remote success, or during local-only reconciliation)
            try:
                db.delete(db_folder)
                db.commit()
                reconciled_local_folders += 1
                folder_outcomes.append({
                    "folder": folder_path,
                    "local_deleted": True,
                    "remote_deleted": remote_success,
                    "status": "reconciled_successfully",
                })
                print(f"  - Removed local folder record: {folder_path}")
            except Exception as db_del_err:
                db.rollback()
                err_msg = str(db_del_err)
                remote_folder_errors.append({
                    "folder": folder_path,
                    "error": err_msg,
                    "status": "recoverable_reconciliation_needed",
                    "remote_deleted": remote_success,
                })
                folder_outcomes.append({
                    "folder": folder_path,
                    "local_deleted": False,
                    "remote_deleted": remote_success,
                    "status": "recoverable_db_failure",
                    "error": err_msg,
                })
                print(f"  [DB ERROR - RECOVERABLE] Remote deleted={remote_success} but local DB delete failed for {folder_path}: {err_msg}")

        print(f"\nReconciliation complete: {reconciled_local_folders} local DB records removed.")
        if remove_remote_folders:
            print(f"Remote Cloudinary empty folders cleaned: {reconciled_remote_folders} (Errors: {len(remote_folder_errors)})")
    else:
        print("\n" + "=" * 65)
        print("PREVIEW COMPLETE: 0 database records and 0 remote assets were modified.")
        print("To execute this safe reconciliation, run with: python backend/scripts/media_cleanup_maintenance.py --confirm")
        print("=" * 65)

    if close_db:
        db.close()

    if dry_run:
        overall_status = "preview_only"
    elif not remote_folder_errors:
        overall_status = "success"
    elif reconciled_local_folders > 0 or reconciled_remote_folders > 0:
        overall_status = "partial_failure"
    else:
        overall_status = "failed"

    return {
        "status": overall_status,
        "dry_run": dry_run,
        "protected_folders_count": len(protected_folders),
        "total_obsolete_candidates": len(obsolete_folders),
        "safe_to_reconcile_count": len(safe_to_reconcile),
        "unsafe_count": len(unsafe),
        "sample_assets_count": len(sample_assets),
        "reconciled_local_folders": reconciled_local_folders,
        "reconciled_remote_folders": reconciled_remote_folders,
        "remote_folder_errors": remote_folder_errors,
        "folder_outcomes": folder_outcomes,
        "obsolete_mappings": OBSOLETE_FOLDER_MAPPINGS,
    }


if __name__ == "__main__":
    confirm = "--confirm" in sys.argv
    clean_remote = "--clean-remote" in sys.argv or "--confirm" in sys.argv
    run_cleanup_maintenance(dry_run=not confirm, remove_remote_folders=clean_remote)
