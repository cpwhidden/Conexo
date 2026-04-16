import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.allowed_email import AllowedEmail
from app.models.user import User
from app.schemas.admin import AllowedEmailCreate, AllowedEmailResponse

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/allowed-emails", response_model=list[AllowedEmailResponse])
async def list_allowed_emails(
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AllowedEmail).order_by(AllowedEmail.email)
    )
    return [AllowedEmailResponse.model_validate(e) for e in result.scalars().all()]


@router.post(
    "/allowed-emails",
    response_model=AllowedEmailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_allowed_email(
    body: AllowedEmailCreate,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    email = body.email.strip().lower()

    # Check for duplicate
    existing = await db.execute(
        select(AllowedEmail).where(AllowedEmail.email == email)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already in the allowed list",
        )

    entry = AllowedEmail(email=email)
    db.add(entry)
    await db.flush()
    return AllowedEmailResponse.model_validate(entry)


@router.delete(
    "/allowed-emails/{email_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_allowed_email(
    email_id: uuid.UUID,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AllowedEmail).where(AllowedEmail.id == email_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Allowed email not found",
        )
    await db.delete(entry)
