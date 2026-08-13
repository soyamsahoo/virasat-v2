"""Aggregate API router."""
from fastapi import APIRouter

from app.api.v1 import (
    agents,
    artisans,
    artworks,
    inquiries,
    passports,
    regions,
    traditions,
    verification,
)

api_router = APIRouter()
api_router.include_router(traditions.router)
api_router.include_router(regions.router)
api_router.include_router(agents.router)
api_router.include_router(artisans.router)
api_router.include_router(artworks.router)
api_router.include_router(passports.router)
api_router.include_router(verification.router)
api_router.include_router(inquiries.router)