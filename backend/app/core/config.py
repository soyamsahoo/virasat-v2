"""Application settings.

All values may be overridden via environment variables prefixed with
``VIRASAT_`` or a ``backend/.env`` file. Without ``VIRASAT_DATABASE_URL``
the service boots in demo mode backed by an in-memory store pre-seeded
from ``seed_data/`` — ideal for local development and field pilots.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_prefix="VIRASAT_",
        extra="ignore",
    )

    # --- Persistence -----------------------------------------------------
    database_url: str | None = None
    seed_data_dir: Path = PROJECT_ROOT / "seed_data"

    @property
    def resolved_seed_dir(self) -> Path:
        """Seed location that actually exists on this deployment.

        Locally the project-root ``seed_data/`` is used; on Vercel only the
        ``backend/`` root directory is shipped, so a committed copy at
        ``backend/seed_data/`` is resolved instead.
        """
        if self.seed_data_dir.is_dir():
            return self.seed_data_dir
        deployed_copy = BACKEND_ROOT / "seed_data"
        return deployed_copy if deployed_copy.is_dir() else self.seed_data_dir

    # --- Security --------------------------------------------------------
    api_key: str | None = None
    # Shared secret held by the coordinating NGO: registration of a field
    # agent is rejected unless this code accompanies the request, proving
    # the onboarding was authorised. Override via VIRASAT_COORDINATOR_ACCESS_CODE.
    coordinator_access_code: str = "RHC-VIRASAT-2026"
    # Demo PIN issued to seeded field agents (memory mode) so the pilot
    # has working credentials out of the box.
    seed_agent_pin: str = "246810"

    # --- Computer vision -------------------------------------------------
    blur_threshold: float = 100.0
    hash_hamming_threshold: int = 10
    orb_keypoints: int = 1000

    # --- Heritage identifiers -------------------------------------------
    heritage_year: int = 2026

    # --- URL topology ----------------------------------------------------
    passport_base_url: str = "http://localhost:8000"
    verify_frontend_url: str = "http://localhost:4173/verify"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]

    @property
    def is_postgres(self) -> bool:
        return bool(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()