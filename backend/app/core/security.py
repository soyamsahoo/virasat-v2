"""Security primitives: canonical fingerprint hashing and API key guard.

The passport's ``cryptographic_hash`` is the SHA-256 digest of a canonical,
deterministically serialised record (artwork fields + artisan identity +
issuance metadata). Any mutation of a registered record invalidates the
digest, which the verification endpoint re-derives and compares.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import datetime

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


def sha256_hex(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


# --- Field agent access PIN -------------------------------------------
# The PIN is the credential a field agent types at sign-in. Only a salted
# PBKDF2 digest is persisted, never the plain PIN, so a database leak
# cannot be replayed. `pbkdf2_hmac` is stdlib — no new dependencies.
PIN_ITERATIONS = 100_000


def random_pin() -> str:
    """Cryptographically random 6-digit PIN, issued once at registration."""
    return f"{secrets.randbelow(1_000_000):06d}"


def pin_digest(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", pin.encode(), salt.encode(), PIN_ITERATIONS
    ).hex()


def verify_pin(pin: str, salt: str, expected_digest: str) -> bool:
    return hmac.compare_digest(pin_digest(pin, salt), expected_digest)


def canonical_bytes(record: dict) -> bytes:
    """Deterministic JSON serialisation (sorted keys, no whitespace)."""
    return json.dumps(record, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _as_datetime(value: datetime | str) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def build_passport_digest(*, artwork: dict, artisan: dict, issued_at: datetime | str) -> str:
    issued = _as_datetime(issued_at)
    record = {
        "artifact": {
            "heritage_id": artwork["heritage_id"],
            "title": artwork["title"],
            "dimensions": artwork.get("dimensions"),
            "medium": artwork.get("medium"),
            "creation_year": artwork.get("creation_year"),
            "phash_signature": artwork.get("phash_signature"),
            "blur_score": artwork.get("blur_score"),
        },
        "artisan": {
            "full_name": artisan["full_name"],
            "pehchan_card_id": artisan.get("pehchan_card_id"),
            "generation_number": artisan.get("generation_number"),
        },
        "issued_at": issued.isoformat(),
    }
    return sha256_hex(canonical_bytes(record))


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Header guard, active only when ``VIRASAT_API_KEY`` is configured."""
    settings = get_settings()
    if settings.api_key is None:
        return
    if x_api_key is None or not hmac.compare_digest(x_api_key, settings.api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header.",
        )