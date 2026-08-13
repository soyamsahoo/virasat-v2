"""VIRASAT (विरासत) — FastAPI application entrypoint.

Run with:
    uvicorn app.main:app --reload        # from backend/
or  python main.py                       # convenience launcher
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.database import get_repository, shutdown_repository


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    repository = await get_repository()
    app.state.repository = repository
    app.state.mode = "postgres" if settings.is_postgres else "memory"
    app.state.seed_dir = str(settings.resolved_seed_dir)
    yield
    await shutdown_repository()


settings = get_settings()
app = FastAPI(
    title="VIRASAT (विरासत) API — India's Digital Memory System",
    description=(
        "Cultural heritage archival platform: artisan lineages, provenance "
        "registry, computer-vision fingerprinting, and cryptographic "
        "heritage passports."
    ),
    version=__version__,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["system"])
async def health() -> dict:
    repository = getattr(app.state, "repository", None)
    return {
        "status": "ok",
        "version": __version__,
        "mode": getattr(app.state, "mode", "memory"),
        "seed_data_dir": getattr(app.state, "seed_dir", None),
        "repository_initialised": repository is not None,
    }