"""Capability score, evidence, learning-plan and reminder routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..deps import (
    EMPLOYEE,
    json_body,
    require_auth,
    require_learning_step_owner,
    require_manager_or_above,
    require_self_manager_or_elevated,
    require_self_or_elevated_body,
)
from ..repositories import evidence, reminders
from ..services import capability, learning, talent

router = APIRouter(prefix="/api", tags=["capability"])


# --------------------------------------------------------------------------- #
# Capability Readiness Score and target role
# --------------------------------------------------------------------------- #

@router.get("/users/{id}/capability")
def get_capability(id: str, _: dict = Depends(require_self_manager_or_elevated("id"))) -> dict[str, Any]:
    return capability.capability_report(id)


@router.post("/users/{id}/target-role")
def set_target_role(
    id: str,
    body: dict[str, Any] = Depends(json_body),
    _: dict = Depends(require_self_manager_or_elevated("id")),
) -> dict[str, Any]:
    updated = capability.change_target_role(id, body.get("roleId"))
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "user": updated}


# --------------------------------------------------------------------------- #
# Evidence
# --------------------------------------------------------------------------- #

@router.get("/evidence")
def list_evidence(userId: str | None = None, session_user: dict = Depends(require_auth)) -> list[dict[str, Any]]:
    # Employees only ever see their own evidence, whatever userId is passed.
    if session_user["role"] == EMPLOYEE:
        userId = session_user["id"]
    if userId:
        return evidence.get_for_user(userId)
    return evidence.get_evidences()


@router.post("/evidence", status_code=201)
def submit_evidence(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_self_or_elevated_body)
) -> dict[str, Any]:
    if not all(body.get(f) for f in ("userId", "skillId", "title", "description", "evidenceText")):
        raise HTTPException(status_code=400, detail="All required evidence fields must be provided")
    created = capability.submit_evidence(
        body["userId"], body["skillId"], body["title"], body["description"],
        body["evidenceText"], body.get("documentUrl"),
    )
    return {"success": True, "evidence": created}


@router.post("/validation")
def review_evidence(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    if not all(body.get(f) for f in ("evidenceId", "reviewerId", "status", "comment")):
        raise HTTPException(status_code=400, detail="Validation parameters missing")
    reviewed = capability.review_evidence(
        body["evidenceId"], body["reviewerId"], body["status"], body["comment"]
    )
    if not reviewed:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return {"success": True, "evidence": reviewed}


# --------------------------------------------------------------------------- #
# Learning plans
# --------------------------------------------------------------------------- #

@router.get("/users/{id}/learning-plan")
def get_learning_plan(id: str, _: dict = Depends(require_self_manager_or_elevated("id"))) -> list[dict[str, Any]]:
    return learning.plan_for(id)


@router.get("/users/{id}/shortlist")
def get_shortlist(id: str, _: dict = Depends(require_self_manager_or_elevated("id"))) -> dict[str, Any]:
    shortlist = talent.active_shortlist(id)
    return {
        "isShortlisted": bool(shortlist),
        "demand": shortlist["demand"] if shortlist else None,
        "shortlistedAt": shortlist["shortlistedAt"] if shortlist else None,
    }


@router.get("/learning-tracker/resources")
def learning_tracker(_: dict = Depends(require_auth)) -> list[dict[str, Any]]:
    return learning.resource_learning_progress()


@router.post("/learning-plan/step")
def update_step(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_learning_step_owner)
) -> list[dict[str, Any]]:
    if not body.get("stepId") or not body.get("status"):
        raise HTTPException(status_code=400, detail="stepId and status are required")
    return learning.update_step(
        body["stepId"], body["status"], body.get("progressPercent") or 0,
        body.get("quizScore"), body.get("timeSpentMins"),
    )


@router.post("/learning-plan/deadline")
def update_deadline(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_self_or_elevated_body)
) -> dict[str, Any]:
    if not body.get("userId") or not body.get("targetDeadline"):
        raise HTTPException(status_code=400, detail="userId and targetDeadline are required")
    plan = learning.update_deadline(body["userId"], body["targetDeadline"], body.get("deadlineType"))
    return {"success": True, "plan": plan}


@router.post("/learning-plan/assign")
def assign_track(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    steps = body.get("steps")
    if not body.get("userId") or not body.get("targetDeadline") or not isinstance(steps, list) or not steps:
        raise HTTPException(
            status_code=400,
            detail="userId, targetDeadline, and non-empty steps array are required",
        )
    plan = learning.assign_track(
        body["userId"],
        body["targetDeadline"],
        body.get("deadlineType") or "client_interview",
        steps,
        body.get("demandId") or None,
        "project_hiring" if body.get("purpose") == "project_hiring" else "career_growth",
    )
    return {"success": True, "plan": plan}


# --------------------------------------------------------------------------- #
# Reminders
# --------------------------------------------------------------------------- #

@router.get("/reminders")
def list_reminders(userId: str | None = None, session_user: dict = Depends(require_auth)) -> list[dict[str, Any]]:
    if session_user["role"] == EMPLOYEE:
        userId = session_user["id"]
    return reminders.get_reminders(userId)


@router.post("/reminders", status_code=201)
def create_reminder(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_self_or_elevated_body)
) -> dict[str, Any]:
    if not all(body.get(f) for f in ("userId", "title", "message")):
        raise HTTPException(status_code=400, detail="Missing required reminder parameters")
    reminder = reminders.create_reminder(
        body["userId"], body.get("targetRole") or "Employee",
        body.get("type") or "weekly_reminder", body["title"], body["message"],
    )
    return {"success": True, "reminder": reminder}
