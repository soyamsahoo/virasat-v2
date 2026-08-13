import type {
  Artisan,
  ArtisanDetail,
  Artwork,
  FieldAgent,
  HeritagePassport,
  ProvenanceEvent,
  Region,
  SimilarArtwork,
  Story,
  Tradition,
  VerificationResult,
  VerificationStatus,
} from "../types";

const configuredBase =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/**
 * Production defaults to the deployed backend; in local development the
 * Vite dev proxy forwards same-origin /api calls to the FastAPI service.
 */
const BASE_URL = configuredBase || `${window.location.origin}/api/v1`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export const api = {
  traditions: {
    list: () => request<Tradition[]>("/traditions"),
    get: (id: string) => request<Tradition>(`/traditions/${id}`),
  },
  regions: {
    list: (district?: string) =>
      request<Region[]>(`/regions${district ? `?district=${encodeURIComponent(district)}` : ""}`),
    get: (id: string) => request<Region>(`/regions/${id}`),
  },
  artisans: {
    list: (params?: {
      region_id?: string;
      tradition_id?: string;
      verification_status?: VerificationStatus;
    }) => {
      const query = new URLSearchParams();
      if (params?.region_id) query.set("region_id", params.region_id);
      if (params?.tradition_id) query.set("tradition_id", params.tradition_id);
      if (params?.verification_status) query.set("verification_status", params.verification_status);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return request<Artisan[]>(`/artisans${suffix}`);
    },
    get: (id: string) => request<ArtisanDetail>(`/artisans/${id}`),
    artworks: (id: string) => request<Artwork[]>(`/artisans/${id}/artworks`),
    stories: (id: string) => request<Story[]>(`/artisans/${id}/stories`),
  },
  artworks: {
    list: (artisan_id?: string) =>
      request<Artwork[]>(`/artworks${artisan_id ? `?artisan_id=${artisan_id}` : ""}`),
    get: (heritageId: string) => request<Artwork>(`/artworks/${heritageId}`),
    similar: (heritageId: string) => request<SimilarArtwork[]>(`/artworks/${heritageId}/similar`),
  },
  passports: {
    get: (heritageId: string) => request<HeritagePassport>(`/passports/${heritageId}`),
    pdfUrl: (heritageId: string) => `${BASE_URL}/passports/${heritageId}/pdf`,
    qrUrl: (heritageId: string) => `${BASE_URL}/passports/${heritageId}/qr`,
  },
  verify: {
    check: (heritageId: string) => request<VerificationResult>(`/verify/${heritageId}`),
  },
  agents: {
    get: (id: string) => request<FieldAgent>(`/field-agents/${id}`),
  },
  events: {
    forArtwork: (artworkId: string) => request<ProvenanceEvent[]>(`/artworks/${artworkId}/events`),
  },
};

export { BASE_URL };
