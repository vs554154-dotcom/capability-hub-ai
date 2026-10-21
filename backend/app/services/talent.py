"""Demand-to-Deployment: matching people to client demands, handing them off for
upskilling, and gating the client resume on persisted proof of readiness."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from .. import ai
from ..database import transaction
from ..errors import NotFound
from ..numeric import js_round
from ..repositories import assessments, catalog, demands, evidence, learning, reminders, user_skills, users

# --------------------------------------------------------------------------- #
# Adaptive upskilling timeline
#
# How long a candidate has before the client interview decides how intensive their
# track is. Matching and handoff use the same buckets; each phrases them its own way.
# --------------------------------------------------------------------------- #

_MATCH_TRACKS = (
    "1-Week Emergency Intensive Track",
    "2-Week Rapid Upskilling Track",
    "3-Week Focused Upskilling Track",
    "4-Week Targeted Roadmap",
    "{weeks}-Week Adaptive Capability Roadmap",
)
_HANDOFF_TRACKS = (
    "1-week emergency intensive sprint",
    "2-week rapid upskilling roadmap",
    "3-week focused upskilling roadmap",
    "4-week targeted roadmap",
    "{weeks}-week capability roadmap",
)


def days_until(target_date: str | None) -> int:
    """Whole days until `target_date`, never fewer than 3; 14 when there is no date."""
    if not target_date:
        return 14
    try:
        target = datetime.fromisoformat(target_date.replace("Z", "+00:00"))
    except ValueError:
        return 14
    return max(3, math.ceil((target - datetime.now(timezone.utc)).total_seconds() / 86400))


def track_for(days: int, labels: tuple[str, ...]) -> str:
    if days <= 7:
        return labels[0]
    if days <= 14:
        return labels[1]
    if days <= 21:
        return labels[2]
    if days <= 30:
        return labels[3]
    return labels[4].format(weeks=math.ceil(days / 7))


def locale_date(iso: str | None) -> str:
    """Day/month/year without zero padding (27/8/2026), for human-readable text."""
    if not iso:
        return "Upcoming"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return "Upcoming"
    return f"{dt.day}/{dt.month}/{dt.year}"


# --------------------------------------------------------------------------- #
# Matching
# --------------------------------------------------------------------------- #

def resolve_demand(body: dict[str, Any]) -> dict[str, Any]:
    """The demand to match against: by id, else an inline demand in the body, else
    the most recent demand."""
    demand_id = body.get("demandId")
    demand = demands.get_project_demand_by_id(demand_id) if demand_id else None
    if not demand and body.get("requiredSkills"):
        demand = body
    if not demand:
        open_demands = demands.get_project_demands()
        demand = open_demands[0] if open_demands else None
    if not demand:
        raise NotFound("Project Demand not found.")
    return demand


def match_candidates(demand: dict[str, Any]) -> dict[str, Any]:
    """Score every employee against the demand and rank them, with a written
    explanation and recommended next actions for each.

    overall = 45% technical + 20% domain + 15% experience + 20% capability readiness,
    capped at 99. Below 80 the candidate needs upskilling before the interview.
    """
    with transaction():
        employees = [u for u in users.get_users() if u["role"] == "employee"]
        all_skills = catalog.get_skills()
        all_evidence = evidence.get_evidences()
        levels_by_user = {e["id"]: user_skills.get_user_skills(e["id"]) for e in employees}

    required = demand.get("requiredSkills") or []
    days = days_until(demand.get("clientInterviewDate") or demand.get("expectedJoiningDate"))
    timeline = track_for(days, _MATCH_TRACKS)
    interview_date = locale_date(demand.get("clientInterviewDate"))
    matches: list[dict[str, Any]] = []

    for emp in employees:
        levels = levels_by_user[emp["id"]]
        approved = [e for e in all_evidence if e["userId"] == emp["id"] and e["status"] == "approved"]

        # Technical: a requirement is met by a held skill at level 3+ (verified
        # competency), a listed primary skill, or the person's title or role.
        matched = 0
        missing: list[str] = []
        for req_name in required:
            req = req_name.lower()
            skill = next(
                (s for s in all_skills if req in s["name"].lower() or s["name"].lower() in req),
                None,
            )
            hit = False
            if skill:
                held = next((u for u in levels if u["skillId"] == skill["id"]), None)
                if held and held["currentLevel"] >= 3:
                    hit = True
            if not hit and emp.get("primarySkills"):
                hit = any(req in ps.lower() or ps.lower() in req for ps in emp["primarySkills"])
            if not hit:
                primary_role = (emp.get("primaryRole") or "").lower()
                hit = req in emp["title"].lower() or bool(primary_role and req in primary_role)
            if hit:
                matched += 1
            else:
                missing.append(req_name)

        technical = js_round(((matched / len(required)) if required else 0.8) * 100)

        dept = emp["department"].lower()
        emp_domain = (emp.get("domain") or emp["department"]).lower()
        demand_domain = (demand.get("domain") or "").lower()
        domain = 75
        if emp_domain and demand_domain and (demand_domain in emp_domain or emp_domain in demand_domain):
            domain = 95
        elif "ai" in dept and "fintech" in demand_domain:
            domain = 90
        elif "qa" in dept and "health" in demand_domain:
            domain = 95
        elif demand_domain and (demand_domain in dept or dept in demand_domain):
            domain = 90

        digits = "".join(c for c in emp["id"] if c.isdigit())
        years = emp.get("experienceYears")
        if years is None:
            years = min(10, 2 + ((int(digits) if digits else 1) % 7))
        exp_min = demand.get("experienceRangeMin", 0)
        exp_max = demand.get("experienceRangeMax", 0)
        experience = 85
        if years < exp_min:
            experience = 60
        elif exp_min <= years <= exp_max:
            experience = 100

        total_levels = sum(u["currentLevel"] for u in levels)
        avg_level = (total_levels / (len(levels) * 5)) * 100 if levels else 70
        readiness = min(100, js_round(avg_level * 0.8 + min(20, len(approved) * 10)))

        overall = min(99, js_round(
            technical * 0.45 + domain * 0.20 + experience * 0.15 + readiness * 0.20
        ))
        handoff_required = overall < 80

        gap_text = (
            f"Capability gap identified in: {', '.join(missing)}. "
            "Handoff to SkillGap Agent recommended."
            if handoff_required else "Resource is client interview ready!"
        )
        explanation = (
            f"{emp['name']} scored {overall}% overall match for "
            f"'{demand.get('projectName')}'. Technical Match is {technical}% "
            f"based on {matched} of {len(required)} required competencies "
            f"verified. Verified Workplace Evidence: {len(approved)} approved "
            f"artifacts. {gap_text}"
        )
        if handoff_required:
            actions = [
                f"Invoke SkillGap Agent to initiate {timeline} for: {', '.join(missing[:2])}",
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
            "experienceYears": years,
            "domain": emp.get("domain") or emp["department"],
            "primaryRole": emp.get("primaryRole") or emp["title"],
            "primarySkills": emp.get("primarySkills") or [],
            "overallMatchPct": overall,
            "technicalMatchPct": technical,
            "domainMatchPct": domain,
            "experienceMatchPct": experience,
            "capabilityReadiness": readiness,
            "confidenceScore": js_round(85 + (overall * 0.1)),
            "matchExplanation": explanation,
            "missingSkills": missing,
            "handOffRequired": handoff_required,
            "verifiedEvidenceCount": len(approved),
            "recommendedActions": actions,
        })

    matches.sort(key=lambda m: m["overallMatchPct"], reverse=True)
    return {"success": True, "demand": demand, "totalCandidatesEvaluated": len(matches), "matches": matches}


# --------------------------------------------------------------------------- #
# Demand intake
# --------------------------------------------------------------------------- #

def parse_job_description(text: str) -> dict[str, Any]:
    """Extract structured demand fields from a pasted job description. Without a
    model, the raw text comes back in the description so the manager can finish the
    form by hand rather than losing what they pasted."""
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
        return parsed
    return {
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
    }


# --------------------------------------------------------------------------- #
# Handoff, shortlist and client resume
# --------------------------------------------------------------------------- #

def handoff(
    employee_id: str,
    demand_id: str | None,
    missing_skills: list[str],
    client_interview_date: str | None,
) -> dict[str, Any]:
    """Hand a matched candidate to the SkillGap agent: snapshot their current levels
    as the baseline growth will be measured against, and send them an escalation
    with their upskilling track. Both commit together."""
    with transaction():
        emp = users.get_user_by_id(employee_id)
        if not emp:
            raise NotFound("Employee not found.")

        demand = (demands.get_project_demand_by_id(demand_id) if demand_id else None) or {}
        if demand_id:
            assessments.capture_baselines(
                emp["id"],
                [(s["skillId"], s["currentLevel"]) for s in user_skills.get_user_skills(emp["id"])],
                demand_id,
            )

        target_skills = ", ".join(missing_skills) if missing_skills else "Target Project Competencies"
        interview_formatted = (
            locale_date(client_interview_date) if client_interview_date
            else "Upcoming Client Interview"
        )
        track = track_for(
            days_until(client_interview_date or demand.get("expectedJoiningDate")), _HANDOFF_TRACKS
        )
        customer = demand.get("customerName") or "Client"
        project = demand.get("projectName") or "Project Demand"

        reminder = reminders.create_reminder(
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


def active_shortlist(user_id: str) -> dict[str, Any] | None:
    """The demand a person is shortlisted for. A handoff is exactly what captures
    their baselines, so the most recent capture identifies the active opportunity -
    no second source of truth to disagree with it. A demand deleted after handoff
    counts as no shortlist rather than a half-populated banner."""
    with transaction():
        latest = assessments.get_latest_handoff(user_id)
        if not latest:
            return None
        demand = demands.get_project_demand_by_id(latest["demandId"])
    if not demand:
        return None
    return {"demand": demand, "shortlistedAt": latest["capturedAt"]}


def skill_growth(user_id: str, demand_id: str) -> list[dict[str, Any]]:
    """Each baselined skill's level at handoff against its level now."""
    with transaction():
        baselines = assessments.get_baselines(user_id, demand_id)
        current = user_skills.get_user_skills(user_id)
        names = catalog.get_skills()
    growth = []
    for b in baselines:
        held = next((s for s in current if s["skillId"] == b["skillId"]), None)
        name = next((s["name"] for s in names if s["id"] == b["skillId"]), b["skillId"])
        growth.append({
            "skillId": b["skillId"],
            "skillName": name,
            "baselineLevel": b["baselineLevel"],
            "currentLevel": held["currentLevel"] if held else b["baselineLevel"],
        })
    return growth


