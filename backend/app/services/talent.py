"""Demand-to-Deployment: matching people to client demands, handing them off for
upskilling, and gating the client resume on persisted proof of readiness."""
from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Any

from .. import ai
from ..database import transaction
from ..errors import Invalid, NotFound
from ..numeric import js_round
from ..repositories import assessments, catalog, demands, evidence, learning, reminders, user_skills, users
from .matching import VERIFIED_LEVEL, find_skill, mentioned_skills, requirement_status

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


def _moment(value: str | None) -> datetime | None:
    """A stored date as a UTC moment. Forms send a bare date (2026-12-20), which is
    read as UTC midnight: left without a zone, comparing it with the clock raised an
    error, so every demand created on screen failed to match."""
    if not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def days_until(target_date: str | None) -> int:
    """Whole days until `target_date`, never fewer than 3; 14 when there is no date."""
    target = _moment(target_date)
    if target is None:
        return 14
    return max(3, math.ceil((target - datetime.now(timezone.utc)).total_seconds() / 86400))


def has_passed(date: str | None) -> bool:
    """Is this date before today?"""
    moment = _moment(date)
    return moment is not None and moment.date() < datetime.now(timezone.utc).date()


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
    dt = _moment(iso)
    return f"{dt.day}/{dt.month}/{dt.year}" if dt else "Upcoming"


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
    if not required:
        raise Invalid("This demand lists no required skills, so there is nothing to match people against.")
    days = days_until(demand.get("clientInterviewDate") or demand.get("expectedJoiningDate"))
    timeline = track_for(days, _MATCH_TRACKS)
    interview_date = locale_date(demand.get("clientInterviewDate"))
    matches: list[dict[str, Any]] = []

    for emp in employees:
        levels = levels_by_user[emp["id"]]
        approved = [e for e in all_evidence if e["userId"] == emp["id"] and e["status"] == "approved"]

        # Technical: the requirements this person meets (see matching.py).
        status = requirement_status(
            emp, {u["skillId"]: u["currentLevel"] for u in levels}, required, all_skills
        )
        missing = [r["name"] for r in status if not r["met"]]
        matched = len(status) - len(missing)
        technical = js_round(matched / len(required) * 100)

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

        # Years that are not on record score as below the range. (They used to be
        # derived from the employee id.)
        years = emp.get("experienceYears")
        exp_min = demand.get("experienceRangeMin", 0)
        exp_max = demand.get("experienceRangeMax", 0)
        experience = 85
        if years is None or years < exp_min:
            experience = 60
        elif exp_min <= years <= exp_max:
            experience = 100

        total_levels = sum(u["currentLevel"] for u in levels)
        avg_level = (total_levels / (len(levels) * 5)) * 100 if levels else 0
        readiness = min(100, js_round(avg_level * 0.8 + min(20, len(approved) * 10)))

        overall = min(99, js_round(
            technical * 0.45 + domain * 0.20 + experience * 0.15 + readiness * 0.20
        ))
        handoff_required = overall < 80

        if missing:
            gap_text = f"Capability gap identified in: {', '.join(missing)}."
            if handoff_required:
                gap_text += " Handoff to SkillGap Agent recommended."
        elif handoff_required:
            gap_text = "Meets every required skill; the score is held down by domain, experience or readiness."
        else:
            gap_text = "Resource is client interview ready!"
        explanation = (
            f"{emp['name']} scored {overall}% overall match for "
            f"'{demand.get('projectName')}'. Technical Match is {technical}% "
            f"based on {matched} of {len(required)} required competencies "
            f"verified. Verified Workplace Evidence: {len(approved)} approved "
            f"artifacts. {gap_text}"
        )
        if handoff_required:
            actions = [
                f"Invoke SkillGap Agent to initiate {timeline} for: "
                f"{', '.join(missing[:2]) or 'capability readiness'}",
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

PRIORITIES = ("LOW", "MEDIUM", "HIGH", "CRITICAL")


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _names(value: Any) -> list[str]:
    """A list of distinct, non-empty names, whatever shape they arrived in."""
    items = value if isinstance(value, list) else []
    return list(dict.fromkeys(i.strip() for i in items if isinstance(i, str) and i.strip()))


def _whole(value: Any, default: int = 0) -> int:
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError, OverflowError):
        return default


def _date(value: Any) -> str:
    return value.strip() if isinstance(value, str) and _moment(value.strip()) else ""


def demand_fields(data: dict[str, Any]) -> dict[str, Any]:
    """A demand's fields with the right types and nothing made up: what is absent or
    unusable becomes empty. Used for a model's output and for a submitted form."""
    low, high = _whole(data.get("experienceRangeMin")), _whole(data.get("experienceRangeMax"))
    priority = _text(data.get("projectPriority")).upper()
    return {
        "projectName": _text(data.get("projectName")),
        "customerName": _text(data.get("customerName")),
        "businessUnit": _text(data.get("businessUnit")),
        "projectDescription": _text(data.get("projectDescription")),
        "rawJobDescription": _text(data.get("rawJobDescription")),
        "requiredSkills": _names(data.get("requiredSkills")),
        "preferredSkills": _names(data.get("preferredSkills")),
        "experienceRangeMin": low,
        "experienceRangeMax": max(low, high),
        "technologyStack": _names(data.get("technologyStack")),
        "resourcesRequired": max(1, _whole(data.get("resourcesRequired"), 1)),
        "clientInterviewDate": _date(data.get("clientInterviewDate")),
        "expectedJoiningDate": _date(data.get("expectedJoiningDate")),
        "projectPriority": priority if priority in PRIORITIES else "MEDIUM",
        "location": _text(data.get("location")),
        "domain": _text(data.get("domain")),
        "employmentType": _text(data.get("employmentType")) or "Full-Time",
        "additionalNotes": _text(data.get("additionalNotes")),
    }


def create_demand(body: dict[str, Any]) -> dict[str, Any]:
    """Publish a requisition. Its id, status and date are set here, never by the
    request, and it must name the skills people will be matched against."""
    fields = demand_fields(body)
    if not all(fields[f] for f in ("projectName", "customerName", "businessUnit")):
        raise Invalid("Project Name, Customer Name, and Business Unit are required.")
    if not fields["requiredSkills"]:
        raise Invalid("List at least one required skill, so candidates can be matched.")
    return demands.create_project_demand(fields)


def _read_job_description(text: str) -> dict[str, Any]:
    """What can be read from a job description without a model: catalogue skills it
    names, a range of years, and an interview date. Everything else stays empty for
    the manager to fill in."""
    skills = [s["name"] for s in mentioned_skills(text, catalog.get_skills())]
    years = re.search(r"(\d{1,2})\s*(?:-|\u2013|to)\s*(\d{1,2})\s*\+?\s*(?:years|yrs)", text, re.I)
    least = re.search(r"(\d{1,2})\s*\+?\s*(?:years|yrs)", text, re.I)
    low, high = (
        (years.group(1), years.group(2)) if years
        else (least.group(1), least.group(1)) if least else (0, 0)
    )
    date = re.search(r"interview\D{0,40}(\d{4}-\d{2}-\d{2})", text, re.I)
    return {
        "projectDescription": text[:600],
        "requiredSkills": skills,
        "technologyStack": skills,
        "experienceRangeMin": low,
        "experienceRangeMax": high,
        "clientInterviewDate": date.group(1) if date else "",
    }


def parse_job_description(text: str) -> dict[str, Any]:
    """Extract structured demand fields from a pasted job description. Without a
    model the skills, years and interview date are read from the text itself, and
    the result is marked as a fallback."""
    prompt = (
        "Extract structured project demand fields from this job description. Leave a "
        "field empty when the text does not state it.\n\n"
        f"{text}\n\n"
        "Return JSON only, shaped as:\n"
        '{"projectName": string, "customerName": string, "businessUnit": string, '
        '"projectDescription": string, "requiredSkills": [string], '
        '"preferredSkills": [string], "experienceRangeMin": number, '
        '"experienceRangeMax": number, "technologyStack": [string], '
        '"resourcesRequired": number, "clientInterviewDate": "YYYY-MM-DD", '
        '"expectedJoiningDate": "YYYY-MM-DD", "projectPriority": string, '
        '"location": string, "domain": string, "employmentType": string}'
    )
    parsed = ai.generate_json(prompt, temperature=0.3)
    if isinstance(parsed, dict):
        return {**demand_fields(parsed), "rawJobDescription": text}
    return {**demand_fields(_read_job_description(text)), "rawJobDescription": text, "_fallback": True}


