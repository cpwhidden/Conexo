import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.collection import Collection, CollectionMove
from app.models.move import Move
from app.models.user import User
from app.schemas.move import MoveCreate, MoveResponse, MoveUpdate

router = APIRouter(prefix="/moves", tags=["moves"])


@router.get("", response_model=list[MoveResponse])
async def list_moves(
    difficulty_min: int | None = Query(None, ge=1, le=10),
    difficulty_max: int | None = Query(None, ge=1, le=10),
    familiarity_min: int | None = Query(None, ge=1, le=10),
    familiarity_max: int | None = Query(None, ge=1, le=10),
    dance_style: str | None = None,
    tag: str | None = None,
    is_state: bool | None = None,
    key_egress: bool | None = None,
    key_ingress: bool | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Move).where(Move.user_id == current_user.id)
    if difficulty_min is not None:
        query = query.where(Move.difficulty >= difficulty_min)
    if difficulty_max is not None:
        query = query.where(Move.difficulty <= difficulty_max)
    if familiarity_min is not None:
        query = query.where(Move.familiarity >= familiarity_min)
    if familiarity_max is not None:
        query = query.where(Move.familiarity <= familiarity_max)
    if dance_style is not None:
        query = query.where(Move.dance_style == dance_style)
    if tag is not None:
        query = query.where(Move.tags.any(tag))
    if is_state is not None:
        query = query.where(Move.is_state == is_state)
    if key_egress is not None:
        query = query.where(Move.key_egress == key_egress)
    if key_ingress is not None:
        query = query.where(Move.key_ingress == key_ingress)
    query = query.order_by(Move.name)
    result = await db.execute(query)
    return [MoveResponse.model_validate(m) for m in result.scalars().all()]


@router.post("", response_model=MoveResponse, status_code=status.HTTP_201_CREATED)
async def create_move(
    body: MoveCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    move = Move(user_id=current_user.id, **body.model_dump())
    db.add(move)
    await db.flush()

    # Auto-add move to default collection for this dance style
    await _add_to_default_collection(db, move, current_user.id)

    return MoveResponse.model_validate(move)


@router.get("/{move_id}", response_model=MoveResponse)
async def get_move(
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    move = await _get_user_move(db, move_id, current_user.id)
    return MoveResponse.model_validate(move)


@router.put("/{move_id}", response_model=MoveResponse)
async def update_move(
    move_id: uuid.UUID,
    body: MoveUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    move = await _get_user_move(db, move_id, current_user.id)
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(move, field, value)
    await db.flush()
    return MoveResponse.model_validate(move)


@router.delete("/{move_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_move(
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    move = await _get_user_move(db, move_id, current_user.id)
    await db.delete(move)


async def _get_user_move(
    db: AsyncSession, move_id: uuid.UUID, user_id: uuid.UUID
) -> Move:
    result = await db.execute(
        select(Move).where(Move.id == move_id, Move.user_id == user_id)
    )
    move = result.scalar_one_or_none()
    if move is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Move not found")
    return move


async def _add_to_default_collection(
    db: AsyncSession, move: Move, user_id: uuid.UUID
) -> None:
    """Add a move to the default collection for its dance style, creating if needed."""
    # Check if default collection exists for this dance style
    result = await db.execute(
        select(Collection).where(
            Collection.user_id == user_id,
            Collection.dance_style == move.dance_style,
            Collection.is_default == True,  # noqa: E712
        )
    )
    default_collection = result.scalar_one_or_none()

    # Create default collection if it doesn't exist
    if default_collection is None:
        default_collection = Collection(
            user_id=user_id,
            name=f"All {move.dance_style} Moves",
            dance_style=move.dance_style,
            is_default=True,
        )
        db.add(default_collection)
        await db.flush()

    # Add move to the default collection
    collection_move = CollectionMove(
        collection_id=default_collection.id,
        move_id=move.id,
    )
    db.add(collection_move)
    await db.flush()
