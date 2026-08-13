"""Institutional & patronage hub (zero-commerce model).

Museums, foundations, researchers and cultural departments can initiate
direct grant, exhibition, commission or research inquiries with verified
artisans — no marketplace, no checkout, no transaction fees. VIRASAT only
brokers the connection.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.v1.deps import Repository, get_repo
from app.core.security import require_api_key
from app.models.schemas import (
    InstitutionalInquiryCreate,
    InstitutionalInquiryRead,
    InstitutionalInquiryUpdate,
    InquiryStatus,
    InquiryType,
)

router = APIRouter(prefix="/inquiries", tags=["patronage"])


@router.post(
    "",
    response_model=InstitutionalInquiryRead,
    status_code=status.HTTP_201_CREATED,
)
async def initiate_inquiry(
    payload: InstitutionalInquiryCreate,
    repo: Repository = Depends(get_repo),
) -> InstitutionalInquiryRead:
    """Open an institutional patronage / grant / exhibition inquiry."""
    artisan = await repo.get_artisan(str(payload.artisan_id))
    if artisan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artisan not found."
        )
    row = await repo.create_inquiry(payload.model_dump(mode="json", exclude_none=True))
    return InstitutionalInquiryRead.model_validate(row)


@router.get("", response_model=list[InstitutionalInquiryRead])
async def list_inquiries(
    artisan_id: uuid.UUID | None = None,
    status_filter: InquiryStatus | None = Query(default=None, alias="status"),
    repo: Repository = Depends(get_repo),
) -> list[InstitutionalInquiryRead]:
    rows = await repo.list_inquiries(
        artisan_id=str(artisan_id) if artisan_id else None,
        status=status_filter.value if status_filter else None,
    )
    return [InstitutionalInquiryRead.model_validate(r) for r in rows]


@router.patch(
    "/{inquiry_id}",
    response_model=InstitutionalInquiryRead,
    dependencies=[Depends(require_api_key)],
)
async def update_inquiry_status(
    inquiry_id: uuid.UUID,
    payload: InstitutionalInquiryUpdate,
    repo: Repository = Depends(get_repo),
) -> InstitutionalInquiryRead:
    row = await repo.set_inquiry_status(str(inquiry_id), payload.status.value)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found."
        )
    return InstitutionalInquiryRead.model_validate(row)