# --------------------------------------------------------------------------- #
# Handoff, shortlist and client resume
# --------------------------------------------------------------------------- #

def capture_project_baseline(employee_id: str, demand: dict[str, Any]) -> None:
    """Record the levels growth will be measured from. Every skill the demand
    requires is included, also one the person has no record of yet: that is the level
    a new record starts at. Without those, the skills a person is trained in are
    exactly the ones whose growth could not be measured."""
    levels = {s["skillId"]: s["currentLevel"] for s in user_skills.get_user_skills(employee_id)}
    skills = catalog.get_skills()
    for name in demand["requiredSkills"]:
        skill = find_skill(name, skills)
        if skill:
            levels.setdefault(skill["id"], user_skills.STARTING_LEVEL)
    assessments.capture_baselines(employee_id, list(levels.items()), demand["id"])


def requirements_for(
    person: dict[str, Any], demand: dict[str, Any], levels: dict[str, int] | None = None
) -> list[dict[str, Any]]:
    """Each skill the demand requires and whether the person meets it, at `levels`
    (their current ones by default)."""
    if levels is None:
        levels = {s["skillId"]: s["currentLevel"] for s in user_skills.get_user_skills(person["id"])}
    return requirement_status(person, levels, demand["requiredSkills"], catalog.get_skills())


def handoff(
    employee_id: str,
    demand_id: str | None,
    missing_skills: list[str],
    client_interview_date: str | None,
) -> dict[str, Any]:
    """Hand a matched candidate to the SkillGap agent: snapshot the baseline growth
    will be measured against, and tell them which skills are missing and what length
    of track fits the time to the interview. Both commit together. For a demand the
    missing skills are worked out here from the records, not taken from the request.
    No track is assigned here; a manager or L&D assigns one."""
    with transaction():
        emp = users.get_user_by_id(employee_id)
        if not emp or emp["role"] != "employee":
            raise NotFound("Employee not found.")

        demand = demands.get_project_demand_by_id(demand_id) if demand_id else None
        if demand_id and not demand:
            raise NotFound("Project Demand not found.")
        interview = (demand or {}).get("clientInterviewDate") or client_interview_date
        if demand:
            missing_skills = [r["name"] for r in requirements_for(emp, demand) if not r["met"]]
            capture_project_baseline(emp["id"], demand)
        else:
            missing_skills = _names(missing_skills)

        demand = demand or {}
        customer = demand.get("customerName") or "Client"
        project = demand.get("projectName") or "Project Demand"
        gaps = (
            f"Missing competencies: [{', '.join(missing_skills)}]." if missing_skills
            else "You meet every required skill."
        )
        if has_passed(interview):
            timing = (
                f"The interview date on record, {locale_date(interview)}, has passed; "
                "ask your manager for the new one."
            )
        else:
            track = track_for(
                days_until(interview or demand.get("expectedJoiningDate")), _HANDOFF_TRACKS
            )
            when = f"your client interview on {locale_date(interview)}" if interview else "your upcoming client interview"
            timing = f"A {track} fits the time to {when}."

        reminder = reminders.create_reminder(
            emp["id"],
            demand.get("projectName") or "Project Opportunity",
            "escalation",
            f"SkillGap Handoff: Upskilling Required for {customer} Interview" if missing_skills
            else f"SkillGap Handoff: Matched for {customer}",
            f"You have been matched for '{project}'. {gaps} {timing} Open the SkillGap agent to "
            "take your Level-1 assessment; your manager or L&D will assign your learning track.",
        )

    return {
        "success": True,
        "message": (
            f"Handed to the SkillGap agent: {emp['name']}'s current levels are saved as "
            "the baseline, and they have been told which skills are missing."
        ),
        "employeeId": emp["id"],
        "targetRole": project,
        "missingSkills": missing_skills,
        "clientInterviewDate": interview,
        "interviewPassed": has_passed(interview),
        "reminder": reminder,
    }


