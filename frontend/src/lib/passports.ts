import type { HeritagePassport } from "../types";

/** Issue dates of the seeded registry, matching ``seed_data/artworks.json``
 *  so the offline mock passport stays coherent with the real database. */
const SEED_ISSUED_AT: Record<string, string> = {
  "VR-OD-PAT-2026-000001": "2026-01-15T00:00:00+00:00",
  "VR-OD-PAT-2026-000002": "2026-02-10T00:00:00+00:00",
  "VR-OD-PAT-2026-000003": "2025-11-02T00:00:00+00:00",
  "VR-OD-PAT-2026-000004": "2026-03-21T00:00:00+00:00",
  "VR-OD-PAT-2026-000005": "2026-04-14T00:00:00+00:00",
  "VR-OD-PAT-2026-000006": "2026-05-01T00:00:00+00:00",
  "VR-OD-PAT-2026-000007": "2026-05-19T00:00:00+00:00",
  "VR-OD-PAT-2026-000008": "2026-06-08T00:00:00+00:00",
};

function fnv1a(input: string, salt: number): number {
  let hash = 0x811c9dc5 ^ salt;
  const text = `${input}::${salt}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Deterministic 64-hex digest: same heritage ID always yields the same
 *  fingerprint, so every seeded work gets a stable mock passport offline. */
export function mockDigest(heritageId: string): string {
  const words: string[] = [];
  for (let k = 0; k < 8; k++) {
    words.push(fnv1a(`virasat::${heritageId}`, k).toString(16).padStart(8, "0"));
  }
  return words.join("");
}

/** Offline fallback passport: mirrors the shape the API returns so the
 *  passport UI (and every fingerprinted plate) renders without the backend.
 *  ``pdf_passport_url`` is left empty — the printable certificate needs the
 *  live registry. */
export function mockPassportFor(heritageId: string): HeritagePassport {
  const issuedAt = SEED_ISSUED_AT[heritageId] ?? "2026-01-15T00:00:00+00:00";
  return {
    id: `mock-passport-${heritageId}`,
    artwork_id: "",
    cryptographic_hash: mockDigest(heritageId),
    qr_code_url: `/api/v1/passports/${heritageId}/qr`,
    pdf_passport_url: "",
    issued_at: issuedAt,
  };
}