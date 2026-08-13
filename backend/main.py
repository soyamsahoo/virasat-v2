"""VIRASAT API development launcher.

Usage:
    python main.py                # uvicorn with auto-reload on port 8000
    uvicorn app.main:app --reload # alternative entry
"""
import uvicorn

from app.main import app

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )