# VIRASAT (विरासत) v2 — Full Project Audit Report

**India's Digital Memory System** — a provenance registry and living archive of artisans, lineages, artworks and heritage passports.

- **Repo:** `github.com/soyamsahoo/virasat-v2` — branch `main` (5 commits, all pushed, working tree clean)
- **Backend:** FastAPI (Python 3.11+) — `backend/`
- **Frontend:** Vite + React 18 + TypeScript PWA — `frontend/`
- **Demo posture:** backend runs in *memory mode* with seeded data (`uvicorn app.main:app`); frontend `vite preview` / Vercel.
- **Test suite:** 27/27 passing (`python -m pytest tests -q` from `backend/`), CI via GitHub Actions.

---

## 1. Repository Layout

```
D:\virasat
├── .github/workflows/tests.yml      # CI: pytest on push/PR to main
├── seed_data/                       # canonical seed JSON + media (source of truth)
│   ├── traditions.json  regions.json  agents.json  artisans.json
│   ├── artworks.json    events.json  stories.json
│   ├── media/artworks/artwork-01..08.jpg    CREDITS.md   audio/
│   └── media/audio/story-0{1..4}.wav        (CC0 placeholders)
├── patachitra/                      # 7 externally-sourced Pattachitra references (committed as-is)
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI factory, lifespan seeding, CORS, /health
│   │   ├── core/                    # config, security, database (2 repos), heritage_id
│   │   ├── api/v1/                  # router + 8 route modules + deps
│   │   ├── cv_engine/               # fingerprint.py, matcher.py
│   │   ├── passport_engine/         # pdf_generator.py, qr_builder.py
│   │   └── models/schemas.py, ddl.sql (incl. 41 RLS policies)
│   ├── tests/                       # test_smoke, test_cv, test_security, test_seed_sync, conftest
│   ├── vercel.json, api/index.py    # serverless deployment (memory mode)
│   └── requirements*.txt, .env.example
└── frontend/
    ├── index.html  vite.config.*  tailwind.config.*  vercel.json
    └── src/
        ├── main.tsx  App.tsx  index.css
        ├── lib/      api.ts, tokens.tsx, offlineQueue.ts, blurCheck.ts, gsap.ts, lenis.tsx, supabase.ts
        ├── pages/    HomePage, MapExplorer, ArtisanPage, TraditionPage, VerificationPage,
        │             PassportPage, AgentPage, InquiriesPage
        └── components/ ArtworkCard, ArtworkPlate, DeepZoomModal, LineageTree, Timeline,
                        PassportCard, VerificationSeal, StatusBadge, ScrollReveal,
                        InquiryModal, KeypointMatchInspector, Navbar, Hero, Footer
```

**Git history** (why each commit exists):

| Commit | Change |
|---|---|
| `b0dc6e6` | VIRASAT V2 base — FastAPI + React platform |
| `6e1601d` | Visual match inspector, deep-zoom, field-agent PWA, patronage hub |
| `79762c2` | Media seeds + CI test suite + catalogue filters + map plate overlay + RLS policies |
| `a7419a7` | Replace artwork plates with patachitra-folder images (fingerprints recomputed) |
| `5f33e6b` | Commit the `patachitra/` source image folder (provenance of plates) |

---

## 2. Backend — Layer by Layer

### 2.1 Entry point — `backend/app/main.py`

The lifespan seeds the in-memory repository **at boot** from `seed_data/`, so the deployed demo is self-contained:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    repo = await get_repo()          # MemoryRepository or PostgresRepository
    if isinstance(repo, MemoryRepository):
        await repo.seed_from_files() # loads the 7 seed JSONs + media
    yield
