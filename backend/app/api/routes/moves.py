import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.collection import CollectionMove
from app.models.move import Move
from app.models.user import User
from app.schemas.move import MoveCreate, MoveResponse, MoveUpdate

router = APIRouter(prefix="/moves", tags=["moves"])


@router.get("", response_model=list[MoveResponse])
async def list_moves(
    collection_id: uuid.UUID | None = None,
    difficulty_min: int | None = Query(None, ge=1, le=10),
    difficulty_max: int | None = Query(None, ge=1, le=10),
    familiarity_min: int | None = Query(None, ge=1, le=10),
    familiarity_max: int | None = Query(None, ge=1, le=10),
    is_state: bool | None = None,
    key_egress: bool | None = None,
    key_ingress: bool | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Move).where(Move.user_id == current_user.id)
    if collection_id is not None:
        query = query.join(CollectionMove, CollectionMove.move_id == Move.id).where(
            CollectionMove.collection_id == collection_id
        )
    if difficulty_min is not None:
        query = query.where(Move.difficulty >= difficulty_min)
    if difficulty_max is not None:
        query = query.where(Move.difficulty <= difficulty_max)
    if familiarity_min is not None:
        query = query.where(Move.familiarity >= familiarity_min)
    if familiarity_max is not None:
        query = query.where(Move.familiarity <= familiarity_max)
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
    move_data = body.model_dump(exclude={"collection_id"})
    move = Move(user_id=current_user.id, **move_data)
    db.add(move)
    await db.flush()

    # If collection_id provided, add move to that collection
    if body.collection_id is not None:
        collection_move = CollectionMove(
            collection_id=body.collection_id,
            move_id=move.id,
        )
        db.add(collection_move)
        await db.flush()

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
