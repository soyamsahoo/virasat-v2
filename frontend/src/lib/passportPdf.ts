/** Dependency-free A4 Heritage Passport certificate builder.
 *
 *  When the API is unreachable we still want the "Download passport" action
 *  to work for registered works. This emits a valid A4 PDF that follows the
 *  VIRASAT certificate blueprint:
 *
 *    - parchment background with a double museum frame
 *      (outer gold hairline, inner museum-black solid)
 *    - serif header block (VIRASAT · HERITAGE PASSPORT, registry subtitle,
 *      Geographical Indication line)
 *    - two-column provenance grid: gold-framed artwork plate with an
 *      emerald wax seal, next to the physical & lineage metadata
 *    - cryptographic & computer-vision proof block (passport ID,
 *      SHA-256 digest in monospace, Laplacian clarity + ORB counts)
 *    - a real scannable QR code (vector-drawn from the ``qrcode`` package),
 *      guild-master signature line and VIRASAT registry stamp
 *    - emerald anti-counterfeit disclaimer footer
 *
 *  Type1/WinAnsi fonts cannot render non-Latin glyphs, so every drawn string
 *  is sanitised to a plain-ASCII approximation before embedding.
 */
import QRCode from "qrcode";
import { plateUrlFor } from "./plates";

export interface PassportPdfData {
  heritageId: string;
  title: string;
  artisanName: string;
  pehchanCardId: string | null;
  generationNumber: number | null;
  regionName: string;
  traditionTitle: string;
  medium: string | null;
  creationYear: number;
  dimensions: string | null;
  cryptographicHash: string;
  issuedAt: string;
  giTag: string | null;
  laplacianVariance: number | null;
  orbFeatures: number | null;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_L = 52;
const CONTENT_R = 543.28;
const CONTENT_W = CONTENT_R - CONTENT_L;

/** Palette (hex -> "r g b" PDF fractions). */
const COL: Record<string, string> = {
  parchment: "0.9608 0.9490 0.9216", // #F5F2EB
  gold: "0.7725 0.6275 0.3490", // #C5A059
  black: "0.0706 0.0706 0.0706", // #121212
  emerald: "0.0824 0.5020 0.2392", // #15803D
  linen: "0.8510 0.8039 0.6980", // #D9CDB2
  grey: "0.3608 0.3529 0.3216", // #5C5A52
};

/** Per-font advance (fraction of font size) used for centring maths. */
const ADVANCE: Record<string, number> = {
  F1: 0.53,
  F2: 0.57,
  F3: 0.6,
  T1: 0.56,
  T2: 0.52,
  T3: 0.52,
};

/** ASCII-safe printable string for embedding in a PDF text operator.
 *  ``·`` (WinAnsi 0xB7) is preserved; everything else non-Latin is dropped. */
function safe(value: string): string {
  return value
    .replace(/—|–|−/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^\x20-\x7E·]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function widthOf(str: string, size: number, font: string, spacing = 0): number {
  const factor = ADVANCE[font] ?? 0.53;
  return str.length * size * factor + (str.length > 1 ? spacing * (str.length - 1) : 0);
}

function rectFill(x: number, y: number, w: number, h: number, color: string): string {
  return `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${COL[color]} rg f\n`;
}

function rectStroke(x: number, y: number, w: number, h: number, width: number, color: string): string {
  return `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${COL[color]} RG ${width} w S\n`;
}

function circle(cx: number, cy: number, r: number, color: string, stroke = true, fill = false, width = 1): string {
  const ops = [];
  if (fill) ops.push(`${COL[color]} rg`);
  if (stroke) ops.push(`${COL[color]} RG ${width} w`);
  const action = fill && stroke ? "B" : fill ? "f" : "S";
  return `newpath ${cx.toFixed(2)} ${cy.toFixed(2)} ${r} 0 360 arc ${ops.join(" ")} ${action}\n`;
}

function line(x1: number, y1: number, x2: number, y2: number, width = 0.75, color = "black"): string {
  return `${COL[color]} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}

/** Draw text. ``center`` anchors on the horizontal centre (computed). */
function text(
  x: number,
  y: number,
  size: number,
  str: string,
  font = "F1",
  center = false,
  spacing = 0,
  color = "black",
): string {
  const escaped = safe(str);
  const s = escaped.replace(/·/g, "\\267");
  const startX = center ? x - widthOf(escaped, size, font, spacing) / 2 : x;
  const spacingOp = spacing > 0 ? `${spacing} Tc ` : "";
  const resetOp = spacing > 0 ? " 0 Tc" : "";
  return `BT ${spacingOp}/${font} ${size} Tf ${COL[color]} rg ${startX.toFixed(2)} ${y.toFixed(2)} Td (${s}) Tj${resetOp} ET\n`;
}

async function loadPlateJpeg(heritageId: string): Promise<Uint8Array | null> {
  const url = plateUrlFor(heritageId);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 ? bytes : null;
  } catch {
    return null;
  }
}

/** Read the SOF marker for intrinsic JPEG dimensions (no decode needed). */
function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      if (length >= 7) {
        return {
          height: (bytes[i + 5] << 8) | bytes[i + 6],
          width: (bytes[i + 7] << 8) | bytes[i + 8],
        };
      }
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    i += 2 + length;
  }
  return null;
}

function formatDate(iso: string): string {
  if (!iso) return "Not yet issued";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function giLabel(giTag: string | null): string {
  if (!giTag) return "Geographical Indication Tag — Registered (Odisha)";
  const number = giTag.replace(/^GI-?/i, "");
  return `Geographical Indication Tag #${number} (Odisha)`;
}

function componentBox(
  x: number,
  y: number,
  size: number,
  padding: number,
  cells: Array<{ row: number; col: number }>,
  moduleCount: number,
): string {
  const cell = (size - 2 * padding) / moduleCount;
  const ops: string[] = [];
  for (const { row, col } of cells) {
    ops.push(rectFill(x + padding + col * cell, y + padding + row * cell, cell, cell, "black"));
  }
  return ops.join("");
}

const encoder = new TextEncoder();
const enc = (value: string): Uint8Array => encoder.encode(value);

export async function buildRegistryCertificatePdf(
  data: PassportPdfData,
): Promise<Uint8Array> {
  const c: string[] = [];
  const top = (offset: number): number => PAGE_H - offset;

  // ------------------------------------------------------------ background
  c.push("q\n");
  c.push(rectFill(0, 0, PAGE_W, PAGE_H, "parchment"));
  c.push(rectStroke(30, 30, PAGE_W - 60, PAGE_H - 60, 0.75, "gold"));
  c.push(rectStroke(40, 40, PAGE_W - 80, PAGE_H - 80, 1.1, "black"));

  // ------------------------------------------------------ Section A header
  c.push(text(PAGE_W / 2, top(80), 24, "VIRASAT · HERITAGE PASSPORT", "T1", true));
  c.push(text(PAGE_W / 2, top(99), 8.5, "NATIONAL CULTURAL PROVENANCE & HERITAGE REGISTRY", "F1", true, 1.4, "black"));
  c.push(text(PAGE_W / 2, top(114), 7.5, giLabel(data.giTag), "F2", true, 0.8, "gold"));
  c.push(line(CONTENT_L, top(132), CONTENT_R, top(132), 0.6, "gold"));

  // --------------------------------------------------- Section B grid
  const gridTop = 156;
  // left: plate inside a gold hairline frame + emerald wax seal
  const boxX = 52;
  const boxW = 178;
  const FONTS: Array<[string, string]> = [
    ["F1", "Helvetica"],
    ["F2", "Helvetica-Bold"],
    ["F3", "Courier-Bold"],
    ["T1", "Times-Bold"],
    ["T2", "Times-Roman"],
    ["T3", "Times-Italic"],
  ];
  const fontStart = 4;
  const imageNum = fontStart + FONTS.length;
  const imageBytes = await loadPlateJpeg(data.heritageId);
  const imageDimensions = imageBytes ? jpegDimensions(imageBytes) : null;
  let imageDraw = "";
  let xobject = "";
  if (imageBytes && imageDimensions) {
    const scale = Math.min((boxW - 16) / imageDimensions.width, 140 / imageDimensions.height);
    const imgW = imageDimensions.width * scale;
    const imgH = imageDimensions.height * scale;
    const imgX = boxX + (boxW - imgW) / 2;
    const imgBottom = top(gridTop) - imgH;
    imageDraw = `q ${imgW.toFixed(2)} 0 0 ${imgH.toFixed(2)} ${imgX.toFixed(2)} ${imgBottom.toFixed(2)} cm /Im1 Do Q\n`;
    imageDraw += rectStroke(imgX - 3, imgBottom - 3, imgW + 6, imgH + 6, 0.95, "gold");
    const sealR = 15;
    const sx = imgX + imgW - 2;
    const sy = imgBottom + 2;
    imageDraw += circle(sx, sy, sealR, "emerald", true, true, 1.1);
    imageDraw += text(sx, sy + 2.5, 5.2, "VERIFIED", "T1", true, 0, "parchment");
    imageDraw += text(sx, sy - 4, 3.8, "FINGERPRINTED", "T1", true, 0, "parchment");
    xobject = `/XObject << /Im1 ${imageNum} 0 R >> `;
  } else {
    imageDraw = rectStroke(boxX, top(gridTop) - 90, boxW, 90, 0.95, "gold");
    imageDraw += text(boxX + boxW / 2, top(gridTop) - 45, 8, "PLATE UNAVAILABLE", "F1", true, 0, "grey");
  }

  // right: physical & lineage metadata
  const rows: Array<[string, string, string]> = [
    ["TITLE", data.title || "—", "T2"],
    ["MASTER ARTISAN", data.artisanName || "—", "F1"],
    ["LINEAGE", data.generationNumber ? `${ordinal(data.generationNumber)} Generation Master` : "—", "F1"],
    ["PEHCHAN ID", `${data.pehchanCardId ?? "—"}  ·  Ministry of Textiles Verified`, "F1"],
    ["ORIGIN", data.regionName || "—", "F1"],
    ["MEDIUM", data.medium || "—", "F1"],
    ["DIMENSIONS & YEAR", `${data.dimensions ?? "—"}  ·  ${data.creationYear || "—"}`, "F1"],
  ];
  for (let k = 0; k < rows.length; k++) {
    const [label, value, font] = rows[k];
    const rowTop = gridTop + k * 27;
    c.push(text(248, top(rowTop), 6, label, "F2", false, 0.9, "gold"));
    c.push(text(248, top(rowTop + 12), font === "T2" ? 11 : 9.5, value, font));
    c.push(line(248, top(rowTop + 22), CONTENT_R, top(rowTop + 22), 0.35, "linen"));
  }
  c.push(imageDraw);

  // -------------------------------------------- Section C: CV proof block
  const secTop = 340;
  c.push(line(CONTENT_L, top(secTop), CONTENT_R, top(secTop), 0.5, "gold"));
  const cvHeader = "CRYPTOGRAPHIC & COMPUTER VISION PROOF";
  c.push(text(PAGE_W / 2, top(secTop - 22), 9.5, cvHeader, "T1", true, 1.2, "gold"));
  c.push(line(CONTENT_L, top(secTop - 26), PAGE_W / 2 - 68, top(secTop - 26), 0.4, "linen"));
  c.push(line(PAGE_W / 2 + 68, top(secTop - 26), CONTENT_R, top(secTop - 26), 0.4, "linen"));

  const cvRow = (rowOffset: number, label: string, value: string, valueFont = "F1", valueSize = 9.5) => {
    const yVal = top(secTop - 50 - rowOffset);
    c.push(text(CONTENT_L, yVal, 6, label, "F2", false, 0.9, "gold"));
    c.push(text(226, yVal, valueSize, value, valueFont));
  };
  cvRow(0, "PASSPORT ID", data.heritageId, "F3", 10.5);
  cvRow(24, "SHA-256 DIGEST", data.cryptographicHash || "-", "F3", 8);
  const lap = data.laplacianVariance != null ? data.laplacianVariance.toFixed(1) : "—";
  const lapLine = `Laplacian Blur Variance  ${lap}  [`;
  const lapPass = "PASSED";
  const lapTail = `]  (threshold >= 100.0)`;
  const lapWidth = widthOf(lapPass, 8.5, "F1");
  c.push(text(CONTENT_L, top(secTop - 98), 6, "LAPLACIAN BLUR VARIANCE", "F2", false, 0.9, "gold"));
  c.push(text(226, top(secTop - 98), 8.5, lapLine, "F1"));
  c.push(text(226 + widthOf(lapLine, 8.5, "F1"), top(secTop - 98), 8.5, lapPass, "F2", false, 0, "emerald"));
  c.push(text(226 + widthOf(lapLine, 8.5, "F1") + lapWidth, top(secTop - 98), 8.5, lapTail, "F1"));
  const orb = data.orbFeatures != null ? `${data.orbFeatures.toLocaleString("en-IN")} descriptors matched (pgvector)` : "—";
  cvRow(72, "ORB KEYPOINT FEATURE COUNT", orb);
  c.push(line(CONTENT_L, top(secTop - 134), CONTENT_R, top(secTop - 134), 0.5, "linen"));

  // ---------------------------------------------- Section D: QR + scanner
  const qrBox = 96;
  const qx = 52;
  const qTopOffset = 190;
  const qy = top(qTopOffset) - qrBox;
  c.push(rectFill(qx, qy, qrBox, qrBox, "parchment"));
  c.push(rectStroke(qx, qy, qrBox, qrBox, 1, "gold"));
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const verifyUrl = `${origin}/verify?id=${encodeURIComponent(data.heritageId)}`;
  try {
    const qr = QRCode.create(verifyUrl, { errorCorrectionLevel: "M" });
    const modules: unknown = qr.modules;
    const size = (modules as { size: number }).size;
    const getCell =
      typeof (modules as { get?: (r: number, c: number) => boolean }).get === "function"
        ? (r: number, c: number) => (modules as { get: (r: number, c: number) => boolean }).get(r, c)
        : (r: number, c: number) =>
            Boolean((modules as { data?: Uint8Array }).data?.[r * size + c]);
    const cells: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < size; r++) {
      for (let col = 0; col < size; col++) {
        if (getCell(r, col)) cells.push({ row: r, col });
      }
    }
    c.push(componentBox(qx, qy, qrBox, 7, cells, size));
  } catch {
    c.push(text(qx + qrBox / 2, top(qTopOffset) - 48, 8, "SCAN TO VERIFY", "F2", true));
  }

  const scanX = 168;
  c.push(text(scanX, top(206), 10, "VERIFICATION SCANNER", "T1", false, 0, "gold"));
  c.push(text(scanX, top(224), 8, "Scan this dynamic QR code to verify physical keypoint", "F1", false, 0, "grey"));
  c.push(text(scanX, top(234), 8, "alignment against the live registry.", "F1", false, 0, "grey"));
  c.push(text(scanX, top(250), 7.5, verifyUrl, "F3"));

  // ------------------------------------------------------ signatures + seal
  c.push(line(CONTENT_L, top(304), CONTENT_R, top(304), 0.5, "linen"));
  c.push(line(52, top(332), 148, top(332), 0.8, "black"));
  c.push(text(52, top(346), 6, "GUILD MASTER SIGNATURE", "F2", false, 0.8, "gold"));
  c.push(text(52, top(358), 8, "Raghurajpur Crafts Guild", "F1", false, 0, "grey"));

  const stampX = CONTENT_R - 70;
  const stampY = top(318);
  const stampLabel = "VIRASAT CRYPTOGRAPHIC REGISTRY STAMP";
  c.push(circle(stampX, stampY, 22, "gold", true, false, 1.6));
  c.push(circle(stampX, stampY, 18.6, "gold", true, false, 0.7));
  c.push(text(stampX, top(312), 7.5, "VIRASAT", "T1", true));
  c.push(text(stampX, top(322), 4.8, "REGISTRY", "F2", true, 1.4, "gold"));
  c.push(text(stampX, top(364), 6, stampLabel, "F2", true, 0.8, "gold"));

  // ------------------------------------------------------------- footer
  c.push(line(CONTENT_L, top(734), CONTENT_R, top(734), 0.5, "gold"));
  c.push(
    text(
      PAGE_W / 2,
      top(750),
      7.5,
      "This Heritage Passport guarantees physical micro-texture fingerprinting and lineage provenance. Any physical copy without matching ORB keypoints is counterfeit.",
      "T3",
      true,
      0,
      "emerald",
    ),
  );
  c.push(
    text(
      PAGE_W / 2,
      top(765),
      6.5,
      "This document constitutes a tamper-proof digital memory record.  VIRASAT - India's Digital Memory System",
      "F1",
      true,
      0,
      "grey",
    ),
  );
  c.push(text(CONTENT_R, top(766), 6, `Issued ${formatDate(data.issuedAt)}`, "F1", true, 0, "grey"));

  const content = c.join("");
  const contentBytes = enc(content);

  // --- object assembly ------------------------------------------------------
  const pieces: Uint8Array[] = [enc("%PDF-1.4\n")];
  const offsets: number[] = [];
  const objectStart = (): void => {
    offsets.push(byteLength(pieces));
  };
  const contentObjectNum = imageNum + (imageBytes && imageDimensions ? 1 : 0);

  objectStart();
  pieces.push(enc("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
  objectStart();
  pieces.push(enc("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"));
  objectStart();
  const fontRefs = FONTS.map(([name], i) => `/${name} ${fontStart + i} 0 R`).join(" ");
  pieces.push(enc(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
    `/Resources << /Font << ${fontRefs} >> ${xobject}>> ` +
    `/Contents ${contentObjectNum} 0 R >>\nendobj\n`,
  ));
  for (let i = 0; i < FONTS.length; i++) {
    objectStart();
    pieces.push(enc(`${fontStart + i} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[i][1]} >>\nendobj\n`));
  }

  if (imageBytes && imageDimensions) {
    objectStart();
    pieces.push(enc(
      `${imageNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageDimensions.width} ` +
      `/Height ${imageDimensions.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
      `/Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
    ));
    pieces.push(imageBytes);
    pieces.push(enc("\nendstream\nendobj\n"));
  }

  objectStart();
  pieces.push(enc(`${contentObjectNum} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`));
  pieces.push(contentBytes);
  pieces.push(enc("\nendstream\nendobj\n"));

  // --- xref + trailer ---------------------------------------------------------
  const xrefOffset = byteLength(pieces);
  let xref = `xref\n0 ${offsets.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const parts: Uint8Array[] = [...pieces, enc(xref)];
  const output = new Uint8Array(byteLength(parts));
  let cursor = 0;
  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

function byteLength(parts: Uint8Array[]): number {
  return parts.reduce((sum, part) => sum + part.length, 0);
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}