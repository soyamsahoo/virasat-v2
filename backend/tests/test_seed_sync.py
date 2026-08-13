"""Guards against seed-data drift between the two committed copies.

``backend/seed_data/`` is the canonical copy shipped to serverless
deployments (Vercel ships only ``backend/``); the project-root copy is used
for local development. Both must stay byte-identical.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ROOT_SEED = REPO_ROOT / "seed_data"
BACKEND_SEED = REPO_ROOT / "backend" / "seed_data"


def _tree_hashes(base: Path):
    hashes = {}
    for path in sorted(base.rglob("*")):
        if path.is_file():
            hashes[str(path.relative_to(base))] = hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
    return hashes


def test_json_seed_files_synced():
    assert ROOT_SEED.is_dir() and BACKEND_SEED.is_dir()
    root = _tree_hashes(ROOT_SEED)
    backend = _tree_hashes(BACKEND_SEED)
    drift = set(root) ^ set(backend)
    assert not drift, f"seed file drift (missing/extra): {sorted(drift)}"
    changed = {f for f in root if root[f] != backend[f]}
    assert not changed, f"seed file drift (content differs): {sorted(changed)}"


def test_media_tree_synced():
    root_media = _tree_hashes(ROOT_SEED / "media")
    backend_media = _tree_hashes(BACKEND_SEED / "media")
    assert set(root_media) == set(backend_media)
    changed = {f for f in root_media if root_media[f] != backend_media[f]}
    assert not changed, f"media drift: {sorted(changed)}"