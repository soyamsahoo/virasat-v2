"""Pydantic v2 request/response contracts for the VIRASAT API.

Schemas mirror the PostgreSQL DDL in ``app/models/ddl.sql``. All reads use
``from_attributes`` so repository rows (dicts or ORM objects) are coerced
directly.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# --------------------------------------------------------------------------
# Enums (mirror PostgreSQL enum types)
# --------------------------------------------------------------------------
class VerificationStatus(str, Enum):
    PENDING = "pending"
    FIELD_VERIFIED = "field_verified"
    MASTER_VERIFIED = "master_verified"
    FLAGGED = "flagged"


class ProvenanceEventType(str, Enum):
    CREATED = "created"
    REGISTERED = "registered"
    VERIFIED_BY_NGO = "verified_by_ngo"
    EXHIBITED = "exhibited"
    TRANSFERRED = "transferred"
    ARCHIVED = "archived"


class Model(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------
# Traditions
# --------------------------------------------------------------------------
class TraditionBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    native_title: Optional[str] = None
    gi_tag_number: Optional[str] = Field(default=None, max_length=100)
    origin_state: str = Field(min_length=1, max_length=100)
    description: str
    technique_breakdown: str
    cover_image_url: Optional[str] = None


class TraditionCreate(TraditionBase):
    pass


class TraditionRead(TraditionBase, Model):
    id: uuid.UUID
    created_at: datetime
    artisan_count: int = 0
    region_count: int = 0


# --------------------------------------------------------------------------
# Regions
# --------------------------------------------------------------------------
class RegionBase(BaseModel):
    state: str = Field(min_length=1, max_length=100)
    district: str = Field(min_length=1, max_length=100)
    village: str = Field(min_length=1, max_length=100)
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    cultural_history: Optional[str] = None


class RegionCreate(RegionBase):
    pass


class RegionRead(RegionBase, Model):
    id: uuid.UUID
    created_at: datetime
    artisan_count: int = 0


# --------------------------------------------------------------------------
# Field agents (NGO portal)
# --------------------------------------------------------------------------
class FieldAgentBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    ngo_organization: str = Field(min_length=1, max_length=255)
    assigned_region_id: uuid.UUID
    badge_number: str = Field(min_length=1, max_length=100)


class FieldAgentCreate(FieldAgentBase):
    pass


class FieldAgentRead(FieldAgentBase, Model):
    id: uuid.UUID
    created_at: datetime


# --------------------------------------------------------------------------
# Artisans
# --------------------------------------------------------------------------
class ArtisanBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    pehchan_card_id: Optional[str] = Field(default=None, max_length=100)
    biography: str
    generation_number: int = Field(default=1, ge=1)
    parent_artisan_id: Optional[uuid.UUID] = None
    region_id: uuid.UUID
    primary_tradition_id: uuid.UUID
    profile_image_url: Optional[str] = None


class ArtisanCreate(ArtisanBase):
    pass


class ArtisanStatusUpdate(BaseModel):
    verification_status: VerificationStatus


class LineageMember(Model):
    id: uuid.UUID
    full_name: str
    generation_number: int
    parent_artisan_id: Optional[uuid.UUID] = None
    depth: int = Field(ge=1, le=4)
    verification_status: VerificationStatus


class ArtisanRead(ArtisanBase, Model):
    id: uuid.UUID
    verification_status: VerificationStatus
    created_at: datetime
    region_name: str = ""
    tradition_title: str = ""


class ArtisanDetail(ArtisanRead):
    lineage: list[LineageMember] = []
    artwork_count: int = 0
    story_count: int = 0


# --------------------------------------------------------------------------
# Artworks
# --------------------------------------------------------------------------
class ArtworkBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    dimensions: Optional[str] = Field(default=None, max_length=100)
    medium: Optional[str] = Field(default=None, max_length=255)
    creation_year: int = Field(ge=1000, le=2100)
    artisan_id: uuid.UUID


class ArtworkCreate(ArtworkBase):
    heritage_id: Optional[str] = None
    phash_signature: Optional[str] = Field(default=None, max_length=64)
    dhash_signature: Optional[str] = Field(default=None, max_length=64)
    blur_score: Optional[float] = Field(default=None, ge=0.0)

    @field_validator("phash_signature", "dhash_signature")
    @classmethod
    def hash_must_be_hex(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.lower()
        if len(value) not in (16, 64) or any(c not in "0123456789abcdef" for c in value):
            raise ValueError(
                "Perceptual hashes must be hexadecimal (64-bit = 16 chars, "
                "256-bit = 64 chars)."
            )
        return value


class ArtworkRead(ArtworkBase, Model):
    id: uuid.UUID
    heritage_id: str
    phash_signature: Optional[str] = None
    dhash_signature: Optional[str] = None
    blur_score: Optional[float] = None
    primary_image_url: str = ""
    created_at: datetime
    artisan_name: str = ""
    tradition_title: str = ""
    verification_status: VerificationStatus = VerificationStatus.PENDING


class SimilarArtwork(Model):
    artwork_id: uuid.UUID
    heritage_id: str
    title: str
    phash_distance: int
    dhash_distance: int
    orb_match_score: float = 0.0


# --------------------------------------------------------------------------
# Upload flow (multipart form payload)
# --------------------------------------------------------------------------
class ImageQualityReport(BaseModel):
    blur_score: float
    blur_pass: bool
    normalized: bool = True


class UploadResponse(ArtworkRead):
    image_quality: ImageQualityReport
    possible_duplicates: list[SimilarArtwork] = []
    passport: Optional[HeritagePassportRead] = None


# --------------------------------------------------------------------------
# Provenance events
# --------------------------------------------------------------------------
class ProvenanceEventCreate(BaseModel):
    event_type: ProvenanceEventType
    location_name: str = Field(min_length=1, max_length=255)
    description: str
    recorded_by_agent_id: Optional[uuid.UUID] = None


class ProvenanceEventRead(ProvenanceEventCreate, Model):
    id: uuid.UUID
    artwork_id: uuid.UUID
    event_date: datetime


# --------------------------------------------------------------------------
# Oral stories
# --------------------------------------------------------------------------
class StoryCreate(BaseModel):
    artisan_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    audio_recording_url: str
    transcript: str
    language: str = "Odia"


class StoryRead(StoryCreate, Model):
    id: uuid.UUID
    artisan_id: uuid.UUID
    created_at: datetime


# --------------------------------------------------------------------------
# Heritage passports
# --------------------------------------------------------------------------
class HeritagePassportRead(Model):
    id: uuid.UUID
    artwork_id: uuid.UUID
    cryptographic_hash: str
    qr_code_url: str
    pdf_passport_url: str = ""
    issued_at: datetime


# --------------------------------------------------------------------------
# Verification result
# --------------------------------------------------------------------------
class VerificationOutcome(str, Enum):
    VERIFIED = "verified"
    TAMPERED = "tampered"
    NOT_REGISTERED = "not_registered"


class VerificationResult(Model):
    heritage_id: str
    outcome: VerificationOutcome
    stored_sha256: Optional[str] = None
    computed_sha256: Optional[str] = None
    artwork: Optional[ArtworkRead] = None
    artisan: Optional[ArtisanRead] = None
    passport: Optional[HeritagePassportRead] = None
    events: list[ProvenanceEventRead] = []
    checked_at: datetime