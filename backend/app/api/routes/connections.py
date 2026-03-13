import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.connection import MoveConnection
from app.models.user import User
from app.schemas.connection import ConnectionCreate, ConnectionResponse, ConnectionUpdate

router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("", response_model=list[ConnectionResponse])
async def list_connections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MoveConnection).where(MoveConnection.user_id == current_user.id)
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
    conn = MoveConnection(user_id=current_user.id, **body.model_dump())
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MoveConnection).where(
            MoveConnection.user_id == current_user.id,
            or_(
                MoveConnection.source_move_id == move_id,
                MoveConnection.target_move_id == move_id,
            ),
        )
    )
    return [ConnectionResponse.model_validate(c) for c in result.scalars().all()]


async def _get_user_connection(
    db: AsyncSession, connection_id: uuid.UUID, user_id: uuid.UUID
) -> MoveConnection:
    result = await db.execute(
        select(MoveConnection).where(
            MoveConnection.id == connection_id, MoveConnection.user_id == user_id
        )
    )
    conn = result.scalar_one_or_none()
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found"
        )
    return conn
