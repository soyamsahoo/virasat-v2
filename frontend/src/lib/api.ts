import type {
  Artisan,
  ArtisanDetail,
  Artwork,
  FieldAgent,
  HeritagePassport,
  ImageVerificationResult,
  InstitutionalInquiry,
  InquiryStatus,
  InquiryType,
  ProvenanceEvent,
  Region,
  SimilarArtwork,
  Story,
  Tradition,
  UploadResponse,
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
  const headers = new Headers(init?.headers);
  // JSON bodies get the JSON content type; FormData (multipart uploads)
  // are left for the browser to tag with the boundary automatically.
  if (typeof init?.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
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
    create: (payload: {
      full_name: string;
      pehchan_card_id?: string;
      biography: string;
      region_id: string;
      primary_tradition_id: string;
      parent_artisan_id?: string;
    }) => request<Artisan>("/artisans", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  },
  artworks: {
    list: (params?: {
      artisan_id?: string;
      state?: string;
      tradition_id?: string;
      medium?: string;
      century?: number;
    }) => {
      const query = new URLSearchParams();
      if (params?.artisan_id) query.set("artisan_id", params.artisan_id);
      if (params?.state) query.set("state", params.state);
      if (params?.tradition_id) query.set("tradition_id", params.tradition_id);
      if (params?.medium) query.set("medium", params.medium);
      if (params?.century) query.set("century", String(params.century));
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return request<Artwork[]>(`/artworks${suffix}`);
    },
    get: (heritageId: string) => request<Artwork>(`/artworks/${heritageId}`),
    similar: (heritageId: string) => request<SimilarArtwork[]>(`/artworks/${heritageId}/similar`),
    imageUrl: (heritageId: string) => `${BASE_URL}/artworks/${heritageId}/image`,
    upload: (form: FormData) => request<UploadResponse>("/artworks/upload", {
      method: "POST",
      body: form,
    }),
  },
  passports: {
    get: (heritageId: string) => request<HeritagePassport>(`/passports/${heritageId}`),
    pdfUrl: (heritageId: string) => `${BASE_URL}/passports/${heritageId}/pdf`,
    qrUrl: (heritageId: string) => `${BASE_URL}/passports/${heritageId}/qr`,
  },
  verify: {
    check: (heritageId: string) => request<VerificationResult>(`/verify/${heritageId}`),
    byImage: (form: FormData) => request<ImageVerificationResult>("/verify/image", {
      method: "POST",
      body: form,
    }),
  },
  agents: {
    get: (id: string) => request<FieldAgent>(`/field-agents/${id}`),
    getByBadge: (badge: string) =>
      request<FieldAgent>(`/field-agents/by-badge/${encodeURIComponent(badge)}`),
    login: (badge: string, accessPin: string) =>
      request<FieldAgent>("/field-agents/login", {
        method: "POST",
        body: JSON.stringify({ badge_number: badge, access_pin: accessPin }),
      }),
    register: (payload: {
      full_name: string;
      ngo_organization: string;
      assigned_region_id: string;
      badge_number: string;
      ngo_access_code: string;
      contact_email?: string;
    }) => request<{ agent: FieldAgent; access_pin: string }>("/field-agents", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    createStory: (agentId: string, payload: {
      artisan_id: string;
      title: string;
      audio_recording_url: string;
      transcript: string;
      language: string;
    }) => request<Story>(`/field-agents/${agentId}/stories`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  },
  events: {
    forArtwork: (artworkId: string) => request<ProvenanceEvent[]>(`/artworks/${artworkId}/events`),
  },
  inquiries: {
    create: (payload: {
      artisan_id: string;
      institution_name: string;
      institution_type: string;
      inquiry_type: InquiryType;
      message: string;
      contact_email?: string;
    }) => request<InstitutionalInquiry>("/inquiries", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    list: (params?: { artisan_id?: string; status?: InquiryStatus }) => {
      const query = new URLSearchParams();
      if (params?.artisan_id) query.set("artisan_id", params.artisan_id);
      if (params?.status) query.set("status", params.status);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return request<InstitutionalInquiry[]>(`/inquiries${suffix}`);
    },
    setStatus: (id: string, status: InquiryStatus) =>
      request<InstitutionalInquiry>(`/inquiries/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },
};

export { BASE_URL };
