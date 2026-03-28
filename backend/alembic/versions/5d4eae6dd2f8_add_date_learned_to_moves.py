"""add date_learned to moves

Revision ID: 5d4eae6dd2f8
Revises: 0a78b43f85d2
Create Date: 2026-03-21 02:26:40.803791

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5d4eae6dd2f8'
down_revision: Union[str, None] = '0a78b43f85d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('moves', sa.Column('date_learned', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('moves', 'date_learned')
