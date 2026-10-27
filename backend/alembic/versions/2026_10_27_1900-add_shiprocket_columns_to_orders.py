"""add_shiprocket_columns_to_orders

Revision ID: 4b923c5f8a02
Revises: 3a812b4e7f91
Create Date: 2026-10-27 19:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b923c5f8a02'
down_revision: Union[str, None] = '3a812b4e7f91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('shiprocket_order_id', sa.String(length=100), nullable=True))
    op.add_column('orders', sa.Column('shipment_id', sa.String(length=100), nullable=True))
    op.add_column('orders', sa.Column('awb_code', sa.String(length=100), nullable=True))
    op.add_column('orders', sa.Column('label_url', sa.String(length=500), nullable=True))
    op.add_column('orders', sa.Column('manifest_url', sa.String(length=500), nullable=True))
    op.add_column('orders', sa.Column('pickup_status', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'pickup_status')
    op.drop_column('orders', 'manifest_url')
    op.drop_column('orders', 'label_url')
    op.drop_column('orders', 'awb_code')
    op.drop_column('orders', 'shipment_id')
    op.drop_column('orders', 'shiprocket_order_id')
