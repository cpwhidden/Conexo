"""Revert impact_distance back to impact

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6
Create Date: 2026-03-02

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "m2n3o4p5q6r7"
down_revision: Union[str, None] = "l1m2n3o4p5q6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_moves_impact_distance_range", "moves", type_="check")
    op.alter_column("moves", "impact_distance", new_column_name="impact")
    op.create_check_constraint(
        "ck_moves_impact_range",
        "moves",
        "impact >= 0 AND impact <= 10",
    )


def downgrade() -> None:
    op.drop_constraint("ck_moves_impact_range", "moves", type_="check")
    op.alter_column("moves", "impact", new_column_name="impact_distance")
    op.create_check_constraint(
        "ck_moves_impact_distance_range",
        "moves",
        "impact_distance >= 0 AND impact_distance <= 10",
    )
