"""ReportLab A4 museum-grade heritage passport certificate.

Composes a framed certificate with the artwork plate, provenance fields,
embedded QR verification code and the SHA-256 cryptographic signature
footer. Fully self-contained: every asset (artwork plate, QR) is embedded,
so the PDF verifies independently of the network.
"""
from __future__ import annotations

import io
from datetime import datetime

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

MUSEUM_BLACK = colors.HexColor("#0D0D0D")
PARCHMENT = colors.HexColor("#F5F2EB")
GOLD = colors.HexColor("#C5A059")
TERRACOTTA = colors.HexColor("#8B4513")
EMERALD = colors.HexColor("#1B3B2B")
FAINT_GOLD = colors.HexColor("#E8D9B8")


def _styles() -> dict:
    return {
        "kicker": ParagraphStyle(
            "kicker", fontName="Helvetica-Bold", fontSize=8, leading=10,
            textColor=TERRACOTTA, alignment=TA_CENTER, tracking=4, spaceAfter=2,
        ),
        "title": ParagraphStyle(
            "title", fontName="Times-Bold", fontSize=22, leading=26,
            textColor=MUSEUM_BLACK, alignment=TA_CENTER, spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", fontName="Helvetica", fontSize=9, leading=12,
            textColor=MUSEUM_BLACK, alignment=TA_CENTER,
        ),
        "heritage_id": ParagraphStyle(
            "heritage_id", fontName="Helvetica-Bold", fontSize=13, leading=16,
            textColor=GOLD, alignment=TA_CENTER, spaceBefore=6,
        ),
        "label": ParagraphStyle(
            "label", fontName="Helvetica-Bold", fontSize=7.5, leading=10,
            textColor=TERRACOTTA,
        ),
        "value": ParagraphStyle(
            "value", fontName="Helvetica", fontSize=9.5, leading=13,
            textColor=MUSEUM_BLACK, alignment=TA_JUSTIFY,
        ),
        "footer": ParagraphStyle(
            "footer", fontName="Helvetica", fontSize=6.5, leading=9,
            textColor=colors.HexColor("#5C5A52"), alignment=TA_CENTER,
        ),
    }


def _draw_frame(c: canvas.Canvas, doc) -> None:
    """Outer parchment certificate frame with double gold rules."""
    page_w, page_h = A4
    margin = 9 * mm
    c.saveState()
    c.setFillColor(PARCHMENT)
    c.rect(0, 0, page_w, page_h, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor("#D9CDB2"))
    c.setLineWidth(0.75)
    c.rect(margin, margin, page_w - 2 * margin, page_h - 2 * margin, stroke=1, fill=0)
    c.setStrokeColor(GOLD)
    c.setLineWidth(2.0)
    c.rect(margin + 2.2 * mm, margin + 2.2 * mm,
           page_w - 2 * (margin + 2.2 * mm), page_h - 2 * (margin + 2.2 * mm),
           stroke=1, fill=0)
    c.setStrokeColor(FAINT_GOLD)
    c.setLineWidth(0.5)
    c.rect(margin + 3.4 * mm, margin + 3.4 * mm,
           page_w - 2 * (margin + 3.4 * mm), page_h - 2 * (margin + 3.4 * mm),
           stroke=1, fill=0)
    # Gold foil corner seals
    c.setFillColor(GOLD)
    for cx, cy in ((margin, page_h - margin), (page_w - margin, page_h - margin),
                   (margin, margin), (page_w - margin, margin)):
        c.circle(cx, cy, 3.4 * mm, stroke=0, fill=1)
    c.setFillColor(PARCHMENT)
    for cx, cy in ((margin, page_h - margin), (page_w - margin, page_h - margin),
                   (margin, margin), (page_w - margin, margin)):
        c.circle(cx, cy, 2.1 * mm, stroke=0, fill=1)
    c.restoreState()


def _pil_bytes_to_reportlab(image_bytes: bytes, max_height: float = 78 * mm) -> Image:
    buf = io.BytesIO(image_bytes)
    pil = PILImage.open(buf)
    width_mm, height_mm = pil.width * 0.264583, pil.height * 0.264583
    scale = min(max_height / max(height_mm, 1.0), 1.0)
    buf.seek(0)
    img = Image(buf)
    img.drawWidth = width_mm * scale
    img.drawHeight = height_mm * scale
    return img


