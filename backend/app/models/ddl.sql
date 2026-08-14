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

DO $$ BEGIN
    CREATE TYPE inquiry_type_enum AS ENUM
        ('grant', 'exhibition', 'commission', 'research', 'patronage', 'collaboration');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE inquiry_status_enum AS ENUM
        ('new', 'contact_made', 'accepted', 'declined');
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
    access_pin_hash TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    contact_email VARCHAR(255),
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
-- 9. ARTWORK IMAGE BLOBS (archived plate photographs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS artwork_image_blobs (
    artwork_id UUID PRIMARY KEY REFERENCES artworks(id) ON DELETE CASCADE,
    image BYTEA NOT NULL
);

-- ---------------------------------------------------------------------------
-- 10. INSTITUTIONAL INQUIRIES (patronage hub — zero-commerce model)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institutional_inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artisan_id UUID REFERENCES artisans(id) ON DELETE CASCADE,
    institution_name VARCHAR(255) NOT NULL,
    institution_type VARCHAR(100) DEFAULT 'Institution',
    inquiry_type inquiry_type_enum NOT NULL DEFAULT 'patronage',
    message TEXT NOT NULL,
    contact_email VARCHAR(255),
    status inquiry_status_enum DEFAULT 'new',
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
CREATE INDEX IF NOT EXISTS idx_inquiries_artisan       ON institutional_inquiries(artisan_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status        ON institutional_inquiries(status);

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
-- Full family tree: walk up to the family root, then sweep the whole branch
-- down (ancestors, siblings and descendants; up to 4 generations each way).
-- Ordered by generation ascending, stable within a generation.
--   Usage:
--     WITH RECURSIVE up AS (
--         SELECT a.id, a.full_name, a.generation_number, a.parent_artisan_id,
--                1 AS depth
--         FROM artisans a
--         WHERE a.id = :artisan_id
--         UNION ALL
--         SELECT p.id, p.full_name, p.generation_number, p.parent_artisan_id,
--                u.depth + 1
--         FROM artisans p
--         JOIN up u ON p.id = u.parent_artisan_id
--         WHERE u.depth < 4
--     ),
--     family_root AS (
--         SELECT id FROM up ORDER BY generation_number ASC, depth DESC LIMIT 1
--     ),
--     down AS (
--         SELECT a.id, a.full_name, a.generation_number, a.parent_artisan_id,
--                1 AS family_depth
--         FROM artisans a JOIN family_root r ON a.id = r.id
--         UNION ALL
--         SELECT ch.id, ch.full_name, ch.generation_number, ch.parent_artisan_id,
--                d.family_depth + 1
--         FROM artisans ch
--         JOIN down d ON ch.parent_artisan_id = d.id
--         WHERE d.family_depth < 4
--     )
--     SELECT id, full_name, generation_number, parent_artisan_id, family_depth
--     FROM down
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
ALTER TABLE artwork_image_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE heritage_passports ENABLE ROW LEVEL SECURITY;
ALTER TABLE provenance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutional_inquiries ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS policies
--
-- Model: the FastAPI backend connects with the service_role key (which
-- bypasses RLS entirely), so these policies govern *direct* clients — e.g.
-- a future browser-side Supabase client using the anon key.
--
--   • anon        → read-only access to the public heritage catalogue,
--                   plus INSERT on institutional_inquiries (contact form).
--   • authenticated → full CRUD on all registry tables (field-agent work).
-- ---------------------------------------------------------------------------

-- --------------------------------------------- public read (anon) ----------
CREATE POLICY "public_read_traditions" ON traditions
    FOR SELECT USING (true);
CREATE POLICY "public_read_regions" ON regions
    FOR SELECT USING (true);
CREATE POLICY "public_read_field_agents" ON field_agents
    FOR SELECT USING (true);
CREATE POLICY "public_read_artisans" ON artisans
    FOR SELECT USING (true);
CREATE POLICY "public_read_artworks" ON artworks
    FOR SELECT USING (true);
CREATE POLICY "public_read_artwork_image_blobs" ON artwork_image_blobs
    FOR SELECT USING (true);
CREATE POLICY "public_read_heritage_passports" ON heritage_passports
    FOR SELECT USING (true);
CREATE POLICY "public_read_provenance_events" ON provenance_events
    FOR SELECT USING (true);
CREATE POLICY "public_read_stories" ON stories
    FOR SELECT USING (true);

-- --------------------------------------------- public write (anon) ---------
-- The institutional inquiry form is the only public write surface.
CREATE POLICY "public_create_inquiries" ON institutional_inquiries
    FOR INSERT WITH CHECK (true);

-- --------------------------------------------- registry writes (auth) ------
CREATE POLICY "authenticated_write_traditions" ON traditions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write_regions" ON regions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write_field_agents" ON field_agents
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write_artisans" ON artisans
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write_artworks" ON artworks
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write_artwork_image_blobs" ON artwork_image_blobs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write_heritage_passports" ON heritage_passports
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write_provenance_events" ON provenance_events
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write_stories" ON stories
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write_inquiries" ON institutional_inquiries
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --------------------------------------------- staff-only inquiry admin ----
-- Dashboard reads/status updates happen via the backend (service role);
-- this is the direct-client equivalent.
CREATE POLICY "service_read_inquiries" ON institutional_inquiries
    FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "service_update_inquiries" ON institutional_inquiries
    FOR UPDATE USING (auth.role() = 'service_role');
