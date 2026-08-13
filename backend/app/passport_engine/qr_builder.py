"""Dynamic QR builder for heritage verification.

The QR encodes the public verification URL so any museum visitor or patron
can cryptographically confirm a passport without an account.
"""
from __future__ import annotations

import io

import qrcode
from qrcode.constants import ERROR_CORRECT_M
from qrcode.image.pil import PilImage


def build_qr_png(verify_url: str) -> bytes:
    if not verify_url.startswith(("http://", "https://")):
        raise ValueError("verify_url must be an absolute http(s) URL.")
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(verify_url)
    qr.make(fit=True)
    image: PilImage = qr.make_image(fill_color="#0D0D0D", back_color="#F5F2EB")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()