def resume_eligibility(employee_id: str, demand_id: str) -> dict[str, Any]:
    """All three must hold before a client resume can be generated: the
    project-hiring track for this demand is complete, a manager has signed off the
    post-training assessment, and at least one skill grew since handoff."""
    reasons: list[str] = []

    with transaction():
        steps = [
            s for s in learning.get_learning_plan(employee_id)
            if s.get("demandId") == demand_id and s.get("purpose") == "project_hiring"
        ]
        latest = assessments.get_latest_post_assessment(employee_id, demand_id)
        growth = skill_growth(employee_id, demand_id)

    training_complete = bool(steps) and all(s["status"] == "completed" for s in steps)
    if not steps:
        reasons.append(
            "No project-hiring learning track has been assigned for this employee "
            "and this demand yet."
        )
    elif not training_complete:
        remaining = sum(1 for s in steps if s["status"] != "completed")
        reasons.append(f"{remaining} of {len(steps)} learning track step(s) are not yet completed.")

    assessment_cleared = bool(latest) and latest["status"] == "cleared"
    if not latest:
        reasons.append(
            "No post-training GROW assessment has been generated for this employee "
            "and this demand yet."
        )
    elif latest["status"] == "pending_signoff":
        reasons.append(
            "The post-training assessment has been generated but not yet signed off "
            "by a manager."
        )
    elif latest["status"] == "not_ready":
        reasons.append("The most recent post-training assessment was marked 'not ready' by a manager.")

    growth_identified = bool(growth) and any(g["currentLevel"] > g["baselineLevel"] for g in growth)
    if not growth:
        reasons.append(
            "No skill baseline was captured for this employee and this demand "
            "(handoff may not have run)."
        )
    elif not growth_identified:
        reasons.append("No measurable skill growth was found since this employee was matched to this demand.")

    return {
        "eligible": training_complete and assessment_cleared and growth_identified,
        "trainingComplete": training_complete,
        "assessmentCleared": assessment_cleared,
        "skillGrowthIdentified": growth_identified,
        "reasons": reasons,
        "growthDetail": growth,
    }


