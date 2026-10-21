"""Sign-in sessions stored in the database."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from ..database import execute, query_one
from ._common import iso as _iso


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create(user_id: str, lifetime_seconds: int) -> str:
    """Start a session for `user_id` and return its id."""
    session_id = secrets.token_urlsafe(32)
    now = _now()
    execute(
        "INSERT INTO sessions (id, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)",
        (session_id, user_id, _iso(now), _iso(now + timedelta(seconds=lifetime_seconds))),
    )
    return session_id


def active_user_id(session_id: str) -> str | None:
    """The user of a session that exists, is not ended and has not expired."""
    row = query_one(
        "SELECT userId FROM sessions WHERE id = ? AND revokedAt IS NULL AND expiresAt > ?",
        (session_id, _iso(_now())),
    )
    return row["userId"] if row else None


def end(session_id: str) -> None:
    execute(
        "UPDATE sessions SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL",
        (_iso(_now()), session_id),
    )


def end_all_for_user(user_id: str, keep: str | None = None) -> None:
    """End every session of `user_id`, except `keep` if given."""
    execute(
        "UPDATE sessions SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL AND id != ?",
        (_iso(_now()), user_id, keep or ""),
    )


def purge_finished(older_than_days: int = 1) -> None:
    """Delete sessions that ended or expired more than `older_than_days` ago."""
    cutoff = _iso(_now() - timedelta(days=older_than_days))
    execute(
        "DELETE FROM sessions WHERE expiresAt < ? OR (revokedAt IS NOT NULL AND revokedAt < ?)",
        (cutoff, cutoff),
    )
