"""add updated_at to tags

Revision ID: bce2668ad584
Revises: ef40730eac40
Create Date: 2026-04-15 22:57:10.305132

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bce2668ad584'
down_revision: Union[str, None] = 'ef40730eac40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add as nullable first, backfill, then make NOT NULL
    op.add_column('tags', sa.Column('updated_at', sa.DateTime(), nullable=True))
    op.execute("UPDATE tags SET updated_at = created_at WHERE updated_at IS NULL")
    op.alter_column('tags', 'updated_at', nullable=False)


def downgrade() -> None:
    op.drop_column('tags', 'updated_at')
