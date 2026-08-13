"""Shared fixtures for the VIRASAT test-suite (memory mode, seeded)."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """TestClient with the application lifespan (repository seeded once)."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def repo(client):
    return client.app.state.repository


def make_sharp_image(size: int = 512) -> bytes:
    """Synthesise a high-contrast, sharp 'patta' style JPEG frame."""
    rng = np.random.default_rng(7)
    img = rng.integers(0, 255, (size, size, 3), dtype=np.uint8)
    img[: size // 2] = np.clip(img[: size // 2] * 2, 0, 255)
    img[:: 8, :, 0] = 255
    img[:: 8, :, 1] = 0
    import cv2

    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def make_flat_image(size: int = 256) -> bytes:
    """Synthesise an uniformly grey frame (fails the blur gate)."""
    import cv2

    img = np.full((size, size, 3), 128, dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def upload_artwork(
    client: TestClient,
    image_bytes: bytes,
    artisan_id: str,
    title: str = "Test Patta",
    **extra,
):
    data = {
        "title": title,
        "artisan_id": artisan_id,
        "creation_year": "2026",
        "medium": "Cotton Patta with mineral pigments",
        "dimensions": "10 x 8 in",
        **extra,
    }
    return client.post(
        "/api/v1/artworks/upload",
        files={"file": ("patta.jpg", image_bytes, "image/jpeg")},
        data=data,
    )