def client_resume(employee: dict[str, Any], demand_id: str, eligibility: dict[str, Any]) -> str:
    """A client-ready resume built only from verified facts. The caller has already
    confirmed eligibility; the model is told not to invent anything, and the
    fallback is assembled from the same facts."""
    with transaction():
        demand = demands.get_project_demand_by_id(demand_id) or {}
        approved = [e for e in evidence.get_for_user(employee["id"]) if e["status"] == "approved"]

    growth_lines = "\n".join(
        f"- {g['skillName']}: level {g['baselineLevel']} -> {g['currentLevel']}"
        for g in eligibility["growthDetail"]
    )
    evidence_lines = "\n".join(f"- {e['title']}: {e['description']}" for e in approved) or "None"

    prompt = (
        "Generate a client-ready resume summary. Use ONLY the verified facts below. "
        "Do not invent employers, dates, certifications or projects.\n\n"
        f"Candidate: {employee['name']} ({employee['title']}, "
        f"{employee.get('experienceYears', 'n/a')} years)\n"
        f"Engagement: {demand.get('projectName')} for {demand.get('customerName')}\n"
        f"Verified skill growth:\n{growth_lines}\n"
        f"Approved workplace evidence:\n{evidence_lines}\n"
    )
    return ai.generate(prompt, temperature=0.4) or (
        f"{employee['name']} - {employee['title']}\n\n"
        f"Proposed for {demand.get('projectName')} ({demand.get('customerName')}).\n\n"
        f"Verified capability growth during preparation:\n{growth_lines}\n\n"
        f"Approved workplace evidence:\n{evidence_lines}\n"
    )
