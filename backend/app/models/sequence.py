import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    """Return current UTC time as a naive datetime (no tzinfo) for TIMESTAMP columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Sequence(Base):
    __tablename__ = "sequences"
    __table_args__ = (
        Index("ix_sequences_user_id", "user_id"),
        Index("ix_sequences_collection_id", "collection_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_last_opened: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        default=_utcnow, onupdate=_utcnow, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="sequences")  # noqa: F821
    collection: Mapped["Collection"] = relationship()  # noqa: F821
    sequence_moves: Mapped[list["SequenceMove"]] = relationship(
        back_populates="sequence",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="SequenceMove.position",
    )


class SequenceMove(Base):
    __tablename__ = "sequence_moves"
    __table_args__ = (
        UniqueConstraint("sequence_id", "position", name="uq_sequence_position"),
        CheckConstraint(
            "(move_id IS NOT NULL AND custom_name IS NULL AND custom_beat_count IS NULL) OR "
            "(move_id IS NULL AND custom_name IS NOT NULL AND custom_beat_count IS NOT NULL)",
            name="ck_sequence_move_entry_type",
        ),
        CheckConstraint("position >= 1", name="ck_sequence_move_position_positive"),
        CheckConstraint(
            "custom_beat_count IS NULL OR custom_beat_count >= 0",
            name="ck_sequence_move_custom_beat_count",
        ),
        Index("ix_sequence_moves_sequence_id", "sequence_id"),
        Index("ix_sequence_moves_move_id", "move_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sequence_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sequences.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    move_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("moves.id", ondelete="CASCADE"), nullable=True
    )
    custom_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    custom_beat_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    sequence: Mapped["Sequence"] = relationship(back_populates="sequence_moves")
    move: Mapped["Move | None"] = relationship()  # noqa: F821
