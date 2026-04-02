import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.collection import Collection
from app.models.connection import MoveConnection
from app.models.sequence import Sequence, SequenceMove
from app.models.user import User
from app.schemas.connection import ConnectionCreate, ConnectionResponse, ConnectionUpdate

router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("", response_model=list[ConnectionResponse])
async def list_connections(
    collection_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify collection ownership
    await _verify_collection_owner(db, collection_id, current_user.id)
    result = await db.execute(
        select(MoveConnection).where(MoveConnection.collection_id == collection_id)
    )
    return [ConnectionResponse.model_validate(c) for c in result.scalars().all()]


@router.post("", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_connection(
    body: ConnectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.source_move_id == body.target_move_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and target moves must be different",
        )
    # Verify collection ownership
    await _verify_collection_owner(db, body.collection_id, current_user.id)

    conn = MoveConnection(**body.model_dump())
    db.add(conn)
    await db.flush()
    return ConnectionResponse.model_validate(conn)


@router.put("/{connection_id}", response_model=ConnectionResponse)
async def update_connection(
    connection_id: uuid.UUID,
    body: ConnectionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn = await _get_user_connection(db, connection_id, current_user.id)
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(conn, field, value)
    await db.flush()
    return ConnectionResponse.model_validate(conn)


@router.get("/{connection_id}/usage")
async def get_connection_usage(
    connection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return names of sequences that use both source and target moves of this connection."""
    conn = await _get_user_connection(db, connection_id, current_user.id)
    # Find sequences in the same collection that contain both moves
    src_alias = SequenceMove.__table__.alias("src")
    tgt_alias = SequenceMove.__table__.alias("tgt")
    result = await db.execute(
        select(Sequence.name)
        .join(src_alias, src_alias.c.sequence_id == Sequence.id)
        .join(tgt_alias, tgt_alias.c.sequence_id == Sequence.id)
        .where(
            Sequence.collection_id == conn.collection_id,
            src_alias.c.move_id == conn.source_move_id,
            tgt_alias.c.move_id == conn.target_move_id,
        )
        .distinct()
    )
    return {"sequence_names": list(result.scalars().all())}


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    connection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn = await _get_user_connection(db, connection_id, current_user.id)
    await db.delete(conn)


@router.get(
    "/by-move/{move_id}",
    response_model=list[ConnectionResponse],
)
async def get_connections_for_move(
    move_id: uuid.UUID,
    collection_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_collection_owner(db, collection_id, current_user.id)
    result = await db.execute(
        select(MoveConnection).where(
            MoveConnection.collection_id == collection_id,
            or_(
                MoveConnection.source_move_id == move_id,
                MoveConnection.target_move_id == move_id,
            ),
        )
    )
    return [ConnectionResponse.model_validate(c) for c in result.scalars().all()]


async def _verify_collection_owner(
    db: AsyncSession, collection_id: uuid.UUID, user_id: uuid.UUID
) -> Collection:
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id, Collection.user_id == user_id)
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found"
        )
    return collection


async def _get_user_connection(
    db: AsyncSession, connection_id: uuid.UUID, user_id: uuid.UUID
) -> MoveConnection:
    result = await db.execute(
        select(MoveConnection)
        .join(Collection, MoveConnection.collection_id == Collection.id)
        .where(MoveConnection.id == connection_id, Collection.user_id == user_id)
    )
    conn = result.scalar_one_or_none()
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found"
        )
    return conn
