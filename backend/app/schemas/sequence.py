import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

DANCE_STYLE_CHOICES = Literal[
    "Salsa", "Bachata", "Zouk", "Kizomba", "West Coast Swing", "Lambada"
]


class SequenceCreate(BaseModel):
    name: str = Field(max_length=255)
    description: str | None = None
    dance_style: DANCE_STYLE_CHOICES


class SequenceUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    # dance_style is immutable - not included in update


class SequenceMoveAdd(BaseModel):
    """Add an entry to a sequence. Either move_id OR (custom_name + custom_beat_count)."""

    position: int = Field(ge=1)
    move_id: uuid.UUID | None = None
    custom_name: str | None = Field(default=None, max_length=255)
    custom_beat_count: int | None = Field(default=None, ge=0)
    notes: str | None = None

    @model_validator(mode="after")
    def validate_entry_type(self):
        if self.move_id is not None:
            if self.custom_name is not None or self.custom_beat_count is not None:
                raise ValueError(
                    "Cannot set custom_name or custom_beat_count when move_id is provided"
                )
        else:
            if self.custom_name is None or self.custom_beat_count is None:
                raise ValueError(
                    "Must provide both custom_name and custom_beat_count when move_id is not provided"
                )
        return self


class SequenceMoveUpdate(BaseModel):
    """Update a sequence entry's position or notes."""

    position: int | None = Field(default=None, ge=1)
    notes: str | None = None


class SequenceMoveResponse(BaseModel):
    id: uuid.UUID
    position: int
    move_id: uuid.UUID | None
    move_name: str | None  # From the linked Move, or None for custom
    custom_name: str | None
    custom_beat_count: int | None
    beat_count: int  # Derived: from Move or custom_beat_count
    notes: str | None

    model_config = {"from_attributes": True}


class SequenceResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    dance_style: str
    date_last_opened: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SequenceWithEntriesResponse(SequenceResponse):
    entries: list[SequenceMoveResponse]
    total_beats: int  # Sum of all beat counts
