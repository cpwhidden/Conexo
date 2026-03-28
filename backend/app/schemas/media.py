import uuid
from datetime import datetime

from pydantic import BaseModel


class MediaResponse(BaseModel):
    id: uuid.UUID
    move_id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class MediaUpdate(BaseModel):
    filename: str


class MediaURLResponse(BaseModel):
    url: str
    content_type: str
