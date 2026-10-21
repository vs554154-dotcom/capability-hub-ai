"""AI copilot routes: the orchestrator, the GROW coach and the interview agent.

Each answers with generated text when Gemini is reachable and a deterministic
fallback when it is not, so these endpoints always return 200 on valid input.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..deps import json_body, require_auth, require_manager_or_above, require_self_or_elevated_body
from ..repositories import users
from ..services import copilot

router = APIRouter(prefix="/api", tags=["agents"])


@router.post("/ai/orchestrator")
def orchestrator(body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_auth)) -> dict[str, Any]:
    prompt = body.get("prompt")
    if not prompt:
        raise HTTPException(status_code=400, detail="A prompt is required for AI interactions.")
    return {"response": copilot.orchestrate(body.get("userId") or "E1000", prompt, body.get("agent"))}


@router.post("/manager/insight")
def manager_insight(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    return {"insight": copilot.manager_insight(body.get("employeeId") or "E1000")}


@router.post("/manager/post-assessment")
def post_assessment(
    body: dict[str, Any] = Depends(json_body), session_user: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    result = copilot.post_assessment(
        body.get("employeeId") or "E1000", body.get("demandId"), session_user["id"]
    )
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
        "message": f"SkillGap assessment recorded for {user['name']}.",
    }
