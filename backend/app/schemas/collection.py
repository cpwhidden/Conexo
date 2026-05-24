import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.connection import ConnectionResponse
from app.schemas.move import MoveGraphData
from app.schemas.tag import TagResponse

DANCE_STYLE_CHOICES = Literal[
    "Salsa", "Bachata", "Zouk", "Kizomba", "West Coast Swing", "Lambada", "Yoga"
]


class CollectionCreate(BaseModel):
    name: str = Field(max_length=255)
    description: str | None = None
    dance_style: DANCE_STYLE_CHOICES


class CollectionUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None


class CollectionMoveAdd(BaseModel):
    move_id: uuid.UUID
    notes: str | None = None


class CollectionMoveResponse(BaseModel):
    id: uuid.UUID
    move_id: uuid.UUID
    move_name: str
    notes: str | None
    position_x: float | None
    position_y: float | None
    added_at: datetime

    model_config = {"from_attributes": True}


class CollectionMovePositionUpdate(BaseModel):
    position_x: float
    position_y: float


class CollectionResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    dance_style: str
    date_last_opened: datetime | None
    move_count: int
    created_at: datetime
    updated_at: datetime


class CollectionWithMovesResponse(CollectionResponse):
    moves: list[CollectionMoveResponse]


class MediaTagLink(BaseModel):
    """A media item marked with a tag, for a specific move (used by the graph
    preview to pick the right media when a tag is active)."""

    move_id: uuid.UUID
    tag_id: uuid.UUID
    media_id: uuid.UUID


class CollectionGraphDataResponse(BaseModel):
    """Combined response for the graph view: collection + full moves + connections + tags."""

    collection: CollectionWithMovesResponse
    moves: list[MoveGraphData]
    connections: list[ConnectionResponse]
    tags: list[TagResponse] = []
    media_tags: list[MediaTagLink] = []
