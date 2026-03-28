import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

PERSON_VALUES = ["leader", "follower"]

BODY_PART_VALUES = [
    "right foot",
    "right leg",
    "left foot",
    "left leg",
    "hips",
    "core",
    "chest",
    "back",
    "right shoulder",
    "right arm",
    "left shoulder",
    "left arm",
    "left hand",
    "neck",
    "head",
    "center of gravity",
]


class MoveCue(Base):
    __tablename__ = "move_cues"
    __table_args__ = (
        UniqueConstraint(
            "move_id", "beat", "person", "body_part",
            name="uq_cue_per_beat_person_part",
        ),
        CheckConstraint("beat >= 1", name="ck_cue_beat_positive"),
        Index("ix_move_cues_move_id", "move_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    move_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("moves.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    beat: Mapped[int] = mapped_column(Integer, nullable=False)
    person: Mapped[str] = mapped_column(String(20), nullable=False)
    body_part: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    move: Mapped["Move"] = relationship(back_populates="cues")  # noqa: F821
