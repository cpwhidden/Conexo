"""add is_core to moves

Revision ID: 5f2926f49d07
Revises: m2n3o4p5q6r7
Create Date: 2026-03-19 21:11:37.814617

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f2926f49d07'
down_revision: Union[str, None] = 'm2n3o4p5q6r7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('moves', sa.Column('is_core', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    # One-time batch update: all State moves should be marked as core
    op.execute("UPDATE moves SET is_core = true WHERE is_state = true")


def downgrade() -> None:
    op.drop_column('moves', 'is_core')
