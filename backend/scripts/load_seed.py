"""Load the Raghurajpur Pattachitra anchor dataset into PostgreSQL.

Usage:
    python -m scripts.load_seed

Resolves ``ref`` fields (parent lineage, regions, traditions) to UUIDs,
mirroring the resolution the memory repository performs on startup.
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
import uuid
from pathlib import Path

import asyncpg

from app.core.config import get_settings


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def read_json(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


async def run() -> None:
    settings = get_settings()
    if not settings.is_postgres:
        sys.exit("VIRASAT_DATABASE_URL is not set.")
    seed = settings.resolved_seed_dir
    conn = await asyncpg.connect(str(settings.database_url))
    try:
        for name in ("traditions.json", "regions.json"):
            rows = read_json(seed / name)
            if not rows:
                continue
            table = name.replace(".json", "")
            if table == "traditions":
                for row in rows:
                    await conn.execute(
                        """
                        INSERT INTO traditions (title, native_title, gi_tag_number,
                                                origin_state, description,
                                                technique_breakdown, cover_image_url)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        ON CONFLICT DO NOTHING
                        """,
                        row["title"], row.get("native_title"), row.get("gi_tag_number"),
                        row["origin_state"], row["description"],
                        row["technique_breakdown"], row.get("cover_image_url"),
                    )
            elif table == "regions":
                for row in rows:
                    await conn.execute(
                        """
                        INSERT INTO regions (state, district, village, latitude,
                                             longitude, cultural_history)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        """,
                        row["state"], row["district"], row["village"],
                        row["latitude"], row["longitude"], row.get("cultural_history"),
                    )

        region_ids = {
            norm(r["village"]): r["id"]
            for r in await conn.fetch("SELECT id, village FROM regions")
        }
        trad_ids = {
            norm(t["title"]): t["id"]
            for t in await conn.fetch("SELECT id, title FROM traditions")
        }

        artisan_rows = read_json(seed / "artisans.json")
        artisan_ids: dict[str, str] = {}
        for row in artisan_rows:
            artisan_id = str(uuid.uuid4())
            artisan_ids[norm(row["full_name"])] = artisan_id
            await conn.execute(
                """
                INSERT INTO artisans (id, full_name, pehchan_card_id, biography,
                                      generation_number, region_id, primary_tradition_id,
                                      verification_status, profile_image_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                artisan_id, row["full_name"], row.get("pehchan_card_id"),
                row["biography"], row.get("generation_number", 1),
                uuid.UUID(region_ids[norm(row["region_ref"])]),
                uuid.UUID(trad_ids[norm(row["tradition_ref"])]),
                row.get("verification_status", "pending"), row.get("profile_image_url"),
            )
        for row in artisan_rows:
            parent_ref = row.get("parent_ref")
            if not parent_ref:
                continue
            await conn.execute(
                "UPDATE artisans SET parent_artisan_id = $1 WHERE id = $2",
                uuid.UUID(artisan_ids[norm(parent_ref)]),
                uuid.UUID(artisan_ids[norm(row["full_name"])]),
            )

        artwork_rows = read_json(seed / "artworks.json")
        artwork_ids: dict[str, str] = {}
        for row in artwork_rows:
            artwork_id = str(uuid.uuid4())
            artwork_ids[norm(row["heritage_id"])] = artwork_id
            await conn.execute(
                """
                INSERT INTO artworks (id, heritage_id, title, dimensions, medium,
                                      creation_year, artisan_id, phash_signature,
                                      dhash_signature, primary_image_url, blur_score)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                artwork_id, row["heritage_id"], row["title"], row.get("dimensions"),
                row["medium"], row["creation_year"],
                uuid.UUID(artisan_ids[norm(row["artisan_ref"])]),
                row.get("phash_signature"), row.get("dhash_signature"),
                row.get("primary_image_url", ""), row.get("blur_score"),
            )

        agent_rows = read_json(seed / "agents.json")
        agent_ids: dict[str, str] = {}
        for row in agent_rows:
            agent_id = str(uuid.uuid4())
            agent_ids[norm(row["full_name"])] = agent_id
            await conn.execute(
                """
                INSERT INTO field_agents (id, full_name, ngo_organization,
                                          assigned_region_id, badge_number)
                VALUES ($1, $2, $3, $4, $5)
                """,
                agent_id, row["full_name"], row["ngo_organization"],
                uuid.UUID(region_ids[norm(row["region_ref"])]), row["badge_number"],
            )

        for row in read_json(seed / "stories.json"):
            await conn.execute(
                """
                INSERT INTO stories (artisan_id, title, audio_recording_url,
                                     transcript, language)
                VALUES ($1, $2, $3, $4, $5)
                """,
                uuid.UUID(artisan_ids[norm(row["artisan_ref"])]), row["title"],
                row.get("audio_recording_url", ""), row["transcript"],
                row.get("language", "Odia"),
            )

        for row in read_json(seed / "events.json"):
            await conn.execute(
                """
                INSERT INTO provenance_events (artwork_id, event_type, location_name,
                                               description, recorded_by_agent_id)
                VALUES ($1, $2, $3, $4, $5)
                """,
                uuid.UUID(artwork_ids[norm(row["heritage_ref"])]),
                row["event_type"], row["location_name"], row["description"],
                uuid.UUID(agent_ids[norm(row["agent_ref"])])
                if row.get("agent_ref") in agent_ids else None,
            )

        # --- Heritage passports: digests must be computed, never faked ----
        from app.core.security import build_passport_digest

        for row in read_json(seed / "artworks.json"):
            passport_ref = row.get("passport")
            if not passport_ref or not passport_ref.get("issued"):
                continue
            heritage_id = row["heritage_id"]
            artwork_row = await conn.fetchrow(
                """
                SELECT ar.*, a.full_name, a.pehchan_card_id, a.generation_number
                FROM artworks ar JOIN artisans a ON a.id = ar.artisan_id
                WHERE ar.heritage_id = $1
                """,
                heritage_id,
            )
            if artwork_row is None:
                continue
            issued_at = passport_ref.get("issued_at", "2026-01-15T00:00:00+00:00")
            digest = build_passport_digest(
                artwork=dict(artwork_row), artisan=dict(artwork_row),
                issued_at=issued_at,
            )
            await conn.execute(
                """
                INSERT INTO heritage_passports (artwork_id, cryptographic_hash,
                                                qr_code_url, pdf_passport_url,
                                                issued_at)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (artwork_id) DO NOTHING
                """,
                uuid.UUID(artwork_ids[norm(heritage_id)]), digest,
                f"/api/v1/passports/{heritage_id}/qr",
                f"/api/v1/passports/{heritage_id}/pdf", issued_at,
            )

        print("Seed dataset loaded into PostgreSQL.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run())