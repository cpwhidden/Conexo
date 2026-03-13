"""rename_flow_energy_to_moderna_add_leader_styling_and_connection_flow

Revision ID: h8i9j0k1l2m3
Revises: aeb1ed06c182
Create Date: 2026-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h8i9j0k1l2m3'
down_revision: Union[str, None] = 'aeb1ed06c182'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Rename flow_energy to moderna_energy in moves table
    # First drop the check constraint
    op.drop_constraint("ck_moves_flow_energy_range", "moves", type_="check")
    # Rename the column
    op.alter_column("moves", "flow_energy", new_column_name="moderna_energy")
    # Recreate the check constraint with new name
    op.create_check_constraint(
        "ck_moves_moderna_energy_range",
        "moves",
        "moderna_energy >= 0 AND moderna_energy <= 10"
    )

    # 2. Add leader_styling column to moves table
    op.add_column(
        "moves",
        sa.Column("leader_styling", sa.String(300), nullable=True)
    )

    # 3. Add flow column to move_connections table with 0-10 constraint
    op.add_column(
        "move_connections",
        sa.Column("flow", sa.Integer, nullable=True)
    )
    op.create_check_constraint(
        "ck_connections_flow_range",
        "move_connections",
        "flow >= 0 AND flow <= 10"
    )


def downgrade() -> None:
    # 3. Remove flow column from move_connections
    op.drop_constraint("ck_connections_flow_range", "move_connections", type_="check")
    op.drop_column("move_connections", "flow")

    # 2. Remove leader_styling column from moves
    op.drop_column("moves", "leader_styling")

    # 1. Rename moderna_energy back to flow_energy
    op.drop_constraint("ck_moves_moderna_energy_range", "moves", type_="check")
    op.alter_column("moves", "moderna_energy", new_column_name="flow_energy")
    op.create_check_constraint(
        "ck_moves_flow_energy_range",
        "moves",
        "flow_energy >= 0 AND flow_energy <= 10"
    )
