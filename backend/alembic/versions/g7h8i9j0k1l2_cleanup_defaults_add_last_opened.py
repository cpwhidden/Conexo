"""Cleanup duplicate default collections, add date_last_opened

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-02-11

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "g7h8i9j0k1l2"
down_revision: str | None = "f6g7h8i9j0k1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Step 1: Add date_last_opened to collections and sequences
    op.add_column(
        "collections",
        sa.Column("date_last_opened", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "sequences",
        sa.Column("date_last_opened", sa.DateTime(), nullable=True),
    )

    # Step 2: Delete duplicate default collections (keep oldest per user/style)
    op.execute(
        text("""
        DELETE FROM collections
        WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY user_id, dance_style
                    ORDER BY created_at ASC
                ) as rn
                FROM collections
                WHERE is_default = true
            ) t
            WHERE rn > 1
        )
    """)
    )

    # Step 3: Update naming from "My X Moves" to "All X Moves"
    op.execute(
        text("""
        UPDATE collections
        SET name = 'All ' || dance_style || ' Moves'
        WHERE is_default = true
    """)
    )

    # Step 4: Add unique constraint (partial - only for is_default=true)
    # Use raw SQL because Alembic's create_unique_constraint doesn't support partial constraints
    op.execute(
        text("""
        CREATE UNIQUE INDEX uq_user_default_collection_per_style
        ON collections (user_id, dance_style)
        WHERE is_default = true
    """)
    )


def downgrade() -> None:
    op.execute(text("DROP INDEX IF EXISTS uq_user_default_collection_per_style"))
    op.drop_column("sequences", "date_last_opened")
    op.drop_column("collections", "date_last_opened")
