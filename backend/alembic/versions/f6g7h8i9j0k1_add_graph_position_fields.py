"""Add graph position fields to collections

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-02-10

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6g7h8i9j0k1"
down_revision: str | None = "e5f6g7h8i9j0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add is_default to collections
    op.add_column(
        "collections",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
    )

    # Add position fields to collection_moves
    op.add_column(
        "collection_moves",
        sa.Column("position_x", sa.Float(), nullable=True),
    )
    op.add_column(
        "collection_moves",
        sa.Column("position_y", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("collection_moves", "position_y")
    op.drop_column("collection_moves", "position_x")
    op.drop_column("collections", "is_default")
