"""upgrade_admin_panel_schema

Revision ID: 5c81d2e3f4a1
Revises: 4b923c5f8a02
Create Date: 2026-10-28 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = '5c81d2e3f4a1'
down_revision: Union[str, None] = '4b923c5f8a02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = inspector.get_table_names()

    # 1. Update orders table with missing columns (order_token, reservation_expires_at, admin_notes)
    orders_cols = [c['name'] for c in inspector.get_columns('orders')]
    with op.batch_alter_table('orders', schema=None) as batch_op:
        if 'order_token' not in orders_cols:
            batch_op.add_column(sa.Column('order_token', sa.String(length=64), nullable=True))
            batch_op.create_index('ix_orders_order_token', ['order_token'], unique=True)
        if 'reservation_expires_at' not in orders_cols:
            batch_op.add_column(sa.Column('reservation_expires_at', sa.DateTime(timezone=True), nullable=True))
        if 'admin_notes' not in orders_cols:
            batch_op.add_column(sa.Column('admin_notes', sa.Text(), nullable=True))

    # 2. Update admins table (role, name, is_active)
    admins_cols = [c['name'] for c in inspector.get_columns('admins')]
    with op.batch_alter_table('admins', schema=None) as batch_op:
        if 'name' not in admins_cols:
            batch_op.add_column(sa.Column('name', sa.String(length=255), nullable=True))
        if 'role' not in admins_cols:
            batch_op.add_column(sa.Column('role', sa.String(length=50), server_default='OWNER', nullable=False))
        if 'is_active' not in admins_cols:
            batch_op.add_column(sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False))

    # 3. Create size_charts table
    if 'size_charts' not in existing_tables:
        op.create_table(
            'size_charts',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('category', sa.String(length=100), nullable=True),
            sa.Column('measurements', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # 4. Update products table (status, fit, size_chart_id)
    products_cols = [c['name'] for c in inspector.get_columns('products')]
    with op.batch_alter_table('products', schema=None) as batch_op:
        if 'fit' not in products_cols:
            batch_op.add_column(sa.Column('fit', sa.String(length=100), nullable=True))
        if 'status' not in products_cols:
            batch_op.add_column(sa.Column('status', sa.String(length=50), server_default='PUBLISHED', nullable=False))
        if 'size_chart_id' not in products_cols:
            batch_op.add_column(sa.Column('size_chart_id', sa.Integer(), nullable=True))
            batch_op.create_foreign_key('fk_products_size_chart_id', 'size_charts', ['size_chart_id'], ['id'], ondelete='SET NULL')

    # 5. Create stock_adjustments table
    if 'stock_adjustments' not in existing_tables:
        op.create_table(
            'stock_adjustments',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('variant_id', sa.Integer(), sa.ForeignKey('product_variants.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('previous_stock', sa.Integer(), nullable=False),
            sa.Column('new_stock', sa.Integer(), nullable=False),
            sa.Column('change_amount', sa.Integer(), nullable=False),
            sa.Column('reason', sa.String(length=50), nullable=False),
            sa.Column('note', sa.Text(), nullable=True),
            sa.Column('actor_email', sa.String(length=255), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # 6. Create return_requests table
    if 'return_requests' not in existing_tables:
        op.create_table(
            'return_requests',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('return_code', sa.String(length=50), unique=True, index=True, nullable=False),
            sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('order_item_id', sa.Integer(), sa.ForeignKey('order_items.id', ondelete='SET NULL'), nullable=True),
            sa.Column('request_type', sa.String(length=20), server_default='RETURN', nullable=False),
            sa.Column('reason', sa.String(length=100), nullable=False),
            sa.Column('customer_comment', sa.Text(), nullable=True),
            sa.Column('requested_resolution', sa.String(length=50), server_default='REFUND', nullable=False),
            sa.Column('exchange_size', sa.String(length=20), nullable=True),
            sa.Column('status', sa.String(length=50), server_default='REQUESTED', nullable=False),
            sa.Column('pickup_awb', sa.String(length=100), nullable=True),
            sa.Column('pickup_courier', sa.String(length=100), nullable=True),
            sa.Column('refund_amount', sa.Numeric(precision=10, scale=2), nullable=True),
            sa.Column('refund_status', sa.String(length=50), server_default='PENDING', nullable=True),
            sa.Column('refund_reference', sa.String(length=100), nullable=True),
            sa.Column('staff_notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # 7. Create or update store_settings table
    if 'store_settings' not in existing_tables:
        op.create_table(
            'store_settings',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('standard_cod_free_threshold', sa.Numeric(precision=10, scale=2), server_default='1500.00', nullable=False),
            sa.Column('standard_shipping_fee', sa.Numeric(precision=10, scale=2), server_default='99.00', nullable=False),
            sa.Column('express_shipping_fee', sa.Numeric(precision=10, scale=2), server_default='99.00', nullable=False),
            sa.Column('announcement_text', sa.String(length=500), server_default='COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS | FREE COD ABOVE ₹1,500', nullable=False),
            sa.Column('announcement_enabled', sa.Boolean(), server_default=sa.true(), nullable=False),
            sa.Column('hero_title', sa.String(length=255), server_default='Timeless Elegance, Handcrafted Regality', nullable=False),
            sa.Column('hero_subtitle', sa.Text(), server_default='Pure handloom chanderi, tissue silks, and festive velvets made for the discerning connoisseur.', nullable=False),
            sa.Column('hero_cta_text', sa.String(length=100), server_default='Explore The Collection', nullable=False),
            sa.Column('hero_cta_link', sa.String(length=255), server_default='/shop', nullable=False),
            sa.Column('hero_image_url', sa.String(length=500), nullable=True),
            sa.Column('whatsapp_number', sa.String(length=50), server_default='+91 98112 23344', nullable=False),
            sa.Column('support_email', sa.String(length=255), server_default='care@royallibas.com', nullable=False),
            sa.Column('support_phone', sa.String(length=50), server_default='+91 98112 23344', nullable=False),
            sa.Column('instagram_handle', sa.String(length=100), server_default='@royal_libas_by_tanya', nullable=False),
            sa.Column('shipping_policy_content', sa.Text(), nullable=True),
            sa.Column('return_policy_content', sa.Text(), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    else:
        setting_cols = [c['name'] for c in inspector.get_columns('store_settings')]
        with op.batch_alter_table('store_settings', schema=None) as batch_op:
            if 'announcement_enabled' not in setting_cols:
                batch_op.add_column(sa.Column('announcement_enabled', sa.Boolean(), server_default=sa.true(), nullable=False))
            if 'hero_title' not in setting_cols:
                batch_op.add_column(sa.Column('hero_title', sa.String(length=255), server_default='Timeless Elegance, Handcrafted Regality', nullable=False))
            if 'hero_subtitle' not in setting_cols:
                batch_op.add_column(sa.Column('hero_subtitle', sa.Text(), server_default='Pure handloom chanderi, tissue silks, and festive velvets made for the discerning connoisseur.', nullable=False))
            if 'hero_cta_text' not in setting_cols:
                batch_op.add_column(sa.Column('hero_cta_text', sa.String(length=100), server_default='Explore The Collection', nullable=False))
            if 'hero_cta_link' not in setting_cols:
                batch_op.add_column(sa.Column('hero_cta_link', sa.String(length=255), server_default='/shop', nullable=False))
            if 'hero_image_url' not in setting_cols:
                batch_op.add_column(sa.Column('hero_image_url', sa.String(length=500), nullable=True))
            if 'support_phone' not in setting_cols:
                batch_op.add_column(sa.Column('support_phone', sa.String(length=50), server_default='+91 98112 23344', nullable=False))
            if 'shipping_policy_content' not in setting_cols:
                batch_op.add_column(sa.Column('shipping_policy_content', sa.Text(), nullable=True))
            if 'return_policy_content' not in setting_cols:
                batch_op.add_column(sa.Column('return_policy_content', sa.Text(), nullable=True))

    # 8. Create or update contact_inquiries table
    if 'contact_inquiries' not in existing_tables:
        op.create_table(
            'contact_inquiries',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('phone', sa.String(length=50), nullable=True),
            sa.Column('subject', sa.String(length=255), nullable=True),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('status', sa.String(length=50), server_default='NEW', nullable=False),
            sa.Column('admin_reply', sa.Text(), nullable=True),
            sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    else:
        inquiry_cols = [c['name'] for c in inspector.get_columns('contact_inquiries')]
        with op.batch_alter_table('contact_inquiries', schema=None) as batch_op:
            if 'phone' not in inquiry_cols:
                batch_op.add_column(sa.Column('phone', sa.String(length=50), nullable=True))
            if 'subject' not in inquiry_cols:
                batch_op.add_column(sa.Column('subject', sa.String(length=255), nullable=True))
            if 'admin_reply' not in inquiry_cols:
                batch_op.add_column(sa.Column('admin_reply', sa.Text(), nullable=True))
            if 'responded_at' not in inquiry_cols:
                batch_op.add_column(sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True))

    # 9. Create newsletter_subscribers table if not exists
    if 'newsletter_subscribers' not in existing_tables:
        op.create_table(
            'newsletter_subscribers',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('email', sa.String(length=255), unique=True, index=True, nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # 10. Create activity_logs table
    if 'activity_logs' not in existing_tables:
        op.create_table(
            'activity_logs',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('actor_email', sa.String(length=255), nullable=False),
            sa.Column('actor_role', sa.String(length=50), nullable=True),
            sa.Column('action', sa.String(length=100), nullable=False),
            sa.Column('target_type', sa.String(length=50), nullable=False),
            sa.Column('target_id', sa.String(length=100), nullable=True),
            sa.Column('details', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # 11. Create media_assets table
    if 'media_assets' not in existing_tables:
        op.create_table(
            'media_assets',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('filename', sa.String(length=255), nullable=False),
            sa.Column('url', sa.String(length=500), nullable=False),
            sa.Column('file_size', sa.Integer(), nullable=False),
            sa.Column('mime_type', sa.String(length=100), nullable=False),
            sa.Column('alt_text', sa.String(length=255), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table('media_assets')
    op.drop_table('activity_logs')
    op.drop_table('return_requests')
    op.drop_table('stock_adjustments')
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.drop_constraint('fk_products_size_chart_id', type_='foreignkey')
        batch_op.drop_column('size_chart_id')
        batch_op.drop_column('status')
        batch_op.drop_column('fit')
    op.drop_table('size_charts')
    with op.batch_alter_table('admins', schema=None) as batch_op:
        batch_op.drop_column('is_active')
        batch_op.drop_column('role')
        batch_op.drop_column('name')
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.drop_column('admin_notes')
        batch_op.drop_column('reservation_expires_at')
        batch_op.drop_index('ix_orders_order_token')
        batch_op.drop_column('order_token')

