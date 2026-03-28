import uuid
from typing import Literal

from pydantic import BaseModel, Field

PersonType = Literal["leader", "follower"]

BodyPartType = Literal[
    "right foot", "right leg", "left foot", "left leg",
    "hips", "core", "chest", "back",
    "right shoulder", "right arm",
    "left shoulder", "left arm", "left hand",
    "neck", "head", "center of gravity",
]


class CueCreate(BaseModel):
    beat: int = Field(ge=1)
    person: PersonType
    body_part: BodyPartType
    description: str = Field(min_length=1)


class CueUpdate(BaseModel):
    beat: int | None = Field(default=None, ge=1)
    person: PersonType | None = None
    body_part: BodyPartType | None = None
    description: str | None = Field(default=None, min_length=1)


class CueResponse(BaseModel):
    id: uuid.UUID
    move_id: uuid.UUID
    beat: int
    person: str
    body_part: str
    description: str

    model_config = {"from_attributes": True}
