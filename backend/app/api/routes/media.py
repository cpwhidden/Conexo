import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.routes.moves import _get_user_move
from app.core.config import settings
from app.core.database import get_db
from app.models.collection import Collection, CollectionMove
from app.models.move import Move
from app.models.tag import MediaTag, Tag
from app.models.user import User
from app.models.video import MoveVideo
from app.schemas.media import MediaResponse, MediaUpdate, MediaURLResponse
from app.schemas.tag import MediaTagAdd, TagResponse
from app.services import storage

router = APIRouter(tags=["media"])


@router.post(
    "/moves/{move_id}/media",
    response_model=MediaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_media(
    move_id: uuid.UUID,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    move = await _get_user_move(db, move_id, current_user.id)
    file_data = await file.read()
    gcs_key = storage.upload_file(
        file_data, file.content_type or "video/mp4", str(current_user.id)
    )
    video = MoveVideo(
        move_id=move_id,
        user_id=current_user.id,
        gcs_key=gcs_key,
        filename=file.filename or "media",
        content_type=file.content_type or "video/mp4",
        size_bytes=len(file_data),
    )
    db.add(video)
    await db.flush()

    # Auto-set as cover media if this is the first media for the move
    if move.cover_media_id is None:
        move.cover_media_id = video.id
        await db.flush()

    return MediaResponse.model_validate(video)


@router.get("/moves/{move_id}/media", response_model=list[MediaResponse])
async def list_media(
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_move(db, move_id, current_user.id)
    result = await db.execute(
        select(MoveVideo).where(
            MoveVideo.move_id == move_id, MoveVideo.user_id == current_user.id
        )
    )
    return [MediaResponse.model_validate(v) for v in result.scalars().all()]


@router.get("/media/{media_id}/url", response_model=MediaURLResponse)
async def get_media_url(
    media_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    media = await _get_user_media(db, media_id, current_user.id)
    if settings.use_local_storage:
        url = f"/api/media/{media_id}/file"
    else:
        url = storage.generate_url(media.gcs_key)
    return MediaURLResponse(url=url, content_type=media.content_type)


@router.get("/media/{media_id}/file")
async def get_media_file(
    media_id: uuid.UUID,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Serve the actual media file with correct Content-Type.

    Uses a query-string token for auth since <video src> can't send headers.
    Starlette's FileResponse handles Range requests natively.
    """
    from app.core.security import decode_access_token
    from app.services.user import get_user_by_id

    user_id_str = decode_access_token(token)
    if user_id_str is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await get_user_by_id(db, uuid.UUID(user_id_str))
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    media = await _get_user_media(db, media_id, user.id)
    file_path = Path(settings.local_storage_path) / media.gcs_key
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(file_path, media_type=media.content_type)


@router.patch("/media/{media_id}", response_model=MediaResponse)
async def update_media(
    media_id: uuid.UUID,
    data: MediaUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    media = await _get_user_media(db, media_id, current_user.id)
    media.filename = data.filename
    await db.flush()
    return MediaResponse.model_validate(media)


@router.patch("/moves/{move_id}/cover-media/{media_id}", status_code=status.HTTP_200_OK)
async def set_cover_media(
    move_id: uuid.UUID,
    media_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set a specific media item as the cover media for a move."""
    move = await _get_user_move(db, move_id, current_user.id)
    # Verify the media belongs to this move
    media = await _get_user_media(db, media_id, current_user.id)
    if media.move_id != move_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Media does not belong to this move",
        )
    move.cover_media_id = media_id
    await db.flush()
    return {"cover_media_id": str(media_id)}


@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    media_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    media = await _get_user_media(db, media_id, current_user.id)

    # If this was the cover media, clear it
    move_result = await db.execute(
        select(Move).where(Move.id == media.move_id, Move.user_id == current_user.id)
    )
    move = move_result.scalar_one_or_none()
    if move and move.cover_media_id == media_id:
        move.cover_media_id = None
        await db.flush()

    storage.delete_file(media.gcs_key)
    await db.delete(media)


async def _get_user_media(
    db: AsyncSession, media_id: uuid.UUID, user_id: uuid.UUID
) -> MoveVideo:
    result = await db.execute(
        select(MoveVideo).where(
            MoveVideo.id == media_id, MoveVideo.user_id == user_id
        )
    )
    media = result.scalar_one_or_none()
    if media is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Media not found"
        )
    return media


# ─── Media tags ──────────────────────────────────────────────────────────────
# A collection tag can mark a single media item per move. When that tag is
# selected in the graph, the move's preview prefers the media marked with it.


@router.get("/media/{media_id}/tags", response_model=list[TagResponse])
async def list_media_tags(
    media_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_media(db, media_id, current_user.id)
    result = await db.execute(
        select(Tag)
        .join(MediaTag, MediaTag.tag_id == Tag.id)
        .where(MediaTag.media_id == media_id)
        .order_by(Tag.name)
    )
    return [TagResponse.model_validate(t) for t in result.scalars().all()]


@router.post(
    "/media/{media_id}/tags",
    response_model=list[TagResponse],
    status_code=status.HTTP_201_CREATED,
)
async def add_media_tag(
    media_id: uuid.UUID,
    body: MediaTagAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Attach a collection tag to a media item.

    Enforces one-media-per-tag-per-move by re-assigning: any existing media tag
    for (tag, move) is removed first. Returns the media's resulting tag list.
    """
    media = await _get_user_media(db, media_id, current_user.id)

    # Verify the tag exists, is owned by the user, and belongs to a collection
    # that this media's move is part of.
    tag_result = await db.execute(
        select(Tag)
        .join(Collection, Collection.id == Tag.collection_id)
        .where(Tag.id == body.tag_id, Collection.user_id == current_user.id)
    )
    tag = tag_result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    cm_result = await db.execute(
        select(CollectionMove).where(
            CollectionMove.collection_id == tag.collection_id,
            CollectionMove.move_id == media.move_id,
        )
    )
    if cm_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tag's collection does not contain this media's move",
        )

    # Re-assign: drop any existing media tag for this (tag, move) pair.
    await db.execute(
        delete(MediaTag).where(
            MediaTag.tag_id == body.tag_id, MediaTag.move_id == media.move_id
        )
    )
    db.add(MediaTag(tag_id=body.tag_id, media_id=media_id, move_id=media.move_id))
    await db.flush()

    result = await db.execute(
        select(Tag)
        .join(MediaTag, MediaTag.tag_id == Tag.id)
        .where(MediaTag.media_id == media_id)
        .order_by(Tag.name)
    )
    return [TagResponse.model_validate(t) for t in result.scalars().all()]


@router.delete(
    "/media/{media_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_media_tag(
    media_id: uuid.UUID,
    tag_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_media(db, media_id, current_user.id)
    result = await db.execute(
        select(MediaTag).where(
            MediaTag.media_id == media_id, MediaTag.tag_id == tag_id
        )
    )
    media_tag = result.scalar_one_or_none()
    if media_tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Media tag not found"
        )
    await db.delete(media_tag)
