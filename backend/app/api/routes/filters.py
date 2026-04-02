import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.collection import Collection
from app.models.collection_filter import CollectionFilter
from app.models.user import User
from app.schemas.collection_filter import (
    CollectionFilterCreate,
    CollectionFilterResponse,
    CollectionFilterUpdate,
)

router = APIRouter(tags=["filters"])


async def _get_user_collection(
    db: AsyncSession, collection_id: uuid.UUID, user_id: uuid.UUID
) -> Collection:
    result = await db.execute(
        select(Collection).where(
            Collection.id == collection_id, Collection.user_id == user_id
        )
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found"
        )
    return collection


@router.get(
    "/collections/{collection_id}/filters",
    response_model=list[CollectionFilterResponse],
)
async def list_filters(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)
    result = await db.execute(
        select(CollectionFilter)
        .where(CollectionFilter.collection_id == collection_id)
        .order_by(CollectionFilter.name)
    )
    return [CollectionFilterResponse.model_validate(f) for f in result.scalars().all()]


@router.post(
    "/collections/{collection_id}/filters",
    response_model=CollectionFilterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_filter(
    collection_id: uuid.UUID,
    body: CollectionFilterCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)

    # Validate unique name per collection
    existing = await db.execute(
        select(CollectionFilter).where(
            CollectionFilter.collection_id == collection_id,
            CollectionFilter.name == body.name,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A filter with this name already exists in this collection",
        )

    cf = CollectionFilter(
        collection_id=collection_id,
        name=body.name,
        criteria=body.criteria,
    )
    db.add(cf)
    await db.flush()
    return CollectionFilterResponse.model_validate(cf)


@router.put(
    "/collections/{collection_id}/filters/{filter_id}",
    response_model=CollectionFilterResponse,
)
async def update_filter(
    collection_id: uuid.UUID,
    filter_id: uuid.UUID,
    body: CollectionFilterUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)
    cf = await _get_collection_filter(db, filter_id, collection_id)

    update_data = body.model_dump(exclude_unset=True)

    # If renaming, check unique name (exclude current filter)
    if "name" in update_data:
        existing = await db.execute(
            select(CollectionFilter).where(
                CollectionFilter.collection_id == collection_id,
                CollectionFilter.name == update_data["name"],
                CollectionFilter.id != filter_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A filter with this name already exists in this collection",
            )

    for field, value in update_data.items():
        setattr(cf, field, value)
    await db.flush()
    return CollectionFilterResponse.model_validate(cf)


@router.delete(
    "/collections/{collection_id}/filters/{filter_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_filter(
    collection_id: uuid.UUID,
    filter_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)
    cf = await _get_collection_filter(db, filter_id, collection_id)
    await db.delete(cf)


async def _get_collection_filter(
    db: AsyncSession, filter_id: uuid.UUID, collection_id: uuid.UUID
) -> CollectionFilter:
    result = await db.execute(
        select(CollectionFilter).where(
            CollectionFilter.id == filter_id,
            CollectionFilter.collection_id == collection_id,
        )
    )
    cf = result.scalar_one_or_none()
    if cf is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Filter not found"
        )
    return cf
