"""Add soft delete (deleted_at) to moves

Revision ID: c3f8a1d90b45
Revises: a1b2c3d4e5f7
Create Date: 2026-09-07

Moves are no longer removed by DELETE /api/moves/{id}; the row stays and
deleted_at is stamped instead, so the delete can be undone. Read paths filter
on deleted_at IS NULL.
"""
import sqlalchemy as sa
from alembic import op

revision = "c3f8a1d90b45"
down_revision = "a1b2c3d4e5f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("moves", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    # Partial index: only soft-deleted rows are indexed, since live reads filter
    # on IS NULL and would not benefit from a full index.
    op.create_index(
        "ix_moves_deleted_at",
        "moves",
        ["deleted_at"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_moves_deleted_at", table_name="moves")
    op.drop_column("moves", "deleted_at")
