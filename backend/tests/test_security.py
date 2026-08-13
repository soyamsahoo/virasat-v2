"""Unit tests for the passport digest — the platform's trust primitive."""
from __future__ import annotations

import json

from app.core.security import canonical_bytes, build_passport_digest

ARTWORK = {
    "heritage_id": "VR-OD-PAT-2026-000001",
    "title": "Dashavatara Patta",
    "dimensions": "24 x 18 in",
    "medium": "Cotton Patta",
    "creation_year": 2026,
    "phash_signature": "a" * 64,
    "blur_score": 287.4,
}
ARTISAN = {
    "full_name": "Gopinath Moharana",
    "pehchan_card_id": "OD-PC-0001",
    "generation_number": 1,
}
ISSUED = "2026-01-15T00:00:00+00:00"


def test_canonical_bytes_are_deterministic():
    left = canonical_bytes({"b": 1, "a": {"y": 2, "x": 1}})
    right = canonical_bytes({"a": {"x": 1, "y": 2}, "b": 1})
    assert left == right
    assert b'"a"' in left and b'"b"' in left  # keys sorted
    json.loads(left.decode("utf-8"))


def test_digest_is_stable_across_calls():
    d1 = build_passport_digest(artwork=ARTWORK, artisan=ARTISAN, issued_at=ISSUED)
    d2 = build_passport_digest(artwork=ARTWORK, artisan=ARTISAN, issued_at=ISSUED)
    assert d1 == d2
    assert len(d1) == 64


def test_digest_flips_on_title_tamper():
    base = build_passport_digest(artwork=ARTWORK, artisan=ARTISAN, issued_at=ISSUED)
    mutated = {**ARTWORK, "title": "Mutated Title"}
    tampered = build_passport_digest(artwork=mutated, artisan=ARTISAN, issued_at=ISSUED)
    assert tampered != base


def test_digest_flips_on_artisan_tamper():
    base = build_passport_digest(artwork=ARTWORK, artisan=ARTISAN, issued_at=ISSUED)
    mutated = {**ARTISAN, "generation_number": 2}
    tampered = build_passport_digest(artwork=ARTWORK, artisan=mutated, issued_at=ISSUED)
    assert tampered != base


def test_digest_flips_on_issuance_tamper():
    base = build_passport_digest(artwork=ARTWORK, artisan=ARTISAN, issued_at=ISSUED)
    tampered = build_passport_digest(
        artwork=ARTWORK, artisan=ARTISAN, issued_at="2026-02-01T00:00:00+00:00"
    )
    assert tampered != base