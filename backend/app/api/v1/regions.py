"""Geographic region endpoints (state → district → village)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.v1.deps import Repository, get_repo
from app.core.security import require_api_key
from app.models.schemas import RegionCreate, RegionRead

router = APIRouter(prefix="/regions", tags=["regions"])


@router.get("", response_model=list[RegionRead])
async def list_regions(
    district: str | None = None,
    repo: Repository = Depends(get_repo),
) -> list[RegionRead]:
    rows = await repo.list_regions(district=district)
    return [RegionRead.model_validate(row) for row in rows]


@router.get("/{region_id}", response_model=RegionRead)
async def get_region(
    region_id: uuid.UUID,
    repo: Repository = Depends(get_repo),
) -> RegionRead:
    row = await repo.get_region(str(region_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Region not found."
        )
    return RegionRead.model_validate(row)


@router.post("", response_model=RegionRead, dependencies=[Depends(require_api_key)])
async def create_region(
    payload: RegionCreate,
    repo: Repository = Depends(get_repo),
) -> RegionRead:
    row = await repo.create_region(payload.model_dump())
    return RegionRead.model_validate(row)