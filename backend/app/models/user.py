import uuid
from datetime import datetime, timezone

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    """Return current UTC time as a naive datetime (no tzinfo) for TIMESTAMP columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    picture_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    google_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)

    moves: Mapped[list["Move"]] = relationship(back_populates="user", lazy="selectin")  # noqa: F821
    collections: Mapped[list["Collection"]] = relationship(back_populates="user", lazy="selectin")  # noqa: F821
    sequences: Mapped[list["Sequence"]] = relationship(back_populates="user", lazy="selectin")  # noqa: F821
