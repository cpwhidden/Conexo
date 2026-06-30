import uuid
from datetime import datetime

from pydantic import BaseModel


class GoogleAuthRequest(BaseModel):
    token: str


class DevLoginRequest(BaseModel):
    """Local-dev login. `email` is optional; defaults to settings.dev_auth_email."""

    email: str | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    picture_url: str | None
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str
