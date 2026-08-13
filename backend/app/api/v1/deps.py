"""Router dependencies."""
from __future__ import annotations

from fastapi import Request

from app.core.database import MemoryRepository, PostgresRepository, get_repository

Repository = MemoryRepository | PostgresRepository


async def get_repo(request: Request) -> Repository:
    return request.app.state.repository


__all__ = ["Repository", "get_repo"]