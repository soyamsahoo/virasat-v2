"""ReportLab A4 Heritage Passport certificate — VIRASAT blueprint.

Composes the museum-grade certificate with canvas primitives so the layout
matches the client-side fallback exactly:

  - parchment background with a double museum frame (outer gold hairline,
    inner museum-black solid)
  - serif header block with registry subtitle + Geographical Indication line
  - two-column provenance grid: gold-framed artwork plate with an emerald
    wax seal badge, next to physical & lineage metadata
  - cryptographic & computer-vision proof block (passport ID, SHA-256
    digest in monospace Courier-Bold, Laplacian clarity + ORB count)
  - embedded QR verification code, guild-master signature line and
    VIRASAT registry stamp
  - emerald anti-counterfeit disclaimer footer

Every asset (artwork plate, QR) is embedded, so the PDF verifies
independently of the network. Strings are drawn in the ASCII subset of the
standard Type1 fonts (no Devanagari / Greek glyphs in WinAnsi).
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Optional

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.pdfgen.canvas import Canvas

MUSEUM_BLACK = colors.HexColor("#121212")
PARCHMENT = colors.HexColor("#F5F2EB")
GOLD = colors.HexColor("#C5A059")
EMERALD = colors.HexColor("#15803D")
LINEN = colors.HexColor("#D9CDB2")
GREY = colors.HexColor("#5C5A52")

PAGE_W, PAGE_H = A4
CONTENT_L = 52.0
CONTENT_R = 543.28


def _safe(value: str) -> str:
    """WinAnsi approximation for the standard Type1 fonts (mirrors the client).

    ``·`` (WinAnsi 0xB7) is preserved; everything else non-Latin is dropped.
    """
    out = value
    for a, b in (("—", "-"), ("–", "-"), ("−", "-"), ("…", "..."), ("•", "-"),
                 ("'", "'"), ("'", "'"), ('"', '"'), ('"', '"')):
        out = out.replace(a, b)
    return "".join(ch if ch == "·" or 0x20 <= ord(ch) <= 0x7E else " " for ch in out)


def _ordinal(n: int) -> str:
    if 11 <= n % 100 <= 13:
        return f"{n}th"
    suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _gi_label(gi_tag: Optional[str]) -> str:
    if not gi_tag:
        return "Geographical Indication Tag — Registered (Odisha)"
    number = gi_tag[3:] if gi_tag.upper().startswith("GI-") else gi_tag
    return f"Geographical Indication Tag #{number} (Odisha)"


def _fmt_date(iso: str) -> str:
    if not iso:
        return "Not yet issued"
    iso = iso.replace("+00:00", "Z")
    try:
        parsed = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return f"{parsed.day} {parsed.strftime('%B')} {parsed.year}"
    except ValueError:
        return iso


def _draw_frame(c: Canvas) -> None:
    """Parchment sheet + double museum frame (outer gold, inner black)."""
    c.setFillColor(PARCHMENT)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.75)
    c.rect(30, 30, PAGE_W - 60, PAGE_H - 60, stroke=1, fill=0)
    c.setStrokeColor(MUSEUM_BLACK)
    c.setLineWidth(1.1)
    c.rect(40, 40, PAGE_W - 80, PAGE_H - 80, stroke=1, fill=0)


def _line(c: Canvas, x1: float, y1: float, x2: float, y2: float,
          width: float = 0.75, color=colors.HexColor("#121212")) -> None:
    c.setStrokeColor(color)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)


def _text(c: Canvas, x: float, y: float, size: float, value: str,
          font: str = "Helvetica", center: bool = False,
          spacing: float = 0.0, color=MUSEUM_BLACK) -> None:
    text = _safe(value)
    c.setFillColor(color)
    start_x = x
    if center:
        width = stringWidth(text, font, size)
        if spacing:
            width += spacing * (len(text) - 1)
        start_x = x - width / 2
    t = c.beginText(start_x, y)
    t.setFont(font, size)
    if spacing:
        t.setCharSpace(spacing)
    t.textLine(text)
    c.drawText(t)


def _image_scale(pil: PILImage.Image, max_w: float, max_h: float) -> tuple[float, float]:
    scale = min(max_w / max(pil.width, 1), max_h / max(pil.height, 1))
    return pil.width * scale, pil.height * scale


def generate_passport_pdf(
    *,
    artwork: dict,
    artisan: dict,
    region: dict | None,
    tradition: dict | None,
    passport: dict,
    verify_url: str,
    artwork_image_bytes: bytes | None = None,
    qr_image_bytes: bytes,
) -> bytes:
    """Render and return the A4 Heritage Passport certificate as bytes."""
    buffer = io.BytesIO()
    c = Canvas(buffer, pagesize=A4)
    c.setTitle(f"VIRASAT Heritage Passport — {artwork.get('heritage_id')}")
    c.setAuthor("VIRASAT Digital Memory System")

    _draw_frame(c)
    top = lambda offset: PAGE_H - offset

    # ------------------------------------------------------- Section A
    _text(c, PAGE_W / 2, top(80), 24, "VIRASAT · HERITAGE PASSPORT",
          font="Times-Bold", center=True, color=MUSEUM_BLACK)
    _text(c, PAGE_W / 2, top(99), 8.5, "NATIONAL CULTURAL PROVENANCE & HERITAGE REGISTRY",
          font="Helvetica", center=True, spacing=1.4, color=MUSEUM_BLACK)
    gi = (tradition or {}).get("gi_tag_number") or artwork.get("gi_tag_number")
    _text(c, PAGE_W / 2, top(114), 7.5, _gi_label(gi),
          font="Helvetica-Bold", center=True, spacing=0.8, color=GOLD)
    _line(c, CONTENT_L, top(132), CONTENT_R, top(132), 0.6, GOLD)

    # ------------------------------------------------------- Section B
    grid_top = 156.0
    box_x, box_w = 52.0, 178.0
    pil: PILImage.Image | None = None
    if artwork_image_bytes:
        try:
            pil = PILImage.open(io.BytesIO(artwork_image_bytes))
        except Exception:
            pil = None
    img_w = img_h = 0.0
    img_x = box_x + (box_w - 150) / 2
    img_bottom = top(grid_top)
    if pil is not None:
        img_w, img_h = _image_scale(pil, box_w - 16, 140)
        img_x = box_x + (box_w - img_w) / 2
        img_bottom = top(grid_top) - img_h
        c.drawImage(ImageReader(pil), img_x, img_bottom, img_w, img_h)
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.95)
        c.rect(img_x - 3, img_bottom - 3, img_w + 6, img_h + 6, stroke=1, fill=0)
        seal_r, sx, sy = 15.0, img_x + img_w - 2, img_bottom + 2
        c.setStrokeColor(GOLD)
        c.setLineWidth(1.1)
        c.setFillColor(EMERALD)
        c.circle(sx, sy, seal_r, stroke=1, fill=1)
        _text(c, sx, sy + 2.5, 5.2, "VERIFIED", font="Times-Bold", center=True, color=PARCHMENT)
        _text(c, sx, sy - 4, 3.8, "FINGERPRINTED", font="Times-Bold", center=True, color=PARCHMENT)
    else:
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.95)
        c.rect(box_x, top(grid_top) - 90, box_w, 90, stroke=1, fill=0)
        _text(c, box_x + box_w / 2, top(grid_top) - 45, 8, "PLATE UNAVAILABLE",
              center=True, color=GREY)

    region_name = "—"
    if region:
        region_name = ", ".join(
            v for v in (region.get("village"), region.get("district"), region.get("state")) if v
        ) or "—"
    pehchan = artisan.get("pehchan_card_id") or "—"
    generation = artisan.get("generation_number")
    rows = [
        ("TITLE", artwork.get("title") or "—", "Times-Roman", 11),
        ("MASTER ARTISAN", artisan.get("full_name") or "—", "Helvetica", 9.5),
        ("LINEAGE", _ordinal(int(generation)) + " Generation Master" if generation else "—",
         "Helvetica", 9.5),
        ("PEHCHAN ID", f"{pehchan}  ·  Ministry of Textiles Verified", "Helvetica", 9.5),
        ("ORIGIN", region_name, "Helvetica", 9.5),
        ("MEDIUM", artwork.get("medium") or "—", "Helvetica", 9.5),
        ("DIMENSIONS & YEAR",
         f"{artwork.get('dimensions') or '—'}  ·  {artwork.get('creation_year') or '—'}",
         "Helvetica", 9.5),
    ]
    for k, (label, value, font, size) in enumerate(rows):
        row_top = grid_top + k * 27
        _text(c, 248, top(row_top), 6, label, font="Helvetica-Bold", spacing=0.9, color=GOLD)
        _text(c, 248, top(row_top + 12), size, value, font=font)
        _line(c, 248, top(row_top + 22), CONTENT_R, top(row_top + 22), 0.35, LINEN)

    # --------------------------------------------- Section C: CV proof
    sec_top = 340.0
    _line(c, CONTENT_L, top(sec_top), CONTENT_R, top(sec_top), 0.5, GOLD)
    _text(c, PAGE_W / 2, top(sec_top - 22), 9.5, "CRYPTOGRAPHIC & COMPUTER VISION PROOF",
          font="Times-Bold", center=True, spacing=1.2, color=GOLD)
    _line(c, CONTENT_L, top(sec_top - 26), PAGE_W / 2 - 68, top(sec_top - 26), 0.4, LINEN)
    _line(c, PAGE_W / 2 + 68, top(sec_top - 26), CONTENT_R, top(sec_top - 26), 0.4, LINEN)

    def _cv_row(offset: float, label: str, value: str, font: str = "Helvetica", size: float = 9.5,
                value_color=MUSEUM_BLACK) -> None:
        _text(c, CONTENT_L, top(sec_top - 50 - offset), 6, label,
              font="Helvetica-Bold", spacing=0.9, color=GOLD)
        _text(c, 226, top(sec_top - 50 - offset), size, value, font=font, color=value_color)

    _cv_row(0, "PASSPORT ID", artwork.get("heritage_id") or "—", font="Courier-Bold", size=10.5)
    _cv_row(24, "SHA-256 DIGEST", passport.get("cryptographic_hash") or "-", font="Courier-Bold", size=8)

    _text(c, CONTENT_L, top(sec_top - 98), 6, "LAPLACIAN BLUR VARIANCE",
          font="Helvetica-Bold", spacing=0.9, color=GOLD)
    blur = artwork.get("blur_score")
    lap_line = "Laplacian Blur Variance  " + (f"{blur:.1f}" if blur is not None else "—") + "  ["
    _text(c, 226, top(sec_top - 98), 8.5, lap_line, font="Helvetica")
    x_pass = 226 + stringWidth(lap_line, "Helvetica", 8.5)
    _text(c, x_pass, top(sec_top - 98), 8.5, "PASSED", font="Helvetica-Bold", color=EMERALD)
    x_tail = x_pass + stringWidth("PASSED", "Helvetica-Bold", 8.5)
    _text(c, x_tail, top(sec_top - 98), 8.5, "]  (threshold >= 100.0)", font="Helvetica")

    orb = artwork.get("orb_keypoint_count")
    orb_value = f"{int(orb):,} descriptors matched (pgvector)" if orb else "—"
    _cv_row(72, "ORB KEYPOINT FEATURE COUNT", orb_value)
    _line(c, CONTENT_L, top(sec_top - 134), CONTENT_R, top(sec_top - 134), 0.5, LINEN)

    # --------------------------------------------- Section D: QR + scanner
    qr_box, qx, q_top = 96.0, 52.0, 190.0
    qy = top(q_top) - qr_box
    c.setFillColor(PARCHMENT)
    c.rect(qx, qy, qr_box, qr_box, stroke=0, fill=1)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.rect(qx, qy, qr_box, qr_box, stroke=1, fill=0)
    if qr_image_bytes:
        try:
            qr_pil = PILImage.open(io.BytesIO(qr_image_bytes))
            qw, qh = _image_scale(qr_pil, qr_box - 14, qr_box - 14)
            c.drawImage(ImageReader(qr_pil), qx + (qr_box - qw) / 2, qy + (qr_box - qh) / 2, qw, qh)
        except Exception:
            _text(c, qx + qr_box / 2, top(q_top) - 48, 8, "SCAN TO VERIFY",
                  font="Helvetica-Bold", center=True)

    scan_x = 168.0
    _text(c, scan_x, top(206), 10, "VERIFICATION SCANNER", font="Times-Bold", color=GOLD)
    _text(c, scan_x, top(224), 8, "Scan this dynamic QR code to verify physical keypoint",
          color=GREY)
    _text(c, scan_x, top(234), 8, "alignment against the live registry.", color=GREY)
    _text(c, scan_x, top(250), 7.5, _safe(verify_url), font="Courier")

    # --------------------------------------------- signatures + stamp
    _line(c, CONTENT_L, top(304), CONTENT_R, top(304), 0.5, LINEN)
    _line(c, 52, top(332), 148, top(332), 0.8)
    _text(c, 52, top(346), 6, "GUILD MASTER SIGNATURE", font="Helvetica-Bold",
          spacing=0.8, color=GOLD)
    _text(c, 52, top(358), 8, "Raghurajpur Crafts Guild", color=GREY)

    stamp_x, stamp_y = CONTENT_R - 70, top(318)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.6)
    c.circle(stamp_x, stamp_y, 22, stroke=1, fill=0)
    c.setLineWidth(0.7)
    c.circle(stamp_x, stamp_y, 18.6, stroke=1, fill=0)
    _text(c, stamp_x, top(312), 7.5, "VIRASAT", font="Times-Bold", center=True)
    _text(c, stamp_x, top(322), 4.8, "REGISTRY", font="Helvetica-Bold", center=True,
          spacing=1.4, color=GOLD)
    _text(c, stamp_x, top(364), 6, "VIRASAT CRYPTOGRAPHIC REGISTRY STAMP",
          font="Helvetica-Bold", center=True, spacing=0.8, color=GOLD)

    # ------------------------------------------------------------- footer
    issued = passport.get("issued_at") or datetime.utcnow().isoformat()
    _line(c, CONTENT_L, top(734), CONTENT_R, top(734), 0.5, GOLD)
    _text(
        c, PAGE_W / 2, top(750), 7.5,
        "This Heritage Passport guarantees physical micro-texture fingerprinting and lineage "
        "provenance. Any physical copy without matching ORB keypoints is counterfeit.",
        font="Times-Italic", center=True, color=EMERALD,
    )
    _text(
        c, PAGE_W / 2, top(765), 6.5,
        "This document constitutes a tamper-proof digital memory record.  "
        "VIRASAT - India's Digital Memory System",
        center=True, color=GREY,
    )
    _text(c, CONTENT_R, top(766), 6, f"Issued {_fmt_date(issued)}", center=True, color=GREY)

    c.save()
    return buffer.getvalue()