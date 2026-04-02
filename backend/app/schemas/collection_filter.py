import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CollectionFilterCreate(BaseModel):
    name: str = Field(max_length=255)
    criteria: dict = Field(default_factory=dict)


class CollectionFilterUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    criteria: dict | None = None


class CollectionFilterResponse(BaseModel):
    id: uuid.UUID
    collection_id: uuid.UUID
    name: str
    criteria: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
