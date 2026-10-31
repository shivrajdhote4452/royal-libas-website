r"""Boutique Media Import & Cloudinary Synchronization Script
Source: F:\Project File\royal-libas-website\royal-libas-website\Photos for royal libas
Target: Cloudinary (galbyoxi) & royal_libas.db (media_assets, media_folders)

Guarantees:
- Resumable and idempotent via media_import_manifest.json
- Preserves exact source folder hierarchy without duplicated outer root
- Preserves intentional empty folders (e.g. Designer Wear/2, Lehenga, etc.)
- Strict resource_type separation (images as image, mp4 as video)
- Reconciles existing assets by SHA-256 content hash and public_id
- Updates Cloudinary asset_folder dynamically without re-uploading
- Safely removes superseded non-boutique assets from previous test runs
- Never modifies local source files
"""
import os
import sys
import time
import json
import hashlib
from typing import Dict, Any, List, Optional
from datetime import datetime

sys.path.insert(0, os.path.abspath("backend"))

from app.config import (
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    is_cloudinary_configured,
)
from app.services.cloudinary_service import (
    init_cloudinary,
    create_cloudinary_folder,
    detect_cloudinary_folder_mode,
    move_cloudinary_asset_folder,
)
import cloudinary
import cloudinary.uploader
import cloudinary.api
from app.database import SessionLocal
from app.models import MediaAsset, MediaFolder

SOURCE_DIR = r"F:\Project File\royal-libas-website\royal-libas-website\Photos for royal libas"
MANIFEST_PATH = os.path.abspath("backend/media_import_manifest.json")
ROOT_FOLDER_NAME = "Photos for royal libas"


def compute_sha256(filepath: str) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def detect_file_type(filename: str) -> tuple[str, str, str]:
    """Return (resource_type, format, mime_type)."""
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    if ext == "mp4":
        return "video", "mp4", "video/mp4"
    elif ext in ("jpg", "jpeg"):
        return "image", "jpg", "image/jpeg"
    elif ext == "png":
        return "image", "png", "image/png"
    elif ext == "webp":
        return "image", "webp", "image/webp"
    else:
        return "image", ext, "application/octet-stream"


def load_or_create_manifest() -> Dict[str, Any]:
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[WARN] Failed to load existing manifest ({e}), starting fresh.")
    return {
        "source_dir": SOURCE_DIR,
        "cloud_name": CLOUDINARY_CLOUD_NAME,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "total_files": 0,
        "folders": [],
        "files": {},
    }


def save_manifest(manifest: Dict[str, Any]):
    manifest["updated_at"] = datetime.now().isoformat()
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)


