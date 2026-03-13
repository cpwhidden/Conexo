"""add_themes_tables

Revision ID: aeb1ed06c182
Revises: 6a0484fce789
Create Date: 2026-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'aeb1ed06c182'
down_revision: Union[str, None] = '6a0484fce789'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Create themes table ---
    op.create_table(
        "themes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("dance_style", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_unique_constraint(
        "uq_theme_user_style_name", "themes", ["user_id", "dance_style", "name"]
    )
    op.create_index("ix_themes_user_id", "themes", ["user_id"])
    op.create_index("ix_themes_user_dance_style", "themes", ["user_id", "dance_style"])

    # --- Create theme_moves table ---
    op.create_table(
        "theme_moves",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "theme_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("themes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "move_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("moves.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("added_at", sa.DateTime, nullable=False),
    )
    op.create_unique_constraint(
        "uq_theme_move", "theme_moves", ["theme_id", "move_id"]
    )
    op.create_index("ix_theme_moves_theme_id", "theme_moves", ["theme_id"])
    op.create_index("ix_theme_moves_move_id", "theme_moves", ["move_id"])


def downgrade() -> None:
    # --- Drop theme_moves table ---
    op.drop_index("ix_theme_moves_move_id", "theme_moves")
    op.drop_index("ix_theme_moves_theme_id", "theme_moves")
    op.drop_constraint("uq_theme_move", "theme_moves", type_="unique")
    op.drop_table("theme_moves")

    # --- Drop themes table ---
    op.drop_index("ix_themes_user_dance_style", "themes")
    op.drop_index("ix_themes_user_id", "themes")
    op.drop_constraint("uq_theme_user_style_name", "themes", type_="unique")
    op.drop_table("themes")
