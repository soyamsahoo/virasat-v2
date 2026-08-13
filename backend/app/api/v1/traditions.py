"""Tradition catalogue endpoints."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.v1.deps import Repository, get_repo
from app.core.security import require_api_key
from app.models.schemas import TraditionCreate, TraditionRead

router = APIRouter(prefix="/traditions", tags=["traditions"])


@router.get("", response_model=list[TraditionRead])
async def list_traditions(
    repo: Repository = Depends(get_repo),
) -> list[TraditionRead]:
    rows = await repo.list_traditions()
    return [TraditionRead.model_validate(row) for row in rows]


@router.get("/{tradition_id}", response_model=TraditionRead)
async def get_tradition(
    tradition_id: uuid.UUID,
    repo: Repository = Depends(get_repo),
) -> TraditionRead:
    row = await repo.get_tradition(str(tradition_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tradition not found.",
        )
    return TraditionRead.model_validate(row)


@router.post("", response_model=TraditionRead, dependencies=[Depends(require_api_key)])
async def create_tradition(
    payload: TraditionCreate,
    repo: Repository = Depends(get_repo),
) -> TraditionRead:
    row = await repo.create_tradition(payload.model_dump(exclude_none=True))
    return TraditionRead.model_validate(row)