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
            ]

            for col_name, col_type in media_asset_cols:
                if col_name not in existing_cols:
                    logger.info(f"Adding column '{col_name}' to media_assets table...")
                    if dialect_name == "postgresql":
                        conn.execute(text(f"ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
                    else:
                        conn.execute(text(f"ALTER TABLE media_assets ADD COLUMN {col_name} {col_type};"))

        # 2. ProductImage table migrations
        if "product_images" in existing_tables:
            existing_img_cols = {col["name"] for col in inspector.get_columns("product_images")}
            
            product_img_cols = [
                ("resource_type", "VARCHAR(20) DEFAULT 'image'"),
                ("public_id", "VARCHAR(255)"),
                ("width", "INTEGER"),
                ("height", "INTEGER"),
                ("duration", "NUMERIC(10, 2)"),
            ]

            for col_name, col_type in product_img_cols:
                if col_name not in existing_img_cols:
                    logger.info(f"Adding column '{col_name}' to product_images table...")
                    if dialect_name == "postgresql":
                        conn.execute(text(f"ALTER TABLE product_images ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
                    else:
                        conn.execute(text(f"ALTER TABLE product_images ADD COLUMN {col_name} {col_type};"))

    logger.info("Database schema migrations completed successfully.")

