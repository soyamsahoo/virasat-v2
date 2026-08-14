/** Dependency-free registry certificate builder.
 *
 *  When the API is unreachable we still want the "Download passport" action
 *  to work for registered works. This emits a valid, minimal A4 PDF (A4 page,
 *  embedded JPEG plate, plain Helvetica text) that reads as a museum
 *  certificate with the same fields as the server-generated passport.
 *
 *  Type1/WinAnsi Helvetica cannot render non-Latin glyphs, so every drawn
 *  string is sanitised to a plain-ASCII approximation before embedding.
 */
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
}

const PAGE_W = 595;
const PAGE_H = 842;

/** ASCII-safe printable string for embedding in a PDF text operator. */
function safe(value: string): string {
  return value
    .replace(/—|–|−/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
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

function line(x1: number, y1: number, x2: number, y2: number, width = 0.75): string {
  return `${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function text(x: number, y: number, size: number, str: string, font = "F1", center = false): string {
  const s = safe(str);
  return center
    ? `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${s}) Tj ET\n`
    : `BT /${font} ${size} Tf ${x} ${y} Td (${s}) Tj ET\n`;
}

const encoder = new TextEncoder();
const enc = (value: string): Uint8Array => encoder.encode(value);

export async function buildRegistryCertificatePdf(
  data: PassportPdfData,
): Promise<Uint8Array> {
  const c: string[] = [];

  // --- content stream -----------------------------------------------------
  c.push("q\n0 0 0 rg\n");

  c.push(text(50, PAGE_H - 90, 9, "INDIA'S DIGITAL MEMORY SYSTEM"));
  c.push(text(PAGE_W - 50, PAGE_H - 90, 9, "PROVENANCE REGISTRY", "F1", true));
  c.push(line(50, PAGE_H - 104, PAGE_W - 50, PAGE_H - 104));
  c.push(text(PAGE_W / 2, PAGE_H - 150, 22, "HERITAGE PASSPORT", "F2", true));
  c.push(text(PAGE_W / 2, PAGE_H - 172, 10, "Virasat - Provenance Registry", "F1", true));
  c.push(text(PAGE_W / 2, PAGE_H - 196, 13, data.heritageId, "F2", true));
  c.push(line(50, PAGE_H - 216, PAGE_W - 50, PAGE_H - 216));

  c.push(text(50, PAGE_H - 254, 17, data.title, "F2"));
  const meta = [
    data.creationYear ? String(data.creationYear) : "",
    data.medium ? String(data.medium) : "",
    data.dimensions ? String(data.dimensions) : "",
  ].filter(Boolean).join("  -  ");
  c.push(text(50, PAGE_H - 272, 10, meta || "", "F1"));
  c.push(line(50, PAGE_H - 286, PAGE_W - 50, PAGE_H - 286));

  const fields: Array<[string, string]> = [
    ["Artisan", data.artisanName],
    ["Pehchan Card", data.pehchanCardId ?? "-"],
    ["Generation", data.generationNumber ? `Generation ${data.generationNumber}` : "-"],
    ["Region", data.regionName || "-"],
    ["Tradition", data.traditionTitle || "-"],
    ["Issued", formatDate(data.issuedAt)],
  ];
  let y = PAGE_H - 306;
  for (const [label, value] of fields) {
    c.push(text(50, y, 8, label.toUpperCase()));
    c.push(text(160, y, 10, value));
    c.push(line(50, y - 11, PAGE_W - 50, y - 11, 0.4));
    y -= 22;
  }

  c.push(text(50, y - 14, 8, "SHA-256"));
  c.push(text(50, y - 28, 7.5, data.cryptographicHash || "-"));
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  c.push(text(50, y - 46, 8, `Verify at: ${origin}/verify?id=${encodeURIComponent(data.heritageId)}`));

  const disturb = 42;
  c.push(line(50, disturb, PAGE_W - 50, disturb, 0.4));
  c.push(text(50, disturb - 16, 8, "VIRASAT - India's Digital Memory System"));
  c.push(text(PAGE_W - 50, disturb - 16, 8, `Certificate issued ${formatDate(data.issuedAt)}`));

  let content = c.join("");

  // --- optional embedded JPEG plate -----------------------------------------
  const imageBytes = await loadPlateJpeg(data.heritageId);
  let xobject = "";
  let contentImage = "";
  let imageObjectNum = 0;
  const imageDimensions = imageBytes ? jpegDimensions(imageBytes) : null;
  if (imageBytes && imageDimensions) {
    const scale = Math.min(200 / imageDimensions.width, 150 / imageDimensions.height);
    const w = imageDimensions.width * scale;
    const h = imageDimensions.height * scale;
    const x = (PAGE_W - w) / 2;
    const y = PAGE_H - 430;
    xobject = "/XObject << /Im1 6 0 R >> ";
    imageObjectNum = 6;
    contentImage = `q ${w} 0 0 ${h} ${x} ${y} cm /Im1 Do Q\n`;
  }
  content += contentImage;

  const contentBytes = enc(content);

  // --- object assembly ------------------------------------------------------
  const pieces: Uint8Array[] = [enc("%PDF-1.4\n")];
  const offsets: number[] = [];
  const objectStart = (): void => {
    offsets.push(byteLength(pieces));
  };
  const contentObjectNum = imageObjectNum > 0 ? 7 : 6;

  objectStart();
  pieces.push(enc("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
  objectStart();
  pieces.push(enc("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"));
  objectStart();
  pieces.push(enc(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
    `/Resources << /Font << /F1 4 0 R /F2 5 0 R >> ${xobject}>> ` +
    `/Contents ${contentObjectNum} 0 R >>\nendobj\n`,
  ));
  objectStart();
  pieces.push(enc("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"));
  objectStart();
  pieces.push(enc("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n"));

  if (imageBytes && imageDimensions) {
    objectStart();
    pieces.push(enc(
      `6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageDimensions.width} ` +
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