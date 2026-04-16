import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload, selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.collection import Collection, CollectionMove
from app.models.connection import MoveConnection
from app.models.cue import MoveCue
from app.models.move import Move
from app.models.tag import MoveTag, Tag
from app.models.user import User
from app.models.video import MoveVideo
from app.schemas.collection import (
    CollectionCreate,
    CollectionGraphDataResponse,
    CollectionMoveAdd,
    CollectionMovePositionUpdate,
    CollectionMoveResponse,
    CollectionResponse,
    CollectionUpdate,
    CollectionWithMovesResponse,
)
from app.schemas.connection import ConnectionResponse
from app.schemas.move import MoveGraphData
from app.schemas.tag import TagResponse

router = APIRouter(prefix="/collections", tags=["collections"])


def _build_collection_response(c: Collection) -> CollectionResponse:
    return CollectionResponse(
        id=c.id,
        name=c.name,
        description=c.description,
        dance_style=c.dance_style,
        date_last_opened=c.date_last_opened,
        move_count=len(c.collection_moves),
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("", response_model=list[CollectionResponse])
async def list_collections(
    dance_style: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Collection).where(Collection.user_id == current_user.id)
    if dance_style is not None:
        query = query.where(Collection.dance_style == dance_style)
    query = query.order_by(nulls_last(Collection.date_last_opened.desc()))
    result = await db.execute(query)
    return [_build_collection_response(c) for c in result.scalars().all()]


@router.get("/by-move/{move_id}", response_model=list[CollectionResponse])
async def get_collections_for_move(
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_move(db, move_id, current_user.id)
    result = await db.execute(
        select(Collection)
        .join(CollectionMove)
        .where(
            Collection.user_id == current_user.id,
            CollectionMove.move_id == move_id,
        )
        .order_by(Collection.name)
    )
    return [_build_collection_response(c) for c in result.scalars().all()]


@router.post("", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    body: CollectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    collection = Collection(user_id=current_user.id, **body.model_dump())
    db.add(collection)
    await db.flush()
    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        dance_style=collection.dance_style,
        date_last_opened=collection.date_last_opened,
        move_count=0,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


@router.get("/{collection_id}", response_model=CollectionWithMovesResponse)
async def get_collection(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    collection = await _get_user_collection(db, collection_id, current_user.id)
    collection.date_last_opened = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()

    moves = [
        CollectionMoveResponse(
            id=cm.id,
            move_id=cm.move_id,
            move_name=cm.move.name,
            notes=cm.notes,
            position_x=cm.position_x,
            position_y=cm.position_y,
            added_at=cm.added_at,
        )
        for cm in collection.collection_moves
    ]

    return CollectionWithMovesResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        dance_style=collection.dance_style,
        date_last_opened=collection.date_last_opened,
        move_count=len(moves),
        created_at=collection.created_at,
        updated_at=collection.updated_at,
        moves=moves,
    )


@router.get(
    "/{collection_id}/graph-data", response_model=CollectionGraphDataResponse
)
async def get_collection_graph_data(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all data needed for the graph view in a single response."""
    # Eagerly load collection_moves AND their associated Move objects in two
    # batched SELECT-IN queries, eliminating the N+1 lazy-load on cm.move.name
    # and the separate select(Move).where(id.in_(...)) that followed.
    result = await db.execute(
        select(Collection)
        .where(Collection.id == collection_id, Collection.user_id == current_user.id)
        .options(
            selectinload(Collection.collection_moves).selectinload(CollectionMove.move),
        )
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found"
        )

    collection.date_last_opened = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()

    move_stubs = [
        CollectionMoveResponse(
            id=cm.id,
            move_id=cm.move_id,
            move_name=cm.move.name,
            notes=cm.notes,
            position_x=cm.position_x,
            position_y=cm.position_y,
            added_at=cm.added_at,
        )
        for cm in collection.collection_moves
    ]
    collection_response = CollectionWithMovesResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        dance_style=collection.dance_style,
        date_last_opened=collection.date_last_opened,
        move_count=len(move_stubs),
        created_at=collection.created_at,
        updated_at=collection.updated_at,
        moves=move_stubs,
    )

    # Move objects are already loaded via the selectinload chain above
    move_objects = [cm.move for cm in collection.collection_moves if cm.move is not None]
    move_ids = [m.id for m in move_objects]

    if move_ids:

        # Single query: connections + enrichment data via raw SQL
        # This combines 4 separate queries into 1 round-trip
        from sqlalchemy import text
        enrichment_sql = text("""
            SELECT 'conn' AS type, id::text, source_move_id::text AS key1, target_move_id::text AS key2,
                   label, notes, flow::text, created_at::text, collection_id::text
            FROM move_connections WHERE collection_id = :cid
            UNION ALL
            SELECT 'media' AS type, NULL, move_id::text, count(*)::text, NULL, NULL, NULL, NULL, NULL
            FROM move_videos WHERE move_id = ANY(:mids) GROUP BY move_id
            UNION ALL
            SELECT 'tag' AS type, NULL, mt.move_id::text, t.name, NULL, NULL, NULL, NULL, NULL
            FROM move_tags mt JOIN tags t ON mt.tag_id = t.id
            WHERE mt.move_id = ANY(:mids) AND t.collection_id = :cid
            UNION ALL
            SELECT 'cue' AS type, NULL, move_id::text, description, NULL, NULL, NULL, NULL, NULL
            FROM move_cues WHERE move_id = ANY(:mids)
            UNION ALL
            SELECT 'alltag' AS type, id::text, collection_id::text, name, NULL, NULL, NULL, created_at::text, updated_at::text
            FROM tags WHERE collection_id = :cid ORDER BY type, key1
        """)
        result = await db.execute(enrichment_sql, {"cid": collection_id, "mids": move_ids})
        rows = result.all()

        connection_objects = []
        media_counts: dict[uuid.UUID, int] = {}
        tag_names_map: dict[uuid.UUID, list[str]] = {}
        cue_descs_map: dict[uuid.UUID, list[str]] = {}
        all_tags = []

        for row in rows:
            rtype = row[0]
            if rtype == "conn":
                connection_objects.append(MoveConnection(
                    id=uuid.UUID(row[1]),
                    source_move_id=uuid.UUID(row[2]),
                    target_move_id=uuid.UUID(row[3]),
                    label=row[4],
                    notes=row[5],
                    flow=int(row[6]) if row[6] else None,
                    created_at=datetime.fromisoformat(row[7]),
                    collection_id=uuid.UUID(row[8]),
                ))
            elif rtype == "media":
                media_counts[uuid.UUID(row[2])] = int(row[3])
            elif rtype == "tag":
                mid = uuid.UUID(row[2])
                tag_names_map.setdefault(mid, []).append(row[3])
            elif rtype == "cue":
                mid = uuid.UUID(row[2])
                cue_descs_map.setdefault(mid, []).append(row[3])
            elif rtype == "alltag":
                all_tags.append(TagResponse(
                    id=uuid.UUID(row[1]),
                    collection_id=uuid.UUID(row[2]),
                    name=row[3],
                    created_at=datetime.fromisoformat(row[7]),
                    updated_at=datetime.fromisoformat(row[8]),
                ))
    else:
        move_objects = []
        connection_objects = []
        media_counts = {}
        tag_names_map = {}
        cue_descs_map = {}
        all_tags = []

    # Connection counts
    outgoing_counts: dict[uuid.UUID, int] = {}
    incoming_counts: dict[uuid.UUID, int] = {}
    for c in connection_objects:
        outgoing_counts[c.source_move_id] = outgoing_counts.get(c.source_move_id, 0) + 1
        incoming_counts[c.target_move_id] = incoming_counts.get(c.target_move_id, 0) + 1

    enriched_moves = []
    for m in move_objects:
        data = MoveGraphData.model_validate(m)
        data.media_count = media_counts.get(m.id, 0)
        data.tag_names = tag_names_map.get(m.id, [])
        data.cue_descriptions = cue_descs_map.get(m.id, [])
        data.outgoing_connection_count = outgoing_counts.get(m.id, 0)
        data.incoming_connection_count = incoming_counts.get(m.id, 0)
        enriched_moves.append(data)

    return CollectionGraphDataResponse(
        collection=collection_response,
        moves=enriched_moves,
        connections=[ConnectionResponse.model_validate(c) for c in connection_objects],
        tags=all_tags,
    )


@router.put("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: uuid.UUID,
    body: CollectionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    collection = await _get_user_collection(db, collection_id, current_user.id)
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(collection, field, value)
    await db.flush()
    return _build_collection_response(collection)


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    collection = await _get_user_collection(db, collection_id, current_user.id)
    await db.delete(collection)


@router.post(
    "/{collection_id}/moves",
    response_model=CollectionMoveResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_move_to_collection(
    collection_id: uuid.UUID,
    body: CollectionMoveAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)
    move = await _get_user_move(db, body.move_id, current_user.id)

    # Check if move is already in collection
    existing = await db.execute(
        select(CollectionMove).where(
            CollectionMove.collection_id == collection_id,
            CollectionMove.move_id == body.move_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Move is already in this collection",
        )

    collection_move = CollectionMove(
        collection_id=collection_id,
        move_id=body.move_id,
        notes=body.notes,
    )
    db.add(collection_move)
    await db.flush()

    return CollectionMoveResponse(
        id=collection_move.id,
        move_id=collection_move.move_id,
        move_name=move.name,
        notes=collection_move.notes,
        position_x=collection_move.position_x,
        position_y=collection_move.position_y,
        added_at=collection_move.added_at,
    )


@router.patch(
    "/{collection_id}/moves/{move_id}/position",
    response_model=CollectionMoveResponse,
)
async def update_move_position(
    collection_id: uuid.UUID,
    move_id: uuid.UUID,
    body: CollectionMovePositionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)
    result = await db.execute(
        select(CollectionMove).where(
            CollectionMove.collection_id == collection_id,
            CollectionMove.move_id == move_id,
        )
    )
    collection_move = result.scalar_one_or_none()
    if collection_move is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Move not found in this collection",
        )

    collection_move.position_x = body.position_x
    collection_move.position_y = body.position_y
    await db.flush()

    move = await _get_user_move(db, move_id, current_user.id)
    return CollectionMoveResponse(
        id=collection_move.id,
        move_id=collection_move.move_id,
        move_name=move.name,
        notes=collection_move.notes,
        position_x=collection_move.position_x,
        position_y=collection_move.position_y,
        added_at=collection_move.added_at,
    )


@router.delete(
    "/{collection_id}/moves/{move_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_move_from_collection(
    collection_id: uuid.UUID,
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_collection(db, collection_id, current_user.id)
    result = await db.execute(
        select(CollectionMove).where(
            CollectionMove.collection_id == collection_id,
            CollectionMove.move_id == move_id,
        )
    )
    collection_move = result.scalar_one_or_none()
    if collection_move is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Move not found in this collection",
        )
    await db.delete(collection_move)


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
