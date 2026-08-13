"""Shared route-level services: passport issuance and image fetching."""
from __future__ import annotations

import io
import urllib.request
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.core.security import build_passport_digest


def fetch_image_bytes(image_url: str | None, timeout: float = 6.0) -> bytes | None:
    """Best-effort fetch of the artwork plate for embedding in the PDF."""
    if not image_url:
        return None
    try:
        request = urllib.request.Request(
            image_url, headers={"User-Agent": "virasat-passport-engine/2.0"}
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read()
        from PIL import Image

        Image.open(io.BytesIO(payload)).verify()
        return payload
    except Exception:
        return None


async def get_qr_sidecar(repo, heritage_id: str) -> bytes | None:
    """Return the persisted QR PNG for a heritage ID, if available."""
    sidecar = getattr(repo, "_qr_sidecar", {})
    return sidecar.get(heritage_id)


async def save_qr_sidecar(repo, heritage_id: str, qr_png: bytes) -> None:
    sidecar = getattr(repo, "_qr_sidecar", {})
    sidecar[heritage_id] = qr_png
    setattr(repo, "_qr_sidecar", sidecar)


async def issue_passport(repo, artwork: dict) -> dict:
    """Issue (or return the existing) heritage passport for an artwork."""
    from app.core.config import get_settings
    from app.passport_engine.qr_builder import build_qr_png

    settings = get_settings()

    existing = await repo.get_passport_by_artwork(str(artwork["id"]))
    if existing:
        return existing

    artisan = await repo.get_artisan(str(artwork["artisan_id"]))
    if artisan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artisan owning this artwork no longer exists.",
        )

    heritage_id = artwork["heritage_id"]
    verify_url = f"{settings.verify_frontend_url}?id={heritage_id}"
    issued_at = datetime.now(timezone.utc)
    issued_at_iso = issued_at.isoformat()

    cryptographic_hash = build_passport_digest(
        artwork=artwork, artisan=artisan, issued_at=issued_at_iso
    )

    qr_png = build_qr_png(verify_url)
    await save_qr_sidecar(repo, heritage_id, qr_png)

    payload = {
        "cryptographic_hash": cryptographic_hash,
        "qr_code_url": settings.passport_base_url
        + f"/api/v1/passports/{heritage_id}/qr",
        "pdf_passport_url": settings.passport_base_url
        + f"/api/v1/passports/{heritage_id}/pdf",
        "issued_at": issued_at_iso,
    }
    record = await repo.create_passport(str(artwork["id"]), payload)
    return record