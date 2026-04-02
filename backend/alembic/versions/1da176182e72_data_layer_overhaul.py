"""Data layer overhaul: collection-scoped connections and tags, remove themes

Revision ID: 1da176182e72
Revises: 5d4eae6dd2f8
Create Date: 2026-04-02 13:30:00.000000

Major changes:
- Connections become collection-scoped (add collection_id, remove user_id)
- Tags become a DB entity scoped to collections (replaces themes + move.tags ARRAY)
- Saved collection filters (JSONB criteria)
- Remove is_default from collections
- Remove dance_style from moves
- Drop themes and theme_moves tables
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision: str = '1da176182e72'
down_revision: Union[str, None] = '5d4eae6dd2f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ========================================================
    # Phase 1a: Additive changes — new tables and columns
    # ========================================================

    # Add nullable collection_id to move_connections
    op.add_column('move_connections', sa.Column(
        'collection_id', UUID(as_uuid=True),
        sa.ForeignKey('collections.id', ondelete='CASCADE'),
        nullable=True,
    ))
    op.create_index('ix_move_connections_collection_id', 'move_connections', ['collection_id'])

    # Create tags table
    op.create_table(
        'tags',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('collection_id', UUID(as_uuid=True), sa.ForeignKey('collections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint('collection_id', 'name', name='uq_tag_per_collection'),
        sa.Index('ix_tags_collection_id', 'collection_id'),
    )

    # Create move_tags join table
    op.create_table(
        'move_tags',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tag_id', UUID(as_uuid=True), sa.ForeignKey('tags.id', ondelete='CASCADE'), nullable=False),
        sa.Column('move_id', UUID(as_uuid=True), sa.ForeignKey('moves.id', ondelete='CASCADE'), nullable=False),
        sa.UniqueConstraint('tag_id', 'move_id', name='uq_move_tag'),
        sa.Index('ix_move_tags_tag_id', 'tag_id'),
        sa.Index('ix_move_tags_move_id', 'move_id'),
    )

    # Create collection_filters table
    op.create_table(
        'collection_filters',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('collection_id', UUID(as_uuid=True), sa.ForeignKey('collections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('criteria', JSONB(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint('collection_id', 'name', name='uq_filter_per_collection'),
        sa.Index('ix_collection_filters_collection_id', 'collection_id'),
    )

    # ========================================================
    # Phase 1b: Data migration
    # ========================================================

    # Drop old unique constraint FIRST so we can insert duplicates during expansion
    op.drop_constraint('uq_connection_per_user', 'move_connections', type_='unique')

    # Backfill collection_id on move_connections:
    # For each existing connection, find all collections containing both
    # source and target moves. Create a row per matching collection.
    op.execute("""
        CREATE TEMP TABLE _conn_expansion AS
        SELECT
            gen_random_uuid() AS id,
            mc.source_move_id,
            mc.target_move_id,
            mc.label,
            mc.notes,
            mc.flow,
            mc.created_at,
            cm_src.collection_id
        FROM move_connections mc
        JOIN collection_moves cm_src ON cm_src.move_id = mc.source_move_id
        JOIN collection_moves cm_tgt ON cm_tgt.move_id = mc.target_move_id
            AND cm_tgt.collection_id = cm_src.collection_id
        WHERE mc.collection_id IS NULL
    """)

    # Delete old connectionless rows
    op.execute("DELETE FROM move_connections WHERE collection_id IS NULL")

    # Insert expanded rows (user_id still present, will be dropped later)
    op.execute("""
        INSERT INTO move_connections (id, source_move_id, target_move_id, label, notes, flow, created_at, collection_id, user_id)
        SELECT
            ce.id,
            ce.source_move_id,
            ce.target_move_id,
            ce.label,
            ce.notes,
            ce.flow,
            ce.created_at,
            ce.collection_id,
            c.user_id
        FROM _conn_expansion ce
        JOIN collections c ON c.id = ce.collection_id
    """)

    op.execute("DROP TABLE _conn_expansion")

    # Migrate themes → tags
    # Create a tag for each theme in each matching collection
    op.execute("""
        INSERT INTO tags (id, collection_id, name, created_at)
        SELECT DISTINCT
            gen_random_uuid(),
            c.id,
            t.name,
            NOW()
        FROM themes t
        JOIN collections c ON c.user_id = t.user_id AND c.dance_style = t.dance_style
        ON CONFLICT (collection_id, name) DO NOTHING
    """)

    # Create move_tags for theme_moves
    op.execute("""
        INSERT INTO move_tags (id, tag_id, move_id)
        SELECT DISTINCT
            gen_random_uuid(),
            tags.id,
            tm.move_id
        FROM theme_moves tm
        JOIN themes t ON t.id = tm.theme_id
        JOIN collections c ON c.user_id = t.user_id AND c.dance_style = t.dance_style
        JOIN tags ON tags.collection_id = c.id AND tags.name = t.name
        JOIN collection_moves cm ON cm.collection_id = c.id AND cm.move_id = tm.move_id
        ON CONFLICT (tag_id, move_id) DO NOTHING
    """)

    # Migrate moves.tags ARRAY → Tag entities
    op.execute("""
        INSERT INTO tags (id, collection_id, name, created_at)
        SELECT DISTINCT
            gen_random_uuid(),
            cm.collection_id,
            tag_name,
            NOW()
        FROM moves m
        CROSS JOIN LATERAL unnest(m.tags) AS tag_name
        JOIN collection_moves cm ON cm.move_id = m.id
        WHERE m.tags IS NOT NULL AND array_length(m.tags, 1) > 0
        ON CONFLICT (collection_id, name) DO NOTHING
    """)

    op.execute("""
        INSERT INTO move_tags (id, tag_id, move_id)
        SELECT DISTINCT
            gen_random_uuid(),
            tags.id,
            m.id
        FROM moves m
        CROSS JOIN LATERAL unnest(m.tags) AS tag_name
        JOIN collection_moves cm ON cm.move_id = m.id
        JOIN tags ON tags.collection_id = cm.collection_id AND tags.name = tag_name
        WHERE m.tags IS NOT NULL AND array_length(m.tags, 1) > 0
        ON CONFLICT (tag_id, move_id) DO NOTHING
    """)

    # Convert default collections to regular
    op.execute("UPDATE collections SET is_default = false WHERE is_default = true")

    # ========================================================
    # Phase 1c: Removals
    # ========================================================

    # Make collection_id NOT NULL on move_connections
    op.alter_column('move_connections', 'collection_id', nullable=False)

    # Create new unique constraint on move_connections (old one already dropped in Phase 1b)
    op.create_unique_constraint(
        'uq_connection_per_collection',
        'move_connections',
        ['collection_id', 'source_move_id', 'target_move_id'],
    )

    # Drop user_id from move_connections (no separate index, was part of unique constraint)
    op.drop_column('move_connections', 'user_id')

    # Drop dance_style from moves
    op.drop_index('ix_moves_user_dance_style', table_name='moves')
    op.drop_column('moves', 'dance_style')

    # Drop tags ARRAY from moves
    op.drop_column('moves', 'tags')

    # Drop is_default from collections
    # First check if the partial unique index exists and drop it
    op.execute("DROP INDEX IF EXISTS uq_user_default_collection_per_style")
    op.drop_column('collections', 'is_default')

    # Drop theme_moves then themes
    op.drop_table('theme_moves')
    op.drop_table('themes')


def downgrade() -> None:
    # This migration is not safely reversible due to data transformations.
    # Restore from backup: backups/conexo_backup_20260402_131416.sql
    raise RuntimeError(
        "This migration cannot be reversed. "
        "Restore from backup: backups/conexo_backup_20260402_131416.sql"
    )
