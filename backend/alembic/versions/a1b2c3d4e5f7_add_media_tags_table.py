"""add media_tags table

Associates a collection tag with a single media item per move.
UNIQUE(tag_id, move_id) enforces "one media item per tag per move".

Revision ID: a1b2c3d4e5f7
Revises: 30523a585556
Create Date: 2026-05-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "30523a585556"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "media_tags",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tag_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "media_id",
            UUID(as_uuid=True),
            sa.ForeignKey("move_videos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "move_id",
            UUID(as_uuid=True),
            sa.ForeignKey("moves.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("tag_id", "move_id", name="uq_media_tag_per_move"),
        sa.Index("ix_media_tags_tag_id", "tag_id"),
        sa.Index("ix_media_tags_media_id", "media_id"),
        sa.Index("ix_media_tags_move_id", "move_id"),
    )


def downgrade() -> None:
    op.drop_table("media_tags")
