-- ============================================================================
-- VIRASAT (विरासत) — PostgreSQL / Supabase schema
-- Compatible with Supabase (extensions, enums, functions and RLS-ready DDL).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ---------------------------------------------------------------------------
-- Enum definitions
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE verification_status_enum AS ENUM
        ('pending', 'field_verified', 'master_verified', 'flagged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE provenance_event_enum AS ENUM
        ('created', 'registered', 'verified_by_ngo', 'exhibited', 'transferred', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 1. TRADITIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS traditions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    native_title VARCHAR(255),
    gi_tag_number VARCHAR(100),
    origin_state VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    technique_breakdown TEXT NOT NULL,
    cover_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 2. REGIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    village VARCHAR(100) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    cultural_history TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 3. FIELD AGENTS (NGO Portal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS field_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    ngo_organization VARCHAR(255) NOT NULL,
    assigned_region_id UUID REFERENCES regions(id),
    badge_number VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 4. ARTISANS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS artisans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    pehchan_card_id VARCHAR(100) UNIQUE,
    biography TEXT NOT NULL,
    generation_number INT DEFAULT 1,
    parent_artisan_id UUID REFERENCES artisans(id),
    region_id UUID REFERENCES regions(id),
    primary_tradition_id UUID REFERENCES traditions(id),
    verification_status verification_status_enum DEFAULT 'pending',
    profile_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 5. ARTWORKS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS artworks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    heritage_id VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    dimensions VARCHAR(100),
    medium VARCHAR(255),
    creation_year INT NOT NULL,
    artisan_id UUID REFERENCES artisans(id) ON DELETE CASCADE,
    phash_signature VARCHAR(64),
    dhash_signature VARCHAR(64),
    orb_descriptors BYTEA,
    orb_keypoint_count INT DEFAULT 0,
    primary_image_url TEXT NOT NULL DEFAULT '',
    blur_score DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 6. HERITAGE PASSPORTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS heritage_passports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artwork_id UUID UNIQUE REFERENCES artworks(id) ON DELETE CASCADE,
    cryptographic_hash VARCHAR(255) NOT NULL,
    qr_code_url TEXT NOT NULL,
    pdf_passport_url TEXT,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 7. PROVENANCE EVENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provenance_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artwork_id UUID REFERENCES artworks(id) ON DELETE CASCADE,
    event_type provenance_event_enum NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    recorded_by_agent_id UUID REFERENCES field_agents(id),
    event_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 8. ORAL STORIES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artisan_id UUID REFERENCES artisans(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    audio_recording_url TEXT NOT NULL,
    transcript TEXT NOT NULL,
    language VARCHAR(50) DEFAULT 'Odia',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Indexes for fast querying
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_artworks_heritage_id    ON artworks(heritage_id);
CREATE INDEX IF NOT EXISTS idx_artworks_phash          ON artworks(phash_signature);
CREATE INDEX IF NOT EXISTS idx_artworks_artisan        ON artworks(artisan_id);
CREATE INDEX IF NOT EXISTS idx_artisans_region         ON artisans(region_id);
CREATE INDEX IF NOT EXISTS idx_artisans_tradition      ON artisans(primary_tradition_id);
CREATE INDEX IF NOT EXISTS idx_events_artwork          ON provenance_events(artwork_id);
CREATE INDEX IF NOT EXISTS idx_stories_artisan         ON stories(artisan_id);

-- ---------------------------------------------------------------------------
-- Deterministic heritage ID generator
--   'VR-OD-PAT-2026-000001'  →  VR-<STATE>-<TRADITION>-<YEAR>-<SEQ>
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_heritage_id(
    p_state_code VARCHAR(2),
    p_trad_code VARCHAR(3),
    p_year INT
) RETURNS VARCHAR AS $$
DECLARE
    v_seq INT;
    v_heritage_id VARCHAR;
BEGIN
    -- Max-based (not count-based) so non-dense seed sequences never collide.
    SELECT COALESCE(MAX((regexp_match(heritage_id, '-(\d{6})$'))[1])::INT, 0) + 1
    INTO v_seq
    FROM artworks WHERE creation_year = p_year;
    v_heritage_id := 'VR-' || UPPER(p_state_code) || '-' || UPPER(p_trad_code)
                     || '-' || p_year::TEXT || '-' || LPAD(v_seq::TEXT, 6, '0');
    RETURN v_heritage_id;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Recursive CTE: fetch up to 4 generations of artisan lineage (ascending)
--   Usage:
--     WITH RECURSIVE artisan_lineage AS (
--         SELECT a.id, a.full_name, a.generation_number, a.parent_artisan_id,
--                1 AS depth
--         FROM artisans a
--         WHERE a.id = :artisan_id
--         UNION ALL
--         SELECT a.id, a.full_name, a.generation_number, a.parent_artisan_id,
--                l.depth + 1
--         FROM artisans a
--         JOIN artisan_lineage l ON a.parent_artisan_id = l.id
--         WHERE l.depth < 4
--     )
--     SELECT id, full_name, generation_number, parent_artisan_id, depth
--     FROM artisan_lineage
--     ORDER BY generation_number ASC;

-- ---------------------------------------------------------------------------
-- Row-level security for Supabase (enforce per-table policies as required).
-- Public reads are open to allow verification lookups; writes are restricted.
-- ---------------------------------------------------------------------------
ALTER TABLE traditions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_agents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE artisans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE artworks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE heritage_passports ENABLE ROW LEVEL SECURITY;
ALTER TABLE provenance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories           ENABLE ROW LEVEL SECURITY;
