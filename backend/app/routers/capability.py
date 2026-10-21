"""Capability score, evidence, learning-plan and reminder routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..deps import (
    EMPLOYEE,
    NOT_OWN_DATA,
    ensure_may_access,
    json_body,
    require_auth,
    require_learning_step_owner,
    require_manager_or_above,
    require_self_manager_or_elevated,
    require_self_or_elevated_body,
    visible_user_ids,
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
    """Evidence the caller may see. Employees always get their own, whatever userId
    is passed. A manager gets their own and their direct reports' - which is what
    fills their validation queue; it used to be every employee's in the company."""
    if session_user["role"] == EMPLOYEE:
        userId = session_user["id"]
    if userId:
        ensure_may_access(session_user, userId, NOT_OWN_DATA)
        return evidence.get_for_user(userId)
    visible = visible_user_ids(session_user)
    rows = evidence.get_evidences()
    return rows if visible is None else [e for e in rows if e["userId"] in visible]


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


REVIEW_VERDICTS = ("approved", "revision_requested")


@router.post("/validation")
def review_evidence(
    body: dict[str, Any] = Depends(json_body), session_user: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    """A manager's verdict on a submission. The reviewer is the signed-in user - a
    reviewerId in the body is ignored, so a review cannot be recorded under someone
    else's name - and a manager may only review their own reports' evidence, since
    approval promotes the employee's skill level."""
    if not all(body.get(f) for f in ("evidenceId", "status", "comment")):
        raise HTTPException(status_code=400, detail="Validation parameters missing")
    if body["status"] not in REVIEW_VERDICTS:
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'revision_requested'.")

    submission = evidence.get_evidence_by_id(body["evidenceId"])
    if not submission:
        raise HTTPException(status_code=404, detail="Evidence not found")
    ensure_may_access(session_user, submission["userId"])

    reviewed = capability.review_evidence(
        body["evidenceId"], session_user["id"], body["status"], body["comment"]
    )
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
def learning_tracker(session_user: dict = Depends(require_manager_or_above)) -> list[dict[str, Any]]:
    """The manager / L&D learning tracker: a manager sees their own reports, L&D and
    Leadership see everyone. It was previously open to any signed-in user, so an
    employee could read every colleague's learning progress."""
    return learning.resource_learning_progress(visible_user_ids(session_user))


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
    body: dict[str, Any] = Depends(json_body), session_user: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    steps = body.get("steps")
    if not body.get("userId") or not body.get("targetDeadline") or not isinstance(steps, list) or not steps:
        raise HTTPException(
            status_code=400,
            detail="userId, targetDeadline, and non-empty steps array are required",
        )
    # Assigning replaces the employee's whole plan, so a manager may only do it for
    # their own reports.
    ensure_may_access(session_user, body["userId"])
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
    if userId:
        ensure_may_access(session_user, userId, NOT_OWN_DATA)
        return reminders.get_reminders(userId)
    visible = visible_user_ids(session_user)
    rows = reminders.get_reminders(None)
    return rows if visible is None else [r for r in rows if r["userId"] in visible]


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
