"""add_payment_events_ledger

Revision ID: 8f94e6b3d5f6
Revises: 7e83d5a2c4e5
Create Date: 2026-11-28 00:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = '8f94e6b3d5f6'
down_revision: Union[str, None] = '7e83d5a2c4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = set(inspector.get_table_names())

    if 'payment_events' not in existing_tables:
        op.create_table(
            'payment_events',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('order_id', sa.Integer(), nullable=False),
            sa.Column('provider', sa.String(length=50), server_default='cashfree', nullable=False),
            sa.Column('payment_id', sa.String(length=100), nullable=False),
            sa.Column('event_type', sa.String(length=100), nullable=False),
            sa.Column('payment_status', sa.String(length=50), nullable=False),
            sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
            sa.Column('currency', sa.String(length=10), server_default='INR', nullable=False),
            sa.Column('payload_hash', sa.String(length=64), nullable=False),
            sa.Column('outcome', sa.String(length=50), nullable=False),
            sa.Column('event_time', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('provider', 'payment_id', 'event_type', name='uq_payment_events_provider_payment_event')
        )
        op.create_index('ix_payment_events_id', 'payment_events', ['id'], unique=False)
        op.create_index('ix_payment_events_order_id', 'payment_events', ['order_id'], unique=False)
        op.create_index('ix_payment_events_payment_id', 'payment_events', ['payment_id'], unique=False)
        op.create_index('ix_payment_events_event_type', 'payment_events', ['event_type'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = set(inspector.get_table_names())

    if 'payment_events' in existing_tables:
        op.drop_index('ix_payment_events_event_type', table_name='payment_events')
        op.drop_index('ix_payment_events_payment_id', table_name='payment_events')
        op.drop_index('ix_payment_events_order_id', table_name='payment_events')
        op.drop_index('ix_payment_events_id', table_name='payment_events')
        op.drop_table('payment_events')
