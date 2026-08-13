"""Artwork registry, image-quality pre-check and CV fingerprint upload."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status

from app.api.v1.deps import Repository, get_repo
from app.api.v1.service import issue_passport
from app.core.config import get_settings
from app.core.heritage_id import build_next_heritage_id
from app.core.security import require_api_key
from app.cv_engine.fingerprint import VisualFingerprintEngine
from app.cv_engine.matcher import match_orb_descriptors, match_orb_visual, score_similarity
from app.models.schemas import (
    ArtworkCreate,
    ArtworkRead,
    HeritagePassportRead,
    ImageQualityReport,
    KeypointMatchPoint,
    ProvenanceEventCreate,
    ProvenanceEventRead,
    SimilarArtwork,
    UploadResponse,
)

router = APIRouter(prefix="/artworks", tags=["artworks"])


@router.get("", response_model=list[ArtworkRead])
async def list_artworks(
    artisan_id: uuid.UUID | None = None,
    repo: Repository = Depends(get_repo),
) -> list[ArtworkRead]:
    rows = await repo.list_artworks(artisan_id=str(artisan_id) if artisan_id else None)
    return [ArtworkRead.model_validate(row) for row in rows]


@router.post(
    "",
    response_model=ArtworkRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
async def register_artwork_metadata(
    payload: ArtworkCreate,
    repo: Repository = Depends(get_repo),
) -> ArtworkRead:
    """Manually register an artwork (used when fingerprints are precomputed)."""
    row = await _persist_artwork(repo, payload.model_dump(exclude_none=True), {})
    return ArtworkRead.model_validate(row)


@router.post(
    "/upload",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
async def upload_artwork(
    file: UploadFile = File(...),
    title: str = Form(...),
    artisan_id: uuid.UUID = Form(...),
    creation_year: int = Form(...),
    medium: str | None = Form(default=None),
    dimensions: str | None = Form(default=None),
    auto_passport: bool = Form(default=False),
    request: Request = None,
    repo: Repository = Depends(get_repo),
) -> UploadResponse:
    """Field-agent upload endpoint.

    Runs the server-side image quality pre-check (blur + illumination)
    *before* indexing, then extracts perceptual hashes and ORB
    fingerprints, detects possible duplicates, and optionally issues
    the heritage passport.
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
    illumination = engine.check_illumination(image_bytes)

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

    metadata = {
        "title": title,
        "artisan_id": str(artisan_id),
        "creation_year": creation_year,
        "medium": medium,
        "dimensions": dimensions,
        "phash_signature": fingerprints["phash"],
        "dhash_signature": fingerprints["dhash"],
        "blur_score": fingerprints["blur_score"],
    }
    artwork = await _persist_artwork(repo, metadata, fingerprints)

    await repo.save_artwork_image(str(artwork["id"]), image_bytes)
    base = str(request.base_url).rstrip("/") if request else str(get_settings().passport_base_url)
    image_url = f"{base}/api/v1/artworks/{artwork['heritage_id']}/image"
    await repo.set_artwork_image_url(str(artwork["id"]), image_url)
    artwork = await repo.get_artwork_by_id(str(artwork["id"]))

    possible_duplicates = await _detect_duplicates(
        repo, fingerprints["descriptors_bytes"], fingerprints["phash"],
        fingerprints["dhash"], str(artwork["id"]),
    )

    passport = None
    if auto_passport:
        passport = await issue_passport(repo, artwork)

    response = UploadResponse(
        **artwork,
        image_quality=quality,
        possible_duplicates=possible_duplicates,
    )
    if passport:
        response = response.model_copy(
            update={"passport": HeritagePassportRead.model_validate(passport)}
        )
    return response


async def _detect_duplicates(
    repo: Repository, orb_payload: bytes | None, phash: str, dhash: str,
    exclude_artwork_id: str,
) -> list[SimilarArtwork]:
    settings = get_settings()
    candidates = await repo.find_similar_by_hash(
        phash, dhash, settings.hash_hamming_threshold
    )
    results: list[SimilarArtwork] = []
    for candidate in candidates:
        if candidate["artwork_id"] == exclude_artwork_id:
            continue
        stored = await repo.get_artwork_by_id(str(candidate["artwork_id"]))
        payload_b, _ = await repo.get_orb_fingerprint(candidate["artwork_id"])
        orb_score = 0.0
        orb_verified = False
        pairs: list[KeypointMatchPoint] = []
        report = None
        if orb_payload and payload_b:
            report = match_orb_descriptors(orb_payload, payload_b)
            orb_score = report.homography_confidence if report.matched else 0.0
            orb_verified = report.matched
            for x1, y1, x2, y2 in match_orb_visual(orb_payload, payload_b):
                pairs.append(KeypointMatchPoint(x1=x1, y1=y1, x2=x2, y2=y2))
        similarity = score_similarity(
            candidate["phash_distance"], candidate["dhash_distance"],
            report if orb_payload else None,
        )
        results.append(
            SimilarArtwork(
                artwork_id=candidate["artwork_id"],
                heritage_id=candidate["heritage_id"],
                title=candidate["title"],
                artisan_name=(stored or {}).get("artisan_name", ""),
                artwork_image_url=(stored or {}).get("primary_image_url", ""),
                phash_distance=candidate["phash_distance"],
                dhash_distance=candidate["dhash_distance"],
                orb_match_score=similarity,
                orb_verified=orb_verified,
                keypoint_pairs=pairs,
            )
        )
    results.sort(key=lambda s: s.orb_match_score, reverse=True)
    return results[:5]


