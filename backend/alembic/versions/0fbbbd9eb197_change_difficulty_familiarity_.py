"""change_difficulty_familiarity_leadability_to_0_10

Revision ID: 0fbbbd9eb197
Revises: g7h8i9j0k1l2
Create Date: 2026-02-13 01:06:30.096617

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0fbbbd9eb197'
down_revision: Union[str, None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old constraints
    op.drop_constraint('ck_moves_difficulty_range', 'moves', type_='check')
    op.drop_constraint('ck_moves_familiarity_range', 'moves', type_='check')
    op.drop_constraint('ck_moves_leadability_range', 'moves', type_='check')

    # Create new constraints with 0-10 range
    op.create_check_constraint(
        'ck_moves_difficulty_range',
        'moves',
        'difficulty >= 0 AND difficulty <= 10'
    )
    op.create_check_constraint(
        'ck_moves_familiarity_range',
        'moves',
        'familiarity >= 0 AND familiarity <= 10'
    )
    op.create_check_constraint(
        'ck_moves_leadability_range',
        'moves',
        'leadability >= 0 AND leadability <= 10'
    )


def downgrade() -> None:
    # Drop new constraints
    op.drop_constraint('ck_moves_difficulty_range', 'moves', type_='check')
    op.drop_constraint('ck_moves_familiarity_range', 'moves', type_='check')
    op.drop_constraint('ck_moves_leadability_range', 'moves', type_='check')

    # Restore old constraints with 1-10 range
    op.create_check_constraint(
        'ck_moves_difficulty_range',
        'moves',
        'difficulty >= 1 AND difficulty <= 10'
    )
    op.create_check_constraint(
        'ck_moves_familiarity_range',
        'moves',
        'familiarity >= 1 AND familiarity <= 10'
    )
    op.create_check_constraint(
        'ck_moves_leadability_range',
        'moves',
        'leadability >= 1 AND leadability <= 10'
    )
