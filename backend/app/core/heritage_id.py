"""Deterministic heritage identifier construction.

Matches the PostgreSQL ``generate_heritage_id`` function:
    VR-<STATE_CODE>-<TRADITION_CODE>-<YEAR>-<SEQ>
"""
from __future__ import annotations

import re

STATE_CODES = {
    "odisha": "OD",
    "odisha (od)": "OD",
    "orissa": "OD",
    "west bengal": "WB",
    "rajasthan": "RJ",
    "gujarat": "GJ",
    "karnataka": "KA",
    "tamil nadu": "TN",
    "uttar pradesh": "UP",
    "madhya pradesh": "MP",
    "bihar": "BR",
    "assam": "AS",
    "kerala": "KL",
    "andhra pradesh": "AP",
    "telangana": "TG",
    "maharashtra": "MH",
    "himachal pradesh": "HP",
    "jammu & kashmir": "JK",
}


def state_code(state: str) -> str:
    key = re.sub(r"\s+", " ", state.strip().lower())
    return STATE_CODES.get(key, key[:2].upper())


def tradition_code(title: str) -> str:
    """'Odisha Pattachitra' → 'PAT'; 'Pattachitra' → 'PAT'.

    Uses the final token of the tradition title, falling back to the full
    title, then truncates to the first three alphanumeric characters.
    """
    tokens = [t for t in re.split(r"\W+", title) if t]
    source = tokens[-1] if len(tokens) >= 2 else title
    code = "".join(c for c in source if c.isalnum())
    return code[:3].upper()


def format_heritage_id(state: str, title: str, year: int, seq: int) -> str:
    return (
        f"VR-{state_code(state)}-{tradition_code(title)}-{year}-{seq:06d}"
    )


def build_next_heritage_id(
    state: str, tradition_title: str, year: int, next_sequence: int
) -> str:
    """Compose a heritage id from the next free sequence for the year."""
    return format_heritage_id(state, tradition_title, year, next_sequence)