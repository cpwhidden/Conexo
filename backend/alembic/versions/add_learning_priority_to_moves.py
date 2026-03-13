"""Add learning_priority field to moves

Revision ID: k0l1m2n3o4p5
Revises: j9k0l1m2n3o4
Create Date: 2026-03-02

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "k0l1m2n3o4p5"
down_revision: Union[str, None] = "j9k0l1m2n3o4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("moves", sa.Column("learning_priority", sa.Integer, nullable=True))
    op.create_check_constraint(
        "ck_moves_learning_priority_range",
        "moves",
        "learning_priority >= 0 AND learning_priority <= 10",
    )


def downgrade() -> None:
    op.drop_constraint("ck_moves_learning_priority_range", "moves", type_="check")
    op.drop_column("moves", "learning_priority")