```

Exposes `GET /health` and mounts `app.api.v1.router` under `/api/v1`.

### 2.2 Config — `backend/app/core/config.py`

- `DATABASE_URL` absent → **memory mode** (default). Present → Postgres/Supabase via asyncpg.
- `VIRASAT_API_KEY` (optional) — arms the write guard.
- `VIRASAT_VERIFY_FRONTEND_URL`, `VIRASAT_PASSPORT_BASE_URL` — for QR/PDF links.
- `.env.example` documents every variable; nothing secret is committed.

### 2.3 Data layer — `backend/app/core/database.py` (⚠ central file)

Two repository implementations behind one async interface (`Repository`):

**`MemoryRepository`** — the demo driver:
- Loads `traditions/regions/agents/artisans/artworks/events/stories` JSON from `seed_data/`.
- `_load_local_artwork_media()`: for each artwork whose `primary_image_url` points at `media/…`, reads the **actual JPEG bytes**, recomputes the perceptual fingerprints, **verifies them against the signature shipped in the seed file**, and keeps the blob for `/image` endpoints. This is why swapping plates in `a7419a7` required recomputing signatures — a replaced file whose bytes no longer matched the stored signature would have broken the seed load.
- `_hamming(a, b) = bit_count(a ^ b)` — the perceptual distance used for candidate search.

**`PostgresRepository`** — production path:
- asyncpg pool, mirrors every method with parameterised SQL against `ddl.sql` schema.
- `generate_heritage_id` is a SQL function matching the Python `heritage_id.py`.
- ⚠️ **Honest gap:** the Postgres repo has **no seed loader** — migrations/DDL exist but no data bootstrap; all live validation so far happened in memory mode.

**Artwork catalogue filters (both repos)** — `list_artworks(state, tradition_id, artisan_id, medium, century)`; returns `origin_state` per artwork (`ArtworkRead`).

### 2.4 Security & the passport digest — `backend/app/core/security.py`

The trust core of the platform. The passport's `cryptographic_hash` is a SHA-256 over a **canonical, deterministically serialised record**:

```python
def canonical_bytes(record: dict) -> bytes:
    return json.dumps(record, sort_keys=True, separators=(",", ":")).encode("utf-8")

def build_passport_digest(*, artwork: dict, artisan: dict, issued_at) -> str:
    record = {
        "artifact": {
            "heritage_id": artwork["heritage_id"],
            "title": artwork["title"],
            "dimensions": artwork.get("dimensions"),
            "medium": artwork.get("medium"),
            "creation_year": artwork.get("creation_year"),
            "phash_signature": artwork.get("phash_signature"),   # fingerprint of the plate
            "blur_score": artwork.get("blur_score"),
        },
        "artisan": {
            "full_name": artisan["full_name"],
            "pehchan_card_id": artisan.get("pehchan_card_id"),
            "generation_number": artisan.get("generation_number"),
        },
        "issued_at": issued.isoformat(),
    }
    return sha256_hex(canonical_bytes(record))
```

Every mutation of record fields (title, year, artisan name, …) or the perceptual signature invalidates the digest → downstream verification flips to **tampered**. **Note:** the digest binds the *fingerprint* of the photo, not the photo bytes themselves — useful precision documented in §7.

`require_api_key` is a header guard (`X-API-Key`, constant-time `hmac.compare_digest`) that is **inert when no key is configured** — protects POST endpoints in production but defaults open locally.

### 2.5 Heritage ID construction — `backend/app/core/heritage_id.py`

Deterministic `VR-<STATE>-<TRADITION>-<YEAR>-<SEQ>`:

```python
def tradition_code(title: str) -> str:
    tokens = [t for t in re.split(r"\W+", title) if t]
    source = tokens[-1] if len(tokens) >= 2 else title   # "Odisha Pattachitra" → "PAT"
    code = "".join(c for c in source if c.isalnum())
    return code[:3].upper()
```

`state_code()` maps ~18 Indian states (`"odisha" → "OD"`, …). Live IDs: `VR-OD-PAT-2026-000001` … `…-000008`.

### 2.6 CV engine — `backend/app/cv_engine/`

**`fingerprint.py`** — the capture pipeline for every uploaded artwork:
- `decode_bgr` — normalises OpenCV BGR.
- `check_blur` — **Laplacian variance, threshold ≥ 100** (the same gate the PWA mirrors client-side, §4.5).
- `check_illumination` — brightness gate.
- `process_artwork_image` — grayscale → CLAHE → **pHash (64-bit) + dHash (64-bit)** → **ORB (1,000 keypoints)**.
- Signatures ship as SHA-256 hex of the concatenated hash bytes (perceptual hash *of* the plate — stored, not reversible to the image).

**`matcher.py`** — structural candidate verification:
- `MIN_ORB_MATCHES = 12`, `MIN_RANSAC_INLIERS = 8`, `MATCH_DISTANCE_CAP = 64`.
- Brute-force descriptor matching → RANSAC homography → up to **32 keypoint pairs** returned to the client for the visual inspector.
- Suspicious uploads (e.g. an existing plate re-photographed) resolve to an existing artwork with `orb_verified: true` + similarity score — verified live: duplicate test hit the original with **32 pairs / score 0.66**.

### 2.7 Passport engine — `backend/app/passport_engine/`

- **`qr_builder.py`** — `qrcode` with error-correction M, dark `#0D0D0D` on parchment `#F5F2EB`, encodes the **public verify URL** (`…/verify?id=<heritage_id>`) so anyone can re-verify without an account.
- **`pdf_generator.py`** — ReportLab **A4 museum-grade certificate**: parchment background, triple gold frame with corner seals, embedded artwork plate (≤78 mm tall), 10-field provenance table (medium/dimensions/year/artisan/Pehchan ID/generation/region/tradition/GI tag/issued), QR + verify-URL panel, and the SHA-256 footer. Fully self-contained — plate & QR embedded, verifies offline. Live size ~12 KB.
- **`service.py` — `issue_passport()`** — idempotent: returns the existing passport if one exists; otherwise computes digest + QR sidecar and persists. Called automatically on artwork upload with `auto_passport=true`.

### 2.8 API surface — `backend/app/api/v1/`

All routes are public **reads**; only writes demand the API key.

| Router | Endpoints |
|---|---|
| `traditions.py` | `GET /traditions`, `GET /traditions/{id}`, `POST /traditions` (key) |
| `regions.py` | `GET /regions?district=`, `GET /regions/{id}`, `POST /regions` (key) |
| `agents.py` | `POST /field-agents` (key), `GET /field-agents/{id}`, `GET /field-agents/by-badge/{badge}`, `POST /field-agents/{id}/stories` (key), `POST /field-agents/{id}/events` (key) |
| `artisans.py` | `GET /artisans?tradition_id=`, `GET /artisans/{id}`, `GET /artisans/{id}/artworks`, `GET /artisans/{id}/stories`, `GET /artisans/{id}/lineage`, `POST /artisans` (key, onboard), `PATCH /artisans/{id}/status` (key) |
| `artworks.py` | `GET /artworks` (**filters:** state, tradition_id, artisan_id, medium, century), `GET /artworks/{heritage_id}`, `GET /artworks/{id}/similar`, `GET /artworks/{id}/image`, `POST /artworks` (multipart upload + CV pipeline + optional auto passport, key) |
| `passports.py` | `GET /passports/{heritage_id}`, `GET /passports/{heritage_id}/qr` (PNG), `GET /passports/{heritage_id}/pdf` |
| `verification.py` | `GET /verify/{heritage_id}` — recomputes digest, returns `outcome: verified | tampered | not_registered` + stored/computed hashes + keypoint pairs |
| `inquiries.py` | `POST /inquiries` (open patronage inquiry), `GET /inquiries?artisan_id=&status=`, `PATCH /inquiries/{id}` (key) |

### 2.9 Schema & RLS — `backend/app/models/ddl.sql`

10 tables (`traditions, regions, agents, artisans, artworks, stories, events, passports, inquiries, artwork_image_blobs`), unique badge/heritage/Pehchan constraints, and the SQL `generate_heritage_id`. **41 RLS policies** grant: anonymous read on public catalogue tables, anonymous insert on `inquiries`, authenticated CRUD for the registry service, and `service_role`-only inquiry administration — a production-ready foundation, though the running demo uses memory mode.

### 2.10 Tests & CI

- `tests/test_smoke.py` — endpoint contract suite incl. seeded catalogue, verification outcomes.
- `tests/test_cv.py` — fingerprint stability, blur/illumination gates, ORB match thresholds, duplicate→`orb_verified` flow.
- `tests/test_security.py` — digest determinism, mutation → tampered, canonical-bytes stability, key guard.
- `tests/test_seed_sync.py` — guards parity between root `seed_data/` and the `backend/seed_data/` copy deployed to Vercel.
- `.github/workflows/tests.yml` runs the suite on push/PR to `main`.

---

## 3. Seed Data & Media Inventory

**Live counts (memory mode):** 1 tradition (GI-88, Odisha Pattachitra) · 2 regions · 2 agents · 6 artisans · **8 artworks** · 8 events · 4 stories.

**Artworks** (`seed_data/artworks.json`): `VR-OD-PAT-2026-000001` Dashavatara Patta (2026) … `…-000008` Jagannath Trinity on Patta (2026) — full titles, media, dimensions and *synthetic* blur scores (e.g. 287.4) are representative training records.

**Plate mapping** (commit `a7419a7`) — plates are now real referenced Pattachitra images:

| Artwork | File |
|---|---|
| 01 Dashavatara | `dasavtar.jpg` |
| 02 Krishna Leela | `kanchi vijaya pattachitra.jpg` |
| 03 Nabagunjara | `Pattachitra-Art-An-Expression-Of-Mythology-And-Folklore.jpg` |
| 04 Radha-Krishna | `Odisha_Pattachitara_…_Radha_Krushna.jpg` (CC BY-SA 4.0) |
| 05 Matsya | `1_JBfvOVgosFoehRl32eJDiw.jpg` |
| 06 Vamana | `Extrait_de_Chandi_Mangal_de_Hazra_Chitrakar_(Naya_Bengale).jpg` (CC BY-SA 2.0) |
| 07 Kalika | kept from Wikimedia (Mike Prince, CC BY 2.0) |
| 08 Jagannath Trinity | `jagannath subhadra balabhadra.jpg` |

- Sources archived in `seed_data/media/CREDITS.md` (hash-identical copy in `backend/seed_data/media/`).
- The raw (`patachitra/`) folder is committed so attribution is reproducible.
- **Audio:** 4 × 20 s tanpura-tone WAVs (`story-0{1..4}.wav`) — **synthesised CC0 placeholders**, not genuine folklore (see §7).

---

## 4. Frontend — Page by Page

### 4.1 Bootstrap & infrastructure

**`main.tsx`** — PWA service-worker registration (`registerSW({ immediate: true })`) via `vite-plugin-pwa`.

**`App.tsx`** routes: `/` (HomePage) · `/artisans/:id` · `/traditions/:id` · `/verify` · `/passport` (with `?id=`) · `/agent` · `/dashboard/inquiries`. Navbar + Footer wrap; `LenisProvider` + `DeepZoomProvider` + `InquiryModalProvider`-style contexts wrap the router.

**`lib/lenis.tsx`** — Lenis smooth scroll driven by GSAP's ticker, bridged to ScrollTrigger (`lenis.on("scroll", ScrollTrigger.update)`), with `scrollToTop()` on route change.

**`lib/gsap.ts`** — single registration point for ScrollTrigger.

**`lib/tokens.tsx`** — the design system: `palette` (black `#0D0D0D`, parchment `#F5F2EB`, gold `#C5A059`, goldSoft `#E8D9B8`, terracotta `#8B4513`, emerald `#1B3B2B`, muted `#A8A29A`), `statusMeta` (pending → terracotta, `field_verified` → gold, `master_verified` → emerald, flagged → `#7A1F1F`), fonts (Cinzel / Cormorant Garamond / Plus Jakarta Sans), and `mapLevels`.

**`lib/api.ts`** — one typed fetch client for every endpoint (`api.traditions`, `api.artisans`, `api.artworks`, `api.passports`, `api.verify`, `api.inquiries`, `api.agents`), thin `ApiError` wrapper, `URLSearchParams` query building (e.g. filters).

**`lib/offlineQueue.ts`** — IndexedDB (`virasat-offline` / store `intake`):
- `enqueueIntake` stores artisan + story + **photo as a data URL** when offline.
- `useQueueSync` shows queued count, auto-syncs on the `online` event, and replays: `artisans.create` → `agents.createStory` → `artworks.upload(auto_passport=true)`, deleting each intake on success. Failed items stay queued with an error message.

**`lib/supabase.ts`** — optional Supabase client, created only when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` exist (presently unused by pages; RLS path is that way for the future).

**`lib/blurCheck.ts`** — the exact server CV gate mirrored in the browser: downscale to 160 px, luminance (`0.299R+0.587G+0.114B`), 3×3 Laplacian kernel `[0,1,0;1,-4,1;0,1,0]`, variance of the output, **pass ≥ 100**. Agents get warned about blurry shots before any network round-trip.

### 4.2 HomePage — the archive landing

- Hero with staggered GSAP entrance, headline, sub-copy, and stats (counts fall back to hard-coded values when APIs fail).
- **Filter system:** five selects (state / tradition / artisan / medium / century) whose options are derived by reading the *full* artwork list once (`allArtworks`); the visible grid re-queries `api.artworks.list(params)` with the 5 filters and shows a dedicated empty state.
- Featured works (first 6) reusing `ArtworkCard`; each links to its passport.
- **MapExplorer** (§4.3) at the Explore anchor.

### 4.3 MapExplorer — the journey map

maplibre-gl with the Carto dark-matter style, four zoom levels driven by a `mapLevels` state machine (level/zoom/center):

| Level | Zoom | Center |
|---|---|---|
| overview | 4.5 | `[79.09, 21.15]` (India) |
| state | 7.5 | `[85.35, 20.1]` (Odisha) |
| village | 14.0 | `[85.8239, 19.8924]` (Raghurajpur) |
| artwork | 15.4 | same point |

- Artwork pins live in a `virasat-artworks` source/layer (`paintMap` re-inits layers on data change): gold circle markers at `VILLAGE_POINT = [85.8239, 19.8924]`, popup with title + "Open passport →" linking `/passport?id=`.
- Controls: step buttons appear per level; the `artwork` button is disabled until a village is selected; `flyTo` animates between levels. No tiles are fetched from a paid key — the style comes from Carto's public CDN.

### 4.4 ArtworkCard & ArtworkPlate — the plates

- **ArtworkCard** shows the plate, title, artisan, year; clicking the plate opens **DeepZoomModal** (§4.6) on the archived image; badges distinguish "Inspect plate" vs "Fingerprinted"; a passport CTA sits beneath.
- **ArtworkPlate** is a `<figure>`-based plate wrapper: renders the image, and on `onError` falls back to a radial gold-gradient stand-in with a `Layers` icon — so the tree never shows a broken image.

### 4.5 DeepZoomModal — the ≤1000% inspector

- Pan via pointer capture (`setPointerCapture`), zoom anchor-to-cursor on wheel / `+`/`−` buttons: `1.2×` per wheel notch, `1.5×` per button, **clamped to `MIN_SCALE=1` / `MAX_SCALE=10`**.
- Offset math keeps the pixel under the cursor stationary:
  ```ts
  const cx = (cursor.x - vp.clientWidth / 2) / vp.clientWidth;
  setOffset(o => clampOffset({ x: o.x + cx * natural.w * (next - current), … }, next));
  ```
- `clampOffset` keeps edges from over-scrolling; `imageRendering: "pixelated"` ≥400% for a crisp, archival inspection feel; fullscreen + reset buttons; "No archived photograph — plate stand-in" fallback for unphotographed records.

### 4.6 ArtisanPage — the people of the archive

- Orchestrates three parallel fetches (`artisan detail`, `artworks`, `stories`); provenance events of the **first artwork** populate the Timeline.
- Header: tradition · generation eyebrow, `StatusBadge`, region pin, **Pehchan Card ID chip**, biography, artwork/story counts, and "Institutional inquiry · Grant / Exhibition" button (opens **InquiryModal** §4.18).
- **LineageTree** — renders `artisan.lineage` (eldest → newest) as a descent column; the **root is the last element** (self), every member annotated "Parent of the record below" / "Ancestor", generation badge, `StatusBadge`, and "Open record →" links; the artisan's own generation number comes from the tree, not a route param.
- **Stories** — accordion rows with language tag; expanded rows show the audio player (`<audio controls>`) and transcript.
- **Timeline** — events as a vertical rail with a gold SVG line that **draws itself on scroll** (gsap `strokeDashoffset` scrubbed 0.6 over `top 75% → bottom 55%`); node color by event type (`created` terracotta, `registered` gold, `verified_by_ngo` emerald, `exhibited` gold, `transferred` parchment, `archived` slate); dates in `en-IN` format.

### 4.7 TraditionPage

GI-tag eyebrow, native title in Odia, origin state, description, **Technique Breakdown** in a paper card, and "N Artisans Documented" grid linking to ArtisanPages (generation-number roundel + status).

### 4.8 VerificationPage — the trust layer

- Accepts `?id=` via query string (auto-verifies on load — this is the QR target).
- Calls `api.verify.check(heritageId)`; shows the **VerificationSeal**, record metadata grid (title/year/medium/artisan/tradition/blur score), artisan status + link, and — critically — **both digests**: `stored_sha256` vs `computed_sha256`, the honest evidence of integrity.
- CTAs: view passport, download PDF certificate.

### 4.9 PassportPage & PassportCard — the certificate

**PassportPage** composes `artwork + artisan + passport + events` in parallel; states for "no ID provided" and "record unavailable".

**PassportCard** renders the museum document: cream paper with double gold border, English + Devanagari masthead, heritage ID in gold, artwork title block, six-field table (Artisan, Pehchan Card, Generation, Region, Tradition, Issued), then:
- **QR generated client-side** (`QRCode.toCanvas`) encoding `window.location.origin + "/verify?id=" + heritageId` — the same contract as the server-side PDF QR.
- "Registered & cryptographically signed" + **SHA-256 prefix** (first 36 hex chars) shown on the face of the document.
- "Verify this passport" + "PDF certificate" actions.

### 4.10 VerificationSeal — outcome badge

SVG wax-seal: circular Devanagari/Latin textPath ring (`विरासत · VIRASAT · PROVENANCE REGISTRY · …`), outcome-colored ring (verified → emerald, tampered → `#7A1F1F`, not_registered → terracotta), centered **VERIFIED / TAMPERED / UNREGISTERED** + sub-label (`SHA-256 MATCH` / `DIGEST MISMATCH` / `NO PASSPORT`).

