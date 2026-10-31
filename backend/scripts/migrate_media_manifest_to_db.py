"""PostgreSQL / Target Database Media Manifest Migration Script
Re-creates media folders and media asset records from media_import_manifest.json
into any configured SQLAlchemy database (e.g. Neon PostgreSQL or SQLite)
WITHOUT re-uploading a single file to Cloudinary.
"""
import os
import sys
import json

sys.path.insert(0, os.path.abspath("backend"))

from app.database import SessionLocal, engine, Base
from app.models import MediaAsset, MediaFolder

MANIFEST_PATH = os.path.abspath("backend/media_import_manifest.json")


def migrate_manifest_to_db():
    print("=" * 65)
    print(">>> MIGRATING MEDIA MANIFEST TO ACTIVE DATABASE <<<")
    print(f"Target Database URL: {engine.url.render_as_string(hide_password=True)}")
    print("=" * 65)

    if not os.path.exists(MANIFEST_PATH):
        print(f"[ERROR] Manifest file not found: {MANIFEST_PATH}")
        sys.exit(1)

    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    db = SessionLocal()

    # 1. Migrate folders
    print(f"[Step 1] Migrating {len(manifest.get('folders', []))} folders...")
    folders_created = 0
    folders_existing = 0

    # Ensure root container
    for f_path in manifest.get("folders", []):
        existing = db.query(MediaFolder).filter(MediaFolder.path == f_path).first()
        if not existing:
            parts = f_path.rsplit("/", 1)
            name = parts[-1]
            parent = parts[0] if len(parts) > 1 else None
            mf = MediaFolder(name=name, path=f_path, parent_path=parent)
            db.add(mf)
            folders_created += 1
        else:
            folders_existing += 1
    db.commit()
    print(f"  Folders: {folders_created} created, {folders_existing} already present.")

    # 2. Migrate assets
    print(f"[Step 2] Migrating {len(manifest.get('files', {}))} media assets...")
    assets_created = 0
    assets_reused = 0

    cloud_name = manifest.get("cloud_name", "galbyoxi")

    for rel_path, item in manifest.get("files", {}).items():
        if item.get("status") not in ("uploaded", "registered") or not item.get("secure_url"):
            continue

        public_id = item.get("public_id")
        asset_id = item.get("asset_id")
        content_hash = item.get("content_hash")

        # Check existing
        existing = None
        if asset_id:
            existing = db.query(MediaAsset).filter(MediaAsset.cloudinary_asset_id == asset_id).first()
        if not existing and public_id:
            existing = db.query(MediaAsset).filter(MediaAsset.public_id == public_id).first()
        if not existing and content_hash:
            existing = db.query(MediaAsset).filter(MediaAsset.content_hash == content_hash).first()

        if existing:
            assets_reused += 1
            continue

        filename = item.get("filename")
        display_name = os.path.splitext(filename)[0] if filename else None

        asset = MediaAsset(
            filename=filename,
            display_name=display_name,
            public_id=public_id,
            cloudinary_asset_id=asset_id,
            cloud_name=cloud_name,
            delivery_type=item.get("delivery_type", "upload"),
            content_hash=content_hash,
            relative_source_path=rel_path,
            url=item.get("secure_url"),
            secure_url=item.get("secure_url"),
            resource_type=item.get("resource_type", "image"),
            format=item.get("format"),
            width=item.get("width"),
            height=item.get("height"),
            duration=item.get("duration"),
            file_size=item.get("file_size", 0),
            mime_type="video/mp4" if item.get("resource_type") == "video" else f"image/{item.get('format', 'jpeg')}",
            alt_text=display_name,
            folder=item.get("folder"),
        )
        db.add(asset)
        assets_created += 1

    db.commit()
    db.close()

    print(f"  Assets: {assets_created} created, {assets_reused} already present.")
    print("\n[SUCCESS] Media migration completed without any Cloudinary re-uploads!")


if __name__ == "__main__":
    migrate_manifest_to_db()

