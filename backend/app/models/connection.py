import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    """Return current UTC time as a naive datetime (no tzinfo) for TIMESTAMP columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class MoveConnection(Base):
    __tablename__ = "move_connections"
    __table_args__ = (
        UniqueConstraint(
            "collection_id",
            "source_move_id",
            "target_move_id",
            name="uq_connection_per_collection",
        ),
        CheckConstraint(
            "source_move_id != target_move_id", name="ck_no_self_connection"
        ),
        CheckConstraint(
            "flow >= 0 AND flow <= 10", name="ck_connections_flow_range"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"), nullable=False
    )
    source_move_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("moves.id", ondelete="CASCADE"), nullable=False
    )
    target_move_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("moves.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    flow: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)

    collection: Mapped["Collection"] = relationship(back_populates="connections")  # noqa: F821
    source_move: Mapped["Move"] = relationship(  # noqa: F821
        foreign_keys=[source_move_id], back_populates="outgoing_connections"
    )
    target_move: Mapped["Move"] = relationship(  # noqa: F821
        foreign_keys=[target_move_id], back_populates="incoming_connections"
    )
