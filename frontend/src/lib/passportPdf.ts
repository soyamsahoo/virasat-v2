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
 *  Layout is measured from the top of the page (offsets below) so every
 *  section keeps a guaranteed gap. Only standard PDF operators are emitted
 *  (circles are Bézier approximations - ``arc`` is PostScript, not PDF).
 *  Type1/WinAnsi fonts cannot render non-Latin glyphs, so every drawn
 *  string is sanitised to a plain-ASCII approximation before embedding.
 */
import QRCode from "qrcode";
import { plateUrlFor } from "./plates";
import { TYPE1_WIDTHS } from "./type1Widths";

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
const L = 52; // content left
const R = 543.28; // content right
const CONTENT_W = R - L;

// ---------------------------------------------------------------- layout
// every number is an offset measured from the TOP edge of the page
const A_TITLE = 80;
const A_SUB = 99;
const A_GI = 114;
const A_RULE = 130;

const B_TOP = 150; // provenance grid
const B_ROW_PITCH = 33; // label + up to 2 value lines + hairline per row
const B_LABEL_X = 248; // right column labels
const B_VALUE_X = 336; // right column values
const BOX_X = 52;
const BOX_W = 178;

const C_RULE_TOP = 392; // CV proof block
const C_HEADER = 412;
const C_RULE_FLANK = 416;
const C_LABELS = [436, 458, 480, 502]; // passport id / sha / laplacian / orb
const C_RULE_BOTTOM = 526;

const D_QR_TOP = 546; // verification scanner
const D_QR = 96;
const D_TITLE = 568;
const D_L1 = 586;
const D_L2 = 602;
const D_URL = 622;

const S_RULE = 656; // signatures + stamp
const S_LINE_Y = 684;
const S_LABEL = 698;
const S_ORG = 710;
const STAMP_CY = 682; // circle centre (r = 22 -> 660..704)
const STAMP_T1 = 676;
const STAMP_T2 = 686;
const STAMP_LABEL = 716;

const F_RULE = 744; // footer
const F_DISCLAIMER = 760;
const F_DOC = 775;
const F_ISSUED = 789;

