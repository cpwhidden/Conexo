"""Sequence belongs to collection, remove dance_style from sequences

Revision ID: 56d7e0f5708b
Revises: 1da176182e72
Create Date: 2026-04-02 15:00:00.000000

- Add collection_id FK to sequences
- Backfill from matching collection (same user + dance_style)
- Remove dance_style from sequences
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = '56d7e0f5708b'
down_revision: Union[str, None] = '1da176182e72'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add nullable collection_id to sequences
    op.add_column('sequences', sa.Column(
        'collection_id', UUID(as_uuid=True),
        sa.ForeignKey('collections.id', ondelete='CASCADE'),
        nullable=True,
    ))
    op.create_index('ix_sequences_collection_id', 'sequences', ['collection_id'])

    # Backfill: assign each sequence to the first collection matching user+dance_style
    op.execute("""
        UPDATE sequences s
        SET collection_id = (
            SELECT c.id FROM collections c
            WHERE c.user_id = s.user_id AND c.dance_style = s.dance_style
            ORDER BY c.date_last_opened DESC NULLS LAST, c.created_at
            LIMIT 1
        )
    """)

    # For any sequences that couldn't be matched, create a collection
    op.execute("""
        INSERT INTO collections (id, user_id, name, description, dance_style, created_at, updated_at)
        SELECT gen_random_uuid(), s.user_id, s.dance_style || ' Sequences', NULL, s.dance_style, now(), now()
        FROM sequences s
        WHERE s.collection_id IS NULL
        GROUP BY s.user_id, s.dance_style
    """)

    # Try backfill again for any that were NULL
    op.execute("""
        UPDATE sequences s
        SET collection_id = (
            SELECT c.id FROM collections c
            WHERE c.user_id = s.user_id AND c.dance_style = s.dance_style
            ORDER BY c.created_at DESC
            LIMIT 1
        )
        WHERE s.collection_id IS NULL
    """)

    # Make collection_id NOT NULL
    op.alter_column('sequences', 'collection_id', nullable=False)

    # Drop dance_style from sequences
    op.drop_index('ix_sequences_user_dance_style', table_name='sequences')
    op.drop_column('sequences', 'dance_style')


def downgrade() -> None:
    raise RuntimeError(
        "This migration cannot be reversed. "
        "Restore from backup: backups/conexo_backup_20260402_131416.sql"
    )
