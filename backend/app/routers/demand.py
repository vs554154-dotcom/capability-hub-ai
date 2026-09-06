"""Project demand and talent-matching routes (Stage 3).

Port of the Demand-to-Deployment endpoints in server.ts. The AI-backed handlers
(parse-jd, generate-client-resume, post-assessment narrative) are Stage 4; the
deterministic matching engine below is fully ported.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from .. import ai, db
from ..deps import require_auth, require_manager_or_above
from ..numeric import js_round

router = APIRouter(prefix="/api", tags=["demand"])


def _js_locale_date(iso: str | None) -> str:
    """Reproduce Node's Date.toLocaleDateString() as observed on this deployment:
    day/month/year with no zero padding (e.g. 27/8/2026).

    This is locale-dependent in Node, so it is the one string in the port that can
    legitimately differ between machines. It only appears inside human-readable
    recommendation text, never in a value the UI parses.
    """
    if not iso:
        return "Upcoming"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return "Upcoming"
    return f"{dt.day}/{dt.month}/{dt.year}"


@router.get("/analytics/eri")
async def enterprise_readiness_index() -> dict[str, Any]:
    # Public in server.ts, and currently a fixed board-level summary.
    return {
        "success": True,
        "enterpriseReadinessIndex": 84,
        "capabilityScore": 82,
        "deploymentSpeed": 88,
        "verificationRate": 91,
    }


@router.get("/project-demand/list")
async def list_demands(_: dict = Depends(require_auth)) -> dict[str, Any]:
    return {"success": True, "demands": db.get_project_demands()}


@router.post("/project-demand/create", status_code=201)
async def create_demand(
    request: Request, _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    data = await request.json()
    if not all(data.get(f) for f in ("projectName", "customerName", "businessUnit")):
        raise HTTPException(
            status_code=400,
            detail="Project Name, Customer Name, and Business Unit are required.",
        )
    return {"success": True, "demand": db.create_project_demand(data)}


@router.post("/project-demand/match")
async def match_candidates(
    request: Request, _: dict = Depends(require_auth)
) -> dict[str, Any]:
    body = await request.json()
    demand_id = body.get("demandId")

    demand = db.get_project_demand_by_id(demand_id) if demand_id else None
    if not demand and body.get("requiredSkills"):
        demand = body                      # direct payload match
    if not demand:
        demands = db.get_project_demands()
        demand = demands[0] if demands else None
    if not demand:
        raise HTTPException(status_code=404, detail="Project Demand not found.")

    employees = [u for u in db.get_users() if u["role"] == "employee"]
    all_skills = db.get_skills()
    all_evidences = db.get_evidences()

    required_skills = demand.get("requiredSkills") or []
    matches: list[dict[str, Any]] = []

    for emp in employees:
        user_skills = db.get_user_skills(emp["id"])
        emp_evidences = [
            e for e in all_evidences
            if e["userId"] == emp["id"] and e["status"] == "approved"
        ]

        # --- technical match -------------------------------------------------
        matched_req = 0
        missing_skills: list[str] = []

        for req_name in required_skills:
            req_lower = req_name.lower()
            skill_obj = next(
                (s for s in all_skills
                 if req_lower in s["name"].lower() or s["name"].lower() in req_lower),
                None,
            )

            is_matched = False
            if skill_obj:
                user_sk = next(
                    (us for us in user_skills if us["skillId"] == skill_obj["id"]), None
                )
                # Level 3 is the bar for "verified competency".
                if user_sk and user_sk["currentLevel"] >= 3:
                    is_matched = True

            if not is_matched and emp.get("primarySkills"):
                if any(
                    req_lower in ps.lower() or ps.lower() in req_lower
                    for ps in emp["primarySkills"]
                ):
                    is_matched = True

            if not is_matched:
                title = emp["title"].lower()
                primary_role = (emp.get("primaryRole") or "").lower()
                if req_lower in title or (primary_role and req_lower in primary_role):
                    is_matched = True

            if is_matched:
                matched_req += 1
            else:
                missing_skills.append(req_name)

        tech_ratio = (matched_req / len(required_skills)) if required_skills else 0.8
        technical_match = js_round(tech_ratio * 100)

        # --- domain match ----------------------------------------------------
        emp_dept = emp["department"].lower()
        emp_domain = (emp.get("domain") or emp["department"]).lower()
        demand_domain = (demand.get("domain") or "").lower()

        domain_match = 75
        if emp_domain and demand_domain and (
            demand_domain in emp_domain or emp_domain in demand_domain
        ):
            domain_match = 95
        elif "ai" in emp_dept and "fintech" in demand_domain:
            domain_match = 90
        elif "qa" in emp_dept and "health" in demand_domain:
            domain_match = 95
        elif demand_domain and (demand_domain in emp_dept or emp_dept in demand_domain):
            domain_match = 90

        # --- experience match ------------------------------------------------
        digits = "".join(c for c in emp["id"] if c.isdigit())
        num_id = int(digits) if digits else 1
        exp_years = emp.get("experienceYears")
        if exp_years is None:
            exp_years = min(10, 2 + (num_id % 7))

        experience_match = 85
        if exp_years < demand.get("experienceRangeMin", 0):
            experience_match = 60
        elif demand.get("experienceRangeMin", 0) <= exp_years <= demand.get("experienceRangeMax", 0):
            experience_match = 100

        # --- capability readiness -------------------------------------------
        total_levels = sum(us["currentLevel"] for us in user_skills)
        avg_skill_level = (
            (total_levels / (len(user_skills) * 5)) * 100 if user_skills else 70
        )
        evidence_bonus = min(20, len(emp_evidences) * 10)
        capability_readiness = min(100, js_round(avg_skill_level * 0.8 + evidence_bonus))

        overall = min(99, js_round(
            technical_match * 0.45
            + domain_match * 0.20
            + experience_match * 0.15
            + capability_readiness * 0.20
        ))

        handoff_required = overall < 80

        # --- adaptive timeline ------------------------------------------------
        target_date = demand.get("clientInterviewDate") or demand.get("expectedJoiningDate")
        days_available = 14
        if target_date:
            try:
                target = datetime.fromisoformat(target_date.replace("Z", "+00:00"))
                diff = (target - datetime.now(timezone.utc)).total_seconds()
                days_available = max(3, math.ceil(diff / 86400))
            except ValueError:
                pass

        if days_available <= 7:
            timeline = "1-Week Emergency Intensive Track"
        elif days_available <= 14:
            timeline = "2-Week Rapid Upskilling Track"
        elif days_available <= 21:
            timeline = "3-Week Focused Upskilling Track"
        elif days_available <= 30:
            timeline = "4-Week Targeted Roadmap"
        else:
            timeline = f"{math.ceil(days_available / 7)}-Week Adaptive Capability Roadmap"

        gap_text = (
            f"Capability gap identified in: {', '.join(missing_skills)}. "
            "Handoff to SkillGap Agent recommended."
            if handoff_required else "Resource is client interview ready!"
        )
        explanation = (
            f"{emp['name']} scored {overall}% overall match for "
            f"'{demand.get('projectName')}'. Technical Match is {technical_match}% "
            f"based on {matched_req} of {len(required_skills)} required competencies "
            f"verified. Verified Workplace Evidence: {len(emp_evidences)} approved "
            f"artifacts. {gap_text}"
        )

        interview_date = _js_locale_date(demand.get("clientInterviewDate"))
        if handoff_required:
            actions = [
                f"Invoke SkillGap Agent to initiate {timeline} for: "
                f"{', '.join(missing_skills[:2])}",
                f"Schedule mock interview targeted for {demand.get('customerName')} "
                f"interview date ({interview_date})",
                "Assign mentor to guide workplace evidence submission",
            ]
        else:
            actions = [
                f"Submit candidate match profile & resume evidence breakdown to "
                f"{demand.get('customerName')} delivery team",
                f"Schedule client interview before "
                f"{interview_date if demand.get('clientInterviewDate') else 'due date'}",
            ]

        matches.append({
            "employeeId": emp["id"],
            "fullName": emp["name"],
            "currentRole": emp["title"],
            "avatar": emp["avatar"],
            "department": emp["department"],
            "experienceYears": exp_years,
            "domain": emp.get("domain") or emp["department"],
            "primaryRole": emp.get("primaryRole") or emp["title"],
            "primarySkills": emp.get("primarySkills") or [],
            "overallMatchPct": overall,
            "technicalMatchPct": technical_match,
            "domainMatchPct": domain_match,
            "experienceMatchPct": experience_match,
            "capabilityReadiness": capability_readiness,
            "confidenceScore": js_round(85 + (overall * 0.1)),
            "matchExplanation": explanation,
            "missingSkills": missing_skills,
            "handOffRequired": handoff_required,
            "verifiedEvidenceCount": len(emp_evidences),
            "recommendedActions": actions,
        })

    matches.sort(key=lambda m: m["overallMatchPct"], reverse=True)

    return {
        "success": True,
        "demand": demand,
        "totalCandidatesEvaluated": len(matches),
        "matches": matches,
    }


# --------------------------------------------------------------------------- #
# Handoff, eligibility and client resume
# --------------------------------------------------------------------------- #

@router.post("/project-demand/parse-jd")
async def parse_jd(
    request: Request, _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    body = await request.json()
    text = (body.get("jobDescriptionText") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Job description text is required.")

    prompt = (
        "Extract structured project demand fields from this job description.\n\n"
        f"{text}\n\n"
        "Return JSON only, shaped as:\n"
        '{"projectName": string, "customerName": string, "businessUnit": string, '
        '"projectDescription": string, "requiredSkills": [string], '
        '"preferredSkills": [string], "experienceRangeMin": number, '
        '"experienceRangeMax": number, "technologyStack": [string], '
        '"resourcesRequired": number, "projectPriority": string, "location": string, '
        '"domain": string, "employmentType": string}'
    )

    parsed = ai.generate_json(prompt, temperature=0.3)
    if parsed:
        return {"success": True, "parsed": parsed}

    # Without a model, hand the raw text back inside the description so the manager
    # can finish the form by hand rather than losing what they pasted.
    return {
        "success": True,
        "parsed": {
            "projectName": "",
            "customerName": "",
            "businessUnit": "",
            "projectDescription": text[:600],
            "rawJobDescription": text,
            "requiredSkills": [],
            "preferredSkills": [],
            "experienceRangeMin": 0,
            "experienceRangeMax": 0,
            "technologyStack": [],
            "resourcesRequired": 1,
            "projectPriority": "MEDIUM",
            "location": "",
            "domain": "",
            "employmentType": "Full-Time",
            "_fallback": True,
        },
    }


@router.post("/project-demand/handoff-skillgap")
async def handoff_skillgap(
    request: Request, _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    body = await request.json()
    emp = db.get_user_by_id(body.get("employeeId") or "E1000")
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")

    demand_id = body.get("demandId")
    demand = db.get_project_demand_by_id(demand_id) if demand_id else None
    demand = demand or {}
    missing_skills = body.get("missingSkills") or []
    client_interview_date = body.get("clientInterviewDate")

    # Snapshot the "before" skill levels for this demand. Runs once per
    # employee+demand, so a repeat handoff cannot reset the baseline that skill
    # growth is later measured against.
    if demand_id:
        db.capture_skill_baselines(emp["id"], demand_id)

    target_skills = (
        ", ".join(missing_skills) if missing_skills else "Target Project Competencies"
    )
    interview_formatted = (
        _js_locale_date(client_interview_date)
        if client_interview_date else "Upcoming Client Interview"
    )

    days_available = 14
    target_date = client_interview_date or demand.get("expectedJoiningDate")
    if target_date:
        try:
            target = datetime.fromisoformat(target_date.replace("Z", "+00:00"))
            days_available = max(
                3,
                math.ceil(
                    (target - datetime.now(timezone.utc)).total_seconds() / 86400
                ),
            )
        except ValueError:
            pass

    if days_available <= 7:
        track = "1-week emergency intensive sprint"
    elif days_available <= 14:
        track = "2-week rapid upskilling roadmap"
    elif days_available <= 21:
        track = "3-week focused upskilling roadmap"
    elif days_available <= 30:
        track = "4-week targeted roadmap"
    else:
        track = f"{math.ceil(days_available / 7)}-week capability roadmap"

    customer = demand.get("customerName") or "Client"
    project = demand.get("projectName") or "Project Demand"

    reminder = db.create_reminder(
        emp["id"],
        demand.get("projectName") or "Project Opportunity",
        "escalation",
        f"SkillGap Handoff: Upskilling Required for {customer} Interview",
        f"You have been matched for '{project}'. Missing competencies identified: "
        f"[{target_skills}]. Your {track} is prioritized for your client interview "
        f"on {interview_formatted}.",
    )

    return {
        "success": True,
        "message": (
            "Handoff payload delivered successfully to SkillGap-to-Growth Agent "
            f"for {emp['name']}."
        ),
        "employeeId": emp["id"],
        "targetRole": project,
        "missingSkills": missing_skills,
        "clientInterviewDate": demand.get("clientInterviewDate"),
        "reminder": reminder,
    }


@router.get("/project-demand/{demandId}/resume-eligibility/{employeeId}")
async def resume_eligibility(
    demandId: str, employeeId: str, _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    if not db.get_user_by_id(employeeId):
        raise HTTPException(status_code=404, detail="Employee not found")
    return db.check_client_resume_eligibility(employeeId, demandId)


@router.post("/project-demand/generate-client-resume")
async def generate_client_resume(
    request: Request, _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    body = await request.json()
    demand_id = body.get("demandId")

    # Same order and defaults as server.ts: employee lookup falls back to E1000,
    # is checked first, then demandId is required separately.
    emp = db.get_user_by_id(body.get("employeeId") or "E1000")
    if not emp:
        raise HTTPException(status_code=404, detail="Employee profile not found.")

    if not demand_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "A demandId is required - the Client Resume Generator only runs for "
                "project-hiring engagements tied to a specific demand, not general "
                "upskilling."
            ),
        )

    employee_id = emp["id"]

    # Zero-hallucination guardrail: generation is gated on persisted proof -
    # completed track, manager sign-off, and measured skill growth - never on
    # anything the caller asserts in the request. Refusal is a 403, not a 200
    # with success:false, so the client treats it as a hard block.
    eligibility = db.check_client_resume_eligibility(employee_id, demand_id)
    if not eligibility["eligible"]:
        return JSONResponse(
            status_code=403,
            content={
                "error": "This employee is not yet eligible for client resume generation.",
                "reasons": eligibility["reasons"],
                "eligibility": eligibility,
            },
        )

    demand = db.get_project_demand_by_id(demand_id) or {}
    growth_lines = "\n".join(
        f"- {g['skillName']}: level {g['baselineLevel']} -> {g['currentLevel']}"
        for g in eligibility["growthDetail"]
    )
    evidence = [
        e for e in db.get_evidences()
        if e["userId"] == employee_id and e["status"] == "approved"
    ]
    evidence_lines = (
        "\n".join(f"- {e['title']}: {e['description']}" for e in evidence) or "None"
    )

    prompt = (
        "Generate a client-ready resume summary. Use ONLY the verified facts below. "
        "Do not invent employers, dates, certifications or projects.\n\n"
        f"Candidate: {emp['name']} ({emp['title']}, "
        f"{emp.get('experienceYears', 'n/a')} years)\n"
        f"Engagement: {demand.get('projectName')} for {demand.get('customerName')}\n"
        f"Verified skill growth:\n{growth_lines}\n"
        f"Approved workplace evidence:\n{evidence_lines}\n"
    )

    resume = ai.generate(prompt, temperature=0.4) or (
        f"{emp['name']} - {emp['title']}\n\n"
        f"Proposed for {demand.get('projectName')} ({demand.get('customerName')}).\n\n"
        f"Verified capability growth during preparation:\n{growth_lines}\n\n"
        f"Approved workplace evidence:\n{evidence_lines}\n"
    )

    return {
        "success": True,
        "eligible": True,
        "resume": resume,
        "eligibility": eligibility,
    }
