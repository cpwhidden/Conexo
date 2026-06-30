from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, verify_google_token
from app.models.user import User
from app.schemas.user import (
    AuthResponse,
    DevLoginRequest,
    GoogleAuthRequest,
    UserResponse,
)
from app.services.user import get_or_create_dev_user, upsert_user_from_google

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google", response_model=AuthResponse)
async def google_auth(
    body: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        google_info = verify_google_token(body.token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {e}",
        )

    user = await upsert_user_from_google(
        db,
        google_id=google_info["sub"],
        email=google_info["email"],
        name=google_info.get("name", google_info["email"]),
        picture_url=google_info.get("picture"),
    )

    access_token = create_access_token(str(user.id))
    return AuthResponse(user=UserResponse.model_validate(user), access_token=access_token)


@router.post("/dev-login", response_model=AuthResponse)
async def dev_login(
    body: DevLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Local-only login that bypasses Google SSO.

    Disabled (404) unless CONEXO_DEV_AUTH=true. Intended for local development
    and automated tests; the startup guard prevents it from running in prod.
    """
    if not settings.dev_auth:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found"
        )

    email = (body.email or settings.dev_auth_email).strip().lower()
    user = await get_or_create_dev_user(db, email)

    access_token = create_access_token(str(user.id))
    return AuthResponse(user=UserResponse.model_validate(user), access_token=access_token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)
