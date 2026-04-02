import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TagCreate(BaseModel):
    name: str = Field(max_length=100)


class TagUpdate(BaseModel):
    name: str = Field(max_length=100)


class TagResponse(BaseModel):
    id: uuid.UUID
    collection_id: uuid.UUID
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MoveTagAdd(BaseModel):
    move_id: uuid.UUID


class MoveTagResponse(BaseModel):
    id: uuid.UUID
    tag_id: uuid.UUID
    move_id: uuid.UUID

    model_config = {"from_attributes": True}
