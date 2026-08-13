"""Computer vision primitives for artwork fingerprinting.

Pipeline used on every upload:
  1. Blur pre-check   — Laplacian variance (``score < 100.0`` ⇒ blurry).
  2. Illumination     — CLAHE on the L channel in LAB colour space.
  3. Perceptual hash  — 64-bit pHash (DCT) + 64-bit dHash (gradient).
  4. ORB features     — keypoints + binary descriptors for geometric
                        matching under varying camera angles.
"""
from __future__ import annotations

import io

import cv2
import imagehash
import numpy as np
from PIL import Image

from app.core.config import get_settings


class VisualFingerprintEngine:
    @staticmethod
    def decode_bgr(image_bytes: bytes) -> np.ndarray | None:
        nparr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    @staticmethod
    def check_blur(image_bytes: bytes) -> float:
        """Variance of the Laplacian operator; < ``blur_threshold`` ⇒ blurry."""
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError("Image could not be decoded as a grayscale frame.")
        return float(cv2.Laplacian(img, cv2.CV_64F).var())

    @staticmethod
    def check_illumination(image_bytes: bytes) -> dict:
        """Histogram analysis: reports mean brightness and exposure spread."""
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError("Image could not be decoded for illumination analysis.")
        hist = cv2.calcHist([img], [0], None, [256], [0, 256]).ravel()
        mean = float(np.average(np.arange(256), weights=hist))
        p5, p95 = np.percentile(img, [5, 95])
        return {
            "mean_luminance": round(mean, 2),
            "dynamic_range_min": round(float(p5), 2),
            "dynamic_range_max": round(float(p95), 2),
            "evenly_lit": bool(p95 - p5 > 60 and 40 <= mean <= 215),
        }

    @staticmethod
    def apply_clahe(img_bgr: np.ndarray, clip_limit: float = 3.0) -> np.ndarray:
        """Contrast Limited Adaptive Histogram Equalization on the L channel."""
        lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        limg = cv2.merge((cl, a, b))
        return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)

    @classmethod
    def compute_hashes(cls, image_bytes: bytes) -> tuple[str, str]:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return str(imagehash.phash(pil_img)), str(imagehash.dhash(pil_img))

    @classmethod
    def extract_orb(cls, image_bytes: bytes):
        """Returns (keypoint_coords Nx2 f32 array, descriptors Nx32 u8 array)."""
        img_bgr = cls.decode_bgr(image_bytes)
        if img_bgr is None:
            raise ValueError("Image could not be decoded as a colour frame.")
        normalized_bgr = cls.apply_clahe(img_bgr)
        gray = cv2.cvtColor(normalized_bgr, cv2.COLOR_BGR2GRAY)
        orb = cv2.ORB_create(nfeatures=get_settings().orb_keypoints)
        keypoints, descriptors = orb.detectAndCompute(gray, None)
        if descriptors is None or not keypoints:
            return None, None
        coords = np.array(
            [(kp.pt[0], kp.pt[1]) for kp in keypoints], dtype=np.float32
        )
        return coords, np.asarray(descriptors, dtype=np.uint8)

    @classmethod
    def process_artwork_image(cls, image_bytes: bytes) -> dict:
        """Full fingerprint extraction: hashes + packed ORB payload."""
        settings = get_settings()
        blur_score = cls.check_blur(image_bytes)
        phash, dhash = cls.compute_hashes(image_bytes)
        coords, descriptors = cls.extract_orb(image_bytes)
        packed = None
        if descriptors is not None and len(descriptors) > 0:
            packed = _pack_orb(coords, descriptors)
        return {
            "phash": phash,
            "dhash": dhash,
            "blur_score": round(blur_score, 2),
            "blur_pass": blur_score >= settings.blur_threshold,
            "descriptors_bytes": packed,
            "keypoint_count": int(len(descriptors)) if descriptors is not None else 0,
        }


def _pack_orb(coords: np.ndarray, descriptors: np.ndarray) -> bytes:
    """Serialise keypoint coordinates (N×2 f32) + descriptors (N×32 u8).

    Layout: [rows int32][coords float32 N*2][descriptors uint8 N*32]
    """
    rows = int(descriptors.shape[0])
    header = np.asarray([rows], dtype=np.int32).tobytes()
    return header + coords.tobytes() + descriptors.tobytes()


def unpack_orb(payload: bytes) -> tuple[np.ndarray, np.ndarray]:
    """Inverse of ``_pack_orb``; returns (coords Nx2 f32, descriptors Nx32 u8)."""
    if not payload:
        raise ValueError("No ORB payload present.")
    rows = int(np.frombuffer(payload[:4], dtype=np.int32)[0])
    coords_bytes = rows * 2 * 4
    header_end = 4
    coords = np.frombuffer(
        payload[header_end:header_end + coords_bytes], dtype=np.float32
    ).reshape(rows, 2)
    descriptors = np.frombuffer(
        payload[header_end + coords_bytes:], dtype=np.uint8
    ).reshape(rows, 32)
    return coords, descriptors