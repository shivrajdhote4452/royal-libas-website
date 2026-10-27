"""add_cashfree_order_id_to_orders

Revision ID: 3a812b4e7f91
Revises: 29595ad50ed7
Create Date: 2026-10-27 15:35:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3a812b4e7f91'
down_revision: Union[str, None] = '29595ad50ed7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('cashfree_order_id', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'cashfree_order_id')
