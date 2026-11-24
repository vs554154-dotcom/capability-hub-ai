"""Reference data: skills, target roles and the course catalogue."""
from __future__ import annotations

import sqlite3
from typing import Any

from ..database import query_all
from ._common import compact


def get_skills() -> list[dict[str, Any]]:
    return [dict(r) for r in query_all("SELECT * FROM skills")]


def get_target_roles() -> list[dict[str, Any]]:
    """Roles with their required skills joined in."""
    roles = query_all("SELECT * FROM target_roles")
    required: dict[str, list[dict[str, Any]]] = {}
    for rs in query_all("SELECT * FROM target_role_skills"):
        required.setdefault(rs["roleId"], []).append(
            {"skillId": rs["skillId"], "minLevel": rs["minLevel"]}
        )
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "description": r["description"],
            "requiredSkills": required.get(r["id"], []),
        }
        for r in roles
    ]


def get_role_requirements(role_id: str) -> list[sqlite3.Row]:
    return query_all("SELECT * FROM target_role_skills WHERE roleId = ?", (role_id,))


def get_courses() -> list[dict[str, Any]]:
    return [
        compact({
            "id": r["id"],
            "title": r["title"],
            "provider": r["provider"],
            "duration": r["duration"],
            "skillId": r["skillId"],
            "description": r["description"],
            "type": r["type"],
            "url": r["url"] or None,
            "rating": r["rating"] or None,
            "enrollmentCount": r["enrollmentCount"] or None,
            "lastUpdated": r["lastUpdated"] or None,
            "isLatest2026": bool(r["isLatest2026"]) if r["isLatest2026"] is not None else None,
        })
        for r in query_all("SELECT * FROM courses")
    ]
