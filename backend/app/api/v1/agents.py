"""Field agent (NGO portal) endpoints.

Field agents bridge the digital divide: they onboard rural artisans,
record oral histories and capture artwork photographs, optionally
offline via the PWA. Story and event creation routes live on this
router so agent attribution is explicit.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.v1.deps import Repository, get_repo
from app.core.security import require_api_key
from app.models.schemas import (
    FieldAgentCreate,
    FieldAgentRead,
    ProvenanceEventCreate,
    ProvenanceEventRead,
    StoryCreate,
    StoryRead,
)

router = APIRouter(tags=["field-agents"])


@router.post(
    "/field-agents",
    response_model=FieldAgentRead,
    dependencies=[Depends(require_api_key)],
)
async def register_agent(
    payload: FieldAgentCreate,
    repo: Repository = Depends(get_repo),
) -> FieldAgentRead:
    try:
        row = await repo.create_agent(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from None
    return FieldAgentRead.model_validate(row)


@router.get("/field-agents/{agent_id}", response_model=FieldAgentRead)
async def get_agent(
    agent_id: uuid.UUID,
    repo: Repository = Depends(get_repo),
) -> FieldAgentRead:
    row = await repo.get_agent(str(agent_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Field agent not found."
        )
    return FieldAgentRead.model_validate(row)


@router.post(
    "/field-agents/{agent_id}/stories",
    response_model=StoryRead,
    dependencies=[Depends(require_api_key)],
)
async def record_story(
    agent_id: uuid.UUID,
    payload: StoryCreate,
    repo: Repository = Depends(get_repo),
) -> StoryRead:
    agent = await repo.get_agent(str(agent_id))
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Field agent not found."
        )
    row = await repo.create_story(payload.model_dump())
    return StoryRead.model_validate(row)


@router.post(
    "/field-agents/{agent_id}/events",
    response_model=ProvenanceEventRead,
    dependencies=[Depends(require_api_key)],
)
async def record_event(
    agent_id: uuid.UUID,
    artwork_id: uuid.UUID,
    payload: ProvenanceEventCreate,
    repo: Repository = Depends(get_repo),
) -> ProvenanceEventRead:
    agent = await repo.get_agent(str(agent_id))
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Field agent not found."
        )
    artwork = await repo.get_artwork_by_id(str(artwork_id))
    if artwork is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found."
        )
    row = await repo.create_event(
        str(artwork_id),
        {**payload.model_dump(exclude_none=True), "recorded_by_agent_id": str(agent_id)},
    )
    return ProvenanceEventRead.model_validate(row)