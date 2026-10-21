"""Learning plans: the ordered steps of each user's learning track."""
from __future__ import annotations

import random
import sqlite3
from typing import Any

from ..database import execute, query_all, query_one
from ._common import BASE36, compact, now_date


def _map(r: sqlite3.Row) -> dict[str, Any]:
    keys = r.keys()

    def col(name: str, default: Any = None) -> Any:
        return r[name] if name in keys else default

    return compact({
        "id": r["id"],
        "userId": r["userId"],
        "weekNumber": r["weekNumber"],
        "title": r["title"],
        "skillFocus": r["skillFocus"],
        "courseName": r["courseName"],
        "provider": r["provider"],
        "milestone": r["milestone"],
        "assessment": r["assessment"],
        "targetScore": r["targetScore"],
        "status": r["status"],
        "progressPercent": r["progressPercent"],
        "learningType": col("learningType") or "in_depth",
        "estimatedDuration": col("estimatedDuration") or "1 hour",
        "phaseLabel": col("phaseLabel") or f"Phase {r['weekNumber']}",
        "targetDeadline": col("targetDeadline") or "2026-08-15",
        "deadlineType": col("deadlineType") or "client_interview",
        "quizScore": col("quizScore") or 0,
        "timeSpentMins": col("timeSpentMins") or 0,
        "completedAt": col("completedAt") or None,
        "demandId": col("demandId") or None,
        "purpose": col("purpose") or "career_growth",
    })


def get_learning_plan(user_id: str) -> list[dict[str, Any]]:
    return [_map(r) for r in query_all(
        "SELECT * FROM learning_plans WHERE userId = ? ORDER BY weekNumber ASC, rowid ASC",
        (user_id,),
    )]


def get_step_owner_id(step_id: str) -> str | None:
    """The user who owns a step, so a write can be authorised against that owner."""
    if not step_id:
        return None
    row = query_one("SELECT userId FROM learning_plans WHERE id = ?", (step_id,))
    return row["userId"] if row else None


def update_step(
    step_id: str,
    status: str,
    progress_percent: int,
    quiz_score: int | None = None,
    time_spent_mins: int | None = None,
) -> None:
    sets = ["status = ?", "progressPercent = ?"]
    params: list[Any] = [status, progress_percent]
    if quiz_score is not None:
        sets.append("quizScore = ?")
        params.append(quiz_score)
    if time_spent_mins is not None:
        # Accumulates rather than overwrites: time is added per study session.
        sets.append("timeSpentMins = timeSpentMins + ?")
        params.append(time_spent_mins)
    if status == "completed":
        sets.append("completedAt = ?")
        params.append(now_date())
    params.append(step_id)
    execute(f"UPDATE learning_plans SET {', '.join(sets)} WHERE id = ?", params)


def set_deadline(user_id: str, target_deadline: str, deadline_type: str) -> None:
    execute(
        "UPDATE learning_plans SET targetDeadline = ?, deadlineType = ? WHERE userId = ?",
        (target_deadline, deadline_type, user_id),
    )


def replace_plan(
    user_id: str,
    target_deadline: str,
    deadline_type: str,
    steps: list[dict[str, Any]],
    demand_id: str | None,
    purpose: str,
) -> None:
    """Delete the user's plan and insert `steps` in its place. Callers must run this
    inside a transaction: on its own the delete and the inserts would commit
    separately, and a failure part-way would leave the plan wiped."""
    execute("DELETE FROM learning_plans WHERE userId = ?", (user_id,))
    for idx, step in enumerate(steps, start=1):
        step_id = f"plan_{user_id}_{idx}_" + "".join(random.choices(BASE36, k=5))
        execute(
            """
            INSERT INTO learning_plans (
                id, userId, weekNumber, title, skillFocus, courseName, provider,
                milestone, assessment, targetScore, status, progressPercent,
                learningType, estimatedDuration, phaseLabel, targetDeadline,
                deadlineType, quizScore, timeSpentMins, demandId, purpose
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, 0, 0, ?, ?)
            """,
            (
                step_id, user_id, idx,
                step.get("title"), step.get("skillFocus"), step.get("courseName"),
                step.get("provider"), step.get("milestone"), step.get("assessment"),
                step.get("targetScore"), step.get("learningType"),
                step.get("estimatedDuration"), step.get("phaseLabel"),
                target_deadline, deadline_type, demand_id, purpose,
            ),
        )
