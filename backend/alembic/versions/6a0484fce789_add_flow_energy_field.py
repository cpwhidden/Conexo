"""add_flow_energy_field

Revision ID: 6a0484fce789
Revises: 0fbbbd9eb197
Create Date: 2026-02-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6a0484fce789'
down_revision: Union[str, None] = '0fbbbd9eb197'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add flow_energy column
    op.add_column('moves', sa.Column('flow_energy', sa.Integer(), nullable=True))

    # Add check constraint for 0-10 range
    op.create_check_constraint(
        'ck_moves_flow_energy_range',
        'moves',
        'flow_energy >= 0 AND flow_energy <= 10'
    )


def downgrade() -> None:
    # Drop check constraint
    op.drop_constraint('ck_moves_flow_energy_range', 'moves', type_='check')

    # Drop column
    op.drop_column('moves', 'flow_energy')
