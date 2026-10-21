"""Reminders and escalations shown to employees."""
from __future__ import annotations

from typing import Any

from ..database import execute, query_all, query_one
from ._common import now_iso, random_id


def get_reminders(user_id: str | None = None) -> list[dict[str, Any]]:
    if user_id:
        rows = query_all(
            "SELECT * FROM reminders WHERE userId = ? ORDER BY createdAt DESC, rowid DESC", (user_id,)
        )
    else:
        rows = query_all("SELECT * FROM reminders ORDER BY createdAt DESC, rowid DESC")
    return [dict(r) for r in rows]


def create_reminder(
    user_id: str, target_role: str, type_: str, title: str, message: str
) -> dict[str, Any]:
    reminder_id = random_id("rem_")
    execute(
        """
        INSERT INTO reminders
            (id, userId, targetRole, type, title, message, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)
        """,
        (reminder_id, user_id, target_role, type_, title, message, now_iso()),
    )
    row = query_one("SELECT * FROM reminders WHERE id = ?", (reminder_id,))
    return dict(row) if row else {}
