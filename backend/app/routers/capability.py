"""Capability, evidence, learning-plan and reminder routes (Stage 2).

Ports the corresponding handlers from server.ts, including their validation
messages and status codes.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import db
from ..deps import (
    EMPLOYEE,
    require_auth,
    require_manager_or_above,
    require_learning_step_owner,
    require_self_manager_or_elevated,
    require_self_or_elevated_body,
)
from ..numeric import js_round

router = APIRouter(prefix="/api", tags=["capability"])


# --------------------------------------------------------------------------- #
# Capability Readiness Score
# --------------------------------------------------------------------------- #

@router.get("/users/{id}/capability")
async def get_capability(
    id: str, _: dict = Depends(require_self_manager_or_elevated("id"))
) -> dict[str, Any]:
    user = db.get_user_by_id(id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    skills = db.get_skills()
    user_skills = db.get_user_skills(id)
    role = next(
        (r for r in db.get_target_roles() if r["id"] == user.get("targetRoleId")), None
    )

    met_count = 0
    total_requirements = 0
    score_accumulator = 0
    breakdown: list[dict[str, Any]] = []

    for sk in skills:
        user_sk = next((s for s in user_skills if s["skillId"] == sk["id"]), None)
        req_sk = (
            next((s for s in role["requiredSkills"] if s["skillId"] == sk["id"]), None)
            if role else None
        )

        current = user_sk["currentLevel"] if user_sk else 0
        if req_sk:
            target = req_sk["minLevel"]
        else:
            target = user_sk["targetLevel"] if user_sk else 0

        met = False
        if target > 0:
            total_requirements += 1
            if current >= target:
                met_count += 1
                met = True

        # A skill with no target counts as fully satisfied (100), matching the
        # Node formula - this is why the average is generous by design.
        ratio = min(100, js_round((current / target) * 100)) if target > 0 else 100
        score_accumulator += ratio

        breakdown.append({
            "skillId": sk["id"],
            "skillName": sk["name"],
            "category": sk["category"],
            "current": current,
            "target": target,
            "status": user_sk["status"] if user_sk else "not_started",
            "isTargetMet": met,
            "scorePercentage": ratio,
            "lastUpdated": user_sk["lastUpdated"] if user_sk else "-",
        })

    average_ratio = js_round(score_accumulator / len(breakdown)) if breakdown else 0

    evidences = db.get_evidences()
    approved = len([e for e in evidences if e["userId"] == id and e["status"] == "approved"])
    pending = len([e for e in evidences if e["userId"] == id and e["status"] == "pending"])

    # Up to 15% bonus for human-validated proof.
    progress_bonus = min(15, approved * 5)
    final_score = min(100, max(0, js_round(average_ratio * 0.85 + progress_bonus)))
    met_percentage = js_round((met_count / total_requirements) * 100) if total_requirements else 0

    role_title = role["title"] if role else "selected role"
    explainability = (
        f"The score of {final_score}% is derived from:\n"
        f"- Match ratio of current vs required levels for the '{role_title}' role: {average_ratio}%.\n"
        f"- Professional evidence threshold: {approved} verified submission(s) ({progress_bonus}% index bonus).\n"
        f"- Target goals successfully attained: {met_count} of {total_requirements} requirements ({met_percentage}% met)."
    )

    return {
        "overallScore": final_score,
        "targetRoleTitle": role["title"] if role else "None Selected",
        "targetRoleId": role["id"] if role else None,
        "skillsBreakdown": breakdown,
        "explainability": explainability,
        "stats": {
            "totalRequirements": total_requirements,
            "metCount": met_count,
            "evidenceCount": approved,
            "pendingValidation": pending,
        },
    }


@router.post("/users/{id}/target-role")
async def set_target_role(
    id: str, request: Request, _: dict = Depends(require_self_manager_or_elevated("id"))
) -> dict[str, Any]:
    body = await request.json()
    updated = db.update_target_role(id, body.get("roleId"))
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "user": updated}


# --------------------------------------------------------------------------- #
# Evidence
# --------------------------------------------------------------------------- #

@router.get("/evidence")
async def list_evidence(
    userId: str | None = None, session_user: dict = Depends(require_auth)
) -> list[dict[str, Any]]:
    # Employees only ever see their own evidence, whatever userId is passed.
    if session_user["role"] == EMPLOYEE:
        userId = session_user["id"]

    evidences = db.get_evidences()
    if userId:
        evidences = [e for e in evidences if e["userId"] == userId]
    return evidences


@router.post("/evidence", status_code=201)
async def submit_evidence(
    request: Request, _: dict = Depends(require_self_or_elevated_body)
) -> dict[str, Any]:
    body = await request.json()
    required = ("userId", "skillId", "title", "description", "evidenceText")
    if not all(body.get(f) for f in required):
        raise HTTPException(
            status_code=400, detail="All required evidence fields must be provided"
        )

    evidence = db.submit_evidence(
        body["userId"], body["skillId"], body["title"], body["description"],
        body["evidenceText"], body.get("documentUrl"),
    )
    return {"success": True, "evidence": evidence}


@router.post("/validation")
async def review_evidence(
    request: Request, _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    body = await request.json()
    if not all(body.get(f) for f in ("evidenceId", "reviewerId", "status", "comment")):
        raise HTTPException(status_code=400, detail="Validation parameters missing")

    evidence = db.review_evidence(
        body["evidenceId"], body["reviewerId"], body["status"], body["comment"]
    )
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return {"success": True, "evidence": evidence}


# --------------------------------------------------------------------------- #
# Learning plans
# --------------------------------------------------------------------------- #

@router.get("/users/{id}/learning-plan")
async def get_learning_plan(
    id: str, _: dict = Depends(require_self_manager_or_elevated("id"))
) -> list[dict[str, Any]]:
    return db.get_learning_plan(id)


# Whether this employee has been shortlisted onto a project demand, and which one.
# Guarded like the other per-user reads: an employee sees only their own status, a
# manager only their reports'.
@router.get("/users/{id}/shortlist")
async def get_shortlist(
    id: str, _: dict = Depends(require_self_manager_or_elevated("id"))
) -> dict[str, Any]:
    shortlist = db.get_active_shortlist(id)
    return {
        "isShortlisted": bool(shortlist),
        "demand": shortlist["demand"] if shortlist else None,
        "shortlistedAt": shortlist["shortlistedAt"] if shortlist else None,
    }


@router.get("/learning-tracker/resources")
async def learning_tracker(_: dict = Depends(require_auth)) -> list[dict[str, Any]]:
    return db.get_resource_learning_progress()


# The step's owner is resolved from the database (stepId -> userId) and run through
# the same self/manager/elevated rule as every other per-user write, so a logged-in
# employee can no longer update someone else's learning step.
@router.post("/learning-plan/step")
async def update_step(
    request: Request, _: dict = Depends(require_learning_step_owner)
) -> list[dict[str, Any]]:
    body = await request.json()
    if not body.get("stepId") or not body.get("status"):
        raise HTTPException(status_code=400, detail="stepId and status are required")

    return db.update_learning_plan_week(
        body["stepId"], body["status"], body.get("progressPercent") or 0,
        body.get("quizScore"), body.get("timeSpentMins"),
    )


@router.post("/learning-plan/deadline")
async def update_deadline(
    request: Request, _: dict = Depends(require_self_or_elevated_body)
) -> dict[str, Any]:
    body = await request.json()
    if not body.get("userId") or not body.get("targetDeadline"):
        raise HTTPException(
            status_code=400, detail="userId and targetDeadline are required"
        )

    plan = db.update_learning_plan_deadline(
        body["userId"], body["targetDeadline"], body.get("deadlineType")
    )
    return {"success": True, "plan": plan}


@router.post("/learning-plan/assign")
async def assign_track(
    request: Request, _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    body = await request.json()
    steps = body.get("steps")
    if not body.get("userId") or not body.get("targetDeadline") or not isinstance(steps, list) or not steps:
        raise HTTPException(
            status_code=400,
            detail="userId, targetDeadline, and non-empty steps array are required",
        )

    plan = db.assign_flexible_learning_track(
        body["userId"],
        body.get("trackTitle") or "Flexible Learning Track",
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
async def list_reminders(
    userId: str | None = None, session_user: dict = Depends(require_auth)
) -> list[dict[str, Any]]:
    if session_user["role"] == EMPLOYEE:
        userId = session_user["id"]
    return db.get_reminders(userId)


@router.post("/reminders", status_code=201)
async def create_reminder(
    request: Request, _: dict = Depends(require_self_or_elevated_body)
) -> dict[str, Any]:
    body = await request.json()
    if not all(body.get(f) for f in ("userId", "title", "message")):
        raise HTTPException(
            status_code=400, detail="Missing required reminder parameters"
        )

    reminder = db.create_reminder(
        body["userId"], body.get("targetRole") or "Employee",
        body.get("type") or "weekly_reminder", body["title"], body["message"],
    )
    return {"success": True, "reminder": reminder}
