"""Field agent (NGO portal) endpoints.

Field agents bridge the digital divide: they onboard rural artisans,
record oral histories and capture artwork photographs, optionally
offline via the PWA. Story and event creation routes live on this
router so agent attribution is explicit.

Verification model
------------------
Registration is vetted: it must carry the coordinating NGO's access
code (``cfg.coordinator_access_code``), which is never persisted. The
server then issues the agent a random 6-digit access PIN and persists
only a salted PBKDF2 digest. Sign-in is badge + PIN against that digest,
with a per-badge brute-force lockout after five failed attempts.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.v1.deps import Repository, get_repo
from app.core.config import get_settings
from app.core.security import require_api_key
from app.models.schemas import (
    FieldAgentCreate,
    FieldAgentLogin,
    FieldAgentRead,
    ProvenanceEventCreate,
    ProvenanceEventRead,
    StoryCreate,
    StoryRead,
)

router = APIRouter(tags=["field-agents"])


@router.post(
    "/field-agents",
    dependencies=[Depends(require_api_key)],
)
async def register_agent(
    payload: FieldAgentCreate,
    repo: Repository = Depends(get_repo),
) -> dict:
    """Register a field agent under NGO vetting.

    Requires the coordinator access code (rejected with 403 otherwise),
    then issues a one-time 6-digit access PIN — returned exactly once;
    only its salted digest is stored.
    """
    settings = get_settings()
    if payload.ngo_access_code != settings.coordinator_access_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Coordinator access code rejected. Registration must be "
            "authorised by the coordinating NGO.",
        )
    data = payload.model_dump(exclude={"ngo_access_code"})
    try:
        row, pin = await repo.create_agent(data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from None
    return {
        "agent": FieldAgentRead.model_validate(row),
        "access_pin": pin,
    }


@router.post("/field-agents/login", response_model=FieldAgentRead)
async def login_agent(
    payload: FieldAgentLogin,
    repo: Repository = Depends(get_repo),
) -> FieldAgentRead:
    """Badge + access PIN sign-in for the field PWA."""
    try:
        row = await repo.authenticate_agent(payload.badge_number, payload.access_pin)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from None
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid badge number or access PIN.",
        )
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


@router.get("/field-agents/by-badge/{badge_number}", response_model=FieldAgentRead)
async def get_agent_by_badge(
    badge_number: str,
    repo: Repository = Depends(get_repo),
) -> FieldAgentRead:
    """PWA login: resolve a badge number to its registered field agent."""
    row = await repo.get_agent_by_badge(badge_number)
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