def run_import(dry_run: bool = False):
    print("=" * 65)
    print(">>> ROYAL LIBAS BOUTIQUE MEDIA IMPORT <<<")
    print(f"Source Directory: {SOURCE_DIR}")
    print("=" * 65)

    if not os.path.exists(SOURCE_DIR):
        print(f"[ERROR] Source directory does not exist: {SOURCE_DIR}")
        sys.exit(1)

    init_cloudinary()
    if not is_cloudinary_configured():
        print("[ERROR] Cloudinary credentials not configured!")
        sys.exit(1)

    print(f"Cloud Name: {CLOUDINARY_CLOUD_NAME}")
    mode = detect_cloudinary_folder_mode()
    print(f"Cloudinary Folder Mode: {mode}")

    # Test Cloudinary API ping
    try:
        ping = cloudinary.api.ping()
        print(f"Cloudinary API Ping: {ping.get('status')}")
    except Exception as e:
        print(f"[ERROR] Failed to reach Cloudinary API: {e}")
        sys.exit(1)

    db = SessionLocal()
    manifest = {
        "source_dir": SOURCE_DIR,
        "cloud_name": CLOUDINARY_CLOUD_NAME,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "total_files": 0,
        "folders": [],
        "files": {},
    }

    # 1. Inventory directories & files from the curated folder
    print("\n[Step 1] Inventorying curated source directories & files...")
    all_dirs = []
    all_files = []

    for root, dirs, files in os.walk(SOURCE_DIR):
        rel_dir = os.path.relpath(root, SOURCE_DIR).replace("\\", "/")
        if rel_dir == ".":
            target_folder = ROOT_FOLDER_NAME
            parent_folder = None
        else:
            target_folder = f"{ROOT_FOLDER_NAME}/{rel_dir}"
            parts = rel_dir.rsplit("/", 1)
            parent_folder = ROOT_FOLDER_NAME if len(parts) == 1 else f"{ROOT_FOLDER_NAME}/{parts[0]}"
        
        dir_name = os.path.basename(root) if rel_dir != "." else ROOT_FOLDER_NAME
        all_dirs.append({
            "name": dir_name,
            "path": target_folder,
            "parent_path": parent_folder,
            "is_empty": len(files) == 0 and len(dirs) == 0,
        })

        for f in files:
            full_path = os.path.join(root, f)
            rel_file = os.path.relpath(full_path, SOURCE_DIR).replace("\\", "/")
            all_files.append({
                "filename": f,
                "full_path": full_path,
                "relative_path": rel_file,
                "folder": target_folder,
                "size": os.path.getsize(full_path),
            })

    print(f"Discovered {len(all_dirs)} directories and {len(all_files)} media files.")
    manifest["total_files"] = len(all_files)
    manifest["folders"] = [d["path"] for d in all_dirs]
    valid_folder_paths = set(d["path"] for d in all_dirs)

    # 2. Register all folders in DB & Cloudinary
    print("\n[Step 2] Synchronizing boutique folder hierarchy...")
    for d_info in all_dirs:
        db_folder = db.query(MediaFolder).filter(MediaFolder.path == d_info["path"]).first()
        if not db_folder:
            if not dry_run:
                try:
                    create_cloudinary_folder(d_info["path"])
                except Exception as e:
                    pass
                
                db_folder = MediaFolder(
                    name=d_info["name"],
                    path=d_info["path"],
                    parent_path=d_info["parent_path"],
                )
                db.add(db_folder)
                db.commit()
                status_note = "[EMPTY FOLDER PRESERVED]" if d_info["is_empty"] else ""
                print(f"  + Created folder: {d_info['path']} {status_note}")
        else:
            if d_info["is_empty"]:
                print(f"  [OK] Preserved empty folder: {d_info['path']}")

    # 3. Process each file: reconcile by SHA-256 hash
    print(f"\n[Step 3] Reconciling and organizing {len(all_files)} boutique media files...")
    reorganized_count = 0
    imported_count = 0
    failed_count = 0
    curated_db_ids = set()

    for idx, f_info in enumerate(all_files, 1):
        rel_key = f_info["relative_path"]
        filename = f_info["filename"]
        target_folder = f_info["folder"]
        full_path = f_info["full_path"]
        file_size = f_info["size"]
        res_type, fmt, mime_type = detect_file_type(filename)
        content_hash = compute_sha256(full_path)

        # Look up existing asset by hash
        existing_db_asset = db.query(MediaAsset).filter(
            MediaAsset.content_hash == content_hash,
            MediaAsset.cloud_name == CLOUDINARY_CLOUD_NAME,
        ).first()

        if existing_db_asset:
            curated_db_ids.add(existing_db_asset.id)
            need_folder_move = existing_db_asset.folder != target_folder
            
            if need_folder_move and not dry_run:
                # Move in Cloudinary
                move_res = move_cloudinary_asset_folder(
                    existing_db_asset.public_id,
                    target_folder,
                    resource_type=existing_db_asset.resource_type,
                )
                if not move_res.get("success", False):
                    print(f"  [WARN] Failed to move Cloudinary asset folder for {existing_db_asset.public_id}: {move_res.get('error')}")

            if not dry_run:
                existing_db_asset.folder = target_folder
                existing_db_asset.relative_source_path = rel_key
                existing_db_asset.filename = filename
                existing_db_asset.display_name = os.path.splitext(filename)[0]
                existing_db_asset.alt_text = os.path.splitext(filename)[0]
                existing_db_asset.delivery_type = "upload"
                db.commit()

            reorganized_count += 1
            print(f"[{idx}/{len(all_files)}] [OK] Reconciled: {filename} -> {target_folder}")

            manifest["files"][rel_key] = {
                "status": "registered",
                "db_id": existing_db_asset.id,
                "public_id": existing_db_asset.public_id,
                "cloudinary_asset_id": existing_db_asset.cloudinary_asset_id,
                "secure_url": existing_db_asset.secure_url or existing_db_asset.url,
                "content_hash": content_hash,
                "folder": target_folder,
                "filename": filename,
                "resource_type": existing_db_asset.resource_type,
                "file_size": file_size,
                "relative_source_path": rel_key,
                "reused": True,
            }
        else:
            # Need fresh upload
            if dry_run:
                print(f"[{idx}/{len(all_files)}] [DRY-RUN] Would upload: {filename} -> {target_folder}")
                imported_count += 1
                continue

            print(f"[{idx}/{len(all_files)}] Uploading new file: {filename} -> {target_folder}")
            max_retries = 3
            uploaded_res = None
            for attempt in range(max_retries):
                try:
                    with open(full_path, "rb") as f_obj:
                        file_bytes = f_obj.read()
                    
                    uploaded_res = cloudinary.uploader.upload(
                        file_bytes,
                        folder=target_folder,
                        resource_type=res_type,
                        overwrite=False,
                        unique_filename=True,
                        use_filename=True,
                    )
                    break
                except Exception as up_err:
                    err_str = str(up_err).lower()
                    if "429" in err_str or "rate limit" in err_str:
                        wait = 2 ** attempt + 1
                        time.sleep(wait)
                    elif attempt < max_retries - 1:
                        time.sleep(1)
                    else:
                        print(f"[{idx}/{len(all_files)}] [FAIL] Upload failed for {filename}: {up_err}")
                        failed_count += 1
                        uploaded_res = None

            if not uploaded_res:
                continue

            public_id = uploaded_res.get("public_id")
            secure_url = uploaded_res.get("secure_url") or uploaded_res.get("url")
            asset_id = uploaded_res.get("asset_id")

            display_name = os.path.splitext(filename)[0]
            new_asset = MediaAsset(
                filename=filename,
                display_name=display_name,
                public_id=public_id,
                cloudinary_asset_id=asset_id,
                cloud_name=CLOUDINARY_CLOUD_NAME,
                delivery_type="upload",
                content_hash=content_hash,
                relative_source_path=rel_key,
                url=secure_url,
                secure_url=secure_url,
                resource_type=res_type,
                format=uploaded_res.get("format", fmt),
                width=uploaded_res.get("width"),
                height=uploaded_res.get("height"),
                duration=uploaded_res.get("duration"),
                file_size=uploaded_res.get("bytes", file_size),
                mime_type=mime_type,
                alt_text=display_name,
                folder=target_folder,
            )
            db.add(new_asset)
            db.commit()
            db.refresh(new_asset)
            curated_db_ids.add(new_asset.id)
            imported_count += 1

            manifest["files"][rel_key] = {
                "status": "registered",
                "db_id": new_asset.id,
                "public_id": public_id,
                "cloudinary_asset_id": asset_id,
                "secure_url": secure_url,
                "content_hash": content_hash,
                "folder": target_folder,
                "filename": filename,
                "resource_type": res_type,
                "file_size": file_size,
                "relative_source_path": rel_key,
            }

    # 4. Clean up superseded non-curated assets from the previous unedited import
    print("\n[Step 4] Cleaning up superseded non-boutique assets from previous runs...")
    other_assets = db.query(MediaAsset).filter(
        MediaAsset.cloud_name == CLOUDINARY_CLOUD_NAME,
        MediaAsset.folder.like(f"{ROOT_FOLDER_NAME}%"),
        ~MediaAsset.id.in_(curated_db_ids),
    ).all()

    print(f"Found {len(other_assets)} superseded assets to clean up.")
    for a in other_assets:
        if not dry_run:
            try:
                cloudinary.uploader.destroy(a.public_id, resource_type=a.resource_type)
            except Exception as e:
                print(f"  [WARN] Could not destroy remote asset {a.public_id}: {e}")
            db.delete(a)
            print(f"  - Removed superseded asset: ID {a.id} ({a.public_id})")
    
    if not dry_run:
        db.commit()

    # 5. Clean up old obsolete folders from DB (e.g. numbered folders like Designer Wear/1, etc.)
    print("\n[Step 5] Cleaning up obsolete folder records...")
    db_folders = db.query(MediaFolder).filter(MediaFolder.path.like(f"{ROOT_FOLDER_NAME}%")).all()
    obsolete_folders = [f for f in db_folders if f.path not in valid_folder_paths]
    print(f"Found {len(obsolete_folders)} obsolete folder records to remove.")
    for of in obsolete_folders:
        if not dry_run:
            db.delete(of)
            print(f"  - Removed obsolete folder record: {of.path}")
    
    if not dry_run:
        db.commit()

    db.close()
    save_manifest(manifest)

    print("\n" + "=" * 65)
    print(">>> MEDIA IMPORT & REORGANIZATION COMPLETE <<<")
    print("=" * 65)
    print(f"Source Folder:        {SOURCE_DIR}")
    print(f"Total Source Files:   {len(all_files)}")
    print(f"Reorganized/Reconciled: {reorganized_count}")
    print(f"New Uploads:          {imported_count}")
    print(f"Failures:             {failed_count}")
    print(f"Boutique Folders:     {len(all_dirs)}")
    print(f"Purged Superseded:    {len(other_assets)}")
    print(f"Purged Obsolete Dirs: {len(obsolete_folders)}")
    print(f"Manifest Saved At:    {MANIFEST_PATH}")
    print("=" * 65)


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    run_import(dry_run=dry)