async def _persist_artwork(repo: Repository, metadata: dict, fingerprints: dict) -> dict:
    heritage_id = metadata.get("heritage_id")
    if not heritage_id:
        artisan = await repo.get_artisan(str(metadata["artisan_id"]))
        if artisan is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Artisan not found."
            )
        region = await repo.get_region(str(artisan["region_id"]))
        tradition = await repo.get_tradition(str(artisan["primary_tradition_id"]))
        sequence = await repo.next_heritage_sequence(int(metadata["creation_year"]))
        heritage_id = build_next_heritage_id(
            state=(region or {}).get("state", "IN"),
            tradition_title=(tradition or {}).get("title", "ART"),
            year=int(metadata["creation_year"]),
            next_sequence=sequence,
        )

    try:
        row = await repo.create_artwork(
            {**metadata, "heritage_id": heritage_id,
             "primary_image_url": metadata.get("primary_image_url", "")}
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from None

    if fingerprints.get("descriptors_bytes"):
        await repo.set_artwork_fingerprint(
            str(row["id"]), fingerprints["descriptors_bytes"],
            fingerprints.get("keypoint_count", 0),
        )
    return row


@router.get("/{heritage_id}", response_model=ArtworkRead)
async def get_artwork(
    heritage_id: str,
    repo: Repository = Depends(get_repo),
) -> ArtworkRead:
    row = await repo.get_artwork_by_heritage(heritage_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found."
        )
    return ArtworkRead.model_validate(row)


def _sniff_media_type(image_bytes: bytes) -> str:
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if image_bytes[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "application/octet-stream"


@router.get("/{heritage_id}/image")
async def get_artwork_image(
    heritage_id: str,
    repo: Repository = Depends(get_repo),
) -> Response:
    """Serve the persisted plate photograph of a registered artwork."""
    artwork = await repo.get_artwork_by_heritage(heritage_id)
    if artwork is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found."
        )
    image_bytes = await repo.get_artwork_image(str(artwork["id"]))
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No photograph archived."
        )
    return Response(
        content=image_bytes,
        media_type=_sniff_media_type(image_bytes),
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/{heritage_id}/similar", response_model=list[SimilarArtwork])
async def find_similar_artworks(
    heritage_id: str,
    repo: Repository = Depends(get_repo),
) -> list[SimilarArtwork]:
    artwork = await repo.get_artwork_by_heritage(heritage_id)
    if artwork is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found."
        )
    descriptors, _ = await repo.get_orb_fingerprint(str(artwork["id"]))
    return await _detect_duplicates(
        repo,
        descriptors,
        artwork.get("phash_signature") or "",
        artwork.get("dhash_signature") or "",
        str(artwork["id"]),
    )


@router.post(
    "/{heritage_id}/passport",
    response_model=HeritagePassportRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
async def issue_artwork_passport(
    heritage_id: str,
    repo: Repository = Depends(get_repo),
) -> HeritagePassportRead:
    artwork = await repo.get_artwork_by_heritage(heritage_id)
    if artwork is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found."
        )
    passport = await issue_passport(repo, artwork)
    return HeritagePassportRead.model_validate(passport)


@router.post(
    "/{heritage_id}/events",
    response_model=ProvenanceEventRead,
    status_code=status.HTTP_201_CREATED,
)
async def record_provenance_event(
    heritage_id: str,
    payload: ProvenanceEventCreate,
    repo: Repository = Depends(get_repo),
) -> ProvenanceEventRead:
    artwork = await repo.get_artwork_by_heritage(heritage_id)
    if artwork is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found."
        )
    row = await repo.create_event(
        str(artwork["id"]), payload.model_dump(exclude_none=True)
    )
    return ProvenanceEventRead.model_validate(row)