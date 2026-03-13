"""Add impact field to moves

Revision ID: j9k0l1m2n3o4
Revises: h8i9j0k1l2m3
Create Date: 2025-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "j9k0l1m2n3o4"
down_revision: Union[str, None] = "h8i9j0k1l2m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add impact field to moves table
    op.add_column("moves", sa.Column("impact", sa.Integer, nullable=True))

    # Add check constraint for 0-10 range
    op.create_check_constraint(
        "ck_moves_impact_range",
        "moves",
        "impact >= 0 AND impact <= 10"
    )


def downgrade() -> None:
    op.drop_constraint("ck_moves_impact_range", "moves", type_="check")
    op.drop_column("moves", "impact")
