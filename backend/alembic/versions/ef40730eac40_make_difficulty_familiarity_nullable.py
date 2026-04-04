"""Make difficulty and familiarity nullable

Revision ID: ef40730eac40
Revises: 56d7e0f5708b
Create Date: 2026-04-02 20:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ef40730eac40'
down_revision: Union[str, None] = '56d7e0f5708b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('moves', 'difficulty', nullable=True)
    op.alter_column('moves', 'familiarity', nullable=True)


def downgrade() -> None:
    op.execute("UPDATE moves SET difficulty = 0 WHERE difficulty IS NULL")
    op.execute("UPDATE moves SET familiarity = 0 WHERE familiarity IS NULL")
    op.alter_column('moves', 'difficulty', nullable=False)
    op.alter_column('moves', 'familiarity', nullable=False)
