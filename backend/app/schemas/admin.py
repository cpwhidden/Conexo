import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AllowedEmailCreate(BaseModel):
    email: str = Field(max_length=255)


class AllowedEmailResponse(BaseModel):
    id: uuid.UUID
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}
