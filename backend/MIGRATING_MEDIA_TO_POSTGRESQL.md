# Migrating Royal Libas Media to PostgreSQL Database

This guide explains how all 106 boutique photos and videos and their 40-folder hierarchy can be seamlessly transferred to your production PostgreSQL database (e.g. Neon) **without re-uploading a single file to Cloudinary**.

---

## 1. Prerequisites

1. Set your `DATABASE_URL` in `.env`:
   ```bash
   DATABASE_URL=postgresql://user:password@ep-xyz.neon.tech/royal_libas?sslmode=require
   ```

2. Run Alembic schema migrations:
   ```bash
   cd backend
   alembic upgrade head
   ```
   This ensures `media_folders` and `media_assets` tables exist with all required columns (`cloud_name`, `delivery_type`, `content_hash`, `relative_source_path`, `folder`, etc.).

---

## 2. Rehydrate Media Registry from Manifest

Run the migration script:
```bash
python backend/scripts/migrate_media_manifest_to_db.py
```

### What this script does:
- Reads `backend/media_import_manifest.json` (the immutable record of all 106 boutique assets and 40 folders).
- Creates the 40 folders (including intentional empty folders like `Designer Wear/2`, `Lehenga`, `Co-ord Sets`).
- Inserts each media asset with its Cloudinary `secure_url`, `public_id`, `asset_id`, dimensions, and SHA-256 hash.
- **Zero re-uploads:** All files remain hosted on Cloudinary (`galbyoxi`), so the migration runs in seconds.

---

## 3. Product Gallery Linking

When creating or importing boutique products:
- You can query `MediaAsset` records by folder (e.g. `Photos for royal libas/Heavy Dress/Designer Wear/1`) or public ID.
- Use the admin Media Library modal (`Attach to Product`) to link photos directly into the `product_images` gallery.
- Promoting a cover photo sets `sort_order = 0` automatically.

