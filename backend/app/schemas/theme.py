import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

DANCE_STYLE_CHOICES = Literal[
    "Salsa", "Bachata", "Zouk", "Kizomba", "West Coast Swing", "Lambada", "Yoga"
]


class ThemeCreate(BaseModel):
    name: str = Field(max_length=100)
    dance_style: DANCE_STYLE_CHOICES
    description: str | None = None


class ThemeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    description: str | None = None
    # dance_style is immutable - not included in update


class ThemeMoveAdd(BaseModel):
    move_id: uuid.UUID


class ThemeMoveResponse(BaseModel):
    id: uuid.UUID
    move_id: uuid.UUID
    move_name: str
    added_at: datetime

    model_config = {"from_attributes": True}


class ThemeResponse(BaseModel):
    id: uuid.UUID
    name: str
    dance_style: str
    description: str | None
    move_count: int
    created_at: datetime
    updated_at: datetime


class ThemeWithMovesResponse(ThemeResponse):
    moves: list[ThemeMoveResponse]
