"""A user's level and target for each skill."""
from __future__ import annotations

from typing import Any

from ..database import execute, query_all, query_one
from ._common import now_date


# The level a new skill record starts at.
STARTING_LEVEL = 1


def get_user_skills(user_id: str) -> list[dict[str, Any]]:
    return [dict(r) for r in query_all(
        "SELECT * FROM user_skills WHERE userId = ?", (user_id,)
    )]


def get_current_level(user_id: str, skill_id: str) -> int:
    """Current level, or the starting level when the pairing has no row yet."""
    row = query_one(
        "SELECT currentLevel FROM user_skills WHERE userId = ? AND skillId = ?",
        (user_id, skill_id),
    )
    return row["currentLevel"] if row else STARTING_LEVEL


def exists(user_id: str, skill_id: str) -> bool:
    return query_one(
        "SELECT 1 FROM user_skills WHERE userId = ? AND skillId = ?", (user_id, skill_id)
    ) is not None


def set_level(user_id: str, skill_id: str, level: int, status: str | None = None) -> None:
    """Upsert a user/skill pairing. New rows start with target level 4 and status
    "learning" unless a status is given."""
    stamp = now_date()
    if exists(user_id, skill_id):
        if status:
            execute(
                """
                UPDATE user_skills SET currentLevel = ?, status = ?, lastUpdated = ?
                 WHERE userId = ? AND skillId = ?
                """,
                (level, status, stamp, user_id, skill_id),
            )
        else:
            execute(
                """
                UPDATE user_skills SET currentLevel = ?, lastUpdated = ?
                 WHERE userId = ? AND skillId = ?
                """,
                (level, stamp, user_id, skill_id),
            )
    else:
        execute(
            """
            INSERT INTO user_skills
                (userId, skillId, currentLevel, targetLevel, status, lastUpdated)
            VALUES (?, ?, ?, 4, ?, ?)
            """,
            (user_id, skill_id, level, status or "learning", stamp),
        )


def set_target_level(user_id: str, skill_id: str, target_level: int) -> None:
    execute(
        "UPDATE user_skills SET targetLevel = ? WHERE userId = ? AND skillId = ?",
        (target_level, user_id, skill_id),
    )


def add_not_started(user_id: str, skill_id: str, target_level: int) -> None:
    execute(
        """
        INSERT INTO user_skills
            (userId, skillId, currentLevel, targetLevel, status, lastUpdated)
        VALUES (?, ?, ?, ?, 'not_started', ?)
        """,
        (user_id, skill_id, STARTING_LEVEL, target_level, now_date()),
    )
