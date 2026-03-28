"""add cover_media_id to moves

Revision ID: 0a78b43f85d2
Revises: 9ce5f1b3e7f7
Create Date: 2026-03-20 21:39:30.498909

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0a78b43f85d2'
down_revision: Union[str, None] = '9ce5f1b3e7f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('moves', sa.Column('cover_media_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_moves_cover_media_id',
        'moves', 'move_videos',
        ['cover_media_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_moves_cover_media_id', 'moves', type_='foreignkey')
    op.drop_column('moves', 'cover_media_id')
