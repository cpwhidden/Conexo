import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class CollectionFilter(Base):
    __tablename__ = "collection_filters"
    __table_args__ = (
        UniqueConstraint("collection_id", "name", name="uq_filter_per_collection"),
        Index("ix_collection_filters_collection_id", "collection_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    criteria: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        default=_utcnow, onupdate=_utcnow, nullable=False
    )

    collection: Mapped["Collection"] = relationship(back_populates="filters")  # noqa: F821
