"""Demand-to-Deployment routes: demands, matching, handoff and the client resume."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from ..deps import json_body, require_auth, require_manager_or_above
from ..repositories import demands, users
from ..services import analytics, talent

router = APIRouter(prefix="/api", tags=["demand"])


@router.get("/analytics/eri")
def enterprise_readiness_index() -> dict[str, Any]:
    return analytics.enterprise_readiness_index()


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
    body: dict[str, Any] = Depends(json_body), _: dict = Depends(require_auth)
) -> dict[str, Any]:
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
    return talent.handoff(
        body.get("employeeId") or "E1000",
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
    employee = users.get_user_by_id(body.get("employeeId") or "E1000")
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
