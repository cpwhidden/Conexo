import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Float, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    """Return current UTC time as a naive datetime (no tzinfo) for TIMESTAMP columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Collection(Base):
    __tablename__ = "collections"
    __table_args__ = (
        Index("ix_collections_user_id", "user_id"),
        Index("ix_collections_user_dance_style", "user_id", "dance_style"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    dance_style: Mapped[str] = mapped_column(String(100), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    date_last_opened: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        default=_utcnow, onupdate=_utcnow, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="collections")  # noqa: F821
    collection_moves: Mapped[list["CollectionMove"]] = relationship(
        back_populates="collection", lazy="selectin", cascade="all, delete-orphan"
    )


class CollectionMove(Base):
    __tablename__ = "collection_moves"
    __table_args__ = (
        UniqueConstraint("collection_id", "move_id", name="uq_collection_move"),
        Index("ix_collection_moves_collection_id", "collection_id"),
        Index("ix_collection_moves_move_id", "move_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"), nullable=False
    )
    move_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("moves.id", ondelete="CASCADE"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    position_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    position_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    added_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)

    collection: Mapped["Collection"] = relationship(back_populates="collection_moves")
    move: Mapped["Move"] = relationship()  # noqa: F821
