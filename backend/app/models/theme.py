import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    """Return current UTC time as a naive datetime (no tzinfo) for TIMESTAMP columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Theme(Base):
    """A theme groups related moves within a dance style (e.g., 'roasted chicken turns')."""

    __tablename__ = "themes"
    __table_args__ = (
        UniqueConstraint("user_id", "dance_style", "name", name="uq_theme_user_style_name"),
        Index("ix_themes_user_id", "user_id"),
        Index("ix_themes_user_dance_style", "user_id", "dance_style"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    dance_style: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        default=_utcnow, onupdate=_utcnow, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="themes")  # noqa: F821
    theme_moves: Mapped[list["ThemeMove"]] = relationship(
        back_populates="theme", lazy="selectin", cascade="all, delete-orphan"
    )


class ThemeMove(Base):
    """Junction table linking themes to moves."""

    __tablename__ = "theme_moves"
    __table_args__ = (
        UniqueConstraint("theme_id", "move_id", name="uq_theme_move"),
        Index("ix_theme_moves_theme_id", "theme_id"),
        Index("ix_theme_moves_move_id", "move_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    theme_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("themes.id", ondelete="CASCADE"), nullable=False
    )
    move_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("moves.id", ondelete="CASCADE"), nullable=False
    )
    added_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)

    theme: Mapped["Theme"] = relationship(back_populates="theme_moves")
    move: Mapped["Move"] = relationship()  # noqa: F821
