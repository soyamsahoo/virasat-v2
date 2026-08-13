"""Public verification endpoint — the trust layer of the platform.

Recomputes the SHA-256 digest from the stored record and compares it to
the registered passport digest. Any mutation of registered fields flips
the outcome to ``tampered``.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.v1.deps import Repository, get_repo
from app.core.security import build_passport_digest
from app.models.schemas import (
    ArtisanRead,
    ArtworkRead,
    HeritagePassportRead,
    ProvenanceEventRead,
    VerificationOutcome,
    VerificationResult,
)

router = APIRouter(prefix="/verify", tags=["verification"])


@router.get("/{heritage_id}", response_model=VerificationResult)
async def verify_heritage(
    heritage_id: str,
    repo: Repository = Depends(get_repo),
) -> VerificationResult:
    artwork = await repo.get_artwork_by_heritage(heritage_id)
    if artwork is None:
        return VerificationResult(
            heritage_id=heritage_id,
            outcome=VerificationOutcome.NOT_REGISTERED,
            checked_at=datetime.now(timezone.utc),
        )

    artisan = await repo.get_artisan(str(artwork["artisan_id"]))
    if artisan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artisan not found."
        )
    passport = await repo.get_passport_by_artwork(str(artwork["id"]))
    events = await repo.events_by_artwork(str(artwork["id"]))

    result = VerificationResult(
        heritage_id=heritage_id,
        outcome=VerificationOutcome.NOT_REGISTERED,
        artwork=ArtworkRead.model_validate(artwork),
        artisan=ArtisanRead.model_validate(artisan),
        events=[ProvenanceEventRead.model_validate(e) for e in events],
        checked_at=datetime.now(timezone.utc),
    )

    if passport is None:
        return result

    passport_read = HeritagePassportRead.model_validate(passport)
    result.passport = passport_read

    computed = build_passport_digest(
        artwork=artwork, artisan=artisan, issued_at=passport["issued_at"]
    )
    stored = passport["cryptographic_hash"]
    result.computed_sha256 = computed
    result.stored_sha256 = stored
    result.outcome = (
        VerificationOutcome.VERIFIED
        if computed == stored
        else VerificationOutcome.TAMPERED
    )
    return result