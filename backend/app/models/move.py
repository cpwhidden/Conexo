import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, ForeignKeyConstraint, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

DANCE_STYLES = ["Salsa", "Bachata", "Zouk", "Kizomba", "West Coast Swing", "Lambada", "Yoga"]


def _utcnow() -> datetime:
    """Return current UTC time as a naive datetime (no tzinfo) for TIMESTAMP columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Move(Base):
    __tablename__ = "moves"
    __table_args__ = (
        # beat_count must be >0 for moves, =0 for states
        CheckConstraint(
            "(beat_count > 0 AND is_state = false) OR (beat_count = 0 AND is_state = true)",
            name="ck_moves_beat_count_valid",
        ),
        CheckConstraint(
            "difficulty >= 0 AND difficulty <= 10", name="ck_moves_difficulty_range"
        ),
        CheckConstraint(
            "familiarity >= 0 AND familiarity <= 10",
            name="ck_moves_familiarity_range",
        ),
        # starting_beat in 1-8 (nullable, so only checked when set)
        CheckConstraint(
            "starting_beat >= 1 AND starting_beat <= 8",
            name="ck_moves_starting_beat_range",
        ),
        # starting_beat is always required for both moves and states
        CheckConstraint(
            "starting_beat IS NOT NULL",
            name="ck_moves_starting_beat_required",
        ),
        # 0-10 range constraint for leadability
        CheckConstraint(
            "leadability >= 0 AND leadability <= 10",
            name="ck_moves_leadability_range",
        ),
        CheckConstraint(
            "mental_availability >= 0 AND mental_availability <= 10",
            name="ck_moves_mental_availability_range",
        ),
        CheckConstraint(
            "beat_energy >= 0 AND beat_energy <= 10",
            name="ck_moves_beat_energy_range",
        ),
        CheckConstraint(
            "moderna_energy >= 0 AND moderna_energy <= 10",
            name="ck_moves_moderna_energy_range",
        ),
        CheckConstraint(
            "sensual_energy >= 0 AND sensual_energy <= 10",
            name="ck_moves_sensual_energy_range",
        ),
        CheckConstraint(
            "impact >= 0 AND impact <= 10",
            name="ck_moves_impact_range",
        ),
        CheckConstraint(
            "learning_priority >= 0 AND learning_priority <= 10",
            name="ck_moves_learning_priority_range",
        ),
        Index("ix_moves_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    beat_count: Mapped[int] = mapped_column(nullable=False)
    difficulty: Mapped[int] = mapped_column(nullable=False)
    familiarity: Mapped[int] = mapped_column(nullable=False)
    # Timing
    starting_beat: Mapped[int] = mapped_column(nullable=False)
    is_state: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )

    # Key move flags
    key_egress: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    key_ingress: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    is_core: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )

    # Optional scores (0-10)
    leadability: Mapped[int | None] = mapped_column(nullable=True)
    mental_availability: Mapped[int | None] = mapped_column(nullable=True)
    beat_energy: Mapped[int | None] = mapped_column(nullable=True)
    moderna_energy: Mapped[int | None] = mapped_column(nullable=True)
    sensual_energy: Mapped[int | None] = mapped_column(nullable=True)
    impact: Mapped[int | None] = mapped_column(nullable=True)
    learning_priority: Mapped[int | None] = mapped_column(nullable=True)

    # Cover media
    cover_media_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("move_videos.id", ondelete="SET NULL"), nullable=True
    )

    # Learning
    date_learned: Mapped[datetime | None] = mapped_column(Date, nullable=True)

    # Styling notes
    leader_styling: Mapped[str | None] = mapped_column(String(300), nullable=True)
    follower_styling: Mapped[str | None] = mapped_column(String(300), nullable=True)
    learning_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        default=_utcnow, onupdate=_utcnow, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="moves")  # noqa: F821
    videos: Mapped[list["MoveVideo"]] = relationship(  # noqa: F821
        back_populates="move",
        lazy="selectin",
        cascade="all, delete-orphan",
        foreign_keys="MoveVideo.move_id",
    )
    outgoing_connections: Mapped[list["MoveConnection"]] = relationship(  # noqa: F821
        foreign_keys="MoveConnection.source_move_id",
        back_populates="source_move",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    incoming_connections: Mapped[list["MoveConnection"]] = relationship(  # noqa: F821
        foreign_keys="MoveConnection.target_move_id",
        back_populates="target_move",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    cues: Mapped[list["MoveCue"]] = relationship(  # noqa: F821
        back_populates="move", lazy="selectin", cascade="all, delete-orphan"
    )
