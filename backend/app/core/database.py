"""Persistence layer.

``PostgresRepository`` targets Supabase/PostgreSQL via asyncpg and executes
the DDL in ``app/models/ddl.sql``. ``MemoryRepository`` is a fully functional,
in-memory stand-in that pre-loads the ``seed_data/`` anchor dataset — it lets
the entire platform (API, CV pipeline, passport engine, verification) run
locally with no database, which is essential for rural field pilots and CI.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import asyncpg

from app.core.config import get_settings
from app.cv_engine.fingerprint import VisualFingerprintEngine

SEED_FILES = (
    "traditions.json",
    "regions.json",
    "agents.json",
    "artisans.json",
    "artworks.json",
    "stories.json",
    "events.json",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid() -> str:
    return str(uuid.uuid4())


def _hamming(a_hex: str, b_hex: str) -> int:
    """Hamming distance between two 64-char perceptual hash strings."""
    a = int(a_hex, 16)
    b = int(b_hex, 16)
    return (a ^ b).bit_count()


# ============================================================================
# In-memory repository (demo / field-pilot mode)
# ============================================================================
class MemoryRepository:
    """Thread-safety is intentionally simple; uvicorn default runs a single
    event loop, so all access is cooperative on the loop."""

    def __init__(self, seed_dir: Path) -> None:
        self.seed_dir = seed_dir
        self.traditions: dict[str, dict] = {}
        self.regions: dict[str, dict] = {}
        self.agents: dict[str, dict] = {}
        self.artisans: dict[str, dict] = {}
        self.artworks: dict[str, dict] = {}
        self.passports: dict[str, dict] = {}
        self.events: list[dict] = []
        self.stories: list[dict] = []
        self.inquiries: list[dict] = []
        self._artwork_images: dict[str, bytes] = {}
        self._load_seed()

    # ------------------------------------------------------------------ seed
    def _load_seed(self) -> None:
        if not self.seed_dir.is_dir():
            return
        traditions = self._read_json("traditions.json")
        regions = self._read_json("regions.json")
        agents = self._read_json("agents.json")
        artisans = self._read_json("artisans.json")
        artworks = self._read_json("artworks.json")
        stories = self._read_json("stories.json")
        events = self._read_json("events.json")

        for row in traditions or []:
            row.setdefault("id", _uid())
            row.setdefault("created_at", _now())
            self.traditions[row["id"]] = row
        for row in regions or []:
            row.setdefault("id", _uid())
            row.setdefault("created_at", _now())
            self.regions[row["id"]] = row
        for row in agents or []:
            row.setdefault("id", _uid())
            row.setdefault("created_at", _now())
            self.agents[row["id"]] = row

        region_ids = {self._norm(row["village"]): row["id"] for row in self.regions.values()}
        trad_ids = {self._norm(row["title"]): row["id"] for row in self.traditions.values()}

        for row in artisans or []:
            row.setdefault("id", _uid())
            row.setdefault("created_at", _now())
            row.setdefault("verification_status", "pending")
            row.setdefault("generation_number", 1)
            if row.get("region_ref"):
                row["region_id"] = region_ids.get(self._norm(row["region_ref"]))
            if row.get("tradition_ref"):
                row["primary_tradition_id"] = trad_ids.get(self._norm(row["tradition_ref"]))
            self.artisans[row["id"]] = row

        artisan_ids = {self._norm(row["full_name"]): row["id"] for row in self.artisans.values()}
        for row in self.artisans.values():
            parent_ref = row.pop("parent_ref", None)
            if parent_ref:
                row["parent_artisan_id"] = artisan_ids.get(self._norm(parent_ref))

        for row in artworks or []:
            row.setdefault("id", _uid())
            row.setdefault("created_at", _now())
            row.setdefault("primary_image_url", "")
            if row.get("artisan_ref"):
                row["artisan_id"] = artisan_ids.get(self._norm(row["artisan_ref"]))
            self.artworks[row["id"]] = row

        self._load_local_artwork_media()

        for row in stories or []:
            row.setdefault("id", _uid())
            row.setdefault("created_at", _now())
            row.setdefault("language", "Odia")
            if row.get("artisan_ref"):
                row["artisan_id"] = artisan_ids.get(self._norm(row["artisan_ref"]))
            self.stories.append(row)

        artwork_ids = {self._norm(row["heritage_id"]): row["id"] for row in self.artworks.values()}
        for row in events or []:
            row.setdefault("id", _uid())
            row.setdefault("event_date", _now())
            if row.get("heritage_ref"):
                row["artwork_id"] = artwork_ids.get(self._norm(row["heritage_ref"]))
            row.pop("heritage_ref", None)
            row.pop("agent_ref", None)
            self.events.append(row)

        for row in self.artworks.values():
            passport_ref = row.pop("passport", None)
            if passport_ref and passport_ref.get("issued"):
                self._issue_seed_passport(row, passport_ref.get("issued_at"))

    def _load_local_artwork_media(self) -> None:
        """Ingest local artwork photographs referenced by seed JSON.

        Seed rows may point ``primary_image_url`` at a local file under
        ``media/...`` (resolved against the seed directory). The photograph
        is ingested into the blob store, perceptual fingerprints are
        recomputed from the real bytes (so hashes, the passport digest and
        duplicate detection all stay coherent with the actual plate), and
        the URL is rewritten to the served image endpoint.
        """
        if not self.artworks:
            return
        base = str(get_settings().passport_base_url).rstrip("/")
        engine = VisualFingerprintEngine()
        for row in self.artworks.values():
            ref = row.get("primary_image_url") or ""
            if not ref.startswith("media/"):
                continue
            path = self.seed_dir / ref
            if not path.is_file():
                continue
            image_bytes = path.read_bytes()
            try:
                fingerprints = engine.process_artwork_image(image_bytes)
            except ValueError:
                continue
            row["phash_signature"] = fingerprints["phash"]
            row["dhash_signature"] = fingerprints["dhash"]
            row["blur_score"] = fingerprints["blur_score"]
            if fingerprints["descriptors_bytes"]:
                # mirrors MemoryRepository.set_artwork_fingerprint()
                row["orb_descriptors"] = fingerprints["descriptors_bytes"]
                row["orb_keypoint_count"] = fingerprints.get("keypoint_count", 0)
            # mirrors MemoryRepository.save_artwork_image()
            self._artwork_images[row["id"]] = image_bytes
            row["primary_image_url"] = (
                f"{base}/api/v1/artworks/{row['heritage_id']}/image"
            )

    def _issue_seed_passport(self, artwork: dict, issued_at: str | None) -> None:
        from app.core.security import build_passport_digest

        artisan = self.artisans.get(artwork.get("artisan_id") or "")
        if artisan is None:
            return
        issued_at_iso = issued_at or _now()
        cryptographic_hash = build_passport_digest(
            artwork=artwork, artisan=artisan, issued_at=issued_at_iso
        )
        heritage_id = artwork["heritage_id"]
        self.passports[artwork["id"]] = {
            "id": _uid(),
            "artwork_id": artwork["id"],
            "cryptographic_hash": cryptographic_hash,
            "qr_code_url": f"/api/v1/passports/{heritage_id}/qr",
            "pdf_passport_url": f"/api/v1/passports/{heritage_id}/pdf",
            "issued_at": issued_at_iso,
        }

    def _read_json(self, name: str) -> list[dict]:
        path = self.seed_dir / name
        if not path.is_file():
            return []
        try:
            with path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError):
            return []

    @staticmethod
    def _norm(value: str) -> str:
        return re.sub(r"[^a-z0-9]", "", str(value).lower())

    # ---------------------------------------------------- generic helpers
    def _enrich_artisan(self, row: dict) -> dict:
        out = dict(row)
        region = self.regions.get(row.get("region_id") or "")
        trad = self.traditions.get(row.get("primary_tradition_id") or "")
        out["region_name"] = (
            f"{region['village']}, {region['district']}, {region['state']}" if region else ""
        )
        out["tradition_title"] = trad["title"] if trad else ""
        return out

    def _enrich_artwork(self, row: dict) -> dict:
        out = dict(row)
        artisan = self.artisans.get(row.get("artisan_id") or "")
        if artisan:
            out["artisan_name"] = artisan["full_name"]
            trad = self.traditions.get(artisan.get("primary_tradition_id") or "")
            out["tradition_title"] = trad["title"] if trad else ""
            out["verification_status"] = artisan.get("verification_status", "pending")
            region = self.regions.get(artisan.get("region_id") or "")
            out["origin_state"] = region["state"] if region else ""
        return out

    def _artwork_matches(
        self, row: dict, *, state: str | None, tradition_id: str | None,
        medium: str | None, century: int | None,
    ) -> bool:
        enriched = self._enrich_artwork(row)
        if state and enriched.get("origin_state", "").lower() != state.lower():
            return False
        if tradition_id and row.get("artisan_id"):
            artisan = self.artisans.get(row["artisan_id"] or "")
            if not artisan or str(artisan.get("primary_tradition_id") or "") != tradition_id:
                return False
        if medium and (row.get("medium") or "").lower() != medium.lower():
            return False
        if century is not None:
            year = row.get("creation_year") or 0
            if not (1 + (year - 1) // 100 == century):
                return False
        return True

    def _lineage(self, artisan_id: str, depth: int) -> list[dict]:
        members: list[dict] = []
        current = self.artisans.get(artisan_id)
        while current and depth <= 4:
            members.append(
                {
                    "id": current["id"],
                    "full_name": current["full_name"],
                    "generation_number": current.get("generation_number", 1),
                    "parent_artisan_id": current.get("parent_artisan_id"),
                    "depth": depth,
                    "verification_status": current.get("verification_status", "pending"),
                }
            )
            current = self.artisans.get(current.get("parent_artisan_id") or "")
            depth += 1
        # Match the SQL RECURSIVE CTE: generation numbers ascending,
        # furthest ancestor first, the queried artisan last.
        return list(reversed(members))

    # ----------------------------------------------------------- traditions
    async def list_traditions(self) -> list[dict]:
        rows = []
        for row in self.traditions.values():
            rows.append(
                {
                    **row,
                    "artisan_count": sum(
                        1
                        for a in self.artisans.values()
                        if a.get("primary_tradition_id") == row["id"]
                    ),
                    "region_count": sum(
                        1
                        for a in self.artisans.values()
                        if a.get("primary_tradition_id") == row["id"]
                    ),
                }
            )
        return rows

    async def get_tradition(self, tradition_id: str) -> dict | None:
        row = self.traditions.get(tradition_id)
        if not row:
            return None
        return {
            **row,
            "artisan_count": sum(
                1
                for a in self.artisans.values()
                if a.get("primary_tradition_id") == tradition_id
            ),
            "region_count": sum(
                1
                for a in self.artisans.values()
                if a.get("primary_tradition_id") == tradition_id
            ),
        }

    async def create_tradition(self, data: dict) -> dict:
        row = {"id": _uid(), "created_at": _now(), **data}
        self.traditions[row["id"]] = row
        return row

    # -------------------------------------------------------------- regions
    async def list_regions(self, district: str | None = None) -> list[dict]:
        rows = []
        for row in self.regions.values():
            if district and not district.lower() in row["district"].lower():
                continue
            rows.append(
                {
                    **row,
                    "artisan_count": sum(
                        1
                        for a in self.artisans.values()
                        if a.get("region_id") == row["id"]
                    ),
                }
            )
        return rows

    async def get_region(self, region_id: str) -> dict | None:
        row = self.regions.get(region_id)
        if not row:
            return None
        return {
            **row,
            "artisan_count": sum(
                1 for a in self.artisans.values() if a.get("region_id") == region_id
            ),
        }

    async def create_region(self, data: dict) -> dict:
        row = {"id": _uid(), "created_at": _now(), **data}
        self.regions[row["id"]] = row
        return row

    # --------------------------------------------------------------- agents
    async def create_agent(self, data: dict) -> dict:
        for existing in self.agents.values():
            if existing["badge_number"] == data["badge_number"]:
                raise ValueError(f"Badge number {data['badge_number']} already registered.")
        row = {"id": _uid(), "created_at": _now(), **data}
        self.agents[row["id"]] = row
        return row

    async def get_agent(self, agent_id: str) -> dict | None:
        return self.agents.get(agent_id)

    async def get_agent_by_badge(self, badge_number: str) -> dict | None:
        badge = badge_number.strip().lower()
        for row in self.agents.values():
            if str(row.get("badge_number", "")).strip().lower() == badge:
                return dict(row)
        return None

    # ------------------------------------------------------------- artisans
    async def list_artisans(
        self, region_id: str | None = None, tradition_id: str | None = None,
        status: str | None = None,
    ) -> list[dict]:
        rows = []
        for row in self.artisans.values():
            if region_id and row.get("region_id") != region_id:
                continue
            if tradition_id and row.get("primary_tradition_id") != tradition_id:
                continue
            if status and row.get("verification_status") != status:
                continue
            rows.append(self._enrich_artisan(row))
        return rows

    async def get_artisan(self, artisan_id: str) -> dict | None:
        row = self.artisans.get(artisan_id)
        return self._enrich_artisan(row) if row else None

    async def create_artisan(self, data: dict) -> dict:
        for existing in self.artisans.values():
            if (
                data.get("pehchan_card_id")
                and existing.get("pehchan_card_id") == data["pehchan_card_id"]
            ):
                raise ValueError(
                    f"Pehchan Card ID {data['pehchan_card_id']} already registered."
                )
        if data.get("parent_artisan_id") and data["parent_artisan_id"] not in self.artisans:
            raise ValueError("parent_artisan_id does not reference an existing artisan.")
        row = {
            "id": _uid(),
            "created_at": _now(),
            "verification_status": "pending",
            "generation_number": 1,
            **data,
        }
        parent = self.artisans.get(row.get("parent_artisan_id") or "")
        if parent:
            row["generation_number"] = int(parent.get("generation_number", 1)) + 1
        self.artisans[row["id"]] = row
        return self._enrich_artisan(row)

    async def set_artisan_status(self, artisan_id: str, status: str) -> dict | None:
        row = self.artisans.get(artisan_id)
        if not row:
            return None
        row["verification_status"] = status
        return self._enrich_artisan(row)

    async def lineage(self, artisan_id: str) -> list[dict]:
        return self._lineage(artisan_id, 1)

    # ------------------------------------------------------------- artworks
    async def list_artworks(
        self, artisan_id: str | None = None, state: str | None = None,
        tradition_id: str | None = None, medium: str | None = None,
        century: int | None = None,
    ) -> list[dict]:
        rows = []
        for row in self.artworks.values():
            if artisan_id and row.get("artisan_id") != artisan_id:
                continue
            if not self._artwork_matches(
                row, state=state, tradition_id=tradition_id,
                medium=medium, century=century,
            ):
                continue
            rows.append(self._enrich_artwork(row))
        return rows

    async def get_artwork_by_id(self, artwork_id: str) -> dict | None:
        row = self.artworks.get(artwork_id)
        return self._enrich_artwork(row) if row else None

    async def get_artwork_by_heritage(self, heritage_id: str) -> dict | None:
        for row in self.artworks.values():
            if row["heritage_id"] == heritage_id:
                return self._enrich_artwork(row)
        return None

    async def next_heritage_sequence(self, year: int) -> int:
        """Highest trailing sequence used for the year, plus one.

        Mirrors the SQL generator; max()-based so seeded identifiers with
        non-dense sequences never collide.
        """
        highest = 0
        for row in self.artworks.values():
            if row.get("creation_year") != year:
                continue
            try:
                highest = max(highest, int(str(row["heritage_id"]).rsplit("-", 1)[1]))
            except (ValueError, IndexError):
                continue
        return highest + 1

    async def create_artwork(self, data: dict) -> dict:
        if data.get("heritage_id") and self.get_artwork_by_heritage:
            for existing in self.artworks.values():
                if existing["heritage_id"] == data["heritage_id"]:
                    raise ValueError(f"Heritage ID {data['heritage_id']} already exists.")
        row = {"id": _uid(), "created_at": _now(), **data}
        self.artworks[row["id"]] = row
        return self._enrich_artwork(row)

    async def set_artwork_fingerprint(
        self, artwork_id: str, orb_bytes: bytes | None, keypoint_count: int
    ) -> None:
        row = self.artworks.get(artwork_id)
        if row:
            row["orb_descriptors"] = orb_bytes
            row["orb_keypoint_count"] = keypoint_count

    async def save_artwork_image(self, artwork_id: str, image_bytes: bytes) -> None:
        self._artwork_images[artwork_id] = image_bytes

    async def get_artwork_image(self, artwork_id: str) -> bytes | None:
        return self._artwork_images.get(artwork_id)

    async def set_artwork_image_url(self, artwork_id: str, url: str) -> None:
        row = self.artworks.get(artwork_id)
        if row:
            row["primary_image_url"] = url

    async def get_orb_fingerprint(self, artwork_id: str) -> tuple[bytes | None, int]:
        row = self.artworks.get(artwork_id)
        if not row:
            return None, 0
        return row.get("orb_descriptors"), row.get("orb_keypoint_count", 0)

    async def find_similar_by_hash(
        self, phash: str, dhash: str, max_hamming: int
    ) -> list[dict]:
        results = []
        for row in self.artworks.values():
            if not row.get("phash_signature") or not row.get("dhash_signature"):
                continue
            pd = _hamming(phash, row["phash_signature"])
            dd = _hamming(dhash, row["dhash_signature"])
            if pd <= max_hamming and dd <= max_hamming:
                results.append(
                    {
                        "artwork_id": row["id"],
                        "heritage_id": row["heritage_id"],
                        "title": row["title"],
                        "phash_distance": pd,
                        "dhash_distance": dd,
                    }
                )
        return results

    async def list_hash_candidates(
        self, phash: str, dhash: str
    ) -> list[dict]:
        """Every fingerprinted artwork with hash distances — no Hamming gate.

        Structural-scan fallback for camera captures whose perceptual
        hashes drift beyond the pre-filter (rotation, angle, lighting);
        ORB then decides who really matches.
        """
        results = []
        for row in self.artworks.values():
            if not row.get("phash_signature") or not row.get("dhash_signature"):
                continue
            results.append(
                {
                    "artwork_id": row["id"],
                    "heritage_id": row["heritage_id"],
                    "title": row["title"],
                    "phash_distance": _hamming(phash, row["phash_signature"]),
                    "dhash_distance": _hamming(dhash, row["dhash_signature"]),
                }
            )
        return results

    # -------------------------------------------------------------- stories
    async def create_story(self, data: dict) -> dict:
        row = {"id": _uid(), "created_at": _now(), **data}
        self.stories.append(row)
        return row

    async def stories_by_artisan(self, artisan_id: str) -> list[dict]:
        return [s for s in self.stories if s.get("artisan_id") == artisan_id]

    # -------------------------------------------------------------- events
    async def create_event(self, artwork_id: str, data: dict) -> dict:
        row = {"id": _uid(), "artwork_id": artwork_id, "event_date": _now(), **data}
        self.events.append(row)
        return row

    async def events_by_artwork(self, artwork_id: str) -> list[dict]:
        return sorted(
            [e for e in self.events if e.get("artwork_id") == artwork_id],
            key=lambda e: e.get("event_date", ""),
        )

    # ----------------------------------------------------------- passports
    async def create_passport(self, artwork_id: str, data: dict) -> dict:
        row = {"id": _uid(), "artwork_id": artwork_id, "issued_at": _now(), **data}
        self.passports[artwork_id] = row
        return row

    async def get_passport_by_artwork(self, artwork_id: str) -> dict | None:
        return self.passports.get(artwork_id)

    async def get_passport_by_heritage(self, heritage_id: str) -> dict | None:
        row = await self.get_artwork_by_heritage(heritage_id)
        if not row:
            return None
        passport = self.passports.get(row["id"])
        return {**passport, "artwork": row} if passport else None

    # ------------------------------------------------------------ inquiries
    async def create_inquiry(self, data: dict) -> dict:
        row = {"id": _uid(), "created_at": _now(), "status": "new", **data}
        self.inquiries.append(row)
        return self._enrich_inquiry(row)

    async def list_inquiries(
        self, artisan_id: str | None = None, status: str | None = None
    ) -> list[dict]:
        rows = []
        for row in self.inquiries:
            if artisan_id and row.get("artisan_id") != artisan_id:
                continue
            if status and row.get("status") != status:
                continue
            rows.append(self._enrich_inquiry(row))
        return rows

    async def set_inquiry_status(self, inquiry_id: str, status: str) -> dict | None:
        for row in self.inquiries:
            if row["id"] == inquiry_id:
                row["status"] = status
                return self._enrich_inquiry(row)
        return None

    def _enrich_inquiry(self, row: dict) -> dict:
        out = dict(row)
        artisan = self.artisans.get(row.get("artisan_id") or "")
        out["artisan_name"] = artisan["full_name"] if artisan else ""
        return out

    async def close(self) -> None:
        return None


# ============================================================================
# PostgreSQL repository (Supabase-compatible)
# ============================================================================
class PostgresRepository:
    def __init__(self, dsn: str) -> None:
        self.dsn = dsn
        self.pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        if self.pool is None:
            self.pool = await asyncpg.create_pool(
                self.dsn, min_size=1, max_size=10, command_timeout=30
            )
        async with self.pool.acquire() as conn:
            await conn.execute("SELECT 1")

    @staticmethod
    def _r(record: asyncpg.Record) -> dict:
        return dict(record)

    def _rows(self, records: list[asyncpg.Record]) -> list[dict]:
        return [self._r(r) for r in records]

    # ----------------------------------------------------------- traditions
    async def list_traditions(self) -> list[dict]:
        async with self.pool.acquire() as conn:
            return self._rows(
                await conn.fetch(
                    """
                    SELECT t.*,
                           (SELECT COUNT(*) FROM artisans a
                             WHERE a.primary_tradition_id = t.id) AS artisan_count,
                           (SELECT COUNT(*) FROM artisans a
                             WHERE a.primary_tradition_id = t.id) AS region_count
                    FROM traditions t ORDER BY t.created_at
                    """
                )
            )

    async def get_tradition(self, tradition_id: str) -> dict | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                SELECT t.*,
                       (SELECT COUNT(*) FROM artisans a
                         WHERE a.primary_tradition_id = t.id) AS artisan_count,
                       (SELECT COUNT(*) FROM artisans a
                         WHERE a.primary_tradition_id = t.id) AS region_count
                FROM traditions t WHERE t.id = $1
                """,
                uuid.UUID(tradition_id),
            )
            return self._r(record) if record else None

    async def create_tradition(self, data: dict) -> dict:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO traditions (title, native_title, gi_tag_number, origin_state,
                                        description, technique_breakdown, cover_image_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
                """,
                data["title"], data.get("native_title"), data.get("gi_tag_number"),
                data["origin_state"], data["description"], data["technique_breakdown"],
                data.get("cover_image_url"),
            )
            return self._r(record)

    # -------------------------------------------------------------- regions
    async def list_regions(self, district: str | None = None) -> list[dict]:
        clauses = []
        params: list[str] = []
        if district:
            params.append(district)
            clauses.append("r.district ILIKE $1")
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        async with self.pool.acquire() as conn:
            return self._rows(
                await conn.fetch(
                    f"""
                    SELECT r.*,
                           (SELECT COUNT(*) FROM artisans a WHERE a.region_id = r.id)
                           AS artisan_count
                    FROM regions r {where} ORDER BY r.village
                    """,
                    *params,
                )
            )

    async def get_region(self, region_id: str) -> dict | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                SELECT r.*,
                       (SELECT COUNT(*) FROM artisans a WHERE a.region_id = r.id)
                       AS artisan_count
                FROM regions r WHERE r.id = $1
                """,
                uuid.UUID(region_id),
            )
            return self._r(record) if record else None

    async def create_region(self, data: dict) -> dict:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO regions (state, district, village, latitude, longitude,
                                     cultural_history)
                VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
                """,
                data["state"], data["district"], data["village"], data["latitude"],
                data["longitude"], data.get("cultural_history"),
            )
            return self._r(record)

    # --------------------------------------------------------------- agents
    async def create_agent(self, data: dict) -> dict:
        async with self.pool.acquire() as conn:
            try:
                record = await conn.fetchrow(
                    """
                    INSERT INTO field_agents (full_name, ngo_organization,
                                              assigned_region_id, badge_number)
                    VALUES ($1, $2, $3, $4) RETURNING *
                    """,
                    data["full_name"], data["ngo_organization"],
                    uuid.UUID(data["assigned_region_id"]), data["badge_number"],
                )
                return self._r(record)
            except asyncpg.UniqueViolationError:
                raise ValueError(
                    f"Badge number {data['badge_number']} already registered."
                ) from None

    async def get_agent(self, agent_id: str) -> dict | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                "SELECT * FROM field_agents WHERE id = $1", uuid.UUID(agent_id)
            )
            return self._r(record) if record else None

    async def get_agent_by_badge(self, badge_number: str) -> dict | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                "SELECT * FROM field_agents WHERE LOWER(badge_number) = LOWER($1)",
                badge_number.strip(),
            )
            return self._r(record) if record else None

    # ------------------------------------------------------------- artisans
    _ARTISAN_SELECT = """
        SELECT a.*, r.village || ', ' || r.district || ', ' || r.state AS region_name,
               t.title AS tradition_title
        FROM artisans a
        LEFT JOIN regions r ON r.id = a.region_id
        LEFT JOIN traditions t ON t.id = a.primary_tradition_id
    """

    async def list_artisans(
        self, region_id: str | None = None, tradition_id: str | None = None,
        status: str | None = None,
    ) -> list[dict]:
        clauses = []
        params: list[Any] = []
        if region_id:
            params.append(uuid.UUID(region_id))
            clauses.append(f"a.region_id = ${len(params)}")
        if tradition_id:
            params.append(uuid.UUID(tradition_id))
            clauses.append(f"a.primary_tradition_id = ${len(params)}")
        if status:
            params.append(status)
            clauses.append(f"a.verification_status = ${len(params)}")
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        async with self.pool.acquire() as conn:
            return self._rows(
                await conn.fetch(
                    f"{self._ARTISAN_SELECT} {where} ORDER BY a.created_at",
                    *params,
                )
            )

    async def get_artisan(self, artisan_id: str) -> dict | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                f"{self._ARTISAN_SELECT} WHERE a.id = $1", uuid.UUID(artisan_id)
            )
            return self._r(record) if record else None

    async def create_artisan(self, data: dict) -> dict:
        async with self.pool.acquire() as conn:
            try:
                record = await conn.fetchrow(
                    """
                    INSERT INTO artisans (full_name, pehchan_card_id, biography,
                                          generation_number, parent_artisan_id,
                                          region_id, primary_tradition_id,
                                          profile_image_url, verification_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
                    """,
                    data["full_name"], data.get("pehchan_card_id"), data["biography"],
                    int(data.get("generation_number", 1)),
                    uuid.UUID(data["parent_artisan_id"]) if data.get("parent_artisan_id") else None,
                    uuid.UUID(data["region_id"]), uuid.UUID(data["primary_tradition_id"]),
                    data.get("profile_image_url"), "pending",
                )
                return await self.get_artisan(str(record["id"]))
            except asyncpg.UniqueViolationError:
                raise ValueError(
                    "Pehchan Card ID is already registered to another artisan."
                ) from None

    async def set_artisan_status(self, artisan_id: str, status: str) -> dict | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                UPDATE artisans SET verification_status = $2 WHERE id = $1 RETURNING id
                """,
                uuid.UUID(artisan_id), status,
            )
            if not record:
                return None
        return await self.get_artisan(str(record["id"]))

    async def lineage(self, artisan_id: str) -> list[dict]:
        async with self.pool.acquire() as conn:
            return self._rows(
                await conn.fetch(
                    """
                    WITH RECURSIVE artisan_lineage AS (
                        SELECT a.id, a.full_name, a.generation_number,
                               a.parent_artisan_id, a.verification_status, 1 AS depth
                        FROM artisans a
                        WHERE a.id = $1
                        UNION ALL
                        SELECT a.id, a.full_name, a.generation_number,
                               a.parent_artisan_id, a.verification_status, l.depth + 1
                        FROM artisans a
                        JOIN artisan_lineage l ON a.parent_artisan_id = l.id
                        WHERE l.depth < 4
                    )
                    SELECT id, full_name, generation_number, parent_artisan_id,
                           verification_status, depth
                    FROM artisan_lineage
                    ORDER BY generation_number ASC
                    """,
                    uuid.UUID(artisan_id),
                )
            )

    # ------------------------------------------------------------- artworks
    _ARTWORK_SELECT = """
        SELECT ar.*, a.full_name AS artisan_name,
               t.title AS tradition_title, a.verification_status,
               r.state AS origin_state
        FROM artworks ar
        JOIN artisans a ON a.id = ar.artisan_id
        LEFT JOIN traditions t ON t.id = a.primary_tradition_id
        LEFT JOIN regions r ON r.id = a.region_id
    """

    async def list_artworks(
        self, artisan_id: str | None = None, state: str | None = None,
        tradition_id: str | None = None, medium: str | None = None,
        century: int | None = None,
    ) -> list[dict]:
        clauses: list[str] = []
        params: list = []
        if artisan_id:
            params.append(uuid.UUID(artisan_id))
            clauses.append(f"ar.artisan_id = ${len(params)}")
        if state:
            params.append(state)
            clauses.append(f"r.state ILIKE ${len(params)}")
        if tradition_id:
            params.append(uuid.UUID(tradition_id))
            clauses.append(f"a.primary_tradition_id = ${len(params)}")
        if medium:
            params.append(medium)
            clauses.append(f"ar.medium ILIKE ${len(params)}")
        if century is not None:
            params.append((int(century) - 1) * 100 + 1)
            clauses.append(f"ar.creation_year >= ${len(params)}")
            params.append(int(century) * 100)
            clauses.append(f"ar.creation_year <= ${len(params)}")
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        async with self.pool.acquire() as conn:
            return self._rows(
                await conn.fetch(
                    f"{self._ARTWORK_SELECT} {where} ORDER BY ar.created_at",
                    *params,
                )
            )

    async def get_artwork_by_id(self, artwork_id: str) -> dict | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                f"{self._ARTWORK_SELECT} WHERE ar.id = $1", uuid.UUID(artwork_id)
            )
            return self._r(record) if record else None

    async def get_artwork_by_heritage(self, heritage_id: str) -> dict | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                f"{self._ARTWORK_SELECT} WHERE ar.heritage_id = $1", heritage_id
            )
            return self._r(record) if record else None

    async def next_heritage_sequence(self, year: int) -> int:
        async with self.pool.acquire() as conn:
            result = await conn.fetchval(
                r"""
                SELECT COALESCE(MAX((regexp_match(heritage_id, '-(\d{6})$'))[1])::INT, 0) + 1
                FROM artworks WHERE creation_year = $1
                """,
                year,
            )
            return int(result or 1)

    async def create_artwork(self, data: dict) -> dict:
        async with self.pool.acquire() as conn:
            try:
                record = await conn.fetchrow(
                    """
                    INSERT INTO artworks (heritage_id, title, dimensions, medium,
                                          creation_year, artisan_id, phash_signature,
                                          dhash_signature, primary_image_url, blur_score)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
                    """,
                    data["heritage_id"], data["title"], data.get("dimensions"),
                    data.get("medium"), int(data["creation_year"]),
                    uuid.UUID(data["artisan_id"]), data.get("phash_signature"),
                    data.get("dhash_signature"), data.get("primary_image_url", ""),
                    data.get("blur_score"),
                )
                return await self.get_artwork_by_id(str(record["id"]))
            except asyncpg.UniqueViolationError:
                raise ValueError(
                    f"Heritage ID {data['heritage_id']} already exists."
                ) from None

    async def set_artwork_fingerprint(
        self, artwork_id: str, orb_bytes: bytes | None, keypoint_count: int
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE artworks
                SET orb_descriptors = $2, orb_keypoint_count = $3
                WHERE id = $1
                """,
                uuid.UUID(artwork_id),
                memoryview(orb_bytes) if orb_bytes else None,
                keypoint_count,
            )

    async def save_artwork_image(self, artwork_id: str, image_bytes: bytes) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO artwork_image_blobs (artwork_id, image) VALUES ($1, $2)
                ON CONFLICT (artwork_id) DO UPDATE SET image = EXCLUDED.image
                """,
                uuid.UUID(artwork_id),
                memoryview(image_bytes),
            )

    async def get_artwork_image(self, artwork_id: str) -> bytes | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                "SELECT image FROM artwork_image_blobs WHERE artwork_id = $1",
                uuid.UUID(artwork_id),
            )
            if not record or not record["image"]:
                return None
            return bytes(record["image"])

    async def set_artwork_image_url(self, artwork_id: str, url: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE artworks SET primary_image_url = $2 WHERE id = $1",
                uuid.UUID(artwork_id), url,
            )

    async def get_orb_fingerprint(self, artwork_id: str) -> tuple[bytes | None, int]:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                "SELECT orb_descriptors, orb_keypoint_count FROM artworks WHERE id = $1",
                uuid.UUID(artwork_id),
            )
            if not record:
                return None, 0
            blob = record["orb_descriptors"]
            return bytes(blob) if blob else None, int(record["orb_keypoint_count"] or 0)

    async def find_similar_by_hash(
        self, phash: str, dhash: str, max_hamming: int
    ) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id AS artwork_id, heritage_id, title,
                       phash_signature, dhash_signature
                FROM artworks
                WHERE phash_signature IS NOT NULL AND dhash_signature IS NOT NULL
                """
            )
        results = []
        for row in rows:
            pd = _hamming(phash, row["phash_signature"])
            dd = _hamming(dhash, row["dhash_signature"])
            if pd <= max_hamming and dd <= max_hamming:
                results.append(
                    {
                        "artwork_id": str(row["artwork_id"]),
                        "heritage_id": row["heritage_id"],
                        "title": row["title"],
                        "phash_distance": pd,
                        "dhash_distance": dd,
                    }
                )
        return results

    async def list_hash_candidates(
        self, phash: str, dhash: str
    ) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id AS artwork_id, heritage_id, title,
                       phash_signature, dhash_signature
                FROM artworks
                WHERE phash_signature IS NOT NULL AND dhash_signature IS NOT NULL
                """
            )
        return [
            {
                "artwork_id": str(row["artwork_id"]),
                "heritage_id": row["heritage_id"],
                "title": row["title"],
                "phash_distance": _hamming(phash, row["phash_signature"]),
                "dhash_distance": _hamming(dhash, row["dhash_signature"]),
            }
            for row in rows
        ]

    # -------------------------------------------------------------- stories
    async def create_story(self, data: dict) -> dict:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO stories (artisan_id, title, audio_recording_url,
                                     transcript, language)
                VALUES ($1, $2, $3, $4, $5) RETURNING *
                """,
                uuid.UUID(data["artisan_id"]), data["title"],
                data["audio_recording_url"], data["transcript"], data.get("language"),
            )
            return self._r(record)

    async def stories_by_artisan(self, artisan_id: str) -> list[dict]:
        async with self.pool.acquire() as conn:
            return self._rows(
                await conn.fetch(
                    """
                    SELECT * FROM stories WHERE artisan_id = $1 ORDER BY created_at
                    """,
                    uuid.UUID(artisan_id),
                )
            )

    # -------------------------------------------------------------- events
    async def create_event(self, artwork_id: str, data: dict) -> dict:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO provenance_events (artwork_id, event_type, location_name,
                                               description, recorded_by_agent_id)
                VALUES ($1, $2, $3, $4, $5) RETURNING *
                """,
                uuid.UUID(artwork_id), data["event_type"], data["location_name"],
                data["description"],
                uuid.UUID(data["recorded_by_agent_id"])
                if data.get("recorded_by_agent_id") else None,
            )
            return self._r(record)

    async def events_by_artwork(self, artwork_id: str) -> list[dict]:
        async with self.pool.acquire() as conn:
            return self._rows(
                await conn.fetch(
                    """
                    SELECT * FROM provenance_events WHERE artwork_id = $1
                    ORDER BY event_date ASC
                    """,
                    uuid.UUID(artwork_id),
                )
            )

    # ----------------------------------------------------------- passports
    async def create_passport(self, artwork_id: str, data: dict) -> dict:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO heritage_passports (artwork_id, cryptographic_hash,
                                                qr_code_url, pdf_passport_url)
                VALUES ($1, $2, $3, $4) RETURNING *
                """,
                uuid.UUID(artwork_id), data["cryptographic_hash"],
                data["qr_code_url"], data.get("pdf_passport_url"),
            )
            return self._r(record)

    async def get_passport_by_artwork(self, artwork_id: str) -> dict | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                "SELECT * FROM heritage_passports WHERE artwork_id = $1",
                uuid.UUID(artwork_id),
            )
            return self._r(record) if record else None

    async def get_passport_by_heritage(self, heritage_id: str) -> dict | None:
        artwork = await self.get_artwork_by_heritage(heritage_id)
        if not artwork:
            return None
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                "SELECT * FROM heritage_passports WHERE artwork_id = $1",
                uuid.UUID(artwork["id"]),
            )
            return {**self._r(record), "artwork": artwork} if record else None

    # ------------------------------------------------------------ inquiries
    async def create_inquiry(self, data: dict) -> dict:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO institutional_inquiries (artisan_id, institution_name,
                    institution_type, inquiry_type, message, contact_email, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'new') RETURNING id
                """,
                uuid.UUID(data["artisan_id"]), data["institution_name"],
                data.get("institution_type", "Institution"), data["inquiry_type"],
                data["message"], data.get("contact_email"),
            )
            return await self.get_inquiry(str(record["id"]))

    async def get_inquiry(self, inquiry_id: str) -> dict | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                SELECT i.*, a.full_name AS artisan_name
                FROM institutional_inquiries i
                JOIN artisans a ON a.id = i.artisan_id
                WHERE i.id = $1
                """,
                uuid.UUID(inquiry_id),
            )
            return self._r(record) if record else None

    async def list_inquiries(
        self, artisan_id: str | None = None, status: str | None = None
    ) -> list[dict]:
        clauses = []
        params: list[Any] = []
        if artisan_id:
            params.append(uuid.UUID(artisan_id))
            clauses.append(f"i.artisan_id = ${len(params)}")
        if status:
            params.append(status)
            clauses.append(f"i.status = ${len(params)}")
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT i.*, a.full_name AS artisan_name
                FROM institutional_inquiries i
                JOIN artisans a ON a.id = i.artisan_id
                {where} ORDER BY i.created_at DESC
                """,
                *params,
            )
            return self._rows(rows)

    async def set_inquiry_status(self, inquiry_id: str, status: str) -> dict | None:
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                UPDATE institutional_inquiries SET status = $2 WHERE id = $1
                RETURNING id
                """,
                uuid.UUID(inquiry_id), status,
            )
            if not record:
                return None
        return await self.get_inquiry(str(record["id"]))

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()
            self.pool = None


# ============================================================================
# Factory
# ============================================================================
_repository: MemoryRepository | PostgresRepository | None = None


async def get_repository() -> MemoryRepository | PostgresRepository:
    global _repository
    if _repository is None:
        settings = get_settings()
        if settings.is_postgres:
            repo = PostgresRepository(str(settings.database_url))
            await repo.connect()
        else:
            repo = MemoryRepository(settings.resolved_seed_dir)
        _repository = repo
    return _repository


async def shutdown_repository() -> None:
    global _repository
    if _repository is not None:
        await _repository.close()
        _repository = None