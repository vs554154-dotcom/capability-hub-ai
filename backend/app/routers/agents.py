"""AI copilot routes: the orchestrator, the GROW coach and the SkillGap agent.

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
)
from ..repositories import assessments
from ..services import copilot, skillgap

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
    if not isinstance(prompt, str) or not prompt.strip():
        raise HTTPException(status_code=400, detail="A prompt is required for AI interactions.")
    # The subject whose skills and evidence ground the answer. Defaults to the caller;
    # naming someone else needs the same right as reading their record.
    subject_id = body.get("userId") or session_user["id"]
    ensure_may_access(session_user, subject_id)
    org_view = session_user["role"] in ORG_VIEW_ROLES
    if body.get("agent") == "coach" and org_view and subject_id == session_user["id"]:
        # A manager coaching asks about their reports, not about themselves.
        return {"response": copilot.coach_team(session_user, prompt)}
    return {"response": copilot.orchestrate(
        subject_id, prompt, body.get("agent"), org_view, body.get("skillId")
    )}


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
    body: dict[str, Any] = Depends(json_body), session_user: dict = Depends(require_auth)
) -> dict[str, Any]:
    # Always for the signed-in person: the result is their record.
    return {"success": True, "assessment": skillgap.start(session_user, body)}


@router.post("/agent/assessment-answer")
def answer_question(
    body: dict[str, Any] = Depends(json_body), session_user: dict = Depends(require_auth)
) -> dict[str, Any]:
    return {"success": True, **skillgap.answer_mcq(
        session_user, body.get("assessmentId"), body.get("questionId"), body.get("optionIndex")
    )}


@router.post("/agent/evaluate-interview-answer")
def evaluate_interview_answer(
    body: dict[str, Any] = Depends(json_body), session_user: dict = Depends(require_auth)
) -> dict[str, Any]:
    """Evaluate one answer. With an assessmentId it answers a stored question and
    counts towards that assessment; without one it is practice and nothing is kept."""
    answer = body.get("candidateAnswer")
    if not isinstance(answer, str) or not answer.strip():
        raise HTTPException(status_code=400, detail="candidateAnswer is required.")
    if body.get("assessmentId"):
        evaluation = skillgap.evaluate_for(
            session_user, body["assessmentId"], body.get("questionId"), answer
        )
    else:
        evaluation = skillgap.evaluate_answer(body)
    return {"success": True, "evaluation": evaluation}


@router.post("/agent/complete-skillgap-assessment")
def complete_skillgap_assessment(
    body: dict[str, Any] = Depends(json_body), session_user: dict = Depends(require_auth)
) -> dict[str, Any]:
    """Score and store the result. Every score comes from the stored answers; a score
    in the request is ignored."""
    return {"success": True, "assessment": skillgap.finish(
        session_user, body.get("assessmentId"), body.get("willAnswers")
    )}
