"""Heritage passport endpoints: issuance, QR and printable PDF."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.v1.deps import Repository, get_repo
from app.api.v1.service import fetch_image_bytes, get_qr_sidecar, issue_passport
from app.core.config import get_settings
from app.passport_engine.pdf_generator import generate_passport_pdf
from app.passport_engine.qr_builder import build_qr_png
from app.models.schemas import HeritagePassportRead

router = APIRouter(prefix="/passports", tags=["passports"])


@router.get("/{heritage_id}", response_model=HeritagePassportRead)
async def get_passport(
    heritage_id: str,
    repo: Repository = Depends(get_repo),
) -> HeritagePassportRead:
    record = await repo.get_passport_by_heritage(heritage_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No passport registered for this heritage ID.",
        )
    return HeritagePassportRead.model_validate(record)


@router.get("/{heritage_id}/qr")
async def get_passport_qr(
    heritage_id: str,
    repo: Repository = Depends(get_repo),
) -> Response:
    """Serve the QR PNG; regenerates deterministically from the verify URL."""
    record = await repo.get_passport_by_heritage(heritage_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No passport registered for this heritage ID.",
        )
    sidecar = await get_qr_sidecar(repo, heritage_id)
    if sidecar is None:
        settings = get_settings()
        verify_url = f"{settings.verify_frontend_url}?id={heritage_id}"
        sidecar = build_qr_png(verify_url)
        await repo_sidecar_save(repo, heritage_id, sidecar)
    return Response(
        content=sidecar,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


async def repo_sidecar_save(repo, heritage_id: str, payload: bytes) -> None:
    from app.api.v1.service import save_qr_sidecar
    await save_qr_sidecar(repo, heritage_id, payload)


@router.get("/{heritage_id}/pdf")
async def get_passport_pdf(
    heritage_id: str,
    repo: Repository = Depends(get_repo),
) -> Response:
    """Dynamically compile the A4 museum certificate with embedded QR."""
    settings = get_settings()
    record = await repo.get_passport_by_heritage(heritage_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No passport registered for this heritage ID.",
        )
    passport = record
    artwork = record["artwork"]

    artisan = await repo.get_artisan(str(artwork["artisan_id"]))
    if artisan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artisan not found."
        )
    region = await repo.get_region(str(artisan["region_id"]))
    tradition = await repo.get_tradition(str(artisan["primary_tradition_id"]))

    verify_url = f"{settings.verify_frontend_url}?id={heritage_id}"
    qr_png = await get_qr_sidecar(repo, heritage_id)
    if qr_png is None:
        qr_png = build_qr_png(verify_url)

    image_bytes = fetch_image_bytes(artwork.get("primary_image_url"))

    pdf_bytes = generate_passport_pdf(
        artwork=artwork,
        artisan=artisan,
        region=region,
        tradition=tradition,
        passport=passport,
        verify_url=verify_url,
        artwork_image_bytes=image_bytes,
        qr_image_bytes=qr_png,
    )
    filename = f"virasat-passport-{heritage_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )