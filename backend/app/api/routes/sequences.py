import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.collection import Collection, CollectionMove
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
    collection_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Sequence).where(Sequence.user_id == current_user.id)
    if collection_id is not None:
        query = query.where(Sequence.collection_id == collection_id)
    query = query.order_by(nulls_last(Sequence.date_last_opened.desc()))
    result = await db.execute(query)
    return [SequenceResponse.model_validate(s) for s in result.scalars().all()]


@router.post("", response_model=SequenceResponse, status_code=status.HTTP_201_CREATED)
async def create_sequence(
    body: SequenceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify collection belongs to user
    await _verify_collection_owner(db, body.collection_id, current_user.id)
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
        move = await _get_user_move(db, body.move_id, current_user.id)

        # Verify move is in the sequence's collection
        await _verify_move_in_collection(db, body.move_id, sequence.collection_id)

        # Validate connection to adjacent moves
        await _validate_connection(db, sequence, body.position, body.move_id)

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

        if entry.move_id is not None:
            await _validate_connection(db, sequence, body.position, entry.move_id)

        entry.position = body.position

    if body.notes is not None:
        entry.notes = body.notes

    await db.flush()
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

    move = await _get_user_move(db, move_id, current_user.id)
    await _verify_move_in_collection(db, move_id, sequence.collection_id)
    await _validate_connection(db, sequence, entry.position, move_id)

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
        collection_id=sequence.collection_id,
        name=sequence.name,
        description=sequence.description,
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
) -> None:
    """Validate connections to adjacent moves using collection-scoped connections."""
    result = await db.execute(
        select(SequenceMove)
        .where(SequenceMove.sequence_id == sequence.id)
        .order_by(SequenceMove.position)
    )
    entries = list(result.scalars().all())

    prev_move_id = None
    next_move_id = None

    for entry in entries:
        if entry.position < new_position and entry.move_id is not None:
            prev_move_id = entry.move_id
        elif entry.position > new_position and entry.move_id is not None:
            next_move_id = entry.move_id
            break

    if prev_move_id is not None:
        conn_result = await db.execute(
            select(MoveConnection).where(
                MoveConnection.collection_id == sequence.collection_id,
                MoveConnection.source_move_id == prev_move_id,
                MoveConnection.target_move_id == move_id,
            )
        )
        if conn_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid connection from previous move to this move",
            )

    if next_move_id is not None:
        conn_result = await db.execute(
            select(MoveConnection).where(
                MoveConnection.collection_id == sequence.collection_id,
                MoveConnection.source_move_id == move_id,
                MoveConnection.target_move_id == next_move_id,
            )
        )
        if conn_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid connection from this move to next move",
            )


async def _verify_collection_owner(
    db: AsyncSession, collection_id: uuid.UUID, user_id: uuid.UUID
) -> Collection:
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id, Collection.user_id == user_id)
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    return collection


async def _verify_move_in_collection(
    db: AsyncSession, move_id: uuid.UUID, collection_id: uuid.UUID
) -> None:
    result = await db.execute(
        select(CollectionMove).where(
            CollectionMove.collection_id == collection_id,
            CollectionMove.move_id == move_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Move is not in this sequence's collection",
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
