"""add move columns and require dance_style

Revision ID: a1b2c3d4e5f6
Revises: 550ccd22c6fd
Create Date: 2026-02-05 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "550ccd22c6fd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Add new columns ---
    op.add_column("moves", sa.Column("starting_beat", sa.Integer(), nullable=True))
    op.add_column(
        "moves",
        sa.Column(
            "is_state",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "moves",
        sa.Column(
            "key_egress",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "moves",
        sa.Column(
            "key_ingress",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column("moves", sa.Column("leadability", sa.Integer(), nullable=True))
    op.add_column(
        "moves", sa.Column("mental_availability", sa.Integer(), nullable=True)
    )
    op.add_column("moves", sa.Column("beat_energy", sa.Integer(), nullable=True))
    op.add_column("moves", sa.Column("sensual_energy", sa.Integer(), nullable=True))
    op.add_column(
        "moves", sa.Column("follower_styling", sa.String(300), nullable=True)
    )

    # --- Make dance_style required ---
    op.execute("UPDATE moves SET dance_style = 'Salsa' WHERE dance_style IS NULL")
    op.alter_column(
        "moves", "dance_style", nullable=False, existing_type=sa.String(100)
    )

    # --- Replace beat_count constraint ---
    op.drop_constraint("ck_moves_beat_count_positive", "moves", type_="check")
    op.create_check_constraint(
        "ck_moves_beat_count_valid",
        "moves",
        "(beat_count > 0 AND is_state = false) OR (beat_count = 0 AND is_state = true)",
    )

    # --- Add new check constraints ---
    op.create_check_constraint(
        "ck_moves_starting_beat_range",
        "moves",
        "starting_beat >= 1 AND starting_beat <= 8",
    )
    op.create_check_constraint(
        "ck_moves_state_no_starting_beat",
        "moves",
        "(is_state = false) OR (starting_beat IS NULL)",
    )
    op.create_check_constraint(
        "ck_moves_leadability_range",
        "moves",
        "leadability >= 0 AND leadability <= 10",
    )
    op.create_check_constraint(
        "ck_moves_mental_availability_range",
        "moves",
        "mental_availability >= 0 AND mental_availability <= 10",
    )
    op.create_check_constraint(
        "ck_moves_beat_energy_range",
        "moves",
        "beat_energy >= 0 AND beat_energy <= 10",
    )
    op.create_check_constraint(
        "ck_moves_sensual_energy_range",
        "moves",
        "sensual_energy >= 0 AND sensual_energy <= 10",
    )


def downgrade() -> None:
    # --- Drop new check constraints ---
    op.drop_constraint("ck_moves_sensual_energy_range", "moves", type_="check")
    op.drop_constraint("ck_moves_beat_energy_range", "moves", type_="check")
    op.drop_constraint("ck_moves_mental_availability_range", "moves", type_="check")
    op.drop_constraint("ck_moves_leadability_range", "moves", type_="check")
    op.drop_constraint("ck_moves_state_no_starting_beat", "moves", type_="check")
    op.drop_constraint("ck_moves_starting_beat_range", "moves", type_="check")

    # --- Restore original beat_count constraint ---
    op.drop_constraint("ck_moves_beat_count_valid", "moves", type_="check")
    op.create_check_constraint(
        "ck_moves_beat_count_positive", "moves", "beat_count > 0"
    )

    # --- Make dance_style nullable again ---
    op.alter_column(
        "moves", "dance_style", nullable=True, existing_type=sa.String(100)
    )

    # --- Drop new columns ---
    op.drop_column("moves", "follower_styling")
    op.drop_column("moves", "sensual_energy")
    op.drop_column("moves", "beat_energy")
    op.drop_column("moves", "mental_availability")
    op.drop_column("moves", "leadability")
    op.drop_column("moves", "key_ingress")
    op.drop_column("moves", "key_egress")
    op.drop_column("moves", "is_state")
    op.drop_column("moves", "starting_beat")
