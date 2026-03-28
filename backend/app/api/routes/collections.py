import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import noload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.collection import Collection, CollectionMove
from app.models.connection import MoveConnection
from app.models.cue import MoveCue
from app.models.move import Move
from app.models.theme import Theme, ThemeMove
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

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("", response_model=list[CollectionResponse])
async def list_collections(
    dance_style: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Collection).where(Collection.user_id == current_user.id)
    if dance_style is not None:
        query = query.where(Collection.dance_style == dance_style)
    # Sort by date_last_opened descending, with nulls at the end
    query = query.order_by(nulls_last(Collection.date_last_opened.desc()))
    result = await db.execute(query)
    collections = result.scalars().all()

    # Build response with move_count
    return [
        CollectionResponse(
            id=c.id,
            name=c.name,
            description=c.description,
            dance_style=c.dance_style,
            is_default=c.is_default,
            date_last_opened=c.date_last_opened,
            move_count=len(c.collection_moves),
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in collections
    ]


@router.get("/by-move/{move_id}", response_model=list[CollectionResponse])
async def get_collections_for_move(
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all collections that contain a specific move."""
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
    collections = result.scalars().all()

    return [
        CollectionResponse(
            id=c.id,
            name=c.name,
            description=c.description,
            dance_style=c.dance_style,
            is_default=c.is_default,
            date_last_opened=c.date_last_opened,
            move_count=len(c.collection_moves),
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in collections
    ]


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
        is_default=collection.is_default,
        date_last_opened=collection.date_last_opened,
        move_count=0,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


# All dance styles that should have default collections
DANCE_STYLES = ["Salsa", "Bachata", "Zouk", "Kizomba", "West Coast Swing", "Lambada"]


@router.post("/ensure-defaults", response_model=list[CollectionResponse])
async def ensure_default_collections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create any missing default collections for the current user.

    Returns the list of newly created collections (empty if all already exist).
    """
    # Get existing default collections for this user
    result = await db.execute(
        select(Collection).where(
            Collection.user_id == current_user.id,
            Collection.is_default == True,  # noqa: E712
        )
    )
    existing_collections = result.scalars().all()
    existing_styles = {c.dance_style for c in existing_collections}

    # Create missing default collections
    created = []
    for style in DANCE_STYLES:
        if style not in existing_styles:
            collection = Collection(
                user_id=current_user.id,
                name=f"All {style} Moves",
                description=f"Default collection for {style} moves",
                dance_style=style,
                is_default=True,
            )
            db.add(collection)
            created.append(collection)

    if created:
        await db.flush()

    return [
        CollectionResponse(
            id=c.id,
            name=c.name,
            description=c.description,
            dance_style=c.dance_style,
            is_default=c.is_default,
            date_last_opened=c.date_last_opened,
            move_count=0,  # Newly created, so no moves yet
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in created
    ]


@router.post("/sync-defaults")
async def sync_default_collections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sync all default collections to include all moves of their dance style.

    For each default collection, adds any moves of that dance style that aren't
    already in the collection. Returns the count of moves added.
    """
    # Get all default collections for this user
    result = await db.execute(
        select(Collection).where(
            Collection.user_id == current_user.id,
            Collection.is_default == True,  # noqa: E712
        )
    )
    default_collections = result.scalars().all()

    total_added = 0

    for collection in default_collections:
        # Get all moves of this dance style for the user
        moves_result = await db.execute(
            select(Move).where(
                Move.user_id == current_user.id,
                Move.dance_style == collection.dance_style,
            )
        )
        all_moves = moves_result.scalars().all()

        # Get move IDs already in the collection
        existing_result = await db.execute(
            select(CollectionMove.move_id).where(
                CollectionMove.collection_id == collection.id
            )
        )
        existing_move_ids = set(existing_result.scalars().all())

        # Add missing moves
        for move in all_moves:
            if move.id not in existing_move_ids:
                collection_move = CollectionMove(
                    collection_id=collection.id,
                    move_id=move.id,
                )
                db.add(collection_move)
                total_added += 1

    if total_added > 0:
        await db.flush()

    return {"moves_added": total_added}


@router.get("/{collection_id}", response_model=CollectionWithMovesResponse)
async def get_collection(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    collection = await _get_user_collection(db, collection_id, current_user.id)

    # Update date_last_opened
    collection.date_last_opened = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()

    # Build response with moves
    moves = []
    for cm in collection.collection_moves:
        moves.append(
            CollectionMoveResponse(
                id=cm.id,
                move_id=cm.move_id,
                move_name=cm.move.name,
                notes=cm.notes,
                position_x=cm.position_x,
                position_y=cm.position_y,
                added_at=cm.added_at,
            )
        )

    return CollectionWithMovesResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        dance_style=collection.dance_style,
        is_default=collection.is_default,
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
    """Return all data needed for the graph view in a single response.

    Bundles the collection (with move stubs), full move data, and connections
    between collection moves.  This replaces the N+1 pattern of fetching each
    move individually.
    """
    collection = await _get_user_collection(db, collection_id, current_user.id)

    # Update date_last_opened (same as get_collection)
    collection.date_last_opened = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()

    # Build collection response (same pattern as get_collection)
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
        is_default=collection.is_default,
        date_last_opened=collection.date_last_opened,
        move_count=len(move_stubs),
        created_at=collection.created_at,
        updated_at=collection.updated_at,
        moves=move_stubs,
    )

    # Batch-fetch full move data with relationship eager-loading suppressed
    move_ids = [cm.move_id for cm in collection.collection_moves]
    if move_ids:
        moves_result = await db.execute(
            select(Move)
            .where(Move.id.in_(move_ids), Move.user_id == current_user.id)
            .options(
                noload(Move.videos),
                noload(Move.outgoing_connections),
                noload(Move.incoming_connections),
            )
        )
        move_objects = list(moves_result.scalars().all())
    else:
        move_objects = []

    # Fetch only connections between moves in this collection
    if move_ids:
        conn_result = await db.execute(
            select(MoveConnection).where(
                MoveConnection.user_id == current_user.id,
                MoveConnection.source_move_id.in_(move_ids),
                MoveConnection.target_move_id.in_(move_ids),
            )
        )
        connection_objects = list(conn_result.scalars().all())
    else:
        connection_objects = []

    # Enrich moves with media counts, theme names, and cue descriptions
    media_counts: dict[uuid.UUID, int] = {}
    theme_names_map: dict[uuid.UUID, list[str]] = {}
    cue_descs_map: dict[uuid.UUID, list[str]] = {}

    if move_ids:
        # Media counts
        vc_result = await db.execute(
            select(MoveVideo.move_id, func.count())
            .where(MoveVideo.move_id.in_(move_ids))
            .group_by(MoveVideo.move_id)
        )
        for mid, cnt in vc_result.all():
            media_counts[mid] = cnt

        # Theme names
        tn_result = await db.execute(
            select(ThemeMove.move_id, Theme.name)
            .join(Theme, ThemeMove.theme_id == Theme.id)
            .where(ThemeMove.move_id.in_(move_ids))
        )
        for mid, tname in tn_result.all():
            theme_names_map.setdefault(mid, []).append(tname)

        # Cue descriptions
        cd_result = await db.execute(
            select(MoveCue.move_id, MoveCue.description)
            .where(MoveCue.move_id.in_(move_ids))
        )
        for mid, desc in cd_result.all():
            cue_descs_map.setdefault(mid, []).append(desc)

    # Connection counts (from the already-fetched connections)
    outgoing_counts: dict[uuid.UUID, int] = {}
    incoming_counts: dict[uuid.UUID, int] = {}
    for c in connection_objects:
        outgoing_counts[c.source_move_id] = outgoing_counts.get(c.source_move_id, 0) + 1
        incoming_counts[c.target_move_id] = incoming_counts.get(c.target_move_id, 0) + 1

    enriched_moves = []
    for m in move_objects:
        data = MoveGraphData.model_validate(m)
        data.media_count = media_counts.get(m.id, 0)
        data.theme_names = theme_names_map.get(m.id, [])
        data.cue_descriptions = cue_descs_map.get(m.id, [])
        data.outgoing_connection_count = outgoing_counts.get(m.id, 0)
        data.incoming_connection_count = incoming_counts.get(m.id, 0)
        enriched_moves.append(data)

    return CollectionGraphDataResponse(
        collection=collection_response,
        moves=enriched_moves,
        connections=[ConnectionResponse.model_validate(c) for c in connection_objects],
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
    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        dance_style=collection.dance_style,
        is_default=collection.is_default,
        date_last_opened=collection.date_last_opened,
        move_count=len(collection.collection_moves),
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    collection = await _get_user_collection(db, collection_id, current_user.id)
    if collection.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete default collection",
        )
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
    collection = await _get_user_collection(db, collection_id, current_user.id)

    # Verify the move exists and belongs to the current user
    move = await _get_user_move(db, body.move_id, current_user.id)

    # Verify dance style matches
    if move.dance_style != collection.dance_style:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Move dance style '{move.dance_style}' does not match collection dance style '{collection.dance_style}'",
        )

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
    """Update the graph position of a move within a collection."""
    # Verify collection belongs to user
    await _get_user_collection(db, collection_id, current_user.id)

    # Find the collection_move entry
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

    # Update position
    collection_move.position_x = body.position_x
    collection_move.position_y = body.position_y
    await db.flush()

    # Get move name for response
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
    # Verify collection belongs to user
    await _get_user_collection(db, collection_id, current_user.id)

    # Find and delete the collection_move entry
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
