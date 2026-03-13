"""add collections and sequences

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-02-07 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6g7h8"
down_revision: Union[str, None] = "b2c3d4e5f6g7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Create collections table ---
    op.create_table(
        "collections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("dance_style", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_collections_user_id", "collections", ["user_id"])
    op.create_index(
        "ix_collections_user_dance_style", "collections", ["user_id", "dance_style"]
    )

    # --- Create collection_moves table ---
    op.create_table(
        "collection_moves",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "collection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("collections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "move_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("moves.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("added_at", sa.DateTime, nullable=False),
    )
    op.create_unique_constraint(
        "uq_collection_move", "collection_moves", ["collection_id", "move_id"]
    )
    op.create_index(
        "ix_collection_moves_collection_id", "collection_moves", ["collection_id"]
    )
    op.create_index("ix_collection_moves_move_id", "collection_moves", ["move_id"])

    # --- Create sequences table ---
    op.create_table(
        "sequences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("dance_style", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_sequences_user_id", "sequences", ["user_id"])
    op.create_index(
        "ix_sequences_user_dance_style", "sequences", ["user_id", "dance_style"]
    )

    # --- Create sequence_moves table ---
    op.create_table(
        "sequence_moves",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "sequence_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sequences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column(
            "move_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("moves.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("custom_name", sa.String(255), nullable=True),
        sa.Column("custom_beat_count", sa.Integer, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_unique_constraint(
        "uq_sequence_position", "sequence_moves", ["sequence_id", "position"]
    )
    op.create_check_constraint(
        "ck_sequence_move_entry_type",
        "sequence_moves",
        "(move_id IS NOT NULL AND custom_name IS NULL AND custom_beat_count IS NULL) OR "
        "(move_id IS NULL AND custom_name IS NOT NULL AND custom_beat_count IS NOT NULL)",
    )
    op.create_check_constraint(
        "ck_sequence_move_position_positive",
        "sequence_moves",
        "position >= 1",
    )
    op.create_check_constraint(
        "ck_sequence_move_custom_beat_count",
        "sequence_moves",
        "custom_beat_count IS NULL OR custom_beat_count >= 0",
    )
    op.create_index("ix_sequence_moves_sequence_id", "sequence_moves", ["sequence_id"])
    op.create_index("ix_sequence_moves_move_id", "sequence_moves", ["move_id"])


def downgrade() -> None:
    # --- Drop sequence_moves table ---
    op.drop_index("ix_sequence_moves_move_id", "sequence_moves")
    op.drop_index("ix_sequence_moves_sequence_id", "sequence_moves")
    op.drop_constraint("ck_sequence_move_custom_beat_count", "sequence_moves", type_="check")
    op.drop_constraint("ck_sequence_move_position_positive", "sequence_moves", type_="check")
    op.drop_constraint("ck_sequence_move_entry_type", "sequence_moves", type_="check")
    op.drop_constraint("uq_sequence_position", "sequence_moves", type_="unique")
    op.drop_table("sequence_moves")

    # --- Drop sequences table ---
    op.drop_index("ix_sequences_user_dance_style", "sequences")
    op.drop_index("ix_sequences_user_id", "sequences")
    op.drop_table("sequences")

    # --- Drop collection_moves table ---
    op.drop_index("ix_collection_moves_move_id", "collection_moves")
    op.drop_index("ix_collection_moves_collection_id", "collection_moves")
    op.drop_constraint("uq_collection_move", "collection_moves", type_="unique")
    op.drop_table("collection_moves")

    # --- Drop collections table ---
    op.drop_index("ix_collections_user_dance_style", "collections")
    op.drop_index("ix_collections_user_id", "collections")
    op.drop_table("collections")
