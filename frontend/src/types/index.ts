export type VerificationStatus =
  | "pending"
  | "field_verified"
  | "master_verified"
  | "flagged";

export type ProvenanceEventType =
  | "created"
  | "registered"
  | "verified_by_ngo"
  | "exhibited"
  | "transferred"
  | "archived";

export interface Tradition {
  id: string;
  title: string;
  native_title: string | null;
  gi_tag_number: string | null;
  origin_state: string;
  description: string;
  technique_breakdown: string;
  cover_image_url: string | null;
  created_at: string;
  artisan_count: number;
  region_count: number;
}

export interface Region {
  id: string;
  state: string;
  district: string;
  village: string;
  latitude: number;
  longitude: number;
  cultural_history: string | null;
  created_at: string;
  artisan_count: number;
}

export interface FieldAgent {
  id: string;
  full_name: string;
  ngo_organization: string;
  assigned_region_id: string;
  badge_number: string;
  created_at: string;
}

export interface LineageMember {
  id: string;
  full_name: string;
  generation_number: number;
  parent_artisan_id: string | null;
  depth: number;
  verification_status: VerificationStatus;
}

export interface Artisan {
  id: string;
  full_name: string;
  pehchan_card_id: string | null;
  biography: string;
  generation_number: number;
  parent_artisan_id: string | null;
  region_id: string;
  primary_tradition_id: string;
  verification_status: VerificationStatus;
  profile_image_url: string | null;
  created_at: string;
  region_name: string;
  tradition_title: string;
}

export interface ArtisanDetail extends Artisan {
  lineage: LineageMember[];
  artwork_count: number;
  story_count: number;
}

export interface Artwork {
  id: string;
  heritage_id: string;
  title: string;
  dimensions: string | null;
  medium: string | null;
  creation_year: number;
  artisan_id: string;
  phash_signature: string | null;
  dhash_signature: string | null;
  blur_score: number | null;
  primary_image_url: string;
  created_at: string;
  artisan_name: string;
  tradition_title: string;
  origin_state: string;
  verification_status: VerificationStatus;
}

export interface KeypointMatchPoint {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SimilarArtwork {
  artwork_id: string;
  heritage_id: string;
  title: string;
  artisan_name: string;
  artwork_image_url: string;
  phash_distance: number;
  dhash_distance: number;
  orb_match_score: number;
  orb_verified: boolean;
  keypoint_pairs: KeypointMatchPoint[];
}

export interface ImageQualityReport {
  blur_score: number;
  blur_pass: boolean;
  normalized: boolean;
}

export interface UploadResponse extends Artwork {
  image_quality: ImageQualityReport;
  possible_duplicates: SimilarArtwork[];
  passport: HeritagePassport | null;
}

export type InquiryType =
  | "grant"
  | "exhibition"
  | "commission"
  | "research"
  | "patronage"
  | "collaboration";

export type InquiryStatus = "new" | "contact_made" | "accepted" | "declined";

export interface InstitutionalInquiry {
  id: string;
  artisan_id: string;
  institution_name: string;
  institution_type: string;
  inquiry_type: InquiryType;
  message: string;
  contact_email: string | null;
  status: InquiryStatus;
  artisan_name: string;
  created_at: string;
}

export interface HeritagePassport {
  id: string;
  artwork_id: string;
  cryptographic_hash: string;
  qr_code_url: string;
  pdf_passport_url: string;
  issued_at: string;
}

export interface ProvenanceEvent {
  id: string;
  artwork_id: string;
  event_type: ProvenanceEventType;
  location_name: string;
  description: string;
  recorded_by_agent_id: string | null;
  event_date: string;
}

export interface Story {
  id: string;
  artisan_id: string;
  title: string;
  audio_recording_url: string;
  transcript: string;
  language: string;
  created_at: string;
}

export type VerificationOutcome = "verified" | "tampered" | "not_registered";

export interface VerificationResult {
  heritage_id: string;
  outcome: VerificationOutcome;
  stored_sha256: string | null;
  computed_sha256: string | null;
  artwork: Artwork | null;
  artisan: Artisan | null;
  passport: HeritagePassport | null;
  events: ProvenanceEvent[];
  checked_at: string;
}

export interface ImageVerificationResult {
  image_quality: ImageQualityReport;
  matches: SimilarArtwork[];
  result: VerificationResult | null;
}
