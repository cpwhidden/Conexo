import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_google_id(db: AsyncSession, google_id: str) -> User | None:
    result = await db.execute(select(User).where(User.google_id == google_id))
    return result.scalar_one_or_none()


async def upsert_user_from_google(
    db: AsyncSession,
    google_id: str,
    email: str,
    name: str,
    picture_url: str | None,
) -> User:
    """Find existing user by google_id or create a new one."""
    user = await get_user_by_google_id(db, google_id)
    if user:
        user.email = email
        user.name = name
        user.picture_url = picture_url
        return user

    user = User(
        google_id=google_id,
        email=email,
        name=name,
        picture_url=picture_url,
    )
    db.add(user)
    await db.flush()
    return user
