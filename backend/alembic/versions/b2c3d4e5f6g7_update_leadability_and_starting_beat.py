"""update leadability range and make starting_beat required for non-states

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-05 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6g7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Update leadability range from 0-10 to 1-10 ---
    op.drop_constraint("ck_moves_leadability_range", "moves", type_="check")
    op.create_check_constraint(
        "ck_moves_leadability_range",
        "moves",
        "leadability >= 1 AND leadability <= 10",
    )

    # --- Replace state_no_starting_beat with starting_beat_required ---
    # Old constraint only prevented states from having starting_beat.
    # New constraint also requires non-states to have starting_beat.
    op.drop_constraint("ck_moves_state_no_starting_beat", "moves", type_="check")
    op.create_check_constraint(
        "ck_moves_starting_beat_required",
        "moves",
        "(is_state = true AND starting_beat IS NULL) OR (is_state = false AND starting_beat IS NOT NULL)",
    )


def downgrade() -> None:
    # --- Restore starting_beat constraint to old form ---
    op.drop_constraint("ck_moves_starting_beat_required", "moves", type_="check")
    op.create_check_constraint(
        "ck_moves_state_no_starting_beat",
        "moves",
        "(is_state = false) OR (starting_beat IS NULL)",
    )

    # --- Restore leadability range to 0-10 ---
    op.drop_constraint("ck_moves_leadability_range", "moves", type_="check")
    op.create_check_constraint(
        "ck_moves_leadability_range",
        "moves",
        "leadability >= 0 AND leadability <= 10",
    )
