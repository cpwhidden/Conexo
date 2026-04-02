import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class SequenceCreate(BaseModel):
    collection_id: uuid.UUID
    name: str = Field(max_length=255)
    description: str | None = None


class SequenceUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None


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
    move_name: str | None
    custom_name: str | None
    custom_beat_count: int | None
    beat_count: int
    notes: str | None

    model_config = {"from_attributes": True}


class SequenceResponse(BaseModel):
    id: uuid.UUID
    collection_id: uuid.UUID
    name: str
    description: str | None
    date_last_opened: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SequenceWithEntriesResponse(SequenceResponse):
    entries: list[SequenceMoveResponse]
    total_beats: int
