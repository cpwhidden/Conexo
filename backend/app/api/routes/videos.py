import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.routes.moves import _get_user_move
from app.core.database import get_db
from app.models.user import User
from app.models.video import MoveVideo
from app.schemas.video import VideoResponse, VideoUpdate, VideoURLResponse
from app.services import storage

router = APIRouter(tags=["videos"])


@router.post(
    "/moves/{move_id}/videos",
    response_model=VideoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_video(
    move_id: uuid.UUID,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_move(db, move_id, current_user.id)
    file_data = await file.read()
    gcs_key = storage.upload_file(
        file_data, file.content_type or "video/mp4", str(current_user.id)
    )
    video = MoveVideo(
        move_id=move_id,
        user_id=current_user.id,
        gcs_key=gcs_key,
        filename=file.filename or "video",
        content_type=file.content_type or "video/mp4",
        size_bytes=len(file_data),
    )
    db.add(video)
    await db.flush()
    return VideoResponse.model_validate(video)


@router.get("/moves/{move_id}/videos", response_model=list[VideoResponse])
async def list_videos(
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
    return [VideoResponse.model_validate(v) for v in result.scalars().all()]


@router.get("/videos/{video_id}/url", response_model=VideoURLResponse)
async def get_video_url(
    video_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await _get_user_video(db, video_id, current_user.id)
    url = storage.generate_signed_url(video.gcs_key)
    return VideoURLResponse(url=url)


@router.patch("/videos/{video_id}", response_model=VideoResponse)
async def update_video(
    video_id: uuid.UUID,
    data: VideoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await _get_user_video(db, video_id, current_user.id)
    video.filename = data.filename
    await db.flush()
    return VideoResponse.model_validate(video)


@router.delete("/videos/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    video_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await _get_user_video(db, video_id, current_user.id)
    storage.delete_file(video.gcs_key)
    await db.delete(video)


async def _get_user_video(
    db: AsyncSession, video_id: uuid.UUID, user_id: uuid.UUID
) -> MoveVideo:
    result = await db.execute(
        select(MoveVideo).where(
            MoveVideo.id == video_id, MoveVideo.user_id == user_id
        )
    )
    video = result.scalar_one_or_none()
    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
        )
    return video
