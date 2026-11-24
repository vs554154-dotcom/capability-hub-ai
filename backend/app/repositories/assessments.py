"""Post-training assessments and skill baselines.

Together these gate the Client Resume Generator: a resume is only produced against
persisted proof - a signed-off assessment and growth measured from a baseline
captured at handoff - never against anything asserted in a request.
"""
from __future__ import annotations

from typing import Any

from ..database import execute, query_all, query_one
from ._common import compact, now_iso, random_id


def create_post_assessment(
    employee_id: str, demand_id: str | None, manager_id: str, narrative: str
) -> dict[str, Any]:
    assessment_id = random_id(f"pa_{employee_id}_")
    created_at = now_iso()
    execute(
        """
        INSERT INTO post_assessments
            (id, employeeId, demandId, managerId, narrative, status, createdAt)
        VALUES (?, ?, ?, ?, ?, 'pending_signoff', ?)
        """,
        (assessment_id, employee_id, demand_id, manager_id, narrative, created_at),
    )
    return compact({
        "id": assessment_id,
        "employeeId": employee_id,
        "demandId": demand_id or None,
        "managerId": manager_id,
        "narrative": narrative,
        "status": "pending_signoff",
        "createdAt": created_at,
    })


def get_post_assessment(assessment_id: str) -> dict[str, Any] | None:
    row = query_one("SELECT * FROM post_assessments WHERE id = ?", (assessment_id,))
    return dict(row) if row else None


def get_latest_post_assessment(
    employee_id: str, demand_id: str | None = None
) -> dict[str, Any] | None:
    if demand_id:
        row = query_one(
            """
            SELECT * FROM post_assessments
             WHERE employeeId = ? AND demandId = ?
             ORDER BY createdAt DESC, rowid DESC LIMIT 1
            """,
            (employee_id, demand_id),
        )
    else:
        row = query_one(
            "SELECT * FROM post_assessments WHERE employeeId = ? "
            "ORDER BY createdAt DESC, rowid DESC LIMIT 1",
            (employee_id,),
        )
    return dict(row) if row else None


def post_assessment_status_counts() -> dict[str, int]:
    """How many post-training assessments are in each status."""
    rows = query_all("SELECT status, COUNT(*) AS n FROM post_assessments GROUP BY status")
    return {r["status"]: r["n"] for r in rows}


def sign_off(assessment_id: str, signed_off_by: str, decision: str) -> None:
    execute(
        """
        UPDATE post_assessments
           SET status = ?, signedOffBy = ?, signedOffAt = ?
         WHERE id = ?
        """,
        (decision, signed_off_by, now_iso(), assessment_id),
    )


def capture_baselines(user_id: str, current_levels: list[tuple[str, int]], demand_id: str) -> None:
    """Record current levels as the "before" state for this demand. A repeat handoff
    never resets a level - which would silently collapse measured growth to zero - but
    its date moves on, so the demand handed off last is the active one."""
    captured_at = now_iso()
    for skill_id, level in current_levels:
        execute(
            """
            INSERT INTO skill_baselines
                (userId, skillId, demandId, baselineLevel, capturedAt)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(userId, skillId, demandId) DO UPDATE SET capturedAt = excluded.capturedAt
            """,
            (user_id, skill_id, demand_id, level, captured_at),
        )


def get_baselines(user_id: str, demand_id: str) -> list[dict[str, Any]]:
    return [dict(r) for r in query_all(
        "SELECT skillId, baselineLevel FROM skill_baselines "
        "WHERE userId = ? AND demandId = ?",
        (user_id, demand_id),
    )]


def handed_off_pairs() -> list[tuple[str, str]]:
    """Every (user, demand) that has been handed off."""
    rows = query_all("SELECT DISTINCT userId, demandId FROM skill_baselines")
    return [(r["userId"], r["demandId"]) for r in rows]


def get_latest_handoff(user_id: str) -> dict[str, Any] | None:
    """The demand whose baselines were captured most recently for this user."""
    row = query_one(
        """
        SELECT demandId, MAX(capturedAt) AS capturedAt
          FROM skill_baselines
         WHERE userId = ?
         GROUP BY demandId
         ORDER BY capturedAt DESC, rowid DESC
         LIMIT 1
        """,
        (user_id,),
    )
    return dict(row) if row else None
