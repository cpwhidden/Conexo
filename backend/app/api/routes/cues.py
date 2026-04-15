import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.routes.moves import _get_user_move
from app.core.database import get_db
from app.models.cue import MoveCue
from app.models.user import User
from app.schemas.cue import CueCreate, CueResponse, CueUpdate

router = APIRouter(tags=["cues"])

MAX_CUES_PER_MOVE = 300


@router.get("/moves/{move_id}/cues", response_model=list[CueResponse])
async def list_cues(
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Filter by user_id directly on MoveCue to skip the ownership round-trip
    # in the common case. Only pay the _get_user_move check when empty, so we
    # can still return 404 (rather than []) for moves the user doesn't own.
    result = await db.execute(
        select(MoveCue)
        .where(MoveCue.move_id == move_id, MoveCue.user_id == current_user.id)
        .order_by(MoveCue.beat, MoveCue.person, MoveCue.body_part)
    )
    cues = list(result.scalars().all())
    if not cues:
        await _get_user_move(db, move_id, current_user.id)
    return [CueResponse.model_validate(c) for c in cues]


@router.post(
    "/moves/{move_id}/cues",
    response_model=CueResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_cue(
    move_id: uuid.UUID,
    body: CueCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_move(db, move_id, current_user.id)

    # Check max cues limit
    count_result = await db.execute(
        select(func.count()).select_from(MoveCue).where(
            MoveCue.move_id == move_id, MoveCue.user_id == current_user.id
        )
    )
    if count_result.scalar_one() >= MAX_CUES_PER_MOVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum of {MAX_CUES_PER_MOVE} cues per move reached",
        )

    cue = MoveCue(
        move_id=move_id,
        user_id=current_user.id,
        beat=body.beat,
        person=body.person,
        body_part=body.body_part,
        description=body.description,
    )
    db.add(cue)
    try:
        await db.flush()
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A cue with this beat, person, and body part already exists for this move",
        )
    return CueResponse.model_validate(cue)


@router.patch("/cues/{cue_id}", response_model=CueResponse)
async def update_cue(
    cue_id: uuid.UUID,
    body: CueUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cue = await _get_user_cue(db, cue_id, current_user.id)
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cue, field, value)
    try:
        await db.flush()
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A cue with this beat, person, and body part already exists for this move",
        )
    return CueResponse.model_validate(cue)


@router.delete("/cues/{cue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cue(
    cue_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cue = await _get_user_cue(db, cue_id, current_user.id)
    await db.delete(cue)


async def _get_user_cue(
    db: AsyncSession, cue_id: uuid.UUID, user_id: uuid.UUID
) -> MoveCue:
    result = await db.execute(
        select(MoveCue).where(MoveCue.id == cue_id, MoveCue.user_id == user_id)
    )
    cue = result.scalar_one_or_none()
    if cue is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Cue not found"
        )
    return cue
