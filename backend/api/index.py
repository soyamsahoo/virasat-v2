"""Vercel serverless entrypoint (ASGI).

Deploy this project on Vercel with:
    Root Directory: backend
    Build Command:  (none)
    Install:        pip install -r requirements.txt (automatic)

Vercel imports the `app` object from `api/index.py` and serves it as an
ASGI application. The service runs in memory mode pre-seeded from
`backend/seed_data/` unless VIRASAT_DATABASE_URL is configured.
"""
from app.main import app
