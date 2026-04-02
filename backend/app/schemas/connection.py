import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ConnectionCreate(BaseModel):
    collection_id: uuid.UUID
    source_move_id: uuid.UUID
    target_move_id: uuid.UUID
    label: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    flow: int | None = Field(default=None, ge=0, le=10)


class ConnectionUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    flow: int | None = Field(default=None, ge=0, le=10)


class ConnectionResponse(BaseModel):
    id: uuid.UUID
    collection_id: uuid.UUID
    source_move_id: uuid.UUID
    target_move_id: uuid.UUID
    label: str | None
    notes: str | None
    flow: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
