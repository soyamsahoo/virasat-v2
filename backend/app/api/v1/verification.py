"""Public verification endpoint — the trust layer of the platform.

Recomputes the SHA-256 digest from the stored record and compares it to
the registered passport digest. Any mutation of registered fields flips
the outcome to ``tampered``. Photo-based verification fingerprints an
uploaded plate and runs the same digest check on the best CV match.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.api.v1.artworks import _detect_duplicates
from app.api.v1.deps import Repository, get_repo
from app.core.config import get_settings
from app.core.security import build_passport_digest
from app.cv_engine.fingerprint import VisualFingerprintEngine
from app.models.schemas import (
    ArtisanRead,
    ArtworkRead,
    HeritagePassportRead,
    ImageQualityReport,
    ImageVerificationResult,
    ProvenanceEventRead,
    VerificationOutcome,
    VerificationResult,
)

router = APIRouter(prefix="/verify", tags=["verification"])

#: Minimum composite match score for a CV candidate to be treated as the
#: official verification target (equal-weight hash + ORB confidence blend).
MATCH_CONFIDENCE_THRESHOLD = 0.6


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


@router.post("/image", response_model=ImageVerificationResult)
async def verify_image(
    file: UploadFile = File(...),
    repo: Repository = Depends(get_repo),
) -> ImageVerificationResult:
    """Public photo verification.

    Fingerprints the uploaded plate (blur gate + perceptual hashes + ORB),
    scans the registry for near-duplicates and — when the strongest
    candidate clears the confidence threshold — returns its official
    digest-based verification result (verified / tampered).
    """
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Empty image upload rejected.",
        )

    engine = VisualFingerprintEngine()
    try:
        blur_score = engine.check_blur(image_bytes)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from None

    settings = get_settings()
    quality = ImageQualityReport(
        blur_score=round(blur_score, 2),
        blur_pass=blur_score >= settings.blur_threshold,
        normalized=True,
    )
    if not quality.blur_pass:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Image rejected by quality pre-check: Laplacian variance "
                f"{quality.blur_score:.2f} is below the {settings.blur_threshold:.1f} "
                "threshold. Re-capture with a steady camera in even light."
            ),
        )

    fingerprints = engine.process_artwork_image(image_bytes)
    matches = await _detect_duplicates(
        repo,
        fingerprints["descriptors_bytes"],
        fingerprints["phash"],
        fingerprints["dhash"],
        exclude_artwork_id="",
    )

    result: VerificationResult | None = None
    best = matches[0] if matches else None
    if best is not None and best.orb_match_score >= MATCH_CONFIDENCE_THRESHOLD:
        candidate = await verify_heritage(best.heritage_id, repo)
        if candidate.outcome != VerificationOutcome.NOT_REGISTERED:
            result = candidate

    return ImageVerificationResult(
        image_quality=quality,
        matches=matches,
        result=result,
    )