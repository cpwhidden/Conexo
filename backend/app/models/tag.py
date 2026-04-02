import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("collection_id", "name", name="uq_tag_per_collection"),
        Index("ix_tags_collection_id", "collection_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)

    collection: Mapped["Collection"] = relationship(back_populates="tags")  # noqa: F821
    move_tags: Mapped[list["MoveTag"]] = relationship(
        back_populates="tag", lazy="selectin", cascade="all, delete-orphan"
    )


class MoveTag(Base):
    __tablename__ = "move_tags"
    __table_args__ = (
        UniqueConstraint("tag_id", "move_id", name="uq_move_tag"),
        Index("ix_move_tags_tag_id", "tag_id"),
        Index("ix_move_tags_move_id", "move_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), nullable=False
    )
    move_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("moves.id", ondelete="CASCADE"), nullable=False
    )

    tag: Mapped["Tag"] = relationship(back_populates="move_tags")
    move: Mapped["Move"] = relationship()  # noqa: F821
