"""Workplace evidence submissions and their reviews."""
from __future__ import annotations

import sqlite3
from typing import Any

from ..database import execute, query_all, query_one
from ._common import compact, now_iso, random_id


def _map(r: sqlite3.Row) -> dict[str, Any]:
    return compact({
        "id": r["id"],
        "userId": r["userId"],
        "skillId": r["skillId"],
        "title": r["title"],
        "description": r["description"],
        "evidenceText": r["evidenceText"],
        "documentUrl": r["documentUrl"] or None,
        "status": r["status"],
        "submittedAt": r["submittedAt"],
        "reviewedBy": r["reviewedBy"] or None,
        "reviewComment": r["reviewComment"] or None,
        "reviewedAt": r["reviewedAt"] or None,
    })


def get_evidences() -> list[dict[str, Any]]:
    return [_map(r) for r in query_all("SELECT * FROM evidences")]


def get_for_user(user_id: str) -> list[dict[str, Any]]:
    """One user's evidence, in the same order get_evidences() returns it."""
    return [_map(r) for r in query_all(
        "SELECT * FROM evidences WHERE userId = ? ORDER BY rowid", (user_id,)
    )]


def get_evidence_by_id(evidence_id: str) -> dict[str, Any] | None:
    row = query_one("SELECT * FROM evidences WHERE id = ?", (evidence_id,))
    return _map(row) if row else None


def insert(
    user_id: str,
    skill_id: str,
    title: str,
    description: str,
    evidence_text: str,
    document_url: str | None,
) -> str:
    evidence_id = random_id("ev_")
    execute(
        """
        INSERT INTO evidences
            (id, userId, skillId, title, description, evidenceText, documentUrl,
             status, submittedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        """,
        (evidence_id, user_id, skill_id, title, description, evidence_text,
         document_url, now_iso()),
    )
    return evidence_id


def set_review(evidence_id: str, reviewer_id: str, status: str, comment: str) -> None:
    execute(
        """
        UPDATE evidences
           SET status = ?, reviewedBy = ?, reviewComment = ?, reviewedAt = ?
         WHERE id = ?
        """,
        (status, reviewer_id, comment, now_iso(), evidence_id),
    )
