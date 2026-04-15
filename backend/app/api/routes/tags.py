import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.collection import Collection, CollectionMove
from app.models.move import Move
from app.models.tag import MoveTag, Tag
from app.models.user import User
from app.schemas.tag import (
    MoveTagAdd,
    MoveTagResponse,
    TagCreate,
    TagResponse,
    TagUpdate,
    TaggedMoveResponse,
)

router = APIRouter(tags=["tags"])


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
    "/collections/{collection_id}/tags", response_model=list[TagResponse]
)
async def list_tags(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)
    # Left join with move_tags to compute move_count per tag
    result = await db.execute(
        select(Tag, func.count(MoveTag.id).label("move_count"))
        .outerjoin(MoveTag, MoveTag.tag_id == Tag.id)
        .where(Tag.collection_id == collection_id)
        .group_by(Tag.id)
        .order_by(Tag.name)
    )
    return [
        TagResponse(
            id=tag.id,
            collection_id=tag.collection_id,
            name=tag.name,
            created_at=tag.created_at,
            move_count=move_count,
        )
        for tag, move_count in result.all()
    ]


@router.get(
    "/collections/{collection_id}/tags/{tag_id}/moves",
    response_model=list[TaggedMoveResponse],
)
async def get_tag_moves(
    collection_id: uuid.UUID,
    tag_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all moves tagged with a specific tag."""
    await _get_user_collection(db, collection_id, current_user.id)
    await _get_collection_tag(db, tag_id, collection_id)
    result = await db.execute(
        select(Move)
        .join(MoveTag, MoveTag.move_id == Move.id)
        .where(MoveTag.tag_id == tag_id)
        .order_by(Move.name)
    )
    return [
        TaggedMoveResponse(id=m.id, name=m.name) for m in result.scalars().all()
    ]


@router.post(
    "/collections/{collection_id}/tags",
    response_model=TagResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_tag(
    collection_id: uuid.UUID,
    body: TagCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)

    # Check unique name per collection
    existing = await db.execute(
        select(Tag).where(
            Tag.collection_id == collection_id, Tag.name == body.name
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A tag with this name already exists in this collection",
        )

    tag = Tag(collection_id=collection_id, name=body.name)
    db.add(tag)
    await db.flush()
    return TagResponse.model_validate(tag)


@router.patch(
    "/collections/{collection_id}/tags/{tag_id}",
    response_model=TagResponse,
)
async def rename_tag(
    collection_id: uuid.UUID,
    tag_id: uuid.UUID,
    body: TagUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)
    tag = await _get_collection_tag(db, tag_id, collection_id)

    # Check unique name per collection (exclude current tag)
    existing = await db.execute(
        select(Tag).where(
            Tag.collection_id == collection_id,
            Tag.name == body.name,
            Tag.id != tag_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A tag with this name already exists in this collection",
        )

    tag.name = body.name
    await db.flush()
    return TagResponse.model_validate(tag)


@router.delete(
    "/collections/{collection_id}/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_tag(
    collection_id: uuid.UUID,
    tag_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)
    tag = await _get_collection_tag(db, tag_id, collection_id)
    await db.delete(tag)


@router.post(
    "/collections/{collection_id}/tags/{tag_id}/moves",
    response_model=MoveTagResponse,
    status_code=status.HTTP_201_CREATED,
)
async def tag_move(
    collection_id: uuid.UUID,
    tag_id: uuid.UUID,
    body: MoveTagAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)
    await _get_collection_tag(db, tag_id, collection_id)

    # Validate move exists and is in the collection
    cm_result = await db.execute(
        select(CollectionMove).where(
            CollectionMove.collection_id == collection_id,
            CollectionMove.move_id == body.move_id,
        )
    )
    if cm_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Move not found in this collection",
        )

    # Check if already tagged
    existing = await db.execute(
        select(MoveTag).where(
            MoveTag.tag_id == tag_id, MoveTag.move_id == body.move_id
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Move is already tagged with this tag",
        )

    move_tag = MoveTag(tag_id=tag_id, move_id=body.move_id)
    db.add(move_tag)
    await db.flush()
    return MoveTagResponse.model_validate(move_tag)


@router.delete(
    "/collections/{collection_id}/tags/{tag_id}/moves/{move_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def untag_move(
    collection_id: uuid.UUID,
    tag_id: uuid.UUID,
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)
    await _get_collection_tag(db, tag_id, collection_id)

    result = await db.execute(
        select(MoveTag).where(
            MoveTag.tag_id == tag_id, MoveTag.move_id == move_id
        )
    )
    move_tag = result.scalar_one_or_none()
    if move_tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Move tag not found"
        )
    await db.delete(move_tag)


@router.get(
    "/collections/{collection_id}/moves/{move_id}/tags",
    response_model=list[TagResponse],
)
async def get_move_tags(
    collection_id: uuid.UUID,
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)

    # Validate move is in the collection
    cm_result = await db.execute(
        select(CollectionMove).where(
            CollectionMove.collection_id == collection_id,
            CollectionMove.move_id == move_id,
        )
    )
    if cm_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Move not found in this collection",
        )

    result = await db.execute(
        select(Tag)
        .join(MoveTag, MoveTag.tag_id == Tag.id)
        .where(
            Tag.collection_id == collection_id,
            MoveTag.move_id == move_id,
        )
        .order_by(Tag.name)
    )
    return [TagResponse.model_validate(t) for t in result.scalars().all()]


async def _get_collection_tag(
    db: AsyncSession, tag_id: uuid.UUID, collection_id: uuid.UUID
) -> Tag:
    result = await db.execute(
        select(Tag).where(
            Tag.id == tag_id, Tag.collection_id == collection_id
        )
    )
    tag = result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found"
        )
    return tag
