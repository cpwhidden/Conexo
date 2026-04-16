"""add allowed_emails table and is_admin to users

Revision ID: 30523a585556
Revises: bce2668ad584
Create Date: 2026-04-16 00:01:00.901741

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '30523a585556'
down_revision: Union[str, None] = 'bce2668ad584'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create allowed_emails table
    op.create_table('allowed_emails',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )

    # Add is_admin as nullable first, backfill, then make NOT NULL
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=True))
    # Promote all existing users to admin (they were already authorized)
    op.execute("UPDATE users SET is_admin = true")
    op.alter_column('users', 'is_admin', nullable=False, server_default=sa.text('false'))

    # Seed allowed_emails with all existing user emails
    op.execute("""
        INSERT INTO allowed_emails (id, email, created_at)
        SELECT gen_random_uuid(), email, now()
        FROM users
        ON CONFLICT (email) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_column('users', 'is_admin')
    op.drop_table('allowed_emails')
