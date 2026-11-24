"""Level-1 SkillGap assessments and their server-scored results."""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from ..database import execute, query_all, query_one
from ._common import compact, json_column, now_iso, random_id


def _map(r: sqlite3.Row) -> dict[str, Any]:
    return compact({
        "id": r["id"],
        "userId": r["userId"],
        "demandId": r["demandId"],
        "mode": r["mode"],
        "roleTitle": r["roleTitle"],
        "content": json_column(r["content"]) or {},
        "answers": json_column(r["answers"]) or {},
        "evaluations": json_column(r["evaluations"]) or {},
        "result": json_column(r["result"]),
        "status": r["status"],
        "createdAt": r["createdAt"],
        "completedAt": r["completedAt"],
    })


def create(
    user_id: str, demand_id: str | None, mode: str, role_title: str, content: dict[str, Any]
) -> str:
    assessment_id = random_id("sga_")
    execute(
        """
        INSERT INTO skillgap_assessments
            (id, userId, demandId, mode, roleTitle, content, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (assessment_id, user_id, demand_id, mode, role_title, json.dumps(content), now_iso()),
    )
    return assessment_id


def get(assessment_id: str) -> dict[str, Any] | None:
    row = query_one("SELECT * FROM skillgap_assessments WHERE id = ?", (assessment_id,))
    return _map(row) if row else None


def save_answers(assessment_id: str, answers: dict[str, int]) -> None:
    execute(
        "UPDATE skillgap_assessments SET answers = ? WHERE id = ?",
        (json.dumps(answers), assessment_id),
    )


def save_evaluations(assessment_id: str, evaluations: dict[str, Any]) -> None:
    execute(
        "UPDATE skillgap_assessments SET evaluations = ? WHERE id = ?",
        (json.dumps(evaluations), assessment_id),
    )


def complete(assessment_id: str, result: dict[str, Any]) -> None:
    execute(
        """
        UPDATE skillgap_assessments
           SET result = ?, status = 'completed', completedAt = ?
         WHERE id = ? AND status = 'in_progress'
        """,
        (json.dumps(result), now_iso(), assessment_id),
    )


def latest_completed(user_id: str, demand_id: str | None = None) -> dict[str, Any] | None:
    """The person's most recent finished assessment, for one demand if given."""
    clause, params = "", [user_id]
    if demand_id:
        clause, params = " AND demandId = ?", [user_id, demand_id]
    row = query_one(
        "SELECT * FROM skillgap_assessments WHERE userId = ? AND status = 'completed'"
        f"{clause} ORDER BY completedAt DESC, rowid DESC LIMIT 1",
        params,
    )
    return _map(row) if row else None


def latest_completed_all() -> dict[str, dict[str, Any]]:
    """Every person's most recent finished assessment, by user id."""
    rows = query_all(
        "SELECT * FROM skillgap_assessments WHERE status = 'completed' "
        "ORDER BY completedAt ASC, rowid ASC"
    )
    return {r["userId"]: _map(r) for r in rows}
