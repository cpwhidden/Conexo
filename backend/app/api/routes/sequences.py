import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.connection import MoveConnection
from app.models.move import Move
from app.models.sequence import Sequence, SequenceMove
from app.models.user import User
from app.schemas.sequence import (
    SequenceCreate,
    SequenceMoveAdd,
    SequenceMoveResponse,
    SequenceMoveUpdate,
    SequenceResponse,
    SequenceUpdate,
    SequenceWithEntriesResponse,
)

router = APIRouter(prefix="/sequences", tags=["sequences"])


@router.get("", response_model=list[SequenceResponse])
async def list_sequences(
    dance_style: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Sequence).where(Sequence.user_id == current_user.id)
    if dance_style is not None:
        query = query.where(Sequence.dance_style == dance_style)
    # Sort by date_last_opened descending, with nulls at the end
    query = query.order_by(nulls_last(Sequence.date_last_opened.desc()))
    result = await db.execute(query)
    return [SequenceResponse.model_validate(s) for s in result.scalars().all()]


@router.post("", response_model=SequenceResponse, status_code=status.HTTP_201_CREATED)
async def create_sequence(
    body: SequenceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sequence = Sequence(user_id=current_user.id, **body.model_dump())
    db.add(sequence)
    await db.flush()
    return SequenceResponse.model_validate(sequence)


@router.get("/{sequence_id}", response_model=SequenceWithEntriesResponse)
async def get_sequence(
    sequence_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sequence = await _get_user_sequence(db, sequence_id, current_user.id)

    # Update date_last_opened
    sequence.date_last_opened = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()

    return _build_sequence_response(sequence)


@router.put("/{sequence_id}", response_model=SequenceResponse)
async def update_sequence(
    sequence_id: uuid.UUID,
    body: SequenceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sequence = await _get_user_sequence(db, sequence_id, current_user.id)
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(sequence, field, value)
    await db.flush()
    return SequenceResponse.model_validate(sequence)


@router.delete("/{sequence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sequence(
    sequence_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sequence = await _get_user_sequence(db, sequence_id, current_user.id)
    await db.delete(sequence)


@router.post(
    "/{sequence_id}/entries",
    response_model=SequenceMoveResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_entry_to_sequence(
    sequence_id: uuid.UUID,
    body: SequenceMoveAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sequence = await _get_user_sequence(db, sequence_id, current_user.id)

    # Check if position is already taken
    existing_position = await db.execute(
        select(SequenceMove).where(
            SequenceMove.sequence_id == sequence_id,
            SequenceMove.position == body.position,
        )
    )
    if existing_position.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Position {body.position} is already taken",
        )

    move = None
    if body.move_id is not None:
        # Verify the move exists and belongs to the current user
        move = await _get_user_move(db, body.move_id, current_user.id)

        # Verify dance style matches
        if move.dance_style != sequence.dance_style:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Move dance style '{move.dance_style}' does not match sequence dance style '{sequence.dance_style}'",
            )

        # Validate connection to previous move (if any)
        await _validate_connection(db, sequence, body.position, body.move_id, current_user.id)

    sequence_move = SequenceMove(
        sequence_id=sequence_id,
        position=body.position,
        move_id=body.move_id,
        custom_name=body.custom_name,
        custom_beat_count=body.custom_beat_count,
        notes=body.notes,
    )
    db.add(sequence_move)
    await db.flush()

    beat_count = move.beat_count if move else body.custom_beat_count
    return SequenceMoveResponse(
        id=sequence_move.id,
        position=sequence_move.position,
        move_id=sequence_move.move_id,
        move_name=move.name if move else None,
        custom_name=sequence_move.custom_name,
        custom_beat_count=sequence_move.custom_beat_count,
        beat_count=beat_count,
        notes=sequence_move.notes,
    )


@router.put(
    "/{sequence_id}/entries/{entry_id}",
    response_model=SequenceMoveResponse,
)
async def update_sequence_entry(
    sequence_id: uuid.UUID,
    entry_id: uuid.UUID,
    body: SequenceMoveUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sequence = await _get_user_sequence(db, sequence_id, current_user.id)
    entry = await _get_sequence_entry(db, sequence_id, entry_id)

    if body.position is not None and body.position != entry.position:
        # Check if new position is taken
        existing_position = await db.execute(
            select(SequenceMove).where(
                SequenceMove.sequence_id == sequence_id,
                SequenceMove.position == body.position,
                SequenceMove.id != entry_id,
            )
        )
        if existing_position.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Position {body.position} is already taken",
            )

        # If this is a move entry, validate connections at new position
        if entry.move_id is not None:
            await _validate_connection(db, sequence, body.position, entry.move_id, current_user.id)

        entry.position = body.position

    if body.notes is not None:
        entry.notes = body.notes

    await db.flush()

    # Reload to get fresh data
    await db.refresh(entry)
    move = entry.move
    beat_count = move.beat_count if move else entry.custom_beat_count

    return SequenceMoveResponse(
        id=entry.id,
        position=entry.position,
        move_id=entry.move_id,
        move_name=move.name if move else None,
        custom_name=entry.custom_name,
        custom_beat_count=entry.custom_beat_count,
        beat_count=beat_count,
        notes=entry.notes,
    )


@router.delete(
    "/{sequence_id}/entries/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_sequence_entry(
    sequence_id: uuid.UUID,
    entry_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_sequence(db, sequence_id, current_user.id)
    entry = await _get_sequence_entry(db, sequence_id, entry_id)
    await db.delete(entry)


@router.post(
    "/{sequence_id}/entries/{entry_id}/upgrade",
    response_model=SequenceMoveResponse,
)
async def upgrade_custom_entry(
    sequence_id: uuid.UUID,
    entry_id: uuid.UUID,
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upgrade a custom entry to reference a real Move."""
    sequence = await _get_user_sequence(db, sequence_id, current_user.id)
    entry = await _get_sequence_entry(db, sequence_id, entry_id)

    if entry.move_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Entry is already linked to a move",
        )

    # Verify the move exists and belongs to the current user
    move = await _get_user_move(db, move_id, current_user.id)

    # Verify dance style matches
    if move.dance_style != sequence.dance_style:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Move dance style '{move.dance_style}' does not match sequence dance style '{sequence.dance_style}'",
        )

    # Validate connection at this position
    await _validate_connection(db, sequence, entry.position, move_id, current_user.id)

    # Upgrade the entry
    entry.move_id = move_id
    entry.custom_name = None
    entry.custom_beat_count = None
    await db.flush()

    return SequenceMoveResponse(
        id=entry.id,
        position=entry.position,
        move_id=entry.move_id,
        move_name=move.name,
        custom_name=None,
        custom_beat_count=None,
        beat_count=move.beat_count,
        notes=entry.notes,
    )


def _build_sequence_response(sequence: Sequence) -> SequenceWithEntriesResponse:
    """Build a full sequence response with entries and total beats."""
    entries = []
    total_beats = 0

    for sm in sequence.sequence_moves:
        if sm.move:
            beat_count = sm.move.beat_count
            move_name = sm.move.name
        else:
            beat_count = sm.custom_beat_count or 0
            move_name = None

        total_beats += beat_count
        entries.append(
            SequenceMoveResponse(
                id=sm.id,
                position=sm.position,
                move_id=sm.move_id,
                move_name=move_name,
                custom_name=sm.custom_name,
                custom_beat_count=sm.custom_beat_count,
                beat_count=beat_count,
                notes=sm.notes,
            )
        )

    return SequenceWithEntriesResponse(
        id=sequence.id,
        name=sequence.name,
        description=sequence.description,
        dance_style=sequence.dance_style,
        date_last_opened=sequence.date_last_opened,
        created_at=sequence.created_at,
        updated_at=sequence.updated_at,
        entries=entries,
        total_beats=total_beats,
    )


async def _validate_connection(
    db: AsyncSession,
    sequence: Sequence,
    new_position: int,
    move_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """
    Validate that a move at the given position has valid connections
    to adjacent move entries (skipping custom entries).
    """
    # Get all entries for this sequence
    result = await db.execute(
        select(SequenceMove)
        .where(SequenceMove.sequence_id == sequence.id)
        .order_by(SequenceMove.position)
    )
    entries = list(result.scalars().all())

    # Find the previous and next move entries (skip custom entries)
    prev_move_id = None
    next_move_id = None

    for entry in entries:
        if entry.position < new_position and entry.move_id is not None:
            prev_move_id = entry.move_id
        elif entry.position > new_position and entry.move_id is not None:
            next_move_id = entry.move_id
            break  # Only need the first one after

    # Validate connection from previous move to this move
    if prev_move_id is not None:
        conn_result = await db.execute(
            select(MoveConnection).where(
                MoveConnection.user_id == user_id,
                MoveConnection.source_move_id == prev_move_id,
                MoveConnection.target_move_id == move_id,
            )
        )
        if conn_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid connection from previous move to this move",
            )

    # Validate connection from this move to next move
    if next_move_id is not None:
        conn_result = await db.execute(
            select(MoveConnection).where(
                MoveConnection.user_id == user_id,
                MoveConnection.source_move_id == move_id,
                MoveConnection.target_move_id == next_move_id,
            )
        )
        if conn_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid connection from this move to next move",
            )


async def _get_user_sequence(
    db: AsyncSession, sequence_id: uuid.UUID, user_id: uuid.UUID
) -> Sequence:
    result = await db.execute(
        select(Sequence).where(
            Sequence.id == sequence_id, Sequence.user_id == user_id
        )
    )
    sequence = result.scalar_one_or_none()
    if sequence is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Sequence not found"
        )
    return sequence


async def _get_sequence_entry(
    db: AsyncSession, sequence_id: uuid.UUID, entry_id: uuid.UUID
) -> SequenceMove:
    result = await db.execute(
        select(SequenceMove).where(
            SequenceMove.id == entry_id, SequenceMove.sequence_id == sequence_id
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Sequence entry not found"
        )
    return entry


async def _get_user_move(
    db: AsyncSession, move_id: uuid.UUID, user_id: uuid.UUID
) -> Move:
    result = await db.execute(
        select(Move).where(Move.id == move_id, Move.user_id == user_id)
    )
    move = result.scalar_one_or_none()
    if move is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Move not found"
        )
    return move
