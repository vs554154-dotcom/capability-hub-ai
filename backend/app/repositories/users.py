"""Users and credentials."""
from __future__ import annotations

import sqlite3
from typing import Any

from ..database import execute, query_all, query_one
from ._common import compact, js_number, json_column


def map_user(row: sqlite3.Row | None) -> dict[str, Any] | None:
    """Public user shape. `passwordHash` is deliberately never mapped, so no API
    response can carry it."""
    if row is None:
        return None
    keys = row.keys()

    def col(name: str) -> Any:
        return row[name] if name in keys else None

    return compact({
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "avatar": row["avatar"],
        "title": row["title"],
        "department": row["department"],
        "targetRoleId": col("targetRoleId") or None,
        "managerId": col("managerId") or None,
        "experienceYears": js_number(col("experienceYears")),
        "domain": col("domain") or None,
        "primaryRole": col("primaryRole") or None,
        "primarySkills": json_column(col("primarySkills")),
    })


def get_users() -> list[dict[str, Any]]:
    return [map_user(r) for r in query_all("SELECT * FROM users")]


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    return map_user(query_one("SELECT * FROM users WHERE id = ?", (user_id,)))


def find_user_by_identifier(identifier: str) -> dict[str, Any] | None:
    """Resolve a sign-in identifier to exactly one user: their id, email or full
    name, case-insensitively.

    Name matching used to be a substring test, so "neha" signed in as Sneha - whose
    row happened to come first. Because the first sign-in to an account sets its
    password, a loose match could claim the wrong person's account.
    """
    target = (identifier or "").strip().lower()
    if not target:
        return None
    for row in query_all("SELECT * FROM users"):
        if target in (row["id"].lower(), row["email"].lower(), row["name"].strip().lower()):
            return map_user(row)
    return None


def get_direct_reports(manager_id: str) -> list[dict[str, Any]]:
    rows = query_all("SELECT * FROM users WHERE managerId = ?", (manager_id,))
    return [map_user(r) for r in rows]


def get_user_password_hash(user_id: str) -> str | None:
    row = query_one("SELECT passwordHash FROM users WHERE id = ?", (user_id,))
    return (row["passwordHash"] or None) if row else None


def set_user_password(user_id: str, password_hash: str) -> None:
    execute("UPDATE users SET passwordHash = ? WHERE id = ?", (password_hash, user_id))


def set_target_role_id(user_id: str, role_id: str | None) -> None:
    execute("UPDATE users SET targetRoleId = ? WHERE id = ?", (role_id, user_id))
