"""make starting_beat always required

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-02-07 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d4e5f6g7h8i9"
down_revision: Union[str, None] = "c3d4e5f6g7h8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Backfill any null starting_beat values with 1
    op.execute("UPDATE moves SET starting_beat = 1 WHERE starting_beat IS NULL")

    # Drop the old conditional constraint
    op.drop_constraint("ck_moves_starting_beat_required", "moves", type_="check")

    # Alter column to NOT NULL
    op.alter_column("moves", "starting_beat", nullable=False, existing_type=sa.Integer)

    # Create new simpler constraint (just NOT NULL, which is enforced by column)
    # The range constraint (1-8) already exists as ck_moves_starting_beat_range
    op.create_check_constraint(
        "ck_moves_starting_beat_required",
        "moves",
        "starting_beat IS NOT NULL",
    )


def downgrade() -> None:
    # Drop the new constraint
    op.drop_constraint("ck_moves_starting_beat_required", "moves", type_="check")

    # Alter column back to nullable
    op.alter_column("moves", "starting_beat", nullable=True, existing_type=sa.Integer)

    # Recreate the old conditional constraint
    op.create_check_constraint(
        "ck_moves_starting_beat_required",
        "moves",
        "(is_state = true AND starting_beat IS NULL) OR (is_state = false AND starting_beat IS NOT NULL)",
    )

    # Set starting_beat to NULL for existing states
    op.execute("UPDATE moves SET starting_beat = NULL WHERE is_state = true")
