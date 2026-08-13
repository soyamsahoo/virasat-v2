"""Artisan endpoints: the heart of VIRASAT — people before objects."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.v1.deps import Repository, get_repo
from app.core.security import require_api_key
from app.models.schemas import (
    ArtisanCreate,
    ArtisanDetail,
    ArtisanRead,
    ArtisanStatusUpdate,
    ArtworkRead,
    LineageMember,
    StoryRead,
    VerificationStatus,
)

router = APIRouter(prefix="/artisans", tags=["artisans"])


@router.get("", response_model=list[ArtisanRead])
async def list_artisans(
    region_id: uuid.UUID | None = None,
    tradition_id: uuid.UUID | None = None,
    verification_status: VerificationStatus | None = Query(default=None),
    repo: Repository = Depends(get_repo),
) -> list[ArtisanRead]:
    rows = await repo.list_artisans(
        region_id=str(region_id) if region_id else None,
        tradition_id=str(tradition_id) if tradition_id else None,
        status=verification_status.value if verification_status else None,
    )
    return [ArtisanRead.model_validate(row) for row in rows]


@router.get("/{artisan_id}", response_model=ArtisanDetail)
async def get_artisan(
    artisan_id: uuid.UUID,
    repo: Repository = Depends(get_repo),
) -> ArtisanDetail:
    row = await repo.get_artisan(str(artisan_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artisan not found."
        )
    lineage = await repo.lineage(str(artisan_id))
    artworks = await repo.list_artworks(artisan_id=str(artisan_id))
    stories = await repo.stories_by_artisan(str(artisan_id))
    return ArtisanDetail(
        **row,
        lineage=[LineageMember.model_validate(m) for m in lineage],
        artwork_count=len(artworks),
        story_count=len(stories),
    )


@router.get("/{artisan_id}/artworks", response_model=list[ArtworkRead])
async def list_artisan_artworks(
    artisan_id: uuid.UUID,
    repo: Repository = Depends(get_repo),
) -> list[ArtworkRead]:
    rows = await repo.list_artworks(artisan_id=str(artisan_id))
    return [ArtworkRead.model_validate(row) for row in rows]


@router.get("/{artisan_id}/stories", response_model=list[StoryRead])
async def list_artisan_stories(
    artisan_id: uuid.UUID,
    repo: Repository = Depends(get_repo),
) -> list[StoryRead]:
    rows = await repo.stories_by_artisan(str(artisan_id))
    return [StoryRead.model_validate(row) for row in rows]


@router.post(
    "",
    response_model=ArtisanRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
async def onboard_artisan(
    payload: ArtisanCreate,
    repo: Repository = Depends(get_repo),
) -> ArtisanRead:
    try:
        row = await repo.create_artisan(payload.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from None
    return ArtisanRead.model_validate(row)


@router.patch(
    "/{artisan_id}/verification",
    response_model=ArtisanRead,
    dependencies=[Depends(require_api_key)],
)
async def update_verification_status(
    artisan_id: uuid.UUID,
    payload: ArtisanStatusUpdate,
    repo: Repository = Depends(get_repo),
) -> ArtisanRead:
    row = await repo.set_artisan_status(str(artisan_id), payload.verification_status.value)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artisan not found."
        )
    return ArtisanRead.model_validate(row)