"""enhance_media_schema_for_cloud_and_hashes

Revision ID: 7e83d5a2c4e5
Revises: 6d92a4f1b2c3
Create Date: 2026-10-31 14:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = '7e83d5a2c4e5'
down_revision: Union[str, None] = '6d92a4f1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = set(inspector.get_table_names())

    # 1. Update media_assets table
    if 'media_assets' in existing_tables:
        media_cols = {c['name'] for c in inspector.get_columns('media_assets')}
        with op.batch_alter_table('media_assets', schema=None) as batch_op:
            if 'cloud_name' not in media_cols:
                batch_op.add_column(sa.Column('cloud_name', sa.String(length=100), nullable=True))
                batch_op.create_index('ix_media_assets_cloud_name', ['cloud_name'], unique=False)
            if 'delivery_type' not in media_cols:
                batch_op.add_column(sa.Column('delivery_type', sa.String(length=50), server_default='upload', nullable=True))
            if 'content_hash' not in media_cols:
                batch_op.add_column(sa.Column('content_hash', sa.String(length=64), nullable=True))
                batch_op.create_index('ix_media_assets_content_hash', ['content_hash'], unique=False)
            if 'relative_source_path' not in media_cols:
                batch_op.add_column(sa.Column('relative_source_path', sa.String(length=500), nullable=True))
            if 'folder' in media_cols:
                batch_op.alter_column('folder', type_=sa.String(length=500), existing_type=sa.String(length=255))

    # 2. Update media_folders table
    if 'media_folders' in existing_tables:
        folder_cols = {c['name'] for c in inspector.get_columns('media_folders')}
        with op.batch_alter_table('media_folders', schema=None) as batch_op:
            if 'name' in folder_cols:
                batch_op.alter_column('name', type_=sa.String(length=255), existing_type=sa.String(length=100))
            if 'path' in folder_cols:
                batch_op.alter_column('path', type_=sa.String(length=500), existing_type=sa.String(length=255))
            if 'parent_path' in folder_cols:
                batch_op.alter_column('parent_path', type_=sa.String(length=500), existing_type=sa.String(length=255))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = set(inspector.get_table_names())

    if 'media_assets' in existing_tables:
        with op.batch_alter_table('media_assets', schema=None) as batch_op:
            batch_op.drop_index('ix_media_assets_content_hash')
            batch_op.drop_column('content_hash')
            batch_op.drop_column('relative_source_path')
            batch_op.drop_column('delivery_type')
            batch_op.drop_index('ix_media_assets_cloud_name')
            batch_op.drop_column('cloud_name')

