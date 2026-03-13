import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

DANCE_STYLE_CHOICES = Literal[
    "Salsa", "Bachata", "Zouk", "Kizomba", "West Coast Swing", "Lambada", "Yoga"
]


class MoveCreate(BaseModel):
    name: str = Field(max_length=255)
    description: str | None = None
    beat_count: int = Field(ge=0)
    difficulty: int = Field(ge=0, le=10)
    familiarity: int = Field(ge=0, le=10)
    tags: list[str] = Field(default_factory=list)
    dance_style: DANCE_STYLE_CHOICES
    starting_beat: int = Field(ge=1, le=8)
    is_state: bool = False
    key_egress: bool = False
    key_ingress: bool = False
    leadability: int | None = Field(default=None, ge=0, le=10)
    mental_availability: int | None = Field(default=None, ge=0, le=10)
    beat_energy: int | None = Field(default=None, ge=0, le=10)
    moderna_energy: int | None = Field(default=None, ge=0, le=10)
    sensual_energy: int | None = Field(default=None, ge=0, le=10)
    impact: int | None = Field(default=None, ge=0, le=10)
    learning_priority: int | None = Field(default=None, ge=0, le=10)
    leader_styling: str | None = Field(default=None, max_length=300)
    follower_styling: str | None = Field(default=None, max_length=300)
    learning_notes: str | None = None

    @model_validator(mode="after")
    def validate_state_fields(self):
        if self.is_state:
            if self.beat_count != 0:
                raise ValueError("beat_count must be 0 when is_state is true")
        else:
            if self.beat_count < 1:
                raise ValueError("beat_count must be >= 1 when is_state is false")
        return self


class MoveUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    beat_count: int | None = Field(default=None, ge=0)
    difficulty: int | None = Field(default=None, ge=0, le=10)
    familiarity: int | None = Field(default=None, ge=0, le=10)
    tags: list[str] | None = None
    starting_beat: int | None = Field(default=None, ge=1, le=8)
    is_state: bool | None = None
    key_egress: bool | None = None
    key_ingress: bool | None = None
    leadability: int | None = Field(default=None, ge=0, le=10)
    mental_availability: int | None = Field(default=None, ge=0, le=10)
    beat_energy: int | None = Field(default=None, ge=0, le=10)
    moderna_energy: int | None = Field(default=None, ge=0, le=10)
    sensual_energy: int | None = Field(default=None, ge=0, le=10)
    impact: int | None = Field(default=None, ge=0, le=10)
    learning_priority: int | None = Field(default=None, ge=0, le=10)
    leader_styling: str | None = Field(default=None, max_length=300)
    follower_styling: str | None = Field(default=None, max_length=300)
    learning_notes: str | None = None


class MoveResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    beat_count: int
    difficulty: int
    familiarity: int
    tags: list[str]
    dance_style: str
    starting_beat: int
    is_state: bool
    key_egress: bool
    key_ingress: bool
    leadability: int | None
    mental_availability: int | None
    beat_energy: int | None
    moderna_energy: int | None
    sensual_energy: int | None
    impact: int | None
    learning_priority: int | None
    leader_styling: str | None
    follower_styling: str | None
    learning_notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