def active_shortlist(user_id: str) -> dict[str, Any] | None:
    """The demand a person is shortlisted for. A handoff is exactly what captures
    their baselines, so the most recent capture identifies the active opportunity -
    no second source of truth to disagree with it. A demand deleted after handoff
    counts as no shortlist rather than a half-populated banner.

    This is what the later agents read: the demand, its brief to assess against, and
    which required skills are still missing."""
    with transaction():
        latest = assessments.get_latest_handoff(user_id)
        if not latest:
            return None
        demand = demands.get_project_demand_by_id(latest["demandId"])
        person = users.get_user_by_id(user_id)
        if not demand or not person:
            return None
        requirements = requirements_for(person, demand)
    return {
        "demand": demand,
        "shortlistedAt": latest["capturedAt"],
        "requirements": requirements,
        "missingSkills": [r["name"] for r in requirements if not r["met"]],
        "jobDescription": demand_brief(demand),
        "interviewPassed": has_passed(demand.get("clientInterviewDate")),
    }


def demand_brief(demand: dict[str, Any]) -> str:
    """A demand as the job description an assessment is built from."""
    lines = [
        f"Project: {demand['projectName']} for {demand['customerName']}",
        f"Domain: {demand['domain']}" if demand.get("domain") else "",
        demand.get("rawJobDescription") or demand.get("projectDescription") or "",
        f"Required skills: {', '.join(demand['requiredSkills'])}",
        f"Preferred skills: {', '.join(demand['preferredSkills'])}" if demand.get("preferredSkills") else "",
        f"Technology: {', '.join(demand['technologyStack'])}" if demand.get("technologyStack") else "",
    ]
    return "\n".join(line for line in lines if line)


def project_readiness(person: dict[str, Any], demand: dict[str, Any]) -> dict[str, Any]:
    """How much of a demand's requirements a person meets now, against the moment
    they were handed off."""
    baseline = {b["skillId"]: b["baselineLevel"] for b in assessments.get_baselines(person["id"], demand["id"])}
    before = requirements_for(person, demand, baseline)
    now = requirements_for(person, demand)
    was_met = {r["name"] for r in before if r["met"]}
    is_met = {r["name"] for r in now if r["met"]}
    total = len(now)
    return {
        "atHandoff": js_round(len(was_met) / total * 100) if total and baseline else None,
        "now": js_round(len(is_met) / total * 100) if total else None,
        "closed": [r["name"] for r in now if r["met"] and r["name"] not in was_met] if baseline else [],
        "open": [r["name"] for r in now if not r["met"]],
        "requirements": now,
    }


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
        verified = [
            r for r in requirements_for(employee, demand)
            if r["level"] is not None and r["level"] >= VERIFIED_LEVEL
        ] if demand else []

    verified_lines = "\n".join(f"- {r['skillName']}: level {r['level']} of 5" for r in verified) or "None"
    growth_lines = "\n".join(
        f"- {g['skillName']}: level {g['baselineLevel']} to {g['currentLevel']}"
        for g in eligibility["growthDetail"] if g["currentLevel"] > g["baselineLevel"]
    )
    years = employee.get("experienceYears")
    experience = f", {years} years' experience" if years is not None else ""
    evidence_lines = "\n".join(f"- {e['title']}: {e['description']}" for e in approved) or "None"

    prompt = (
        "Generate a client-ready resume summary in Markdown, starting with the candidate's "
        "name. Use ONLY the verified facts below. Do not invent employers, dates, "
        "certifications or projects.\n"
        "The candidate is being PROPOSED for the engagement and has NOT worked on it: never "
        "say or imply that they contributed to it or did any of this work for that client. "
        "The evidence is their own earlier work; do not say whom it was for. State each "
        "skill level as given.\n\n"
        f"Candidate: {employee['name']} ({employee['title']}{experience})\n"
        f"Proposed for: {demand.get('projectName')} for {demand.get('customerName')}\n"
        f"Verified project skills:\n{verified_lines}\n"
        f"Verified skill growth:\n{growth_lines}\n"
        f"Approved workplace evidence:\n{evidence_lines}\n"
    )
    return ai.generate(prompt, temperature=0.4) or (
        f"## {employee['name']}\n\n{employee['title']}{experience}\n\n"
        f"Proposed for **{demand.get('projectName')}** ({demand.get('customerName')}).\n\n"
        f"### Verified project skills\n\n{verified_lines}\n\n"
        f"### Growth during preparation\n\n{growth_lines}\n\n"
        f"### Approved workplace evidence\n\n{evidence_lines}\n"
    )
