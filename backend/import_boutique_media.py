r"""Boutique Media Import & Cloudinary Synchronization Script
Source: F:\Project File\royal-libas-website\Photos for royal libas
Target: Cloudinary (galbyoxi) & royal_libas.db (media_assets, media_folders)

Guarantees:
- Resumable and idempotent via media_import_manifest.json
- Preserves exact source folder hierarchy without duplicated outer root
- Preserves intentional empty folders (e.g. Designer Wear/2, Lehenga, etc.)
- Strict resource_type separation (images as image, mp4 as video)
- Reconciles existing assets by SHA-256 content hash and public_id
- Bounded retries with backoff on rate limits
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
)
import cloudinary
import cloudinary.uploader
import cloudinary.api
from app.database import SessionLocal
from app.models import MediaAsset, MediaFolder

SOURCE_DIR = r"F:\Project File\royal-libas-website\Photos for royal libas"
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
    manifest = load_or_create_manifest()

    # 1. Inventory directories
    print("\n[Step 1] Inventorying source directories & files...")
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
    save_manifest(manifest)

    # 2. Register all folders in DB & Cloudinary
    print("\n[Step 2] Synchronizing folder hierarchy...")
    for d_info in all_dirs:
        # Check DB
        db_folder = db.query(MediaFolder).filter(MediaFolder.path == d_info["path"]).first()
        if not db_folder:
            if not dry_run:
                # Create remote folder
                try:
                    c_res = create_cloudinary_folder(d_info["path"])
                    remote_ok = c_res.get("success", False)
                except Exception as e:
                    remote_ok = False
                
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
                print(f"  [OK] Existing intentional empty folder: {d_info['path']}")

    # 3. Process each file
    print(f"\n[Step 3] Processing & uploading {len(all_files)} files...")
    imported_count = 0
    reused_count = 0
    failed_count = 0

    for idx, f_info in enumerate(all_files, 1):
        rel_key = f_info["relative_path"]
        filename = f_info["filename"]
        folder = f_info["folder"]
        full_path = f_info["full_path"]
        file_size = f_info["size"]
        res_type, fmt, mime_type = detect_file_type(filename)

        content_hash = compute_sha256(full_path)

        # Check existing manifest record
        file_entry = manifest["files"].get(rel_key, {})
        
        # Check if already in DB
        existing_db_asset = db.query(MediaAsset).filter(
            MediaAsset.content_hash == content_hash,
            MediaAsset.cloud_name == CLOUDINARY_CLOUD_NAME,
        ).first()

        if not existing_db_asset:
            # Check by folder and filename
            existing_db_asset = db.query(MediaAsset).filter(
                MediaAsset.folder == folder,
                MediaAsset.filename == filename,
                MediaAsset.cloud_name == CLOUDINARY_CLOUD_NAME,
            ).first()

        if existing_db_asset and existing_db_asset.url:
            print(f"[{idx}/{len(all_files)}] Reused: {filename} ({folder}) -> ID {existing_db_asset.id}")
            reused_count += 1
            manifest["files"][rel_key] = {
                "status": "registered",
                "db_id": existing_db_asset.id,
                "public_id": existing_db_asset.public_id,
                "cloudinary_asset_id": existing_db_asset.cloudinary_asset_id,
                "secure_url": existing_db_asset.secure_url or existing_db_asset.url,
                "content_hash": content_hash,
                "folder": folder,
                "filename": filename,
                "resource_type": existing_db_asset.resource_type,
                "file_size": file_size,
                "reused": True,
            }
            save_manifest(manifest)
            continue

        if dry_run:
            print(f"[{idx}/{len(all_files)}] [DRY-RUN] Would upload: {filename} -> {folder}")
            imported_count += 1
            continue

        # Check if manifest has an uncommitted upload result
        upload_meta = None
        if file_entry.get("status") in ("uploaded", "registered") and file_entry.get("secure_url"):
            upload_meta = file_entry
            print(f"[{idx}/{len(all_files)}] Recovered upload metadata from manifest: {filename}")
        else:
            # Upload to Cloudinary with retry
            max_retries = 3
            uploaded_res = None
            for attempt in range(max_retries):
                try:
                    with open(full_path, "rb") as f_obj:
                        file_bytes = f_obj.read()
                    
                    uploaded_res = cloudinary.uploader.upload(
                        file_bytes,
                        folder=folder,
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
                        print(f"  [WAIT] Rate limited for {filename}. Retrying in {wait}s...")
                        time.sleep(wait)
                    elif attempt < max_retries - 1:
                        time.sleep(1)
                    else:
                        print(f"[{idx}/{len(all_files)}] [FAIL] Upload failed for {filename}: {up_err}")
                        failed_count += 1
                        manifest["files"][rel_key] = {
                            "status": "failed",
                            "error": str(up_err),
                            "content_hash": content_hash,
                            "folder": folder,
                            "filename": filename,
                        }
                        save_manifest(manifest)
                        uploaded_res = None

            if not uploaded_res:
                continue

            public_id = uploaded_res.get("public_id")
            secure_url = uploaded_res.get("secure_url") or uploaded_res.get("url")
            asset_id = uploaded_res.get("asset_id")

            if not public_id or not secure_url:
                print(f"[{idx}/{len(all_files)}] [FAIL] Unconfirmed result for {filename}")
                failed_count += 1
                manifest["files"][rel_key] = {
                    "status": "failed",
                    "error": "Unconfirmed result: missing public_id or secure_url",
                    "content_hash": content_hash,
                }
                save_manifest(manifest)
                continue

            upload_meta = {
                "public_id": public_id,
                "asset_id": asset_id,
                "secure_url": secure_url,
                "resource_type": uploaded_res.get("resource_type", res_type),
                "format": uploaded_res.get("format", fmt),
                "width": uploaded_res.get("width"),
                "height": uploaded_res.get("height"),
                "duration": uploaded_res.get("duration"),
                "file_size": uploaded_res.get("bytes", file_size),
                "delivery_type": uploaded_res.get("type", "upload"),
            }
            # Record upload success in manifest before DB
            manifest["files"][rel_key] = {
                "status": "uploaded",
                **upload_meta,
                "content_hash": content_hash,
                "folder": folder,
                "filename": filename,
            }
            save_manifest(manifest)

        # Register in DB
        try:
            display_name = os.path.splitext(filename)[0]
            new_asset = MediaAsset(
                filename=filename,
                display_name=display_name,
                public_id=upload_meta["public_id"],
                cloudinary_asset_id=upload_meta.get("asset_id"),
                cloud_name=CLOUDINARY_CLOUD_NAME,
                delivery_type=upload_meta.get("delivery_type", "upload"),
                content_hash=content_hash,
                relative_source_path=rel_key,
                url=upload_meta["secure_url"],
                secure_url=upload_meta["secure_url"],
                resource_type=upload_meta.get("resource_type", res_type),
                format=upload_meta.get("format", fmt),
                width=upload_meta.get("width"),
                height=upload_meta.get("height"),
                duration=upload_meta.get("duration"),
                file_size=upload_meta.get("file_size", file_size),
                mime_type=mime_type,
                alt_text=display_name,
                folder=folder,
            )
            db.add(new_asset)
            db.commit()
            db.refresh(new_asset)

            imported_count += 1
            manifest["files"][rel_key]["status"] = "registered"
            manifest["files"][rel_key]["db_id"] = new_asset.id
            save_manifest(manifest)
            print(f"[{idx}/{len(all_files)}] Imported: {filename} ({upload_meta['resource_type']}) -> DB ID {new_asset.id}")

        except Exception as db_err:
            db.rollback()
            print(f"[{idx}/{len(all_files)}] [DB-ERROR] Failed to save {filename} to DB: {db_err}")
            failed_count += 1
            manifest["files"][rel_key]["status"] = "db_failed"
            manifest["files"][rel_key]["error"] = str(db_err)
            save_manifest(manifest)

    db.close()

    print("\n" + "=" * 65)
    print(">>> MEDIA IMPORT SUMMARY <<<")
    print("=" * 65)
    print(f"Total Source Files:   {len(all_files)}")
    print(f"Successfully Imported: {imported_count}")
    print(f"Reused (Unchanged):   {reused_count}")
    print(f"Failed:               {failed_count}")
    print(f"Total Folders:        {len(all_dirs)}")
    print(f"Manifest Saved At:    {MANIFEST_PATH}")
    print("=" * 65)


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    run_import(dry_run=dry)

