"""Unit tests for the computer-vision fingerprint engine (cv_engine/)."""
from __future__ import annotations

import numpy as np
import pytest

from conftest import make_flat_image, make_sharp_image

from app.cv_engine.fingerprint import VisualFingerprintEngine, unpack_orb
from app.cv_engine.matcher import match_orb_descriptors, match_orb_visual, score_similarity


# ------------------------------------------------------------------ fingerprints
def test_compute_hashes_returns_hex_signatures():
    phash, dhash = VisualFingerprintEngine.compute_hashes(make_sharp_image())
    assert len(phash) == 16
    assert len(dhash) == 16
    int(phash, 16)
    int(dhash, 16)


def test_blur_score_separates_sharp_from_flat():
    sharp_score = VisualFingerprintEngine.check_blur(make_sharp_image())
    flat_score = VisualFingerprintEngine.check_blur(make_flat_image())
    assert flat_score < sharp_score
    assert flat_score < 100.0  # below the configured rejection threshold


def test_process_artwork_image_full_extraction():
    report = VisualFingerprintEngine.process_artwork_image(make_sharp_image())
    assert report["blur_pass"] is True
    assert len(report["phash"]) == 16
    assert report["keypoint_count"] > 0
    assert report["descriptors_bytes"] is not None
    coords, descs = unpack_orb(report["descriptors_bytes"])
    assert coords.shape == (report["keypoint_count"], 2)
    assert descs.shape == (report["keypoint_count"], 32)


# ------------------------------------------------------------------ matching
def test_identical_image_matches_geometrically():
    payload = make_sharp_image()
    report = VisualFingerprintEngine.process_artwork_image(payload)
    assert report["descriptors_bytes"] is not None
    match = match_orb_descriptors(
        report["descriptors_bytes"], report["descriptors_bytes"]
    )
    assert match.matched is True
    assert match.inliers >= 8
    assert 0.0 < match.homography_confidence <= 1.0


def test_unrelated_images_do_not_match():
    import cv2

    rng = np.random.default_rng(3)
    noise = rng.integers(0, 255, (512, 512, 3), dtype=np.uint8)
    _, buf_b = cv2.imencode(".jpg", noise)
    rep_a = VisualFingerprintEngine.process_artwork_image(make_sharp_image())
    rep_b = VisualFingerprintEngine.process_artwork_image(buf_b.tobytes())
    assert rep_a["descriptors_bytes"] is not None
    assert rep_b["descriptors_bytes"] is not None
    match = match_orb_descriptors(rep_a["descriptors_bytes"], rep_b["descriptors_bytes"])
    assert match.matched is False


def test_visual_pairs_capped_and_ordered():
    payload = make_sharp_image()
    report = VisualFingerprintEngine.process_artwork_image(payload)
    pairs = match_orb_visual(report["descriptors_bytes"], report["descriptors_bytes"])
    assert len(pairs) <= 32
    for x1, y1, x2, y2 in pairs:
        assert x1 == x2 and y1 == y2  # identical images → co-located pairs


def test_score_similarity_bounds():
    assert 0.0 <= score_similarity(0, 0, _matched_report()) <= 1.0
    assert score_similarity(64, 64, _unmatched_report()) < 0.5


class _DummyReport:
    def __init__(self, matched, confidence):
        self.matched = matched
        self.homography_confidence = confidence


def _matched_report():
    return _DummyReport(True, 0.9)


def _unmatched_report():
    return _DummyReport(False, 0.0)