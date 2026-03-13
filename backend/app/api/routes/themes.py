import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.move import Move
from app.models.theme import Theme, ThemeMove
from app.models.user import User
from app.schemas.theme import (
    ThemeCreate,
    ThemeMoveAdd,
    ThemeMoveResponse,
    ThemeResponse,
    ThemeUpdate,
    ThemeWithMovesResponse,
)

router = APIRouter(prefix="/themes", tags=["themes"])


@router.get("", response_model=list[ThemeResponse])
async def list_themes(
    dance_style: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all themes for the current user, optionally filtered by dance style."""
    query = select(Theme).where(Theme.user_id == current_user.id)
    if dance_style is not None:
        query = query.where(Theme.dance_style == dance_style)
    query = query.order_by(Theme.name)
    result = await db.execute(query)
    themes = result.scalars().all()

    return [
        ThemeResponse(
            id=t.id,
            name=t.name,
            dance_style=t.dance_style,
            description=t.description,
            move_count=len(t.theme_moves),
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in themes
    ]


@router.get("/by-move/{move_id}", response_model=list[ThemeResponse])
async def get_themes_for_move(
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all themes that contain a specific move."""
    # Verify move belongs to user
    await _get_user_move(db, move_id, current_user.id)

    result = await db.execute(
        select(Theme)
        .join(ThemeMove)
        .where(
            Theme.user_id == current_user.id,
            ThemeMove.move_id == move_id,
        )
        .order_by(Theme.name)
    )
    themes = result.scalars().all()

    return [
        ThemeResponse(
            id=t.id,
            name=t.name,
            dance_style=t.dance_style,
            description=t.description,
            move_count=len(t.theme_moves),
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in themes
    ]


@router.post("", response_model=ThemeResponse, status_code=status.HTTP_201_CREATED)
async def create_theme(
    body: ThemeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new theme."""
    # Check for duplicate name within same dance style
    existing = await db.execute(
        select(Theme).where(
            Theme.user_id == current_user.id,
            Theme.dance_style == body.dance_style,
            Theme.name == body.name,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A theme named '{body.name}' already exists for {body.dance_style}",
        )

    theme = Theme(user_id=current_user.id, **body.model_dump())
    db.add(theme)
    await db.flush()

    return ThemeResponse(
        id=theme.id,
        name=theme.name,
        dance_style=theme.dance_style,
        description=theme.description,
        move_count=0,
        created_at=theme.created_at,
        updated_at=theme.updated_at,
    )


@router.get("/{theme_id}", response_model=ThemeWithMovesResponse)
async def get_theme(
    theme_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a theme with all its moves."""
    theme = await _get_user_theme(db, theme_id, current_user.id)

    moves = [
        ThemeMoveResponse(
            id=tm.id,
            move_id=tm.move_id,
            move_name=tm.move.name,
            added_at=tm.added_at,
        )
        for tm in theme.theme_moves
    ]

    return ThemeWithMovesResponse(
        id=theme.id,
        name=theme.name,
        dance_style=theme.dance_style,
        description=theme.description,
        move_count=len(moves),
        created_at=theme.created_at,
        updated_at=theme.updated_at,
        moves=moves,
    )


@router.patch("/{theme_id}", response_model=ThemeResponse)
async def update_theme(
    theme_id: uuid.UUID,
    body: ThemeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a theme's name or description."""
    theme = await _get_user_theme(db, theme_id, current_user.id)

    # If updating name, check for duplicates
    if body.name is not None and body.name != theme.name:
        existing = await db.execute(
            select(Theme).where(
                Theme.user_id == current_user.id,
                Theme.dance_style == theme.dance_style,
                Theme.name == body.name,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A theme named '{body.name}' already exists for {theme.dance_style}",
            )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(theme, field, value)
    await db.flush()

    return ThemeResponse(
        id=theme.id,
        name=theme.name,
        dance_style=theme.dance_style,
        description=theme.description,
        move_count=len(theme.theme_moves),
        created_at=theme.created_at,
        updated_at=theme.updated_at,
    )


@router.delete("/{theme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_theme(
    theme_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a theme and all its move associations."""
    theme = await _get_user_theme(db, theme_id, current_user.id)
    await db.delete(theme)


@router.post(
    "/{theme_id}/moves",
    response_model=ThemeMoveResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_move_to_theme(
    theme_id: uuid.UUID,
    body: ThemeMoveAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a move to a theme."""
    theme = await _get_user_theme(db, theme_id, current_user.id)
    move = await _get_user_move(db, body.move_id, current_user.id)

    # Verify dance style matches
    if move.dance_style != theme.dance_style:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Move dance style '{move.dance_style}' does not match theme dance style '{theme.dance_style}'",
        )

    # Check if move is already in theme
    existing = await db.execute(
        select(ThemeMove).where(
            ThemeMove.theme_id == theme_id,
            ThemeMove.move_id == body.move_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Move is already in this theme",
        )

    theme_move = ThemeMove(
        theme_id=theme_id,
        move_id=body.move_id,
    )
    db.add(theme_move)
    await db.flush()

    return ThemeMoveResponse(
        id=theme_move.id,
        move_id=theme_move.move_id,
        move_name=move.name,
        added_at=theme_move.added_at,
    )


@router.delete(
    "/{theme_id}/moves/{move_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_move_from_theme(
    theme_id: uuid.UUID,
    move_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a move from a theme."""
    await _get_user_theme(db, theme_id, current_user.id)

    result = await db.execute(
        select(ThemeMove).where(
            ThemeMove.theme_id == theme_id,
            ThemeMove.move_id == move_id,
        )
    )
    theme_move = result.scalar_one_or_none()
    if theme_move is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Move not found in this theme",
        )
    await db.delete(theme_move)


async def _get_user_theme(
    db: AsyncSession, theme_id: uuid.UUID, user_id: uuid.UUID
) -> Theme:
    result = await db.execute(
        select(Theme).where(Theme.id == theme_id, Theme.user_id == user_id)
    )
    theme = result.scalar_one_or_none()
    if theme is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Theme not found"
        )
    return theme


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