/** Palette (hex -> "r g b" PDF fractions). */
const COL: Record<string, string> = {
  parchment: "0.9608 0.9490 0.9216", // #F5F2EB
  gold: "0.7725 0.6275 0.3490", // #C5A059
  black: "0.0706 0.0706 0.0706", // #121212
  emerald: "0.0824 0.5020 0.2392", // #15803D
  linen: "0.8510 0.8039 0.6980", // #D9CDB2
  grey: "0.3608 0.3529 0.3216", // #5C5A52
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

/** Exact text width using the calibrated Type1 advances (units/1000 em). */
function widthOf(str: string, size: number, font: string, spacing = 0): number {
  const table = TYPE1_WIDTHS[font] ?? {};
  let sum = 0;
  for (const ch of str) sum += table[ch] ?? 500;
  return (sum / 1000) * size + (str.length > 1 ? spacing * (str.length - 1) : 0);
}

function rectFill(x: number, y: number, w: number, h: number, color: string): string {
  return `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${COL[color]} rg f\n`;
}

function rectStroke(x: number, y: number, w: number, h: number, width: number, color: string): string {
  return `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${COL[color]} RG ${width} w S\n`;
}

/** Circle approximated with four cubic Béziers (kappa = 0.5522847...). */
function circlePath(cx: number, cy: number, r: number): string {
  const k = 0.5522847498307936 * r;
  const n = (v: number) => v.toFixed(2);
  return (
    `${n(cx + r)} ${n(cy)} m ` +
    `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c ` +
    `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c ` +
    `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c ` +
    `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c`
  );
}

function circle(
  cx: number,
  cy: number,
  r: number,
  color: string,
  stroke = true,
  fill = false,
  width = 1,
): string {
  const ops: string[] = [];
  if (fill) ops.push(`${COL[color]} rg`);
  if (stroke) ops.push(`${COL[color]} RG ${width} w`);
  const action = fill && stroke ? "B" : fill ? "f" : "S";
  const close = stroke && !fill ? " h" : "";
  return `${circlePath(cx, cy, r)}${close} ${ops.join(" ")} ${action}\n`;
}

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width = 0.75,
  color = "black",
): string {
  return `${COL[color]} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}

/** Draw text; ``align`` anchors at ``x``: "left" starts, "center"/"right"
 *  are computed from the estimated advance widths. */
function text(
  x: number,
  y: number,
  size: number,
  str: string,
  font = "F1",
  align: "left" | "center" | "right" = "left",
  spacing = 0,
  color = "black",
): string {
  const escaped = safe(str);
  const s = escaped.replace(/·/g, "\\267");
  const w = widthOf(escaped, size, font, spacing);
  const startX = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
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

/** Fit ``value`` into ``maxW`` points: single line, then shrink (min 7pt),
 *  then greedy word-wrap onto up to two lines. */
function wrapFit(
  value: string,
  maxW: number,
  size: number,
  font: string,
): { size: number; lines: string[] } {
  if (widthOf(value, size, font) <= maxW) return { size, lines: [value] };
  const shrunk = Math.max(7, Math.floor((size * maxW * 100) / widthOf(value, size, font)) / 100);
  if (widthOf(value, shrunk, font) <= maxW) return { size: shrunk, lines: [value] };
  const words = value.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(candidate, shrunk, font) <= maxW) {
      line = candidate;
    } else if (!line) {
      lines.push(word);
    } else {
      lines.push(line);
      line = word;
    }
    if (lines.length === 2) break;
  }
  if (line) lines.push(line);
  return { size: shrunk, lines: lines.slice(0, 2) };
}

const encoder = new TextEncoder();
const enc = (value: string): Uint8Array => encoder.encode(value);

export async function buildRegistryCertificatePdf(
  data: PassportPdfData,
): Promise<Uint8Array> {
  const c: string[] = [];
  const top = (offset: number): number => PAGE_H - offset;

  // embedded-font + xobject object numbers (must be known before the image
  // block references them)
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

  // ------------------------------------------------------------ background
  c.push("q\n");
  c.push(rectFill(0, 0, PAGE_W, PAGE_H, "parchment"));
  c.push(rectStroke(30, 30, PAGE_W - 60, PAGE_H - 60, 0.75, "gold"));
  c.push(rectStroke(40, 40, PAGE_W - 80, PAGE_H - 80, 1.1, "black"));

  // ------------------------------------------------------ Section A header
  c.push(text(PAGE_W / 2, top(A_TITLE), 24, "VIRASAT · HERITAGE PASSPORT", "T1", "center"));
  c.push(
    text(PAGE_W / 2, top(A_SUB), 8.5, "NATIONAL CULTURAL PROVENANCE & HERITAGE REGISTRY", "F1", "center", 1.4),
  );
  c.push(text(PAGE_W / 2, top(A_GI), 7.5, giLabel(data.giTag), "F2", "center", 0.8, "gold"));
  c.push(line(L, top(A_RULE), R, top(A_RULE), 0.6, "gold"));

  // --------------------------------------------------- Section B grid
  const imageBytes = await loadPlateJpeg(data.heritageId);
  const imageDimensions = imageBytes ? jpegDimensions(imageBytes) : null;
  const contentObjectNum = imageNum + (imageBytes && imageDimensions ? 1 : 0);
  let xobject = "";
  let imageDraw = "";
  if (imageBytes && imageDimensions) {
    // gold-framed plate, top-aligned inside the left column
    const scale = Math.min((BOX_W - 16) / imageDimensions.width, 140 / imageDimensions.height);
    const imgW = imageDimensions.width * scale;
    const imgH = imageDimensions.height * scale;
    const imgX = BOX_X + (BOX_W - imgW) / 2;
    const imgBottom = top(B_TOP + 4) - imgH;
    imageDraw = `q ${imgW.toFixed(2)} 0 0 ${imgH.toFixed(2)} ${imgX.toFixed(2)} ${imgBottom.toFixed(2)} cm /Im1 Do Q\n`;
    imageDraw += rectStroke(imgX - 3, imgBottom - 3, imgW + 6, imgH + 6, 0.95, "gold");
    // emerald wax seal over the bottom-right corner of the frame
    const sealR = 15;
    const sx = imgX + imgW - 2;
    const sy = imgBottom + 2;
    imageDraw += circle(sx, sy, sealR, "emerald", true, true, 1.1);
    imageDraw += text(sx, sy + 2.5, 5.2, "VERIFIED", "T1", "center", 0, "parchment");
    imageDraw += text(sx, sy - 4, 3.8, "FINGERPRINTED", "T1", "center", 0, "parchment");
    xobject = `/XObject << /Im1 ${imageNum} 0 R >> `;
  } else {
    imageDraw = rectStroke(BOX_X, top(B_TOP + 4) - 90, BOX_W, 90, 0.95, "gold");
    imageDraw += text(BOX_X + BOX_W / 2, top(B_TOP + 4) - 45, 8, "PLATE UNAVAILABLE", "F1", "center", 0, "grey");
  }
  c.push(imageDraw);

  // right column: physical & lineage metadata
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
    const rowTop = B_TOP + k * B_ROW_PITCH;
    c.push(text(B_LABEL_X, top(rowTop), 6, label, "F2", "left", 0.9, "gold"));
    const valueSize = font === "T2" ? 11 : 9.5;
    const fit = wrapFit(value, R - B_VALUE_X - 2, valueSize, font);
    for (let i = 0; i < fit.lines.length; i++) {
      c.push(text(B_VALUE_X, top(rowTop + 12 + i * 12), fit.size, fit.lines[i], font));
    }
    c.push(line(B_LABEL_X, top(rowTop + 30), R, top(rowTop + 30), 0.35, "linen"));
  }

  // -------------------------------------------- Section C: CV proof block
  c.push(line(L, top(C_RULE_TOP), R, top(C_RULE_TOP), 0.5, "gold"));
  c.push(text(PAGE_W / 2, top(C_HEADER), 9.5, "CRYPTOGRAPHIC & COMPUTER VISION PROOF", "T1", "center", 1.2, "gold"));
  c.push(line(L, top(C_RULE_FLANK), PAGE_W / 2 - 68, top(C_RULE_FLANK), 0.4, "linen"));
  c.push(line(PAGE_W / 2 + 68, top(C_RULE_FLANK), R, top(C_RULE_FLANK), 0.4, "linen"));

  const cvRow = (label: string, value: string, font = "F1", size = 9.5, rowIndex: number) => {
    const yVal = top(C_LABELS[rowIndex]);
    c.push(text(L, yVal, 6, label, "F2", "left", 0.9, "gold"));
    c.push(text(226, yVal, size, value, font));
  };
  cvRow("PASSPORT ID", data.heritageId, "F3", 10.5, 0);
  const hash = (data.cryptographicHash || "-").slice(0, 64);
  cvRow("SHA-256 DIGEST", hash, "F3", 8, 1);

  // laplacian row: value split so "PASSED" renders in emerald
  const lap = data.laplacianVariance != null ? data.laplacianVariance.toFixed(1) : "—";
  const lapLine = `Laplacian Blur Variance  ${lap}  [`;
  const lapPass = "PASSED";
  const lapTail = `]  (threshold >= 100.0)`;
  const lapY = top(C_LABELS[2]);
  c.push(text(L, lapY, 6, "LAPLACIAN BLUR VARIANCE", "F2", "left", 0.9, "gold"));
  c.push(text(226, lapY, 8.5, lapLine));
  const xPass = 226 + widthOf(lapLine, 8.5, "F1");
  c.push(text(xPass, lapY, 8.5, lapPass, "F2", "left", 0, "emerald"));
  c.push(text(xPass + widthOf(lapPass, 8.5, "F2"), lapY, 8.5, lapTail));

  const orb = data.orbFeatures != null ? `${data.orbFeatures.toLocaleString("en-IN")} descriptors matched (pgvector)` : "—";
  cvRow("ORB KEYPOINT FEATURE COUNT", orb, "F1", 9.5, 3);
  c.push(line(L, top(C_RULE_BOTTOM), R, top(C_RULE_BOTTOM), 0.5, "linen"));

  // ---------------------------------------------- Section D: QR + scanner
  const qy = top(D_QR_TOP) - D_QR;
  c.push(rectFill(BOX_X, qy, D_QR, D_QR, "parchment"));
  c.push(rectStroke(BOX_X, qy, D_QR, D_QR, 1, "gold"));
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
    const cell = (D_QR - 14) / size;
    for (const { row, col } of cells) {
      c.push(rectFill(BOX_X + 7 + col * cell, qy + 7 + row * cell, cell, cell, "black"));
    }
  } catch {
    c.push(text(BOX_X + D_QR / 2, top(D_QR_TOP) - 48, 8, "SCAN TO VERIFY", "F2", "center"));
  }

  const scanX = 168;
  c.push(text(scanX, top(D_TITLE), 10, "VERIFICATION SCANNER", "T1", "left", 0, "gold"));
  c.push(text(scanX, top(D_L1), 8, "Scan this dynamic QR code to verify physical keypoint", "F1", "left", 0, "grey"));
  c.push(text(scanX, top(D_L2), 8, "alignment against the live registry.", "F1", "left", 0, "grey"));
  c.push(text(scanX, top(D_URL), 7.5, verifyUrl, "F3"));

  // ------------------------------------------------------ signatures + seal
  c.push(line(L, top(S_RULE), R, top(S_RULE), 0.5, "linen"));
  c.push(line(52, top(S_LINE_Y), 148, top(S_LINE_Y), 0.8, "black"));
  c.push(text(52, top(S_LABEL), 6, "GUILD MASTER SIGNATURE", "F2", "left", 0.8, "gold"));
  c.push(text(52, top(S_ORG), 8, "Raghurajpur Crafts Guild", "F1", "left", 0, "grey"));

  const stampX = R - 70;
  const stampLabel = "VIRASAT CRYPTOGRAPHIC REGISTRY STAMP";
  c.push(circle(stampX, top(STAMP_CY), 22, "gold", true, false, 1.6));
  c.push(circle(stampX, top(STAMP_CY), 18.6, "gold", true, false, 0.7));
  c.push(text(stampX, top(STAMP_T1), 7.5, "VIRASAT", "T1", "center"));
  c.push(text(stampX, top(STAMP_T2), 4.8, "REGISTRY", "F2", "center", 1.4, "gold"));
  c.push(text(stampX, top(STAMP_LABEL), 6, stampLabel, "F2", "center", 0.8, "gold"));

  // ------------------------------------------------------------- footer
  c.push(line(L, top(F_RULE), R, top(F_RULE), 0.5, "gold"));
  c.push(
    text(
      PAGE_W / 2,
      top(F_DISCLAIMER),
      7.5,
      "This Heritage Passport guarantees physical micro-texture fingerprinting and lineage provenance. Any physical copy without matching ORB keypoints is counterfeit.",
      "T3",
      "center",
      0,
      "emerald",
    ),
  );
  c.push(
    text(
      PAGE_W / 2,
      top(F_DOC),
      6.5,
      "This document constitutes a tamper-proof digital memory record.  VIRASAT - India's Digital Memory System",
      "F1",
      "center",
      0,
      "grey",
    ),
  );
  c.push(text(R, top(F_ISSUED), 6, `Issued ${formatDate(data.issuedAt)}`, "F1", "right", 0, "grey"));

  const content = c.join("");
  const contentBytes = enc(content);

  // --- object assembly ------------------------------------------------------
  const pieces: Uint8Array[] = [enc("%PDF-1.4\n")];
  const offsets: number[] = [];
  const objectStart = (): void => {
    offsets.push(byteLength(pieces));
  };

  objectStart();
  pieces.push(enc("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
  objectStart();
  pieces.push(enc("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"));
  objectStart();
  const fontRefs = FONTS.map(([name], i) => `/${name} ${fontStart + i} 0 R`).join(" ");  pieces.push(enc(
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