"""Automated lightweight schema migration helper for Royal Libas.
Ensures new columns are safely added to SQLite and PostgreSQL databases
without dropping tables or losing existing data.
"""

import logging
from sqlalchemy import text, inspect
from sqlalchemy.engine import Engine

logger = logging.getLogger("royal_libas.migrations")


def run_migrations(engine: Engine) -> None:
    """Safely apply schema migrations to ensure MediaAsset and ProductImage have all columns."""
    dialect_name = engine.dialect.name.lower()
    logger.info(f"Checking database schema migrations for dialect '{dialect_name}'...")

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        # 1. MediaAsset table migrations
        if "media_assets" in existing_tables:
            existing_cols = {col["name"] for col in inspector.get_columns("media_assets")}
            
            media_asset_cols = [
                ("public_id", "VARCHAR(255)"),
                ("secure_url", "VARCHAR(500)"),
                ("resource_type", "VARCHAR(20) DEFAULT 'image'"),
                ("format", "VARCHAR(50)"),
                ("width", "INTEGER"),
                ("height", "INTEGER"),
                ("duration", "NUMERIC(10, 2)"),
                ("folder", "VARCHAR(100)"),
                ("display_name", "VARCHAR(255)"),
                ("cloudinary_asset_id", "VARCHAR(100)"),
            ]

            for col_name, col_type in media_asset_cols:
                if col_name not in existing_cols:
                    logger.info(f"Adding column '{col_name}' to media_assets table...")
                    if dialect_name == "postgresql":
                        conn.execute(text(f"ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
                    else:
                        conn.execute(text(f"ALTER TABLE media_assets ADD COLUMN {col_name} {col_type};"))

        # 1b. MediaFolders table creation
        if "media_folders" not in existing_tables:
            logger.info("Creating media_folders table...")
            if dialect_name == "postgresql":
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS media_folders (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(100) NOT NULL,
                        path VARCHAR(255) UNIQUE NOT NULL,
                        parent_path VARCHAR(255),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
                    )
                """))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_media_folders_path ON media_folders (path)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_media_folders_parent_path ON media_folders (parent_path)"))
            else:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS media_folders (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name VARCHAR(100) NOT NULL,
                        path VARCHAR(255) UNIQUE NOT NULL,
                        parent_path VARCHAR(255),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                    )
                """))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_media_folders_path ON media_folders (path)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_media_folders_parent_path ON media_folders (parent_path)"))

        # 2. ProductImage table migrations
        if "product_images" in existing_tables:
            existing_img_cols = {col["name"] for col in inspector.get_columns("product_images")}
            
            product_img_cols = [
                ("resource_type", "VARCHAR(20) DEFAULT 'image'"),
                ("public_id", "VARCHAR(255)"),
                ("width", "INTEGER"),
                ("height", "INTEGER"),
                ("duration", "NUMERIC(10, 2)"),
                ("media_asset_id", "INTEGER REFERENCES media_assets(id) ON DELETE SET NULL"),
            ]

            for col_name, col_type in product_img_cols:
                if col_name not in existing_img_cols:
                    logger.info(f"Adding column '{col_name}' to product_images table...")
                    if dialect_name == "postgresql":
                        conn.execute(text(f"ALTER TABLE product_images ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
                    else:
                        conn.execute(text(f"ALTER TABLE product_images ADD COLUMN {col_name} {col_type};"))

            # Ensure index on media_asset_id
            try:
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_product_images_media_asset_id ON product_images (media_asset_id);"))
            except Exception as e:
                logger.warning(f"Index creation on product_images.media_asset_id: {e}")

            # Unambiguous backfill: only when public_id AND resource_type uniquely match exactly ONE media asset
            try:
                if dialect_name == "postgresql":
                    conn.execute(text("""
                        UPDATE product_images pi
                        SET media_asset_id = ma.id
                        FROM media_assets ma
                        WHERE pi.media_asset_id IS NULL
                          AND pi.public_id IS NOT NULL
                          AND pi.public_id = ma.public_id
                          AND COALESCE(pi.resource_type, 'image') = COALESCE(ma.resource_type, 'image')
                          AND (
                              SELECT COUNT(*)
                              FROM media_assets sub
                              WHERE sub.public_id = pi.public_id
                                AND COALESCE(sub.resource_type, 'image') = COALESCE(pi.resource_type, 'image')
                          ) = 1;
                    """))
                else:
                    conn.execute(text("""
                        UPDATE product_images
                        SET media_asset_id = (
                            SELECT ma.id
                            FROM media_assets ma
                            WHERE ma.public_id = product_images.public_id
                              AND COALESCE(ma.resource_type, 'image') = COALESCE(product_images.resource_type, 'image')
                        )
                        WHERE media_asset_id IS NULL
                          AND public_id IS NOT NULL
                          AND (
                              SELECT COUNT(*)
                              FROM media_assets ma_cnt
                              WHERE ma_cnt.public_id = product_images.public_id
                                AND COALESCE(ma_cnt.resource_type, 'image') = COALESCE(product_images.resource_type, 'image')
                          ) = 1;
                    """))
            except Exception as e:
                logger.warning(f"Unambiguous backfill for product_images.media_asset_id skipped: {e}")

        # 3. StoreSetting table migrations for payment controls
        if "store_settings" in existing_tables:
            existing_setting_cols = {col["name"] for col in inspector.get_columns("store_settings")}
            
            setting_cols = [
                ("cod_enabled", "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE"),
                ("online_payment_enabled", "BOOLEAN DEFAULT 1", "BOOLEAN DEFAULT TRUE"),
                ("category_two_pieces_image", "VARCHAR(500)", "VARCHAR(500)"),
                ("category_suit_set_image", "VARCHAR(500)", "VARCHAR(500)"),
                ("category_heavy_dress_image", "VARCHAR(500)", "VARCHAR(500)"),
                ("festive_banner_image", "VARCHAR(500)", "VARCHAR(500)"),
                ("poster_occasion_image", "VARCHAR(500)", "VARCHAR(500)"),
                ("poster_everyday_image", "VARCHAR(500)", "VARCHAR(500)"),
                ("poster_story_image", "VARCHAR(500)", "VARCHAR(500)"),
            ]

            for col_name, sqlite_type, pg_type in setting_cols:
                if col_name not in existing_setting_cols:
                    logger.info(f"Adding column '{col_name}' to store_settings table...")
                    if dialect_name == "postgresql":
                        conn.execute(text(f"ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS {col_name} {pg_type};"))
                    else:
                        conn.execute(text(f"ALTER TABLE store_settings ADD COLUMN {col_name} {sqlite_type};"))

        # 4. Product table migrations for subcategory
        if "products" in existing_tables:
            existing_prod_cols = {col["name"] for col in inspector.get_columns("products")}
            if "subcategory" not in existing_prod_cols:
                logger.info("Adding column 'subcategory' to products table...")
                if dialect_name == "postgresql":
                    conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);"))
                else:
                    conn.execute(text("ALTER TABLE products ADD COLUMN subcategory VARCHAR(100);"))

    logger.info("Database schema migrations completed successfully.")

