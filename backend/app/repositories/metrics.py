"""Daily Enterprise Readiness Index readings, the history behind its trend line."""
from __future__ import annotations

from typing import Any

from ..database import execute, query_all
from ._common import now_iso


def record_eri(day: str, eri: int, coverage: int) -> None:
    """Store today's reading. A later reading on the same day replaces it, so each
    day keeps its most recent value."""
    execute(
        "INSERT INTO eri_snapshots (day, eri, coverage, recordedAt) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(day) DO UPDATE SET eri = excluded.eri, coverage = excluded.coverage, "
        "recordedAt = excluded.recordedAt",
        (day, eri, coverage, now_iso()),
    )


def eri_history(limit: int = 12) -> list[dict[str, Any]]:
    """The most recent `limit` daily readings, oldest first."""
    rows = query_all(
        "SELECT day, eri, coverage FROM eri_snapshots ORDER BY day DESC LIMIT ?", (limit,)
    )
    return [{"day": r["day"], "eri": r["eri"], "coverage": r["coverage"]} for r in reversed(rows)]