def _field(label: str, value: str) -> list:
    style = _styles()
    return [Paragraph(label, style["label"]), Paragraph(value or "—", style["value"])]


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
    """Render and return the A4 certificate PDF as bytes."""
    styles = _styles()
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=16 * mm, bottomMargin=18 * mm,
        title=f"VIRASAT Heritage Passport — {artwork.get('heritage_id')}",
        author="VIRASAT (विरासत) Digital Memory System",
    )

    region_name = region and f"{region.get('village')}, {region.get('district')}, {region.get('state')}"
    pehchan = artisan.get("pehchan_card_id") or "Not registered"
    issued = passport.get("issued_at") or datetime.utcnow().isoformat()
    if isinstance(issued, str):
        issued = issued.replace("+00:00", "Z")

    story = []
    story.append(Paragraph("भारत की जीवित कला · INDIA'S LIVING ART", styles["kicker"]))
    story.append(Paragraph("HERITAGE PASSPORT", styles["title"]))
    story.append(Paragraph("विरासत — Digital Memory System &amp; Provenance Registry", styles["subtitle"]))
    story.append(Paragraph(artwork.get("heritage_id", ""), styles["heritage_id"]))
    story.append(Spacer(1, 3 * mm))
    story.append(HRFlowable(width="100%", thickness=0.6, color=GOLD))
    story.append(Spacer(1, 6 * mm))

    if artwork_image_bytes:
        try:
            story.append(_pil_bytes_to_reportlab(artwork_image_bytes))
        except Exception:
            pass

    story.append(Paragraph(artwork.get("title", ""), styles["title"]))
    story.append(Spacer(1, 4 * mm))

    fields = Table(
        [
            _field("Medium", artwork.get("medium")),
            _field("Dimensions", artwork.get("dimensions")),
            _field("Creation Year", str(artwork.get("creation_year"))),
            _field("Artisan", artisan.get("full_name")),
            _field("Pehchan Card ID", pehchan),
            _field("Generation", f"Generation {artisan.get('generation_number', 1)}"),
            _field("Region", region_name or "—"),
            _field("Tradition", tradition and tradition.get("title") or artwork.get("tradition_title") or "—"),
            _field("GI Tag", tradition and tradition.get("gi_tag_number") or "—"),
            _field("Passport Issued", issued),
        ],
        colWidths=[52 * mm, 118 * mm],
        hAlign="CENTER",
    )
    fields.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#D9CDB2")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(fields)
    story.append(Spacer(1, 8 * mm))

    verify = Table(
        [
            [
                Image(io.BytesIO(qr_image_bytes), width=32 * mm, height=32 * mm),
                Paragraph(
                    f"Scan to verify authenticity at<br/><b>{verify_url}</b>",
                    ParagraphStyle(
                        "scan", fontName="Helvetica", fontSize=9, leading=13,
                        textColor=MUSEUM_BLACK,
                    ),
                ),
            ]
        ],
        colWidths=[44 * mm, 126 * mm],
        hAlign="CENTER",
    )
    verify.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOX", (0, 0), (-1, -1), 0.6, GOLD),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FBFAF5")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(verify)
    story.append(Spacer(1, 6 * mm))

    story.append(HRFlowable(width="100%", thickness=0.6, color=GOLD))
    story.append(Spacer(1, 3 * mm))
    story.append(
        Paragraph(
            f"SHA-256 FINGERPRINT&nbsp;&nbsp;{passport.get('cryptographic_hash', '')}",
            styles["footer"],
        )
    )
    story.append(
        Paragraph(
            "VIRASAT · विरासत · India's Digital Memory System — Issued under the "
            "provenance registry. Verify at {0}".format(verify_url),
            styles["footer"],
        )
    )

    doc.build(
        story,
        onFirstPage=_draw_frame,
        onLaterPages=_draw_frame,
    )
    return buffer.getvalue()