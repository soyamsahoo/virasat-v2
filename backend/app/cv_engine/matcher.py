"""Geometric duplicate detection.

Two-stage similarity pipeline:
  1. Perceptual hash filter — O(N) Hamming scan over stored pHash/dHash pairs.
  2. ORB verification      — brute-force Hamming matching between descriptor
                             sets, then RANSAC homography on real keypoint
                             coordinates to confirm the structural art pattern
                             beyond camera-angle noise.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.cv_engine.fingerprint import unpack_orb

MIN_ORB_MATCHES = 12
MIN_RANSAC_INLIERS = 8
MATCH_DISTANCE_CAP = 64


@dataclass
class OrbMatchReport:
    matched: bool
    raw_matches: int
    inliers: int
    homography_confidence: float


def _good_matches(
    payload_a: bytes, payload_b: bytes, min_matches: int = MIN_ORB_MATCHES,
) -> tuple[list | None, np.ndarray | None, np.ndarray | None]:
    """Return (good_matches, points_a Nx2, points_b Nx2) or (None, None, None)."""
    if not payload_a or not payload_b:
        return None, None, None
    try:
        coords_a, desc_a = unpack_orb(payload_a)
        coords_b, desc_b = unpack_orb(payload_b)
    except ValueError:
        return None, None, None
    if len(desc_a) < 2 or len(desc_b) < 2:
        return None, None, None

    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = bf.match(desc_a, desc_b)
    good = [m for m in matches if m.distance <= MATCH_DISTANCE_CAP]
    if len(good) < min_matches:
        return None, None, None

    points_a = np.asarray([coords_a[m.queryIdx] for m in good], dtype=np.float32)
    points_b = np.asarray([coords_b[m.trainIdx] for m in good], dtype=np.float32)
    return good, points_a, points_b


def match_orb_descriptors(
    payload_a: bytes, payload_b: bytes,
    min_matches: int = MIN_ORB_MATCHES,
    min_inliers: int = MIN_RANSAC_INLIERS,
) -> OrbMatchReport:
    """Brute-force Hamming matching with RANSAC homography verification."""
    good, points_a, points_b = _good_matches(payload_a, payload_b, min_matches)
    if good is None:
        return OrbMatchReport(False, 0, 0, 0.0)

    homography, mask = cv2.findHomography(points_a, points_b, cv2.RANSAC, 5.0)
    if homography is None or mask is None:
        return OrbMatchReport(False, len(good), 0, 0.0)

    inliers = int(np.count_nonzero(mask))
    confidence = inliers / max(len(good), 1)
    return OrbMatchReport(
        matched=inliers >= min_inliers,
        raw_matches=len(good),
        inliers=inliers,
        homography_confidence=round(float(confidence), 4),
    )


def match_orb_visual(
    payload_a: bytes, payload_b: bytes, max_pairs: int = 32,
) -> list[tuple[float, float, float, float]]:
    """Evenly sampled matched keypoint pairs for the inspector overlay.

    Returns (x1, y1, x2, y2) tuples in each source image's pixel space,
    drawn from the RANSAC-inlier set when a homography is found, else from
    the raw Hamming-filtered matches.
    """
    good, points_a, points_b = _good_matches(payload_a, payload_b, min_matches=8)
    if good is None:
        return []

    homography, mask = cv2.findHomography(points_a, points_b, cv2.RANSAC, 5.0)
    if homography is not None and mask is not None:
        inliers = np.flatnonzero(mask)
        if len(inliers) >= 8:
            pts_a, pts_b = points_a[inliers], points_b[inliers]
        else:
            pts_a, pts_b = points_a, points_b
    else:
        pts_a, pts_b = points_a, points_b

    count = min(len(pts_a), max_pairs)
    if count == 0:
        return []
    indices = np.linspace(0, len(pts_a) - 1, count, dtype=int)
    pairs = [
        (float(pts_a[i][0]), float(pts_a[i][1]),
         float(pts_b[i][0]), float(pts_b[i][1]))
        for i in indices
    ]
    return pairs


def score_similarity(phash_distance: int, dhash_distance: int, orb_report: OrbMatchReport) -> float:
    """Composite 0..1 score for duplicate ranking."""
    hash_score = 1.0 - ((phash_distance + dhash_distance) / 2) / 64.0
    orb_score = orb_report.homography_confidence if orb_report.matched else 0.0
    return round(0.5 * max(0.0, hash_score) + 0.5 * orb_score, 4)