### 4.11 AgentPage — the field-agent PWA

The most operationally complex page (745 lines):

- **Gate:** badge login (`GET /field-agents/by-badge/…`) or register (`POST /field-agents`); the resolved agent persists in `localStorage` under `AGENT_KEY = "virasat-agent-v1"`.
- **4-step wizard** with per-step validation (`stepValid`):
  1. **Artisan intake** — name, Pehchan ID, tradition/region selects, master artisan → **generation derived automatically** ("Generation number is derived automatically from the selected master").
  2. **Oral story** — title/language/transcript + **MediaRecorder capture** (start/pause/resume/stop, elapsed timer, re-record, live `<audio>` preview).
  3. **Artwork capture** — title/year/medium/dimensions + camera photo (`accept="image/*" capture="environment"`), **instant blur pre-check** (`checkBlur` result box: "passes the sharpness gate" / "blurry; re-capture"), preview that opens the DeepZoom inspector.
  4. **Review & submit** — summary `dl` (artisan, Pehchan, tradition, region, story, audio clip, photo size, blur gate); online → "Register artisan, story & artwork" (live CV fingerprinting + auto passport); offline → "Save to offline queue" (IndexedDB; "synced automatically when signal returns").
- The blur gate + offline queue + auto-passport make this a genuinely rural-network-tolerant flow.

