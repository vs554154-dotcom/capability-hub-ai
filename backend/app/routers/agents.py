"""AI copilot routes: the orchestrator, the GROW coach and the interview agent.

Each answers with generated text when Gemini is reachable and a deterministic
fallback when it is not, so these endpoints always return 200 on valid input.

Every prompt is grounded in a person's skills and evidence, so whose data goes into
it is an authorization decision: the same rule as reading that person's record.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..deps import (
    ORG_VIEW_ROLES,
    ensure_may_access,
    json_body,
    require_auth,
    require_manager_or_above,
    require_self_or_elevated_body,
)
from ..repositories import assessments, users
from ..services import copilot

router = APIRouter(prefix="/api", tags=["agents"])


def _employee_id(body: dict[str, Any]) -> str:
    employee_id = body.get("employeeId")
    if not employee_id:
        raise HTTPException(status_code=400, detail="employeeId is required.")
    return employee_id


@router.post("/ai/orchestrator")
def orchestrator(
    body: dict[str, Any] = Depends(json_body), session_user: dict = Depends(require_auth)
) -> dict[str, Any]:
    prompt = body.get("prompt")
    if not prompt:
        raise HTTPException(status_code=400, detail="A prompt is required for AI interactions.")
    # The subject whose skills and evidence ground the answer. Defaults to the caller;
    # naming someone else needs the same right as reading their record.
    subject_id = body.get("userId") or session_user["id"]
    ensure_may_access(session_user, subject_id)
    org_view = session_user["role"] in ORG_VIEW_ROLES
    return {"response": copilot.orchestrate(subject_id, prompt, body.get("agent"), org_view)}


@router.post("/manager/insight")
def manager_insight(
    body: dict[str, Any] = Depends(json_body), session_user: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    employee_id = _employee_id(body)
    ensure_may_access(session_user, employee_id)
    return {"insight": copilot.manager_insight(employee_id)}


@router.post("/manager/post-assessment")
def post_assessment(
    body: dict[str, Any] = Depends(json_body), session_user: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    employee_id = _employee_id(body)
    ensure_may_access(session_user, employee_id)
    result = copilot.post_assessment(employee_id, body.get("demandId"), session_user["id"])
    return {"success": True, **result}


@router.post("/manager/post-assessment/{id}/signoff")
def signoff_post_assessment(
    id: str,
    body: dict[str, Any] = Depends(json_body),
    session_user: dict = Depends(require_manager_or_above),
) -> dict[str, Any]:
    decision = body.get("decision")
    if decision not in ("cleared", "not_ready"):
        raise HTTPException(status_code=400, detail="decision must be 'cleared' or 'not_ready'.")
    # Sign-off is what unlocks the client resume, so only someone who may act on the
    # assessed employee can give it.
    existing = assessments.get_post_assessment(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Assessment not found")
    ensure_may_access(session_user, existing["employeeId"])
    return {"success": True, "assessment": copilot.sign_off_assessment(id, session_user["id"], decision)}


@router.post("/agent/generate-jd-assessment")
def generate_jd_assessment(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_auth)
) -> dict[str, Any]:
    target_role = body.get("targetRole")
    job_description = body.get("jobDescription")
    if not target_role or not job_description:
        raise HTTPException(status_code=400, detail="targetRole and jobDescription are required.")
    return {"success": True, "assessment": copilot.jd_assessment(target_role, job_description)}


@router.post("/agent/evaluate-interview-answer")
def evaluate_interview_answer(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_auth)
) -> dict[str, Any]:
    if not body.get("candidateAnswer"):
        raise HTTPException(status_code=400, detail="candidateAnswer is required.")
    return {"success": True, "evaluation": copilot.evaluate_answer(body)}


@router.post("/agent/complete-skillgap-assessment")
def complete_skillgap_assessment(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_self_or_elevated_body)
) -> dict[str, Any]:
    user_id = body.get("userId")
    if not user_id:
        raise HTTPException(status_code=400, detail="userId is required.")
    user = users.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "success": True,
        "userId": user_id,
        "overallScore": body.get("overallScore"),
        # Nothing is stored: the score was computed in the browser, so it is not
        # trusted as a record. The message used to say "recorded".
        "message": f"SkillGap assessment completed for {user['name']}.",
    }
