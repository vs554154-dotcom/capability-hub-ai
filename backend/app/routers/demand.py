"""Demand-to-Deployment routes: demands, matching, handoff and the client resume."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from ..deps import LD, LEADERSHIP, json_body, require_auth, require_manager_or_above, require_role
from ..repositories import demands, users
from ..services import analytics, talent

router = APIRouter(prefix="/api", tags=["demand"])


@router.get("/analytics/eri")
def enterprise_readiness_index(_: dict = Depends(require_manager_or_above)) -> dict[str, Any]:
    # Board-level metrics for the Leadership dashboard; no reason to serve them to a
    # signed-out visitor, which this route previously did.
    return analytics.enterprise_readiness_index()


@router.get("/analytics/leadership")
def leadership_overview(_: dict = Depends(require_manager_or_above)) -> dict[str, Any]:
    return analytics.leadership_overview()


@router.get("/analytics/ld")
def ld_overview(_: dict = Depends(require_manager_or_above)) -> dict[str, Any]:
    return analytics.ld_overview()


@router.post("/analytics/campaign")
def launch_campaign(
    body: dict[str, Any] = Depends(json_body),
    session_user: dict = Depends(require_role(LD, LEADERSHIP)),
) -> dict[str, Any]:
    # Reminds employees across the whole organisation, so it is limited to the roles
    # that own organisation-wide learning: L&D and leadership, not line managers.
    if not body.get("skillId"):
        raise HTTPException(status_code=400, detail="skillId is required.")
    return analytics.launch_campaign(body["skillId"], session_user)


@router.get("/project-demand/list")
def list_demands(_: dict = Depends(require_auth)) -> dict[str, Any]:
    return {"success": True, "demands": demands.get_project_demands()}


@router.post("/project-demand/create", status_code=201)
def create_demand(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    if not all(body.get(f) for f in ("projectName", "customerName", "businessUnit")):
        raise HTTPException(
            status_code=400, detail="Project Name, Customer Name, and Business Unit are required."
        )
    return {"success": True, "demand": demands.create_project_demand(body)}


@router.post("/project-demand/match")
def match_candidates(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    # Talent sourcing spans the whole organisation, so a manager sees every
    # candidate - but each match profile carries an employee's skills, experience and
    # readiness, so employees (who previously could) cannot run it.
    return talent.match_candidates(talent.resolve_demand(body))


@router.post("/project-demand/parse-jd")
def parse_jd(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    text = (body.get("jobDescriptionText") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Job description text is required.")
    return {"success": True, "parsed": talent.parse_job_description(text)}


@router.post("/project-demand/handoff-skillgap")
def handoff_skillgap(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    if not body.get("employeeId"):
        raise HTTPException(status_code=400, detail="employeeId is required.")
    return talent.handoff(
        body["employeeId"],
        body.get("demandId"),
        body.get("missingSkills") or [],
        body.get("clientInterviewDate"),
    )


@router.get("/project-demand/{demandId}/resume-eligibility/{employeeId}")
def resume_eligibility(
    demandId: str, employeeId: str, _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    if not users.get_user_by_id(employeeId):
        raise HTTPException(status_code=404, detail="Employee not found")
    return talent.resume_eligibility(employeeId, demandId)


@router.post("/project-demand/generate-client-resume")
def generate_client_resume(
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_manager_or_above)
) -> Any:
    if not body.get("employeeId"):
        raise HTTPException(status_code=400, detail="employeeId is required.")
    employee = users.get_user_by_id(body["employeeId"])
    if not employee:
        raise HTTPException(status_code=404, detail="Employee profile not found.")

    demand_id = body.get("demandId")
    if not demand_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "A demandId is required - the Client Resume Generator only runs for "
                "project-hiring engagements tied to a specific demand, not general "
                "upskilling."
            ),
        )

    # Zero-hallucination guardrail: generation is gated on persisted proof, never on
    # anything the caller asserts. A refusal is a 403, not a 200 with success:false,
    # so the client treats it as a hard block.
    eligibility = talent.resume_eligibility(employee["id"], demand_id)
    if not eligibility["eligible"]:
        return JSONResponse(
            status_code=403,
            content={
                "error": "This employee is not yet eligible for client resume generation.",
                "reasons": eligibility["reasons"],
                "eligibility": eligibility,
            },
        )

    return {
        "success": True,
        "eligible": True,
        "resume": talent.client_resume(employee, demand_id, eligibility),
        "eligibility": eligibility,
    }
