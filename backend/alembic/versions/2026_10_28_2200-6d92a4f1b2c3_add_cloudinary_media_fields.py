"""add_cloudinary_media_fields

Revision ID: 6d92a4f1b2c3
Revises: 5c81d2e3f4a1
Create Date: 2026-10-28 22:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = '6d92a4f1b2c3'
down_revision: Union[str, None] = '5c81d2e3f4a1'
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
            if 'public_id' not in media_cols:
                batch_op.add_column(sa.Column('public_id', sa.String(length=255), nullable=True))
                batch_op.create_index('ix_media_assets_public_id', ['public_id'], unique=False)
            if 'secure_url' not in media_cols:
                batch_op.add_column(sa.Column('secure_url', sa.String(length=500), nullable=True))
            if 'resource_type' not in media_cols:
                batch_op.add_column(sa.Column('resource_type', sa.String(length=20), server_default='image', nullable=False))
            if 'format' not in media_cols:
                batch_op.add_column(sa.Column('format', sa.String(length=50), nullable=True))
            if 'width' not in media_cols:
                batch_op.add_column(sa.Column('width', sa.Integer(), nullable=True))
            if 'height' not in media_cols:
                batch_op.add_column(sa.Column('height', sa.Integer(), nullable=True))
            if 'duration' not in media_cols:
                batch_op.add_column(sa.Column('duration', sa.Numeric(precision=10, scale=2), nullable=True))
            if 'folder' not in media_cols:
                batch_op.add_column(sa.Column('folder', sa.String(length=100), nullable=True))

    # 2. Update product_images table
    if 'product_images' in existing_tables:
        img_cols = {c['name'] for c in inspector.get_columns('product_images')}
        with op.batch_alter_table('product_images', schema=None) as batch_op:
            if 'resource_type' not in img_cols:
                batch_op.add_column(sa.Column('resource_type', sa.String(length=20), server_default='image', nullable=False))
            if 'public_id' not in img_cols:
                batch_op.add_column(sa.Column('public_id', sa.String(length=255), nullable=True))
            if 'width' not in img_cols:
                batch_op.add_column(sa.Column('width', sa.Integer(), nullable=True))
            if 'height' not in img_cols:
                batch_op.add_column(sa.Column('height', sa.Integer(), nullable=True))
            if 'duration' not in img_cols:
                batch_op.add_column(sa.Column('duration', sa.Numeric(precision=10, scale=2), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = set(inspector.get_table_names())

    if 'product_images' in existing_tables:
        with op.batch_alter_table('product_images', schema=None) as batch_op:
            batch_op.drop_column('duration')
            batch_op.drop_column('height')
            batch_op.drop_column('width')
            batch_op.drop_column('public_id')
            batch_op.drop_column('resource_type')

    if 'media_assets' in existing_tables:
        with op.batch_alter_table('media_assets', schema=None) as batch_op:
            batch_op.drop_column('folder')
            batch_op.drop_column('duration')
            batch_op.drop_column('height')
            batch_op.drop_column('width')
            batch_op.drop_column('format')
            batch_op.drop_column('resource_type')
            batch_op.drop_column('secure_url')
            batch_op.drop_index('ix_media_assets_public_id')
            batch_op.drop_column('public_id')