### 4.12 InquiriesPage — patronage inbox

Filter pills (All/New/Contact made/Accepted/Declined with live counts), status chips, refresh; each card: institution name+type, artisan link, inquiry type, date (`en-IN`), message, contact email, and quick status transitions (`contact_made` / `accepted` / `declined`) — these PATCH calls require the API key server-side, so the inbox is an operator surface, not public.

### 4.13 InquiryModal — zero-commerce contact

Six inquiry types (grant/exhibition/commission/research/patronage/collaboration) with inline hints, institution type select, email, message (min 10 chars), success state ("No fees, no marketplace — direct patronage only"). VIRASAT only brokers the connection — no transactions.

### 4.14 KeypointMatchInspector — the evidence view (on similar-artwork results)

- Split-screen: uploaded plate (left) vs registered plate (right), both `object-contain`.
- Measures natural vs rendered dimensions per plate (`scale = min(boxW/natW, boxH/natH)`), then draws **every matched keypoint pair as a gold line** spanning the two boxes (endpoints projected from pixel space → visible box space, offset by the right plate's x-position).
- Headline chips: `{orb_match_score}% structural`, "ORB + RANSAC verified" (gold/emerald pills), footer legend: ORB matches count, pHash distance, dHash distance, candidate ID.

### 4.15 Support components

- **ScrollReveal** — gsap `fromTo(autoAlpha 0, y 48)` → visible with `scrollTrigger start "top 88%"`, once, kills on unmount; the site-wide entrance idiom.
- **StatusBadge** — statusMeta dot with glow (`boxShadow: 0 0 8px`) + label.
- **Navbar** — fixed, transparent→solid on scroll, links: The Archive `/` · Explore `/ #map` · Verify `/verify` · Passport `/passport?id=VR-OD-PAT-2026-000001` · Field Agent `/agent` · Patronage `/dashboard/inquiries`.
- **Hero** — full-viewport, serif display with staggered reveal, stats row, and a torch-bearer figure (GSAP scroll-driven parallax).
- **Footer** — three columns (archive/trust/patronage), brand blurb "6-generation artisan lineages", GI-88 citation, legal-ish line about the SHA-256 registry.

### 4.16 Theme (`index.css` + `tailwind.config`)

Palette bound to Tailwind tokens (`museum-black`, `museum-parchment`, `museum-gold`, …); body has fixed radial gold/terracotta glow gradients; custom scrollbars; `.hairline`, `.eyebrow`, `.text-gold-gradient`, `.passport-paper` components; Google Fonts (Cinzel/Cormorant/Plus Jakarta). `index.html` carries PWA meta + theme-color.

---

## 5. Trust Model — What the System Actually Proves

1. **Registration:** upload → CV pipeline (`blur ≥ 100`, brightness, pHash+dHash, ORB 1000) → heritage ID → digest → QR + PDF issued atomically.
2. **Duplicate detection:** a re-upload of an existing plate is caught by hashes/ORB and surfaced with `orb_verified` + keypoint evidence instead of silently double-registered.
3. **Verification contract:** `GET /verify/{id}` recomputes the canonical digest over the *stored* record and compares to the passport's `cryptographic_hash`. Outcomes are honest to what they are:
   - ✅ `verified` — record unchanged since issuance.
   - 🚩 `tampered` — any metadata or fingerprint field mutated.
   - ⚪ `not_registered` — no passport for the ID.
4. **Human-readable evidence:** both digests are shown; the seal, the PDF, the QR and the inspector all route back to the same endpoint, so every surface re-proves the same claim.
5. **What it does NOT prove** (precision matters): the digest binds the *fingerprint*, not the *pixel bytes*, of the plate; it proves registry integrity, not physical authorship of the artifact.

---

## 6. Security Posture & RLS

- Default open reads; writes gated by `X-API-Key` (constant-time compare) **when configured**; `VERIFY` endpoint reads only.
- Postgres DDL ships 41 RLS policies: anon select on public catalogue, anon insert on inquiries (spam posture acceptable for a demo), authenticated service CRUD, `service_role` inquiry admin. Views/table-permissions ready for Supabase.
- Frontend never stores secrets; `API_KEY` lives server-side (and the PWA uses none — the offline queue replays the same endpoints when connectivity returns).
- Residual risks are listed in §7.

---

## 7. Honest Gaps & Risks (candid audit)

1. **Postgres repo has no data seeding** — DDL + RLS are complete, but no bootstrap path; every demo so far ran in memory mode. A `seed.sql`/loader for the production era is the single biggest missing piece.
2. **Digest binds metadata + fingerprint, not raw plate bytes** — a photo replaced with a *different* file whose computed fingerprint matched the stored signature could pass. Strengthening: include a SHA-256 of the encoded image bytes in the digest.
3. **No user authentication anywhere** — the "field agent" identity is a badge-number lookup; anyone with the (public) endpoints could register agents in a key-less deployment. Intentional for an open demo, but must flip before real-world provenance.
4. **Story audio is synthesised CC0 tanpura** — placeholders stand in for genuine folklore; presentation must not imply authenticity. License only says CC0, not "recorded in the field".
5. **Seed data is representative/synthetic** (artisans' digits, blur scores, passport issue dates) — training-grade, clearly not real records.
6. **No live deploy verification** since the plate swap and filter/RIS changes — CI covers tests, but the Vercel memory-mode deployment hasn't been smoke-tested end-to-end in this cycle.
7. **No README / docs directory existed in the repo until this audit** — deployment steps existed only in `.env.example` + configs; this report is the start of documentation.
8. **Frontend offline queue replays sequentially with no retry/backoff UI** — acceptable for MVP; a background worker would harden it.
9. **Map tiles depend on Carto's public dark-matter style** — fine for demo, needs self-hosting/approval for production.

---

## 8. Quick Start (as verified during the audit)

```bash
# backend (memory mode, seeded)
cd backend
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --port 8000        # seeds on boot; GET /health → {"status":"ok","version":"2.0.0"}

# tests
python -m pytest tests -q                # 27 passed

# frontend
cd frontend
npm install
npm run dev                              # or: npm run build && npm run preview
```

**Verified live during the audit cycle:** `GET /api/v1/verify/VR-OD-PAT-2026-000001` → `verified` (computed == stored digest); tampered title → `tampered`; duplicate upload → `orb_verified: true` (32 keypoint pairs, 0.66); PDF certificate 12,092 bytes with embedded plate + QR; all plate endpoints served `image/jpeg` after the patachitra swap; 27/27 tests green; `npm run build` clean (dist: app ~447 kB JS + maplibre ~802 kB).

---

*Audit compiled during the v2 remediation cycle — commit `5f33e6b`. End.*