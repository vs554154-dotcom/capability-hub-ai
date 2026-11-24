"""Project demands (open client requisitions)."""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from ..database import execute, query_all, query_one
from ._common import compact, json_column, now_iso, random_id


def _map(r: sqlite3.Row) -> dict[str, Any]:
    return compact({
        "id": r["id"],
        "projectName": r["projectName"],
        "customerName": r["customerName"],
        "businessUnit": r["businessUnit"],
        "projectDescription": r["projectDescription"],
        "rawJobDescription": r["rawJobDescription"] or None,
        "requiredSkills": json_column(r["requiredSkills"]) or [],
        "preferredSkills": json_column(r["preferredSkills"]) or [],
        "experienceRangeMin": r["experienceRangeMin"],
        "experienceRangeMax": r["experienceRangeMax"],
        "technologyStack": json_column(r["technologyStack"]) or [],
        "resourcesRequired": r["resourcesRequired"],
        "clientInterviewDate": r["clientInterviewDate"],
        "expectedJoiningDate": r["expectedJoiningDate"],
        "projectPriority": r["projectPriority"],
        "location": r["location"],
        "domain": r["domain"],
        "employmentType": r["employmentType"],
        "additionalNotes": r["additionalNotes"] or None,
        "status": r["status"],
        "createdAt": r["createdAt"],
    })


def get_project_demands() -> list[dict[str, Any]]:
    return [_map(r) for r in query_all(
        "SELECT * FROM project_demands ORDER BY createdAt DESC, rowid DESC"
    )]


def get_project_demand_by_id(demand_id: str) -> dict[str, Any] | None:
    row = query_one("SELECT * FROM project_demands WHERE id = ?", (demand_id,))
    return _map(row) if row else None


def create_project_demand(data: dict[str, Any]) -> dict[str, Any]:
    demand_id = random_id("OPP-")
    execute(
        """
        INSERT INTO project_demands (
            id, projectName, customerName, businessUnit, projectDescription,
            rawJobDescription, requiredSkills, preferredSkills, experienceRangeMin,
            experienceRangeMax, technologyStack, resourcesRequired,
            clientInterviewDate, expectedJoiningDate, projectPriority, location,
            domain, employmentType, additionalNotes, status, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            demand_id,
            data.get("projectName"), data.get("customerName"), data.get("businessUnit"),
            data.get("projectDescription", ""), data.get("rawJobDescription"),
            json.dumps(data.get("requiredSkills") or []),
            json.dumps(data.get("preferredSkills") or []),
            data.get("experienceRangeMin", 0), data.get("experienceRangeMax", 0),
            json.dumps(data.get("technologyStack") or []),
            data.get("resourcesRequired", 1),
            data.get("clientInterviewDate", ""), data.get("expectedJoiningDate", ""),
            data.get("projectPriority", "MEDIUM"), data.get("location", ""),
            data.get("domain", ""), data.get("employmentType", "Full-Time"),
            data.get("additionalNotes"), "OPEN", now_iso(),
        ),
    )
    return get_project_demand_by_id(demand_id)
