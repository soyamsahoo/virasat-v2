"""Bootstrap the PostgreSQL schema.

Usage:
    python -m scripts.init_db

Executes ``app/models/ddl.sql`` against ``VIRASAT_DATABASE_URL``.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import asyncpg

from app.core.config import get_settings

DDL_PATH = Path(__file__).resolve().parents[1] / "app" / "models" / "ddl.sql"


async def run() -> None:
    settings = get_settings()
    if not settings.is_postgres:
        sys.exit(
            "VIRASAT_DATABASE_URL is not set. Export it, or stay in memory mode."
        )
    ddl = DDL_PATH.read_text(encoding="utf-8")
    conn = await asyncpg.connect(str(settings.database_url))
    try:
        await conn.execute(ddl)
        print(f"Schema applied from {DDL_PATH.name}.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run())