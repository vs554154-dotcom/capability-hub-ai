"""Organisation-wide analytics for the L&D and Leadership dashboards.

Every figure here is computed from stored records. A figure that would need data the
system does not keep is reported as not measured, with the reason - never estimated.
"""
from __future__ import annotations

from typing import Any

from ..database import transaction
from ..errors import NotFound
from ..numeric import js_round
from ..repositories import (
    assessments, catalog, demands, evidence, learning, metrics, reminders, skillgap, user_skills, users,
)
from ..repositories._common import now_date
from .capability import capability_report, compute_motivation_scores, skill_score
from .matching import VERIFIED_LEVEL, find_skill
from .talent import resume_eligibility

# Skill and Will at or above this place a person in "Deploy Now" - the same line the
# Skill-vs-Will matrix draws.
DEPLOY_THRESHOLD = 60


def _pct(part: int, whole: int) -> int:
    return js_round(part / whole * 100)


def _mean(values: list[int]) -> int | None:
    return js_round(sum(values) / len(values)) if values else None


def workforce_metrics() -> dict[str, Any]:
    """Readiness, active learners, verified evidence and the most common skill gap,
    computed from real rows. Anything that would need history the system does not
    keep - a month-over-month delta, say - is left out rather than invented."""
    with transaction():
        employees = [u for u in users.get_users() if u["role"] == "employee"]
        all_evidence = evidence.get_evidences()
        skill_names = {s["id"]: s["name"] for s in catalog.get_skills()}

        readiness_total = 0
        active_learners = 0
        gap_counts: dict[str, int] = {}

        for emp in employees:
            levels = user_skills.get_user_skills(emp["id"])
            approved = sum(
                1 for e in all_evidence if e["userId"] == emp["id"] and e["status"] == "approved"
            )
            readiness_total += skill_score(levels, approved)

            if any(p["status"] in ("in_progress", "completed")
                   for p in learning.get_learning_plan(emp["id"])):
                active_learners += 1

            for s in levels:
                if s["targetLevel"] > 0 and s["currentLevel"] < s["targetLevel"]:
                    gap_counts[s["skillId"]] = gap_counts.get(s["skillId"], 0) + 1

    top_gap = None
    if gap_counts:
        skill_id, count = max(gap_counts.items(), key=lambda kv: kv[1])
        top_gap = {"skillName": skill_names.get(skill_id, skill_id), "employeesBelowTarget": count}

    return {
        "employeeCount": len(employees),
        "readinessIndex": js_round(readiness_total / len(employees)) if employees else 0,
        "activeLearners": active_learners,
        "verifiedEvidence": sum(1 for e in all_evidence if e["status"] == "approved"),
        "topSkillGap": top_gap,
    }


# --------------------------------------------------------------------------- #
# Enterprise Readiness Index
# --------------------------------------------------------------------------- #

def _measure_people() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Every employee's levels and scores, and all evidence, read in one transaction."""
    with transaction():
        employees = [u for u in users.get_users() if u["role"] == "employee"]
        all_evidence = evidence.get_evidences()
        skills, roles = catalog.get_skills(), catalog.get_target_roles()
        approved_by: dict[str, int] = {}
        for e in all_evidence:
            if e["status"] == "approved":
                approved_by[e["userId"]] = approved_by.get(e["userId"], 0) + 1
        people = []
        for emp in employees:
            levels = user_skills.get_user_skills(emp["id"])
            approved = approved_by.get(emp["id"], 0)
            motivation = compute_motivation_scores(emp["id"])
            people.append({
                "id": emp["id"],
                "levels": levels,
                "studying": {s["skillFocus"].lower() for s in learning.get_learning_plan(emp["id"])},
                "approved": approved,
                "skill": skill_score(levels, approved),
                "will": motivation["willScore"],
                "engagement": motivation["engagementScore"],
                "crs": capability_report(emp["id"], skills, roles)["overallScore"],
            })
    return people, all_evidence


def _factor(key: str, label: str, weight: int, score: int | None, basis: str) -> dict[str, Any]:
    return {
        "key": key, "label": label, "weight": weight,
        "score": score, "measured": score is not None, "basis": basis,
    }


def _factors(
    people: list[dict[str, Any]],
    all_evidence: list[dict[str, Any]],
    post_counts: dict[str, int],
    level1: list[int],
) -> list[dict[str, Any]]:
    """The eight weighted components of the index, as defined in AGENTS.md. `level1`
    holds the latest graded SkillGap score of each employee who has one."""
    n = len(people)
    approved = sum(1 for e in all_evidence if e["status"] == "approved")
    deploy_now = sum(1 for p in people if p["skill"] >= DEPLOY_THRESHOLD and p["will"] >= DEPLOY_THRESHOLD)
    signed = post_counts.get("cleared", 0) + post_counts.get("not_ready", 0)
    cleared = post_counts.get("cleared", 0)

    return [
        _factor(
            "skillProficiency", "Skill proficiency", 25, _mean([p["skill"] for p in people]),
            f"Average Skill score across {n} employees: levels as a share of level 5, "
            "plus 5 points per approved piece of evidence.",
        ),
        _factor(
            "videoMcqAssessments", "Level-1 video/MCQ assessments", 20, _mean(level1),
            f"Average of the latest graded SkillGap assessment of {len(level1)} of {n} employees."
            if level1 else "Not measured: no employee has a graded SkillGap assessment yet.",
        ),
        _factor(
            "workplaceEvidence", "Workplace evidence validation", 15,
            _pct(approved, len(all_evidence)) if all_evidence else None,
            f"{approved} of {len(all_evidence)} submitted pieces of evidence approved by a manager."
            if all_evidence else "Not measured: no evidence has been submitted.",
        ),
        _factor(
            "certificationHealth", "Certification health", 15, None,
            "Not measured: no certification records are kept.",
        ),
        _factor(
            "capabilityReadinessIndex", "Capability readiness (CRI)", 10,
            _mean([p["crs"] for p in people if p["crs"] is not None]),
            "Average Capability Readiness Score: current levels against each person's "
            "target levels, over the skills that have one.",
        ),
        _factor(
            "deploymentAvailability", "Deployment availability", 5,
            _pct(deploy_now, n) if n else None,
            f"{deploy_now} of {n} employees in Deploy Now (Skill and Will both "
            f"{DEPLOY_THRESHOLD} or more).",
        ),
        _factor(
            "learningEngagement", "Learning engagement", 5, _mean([p["engagement"] for p in people]),
            "Average learning-plan completion across employees.",
        ),
        _factor(
            "managerGrowValidation", "Manager GROW validation", 5,
            _pct(cleared, signed) if signed else None,
            f"{cleared} of {signed} signed-off post-training assessments cleared."
            if signed else "Not measured: no post-training assessment has been signed off.",
        ),
    ]


def _level1_scores(people: list[dict[str, Any]]) -> list[int]:
    """Each employee's latest SkillGap score, where the server could grade one."""
    latest = skillgap.latest_completed_all()
    scores = [latest[p["id"]]["result"]["overallScore"] for p in people if p["id"] in latest]
    return [s for s in scores if s is not None]


def _composite(factors: list[dict[str, Any]]) -> tuple[int | None, int]:
    """The weighted index over the measured components only, and how much of the
    full weight those components carry. Unmeasured components are excluded rather
    than given an assumed score."""
    measured = [f for f in factors if f["measured"]]
    coverage = sum(f["weight"] for f in measured)
    if not coverage:
        return None, 0
    return js_round(sum(f["score"] * f["weight"] for f in measured) / coverage), coverage


def readiness_index() -> dict[str, Any]:
    """The Enterprise Readiness Index and its components, computed now."""
    people, all_evidence = _measure_people()
    factors = _factors(
        people, all_evidence, assessments.post_assessment_status_counts(), _level1_scores(people)
    )
    eri, coverage = _composite(factors)
    return {
        "success": True,
        "enterpriseReadinessIndex": eri,
        "coverage": coverage,
        "workforceCount": len(people),
        "deployNowCount": sum(
            1 for p in people if p["skill"] >= DEPLOY_THRESHOLD and p["will"] >= DEPLOY_THRESHOLD
        ),
        "factors": factors,
    }


def enterprise_readiness_index() -> dict[str, Any]:
    """The index, with today's reading recorded and the daily history behind its
    trend. The history only grows from real readings; nothing is back-filled."""
    report = readiness_index()
    if report["enterpriseReadinessIndex"] is not None:
        metrics.record_eri(now_date(), report["enterpriseReadinessIndex"], report["coverage"])
    report["trend"] = metrics.eri_history()
    return report


# --------------------------------------------------------------------------- #
# Leadership overview
# --------------------------------------------------------------------------- #

def _skill_gaps(people: list[dict[str, Any]], names: dict[str, str]) -> list[dict[str, Any]]:
    """Every skill people are working toward that someone is still below target on,
    largest group first."""
    targeted: dict[str, list[bool]] = {}
    for p in people:
        for s in p["levels"]:
            if s["targetLevel"] > 0:
                targeted.setdefault(s["skillId"], []).append(s["currentLevel"] < s["targetLevel"])
    return sorted(
        (
            {
                "skillId": skill_id,
                "skillName": names.get(skill_id, skill_id),
                "employeesTargeting": len(flags),
                "belowTarget": sum(flags),
                "gapShare": _pct(sum(flags), len(flags)),
            }
            for skill_id, flags in targeted.items() if any(flags)
        ),
        key=lambda r: (-r["belowTarget"], -r["gapShare"], r["skillName"]),
    )


def deployment_pipeline() -> dict[str, int]:
    """How many people are at each stage between handoff and a client resume, counted
    per person and demand from what each agent stored."""
    with transaction():
        pairs = assessments.handed_off_pairs()
        taken = assigned = trained = cleared = eligible = 0
        for user_id, demand_id in pairs:
            steps = [
                s for s in learning.get_learning_plan(user_id)
                if s.get("demandId") == demand_id and s.get("purpose") == "project_hiring"
            ]
            post = assessments.get_latest_post_assessment(user_id, demand_id)
            taken += skillgap.latest_completed(user_id, demand_id) is not None
            assigned += bool(steps)
            trained += bool(steps) and all(s["status"] == "completed" for s in steps)
            cleared += bool(post) and post["status"] == "cleared"
            eligible += resume_eligibility(user_id, demand_id)["eligible"]
    return {
        "handedOff": len(pairs), "assessed": taken, "trackAssigned": assigned,
        "trained": trained, "cleared": cleared, "resumeReady": eligible,
    }


def _strategy(ready: int, developing: int, demand: int) -> str:
    shortfall = demand - ready
    if shortfall <= 0:
        return "Covered by ready employees"
    if developing >= shortfall:
        return f"Upskill {shortfall} of {developing} developing"
    if developing:
        return f"Upskill {developing}, source {shortfall - developing} externally"
    return f"Source {shortfall} externally"


def leadership_overview() -> dict[str, Any]:
    """Skill-gap risk, supply against open demand, the effect of closing every open
    gap, and the directives that follow from them."""
    people, all_evidence = _measure_people()
    with transaction():
        skills = catalog.get_skills()
        open_demands = [d for d in demands.get_project_demands() if d["status"] == "OPEN"]
        post_counts = assessments.post_assessment_status_counts()
    names = {s["id"]: s["name"] for s in skills}

    # Risk: the skills with the most people still below target.
    risk = _skill_gaps(people, names)[:5]

    # Supply against open demand, per skill. Ready means held at the level the
    # matching engine treats as verified; developing means not there yet, with that
    # level as a target or the skill on the person's learning plan - a project track
    # can train a skill the person's role does not name.
    rows: dict[str, dict[str, Any]] = {}
    for d in open_demands:
        for name in d["requiredSkills"]:
            skill = find_skill(name, skills)
            key = skill["id"] if skill else f"unmatched:{name.lower()}"
            row = rows.setdefault(key, {
                "skillName": skill["name"] if skill else name,
                "skillId": skill["id"] if skill else None,
                "openDemands": 0,
                "resourcesNeeded": 0,
            })
            row["openDemands"] += 1
            row["resourcesNeeded"] += d["resourcesRequired"]
    supply = []
    for row in rows.values():
        ready = developing = 0
        for p in people:
            held = next((s for s in p["levels"] if s["skillId"] == row["skillId"]), None)
            if held and held["currentLevel"] >= VERIFIED_LEVEL:
                ready += 1
            elif (held and held["targetLevel"] >= VERIFIED_LEVEL) or row["skillName"].lower() in p["studying"]:
                developing += 1
        supply.append({
            "skillName": row["skillName"],
            "openDemands": row["openDemands"],
            "resourcesNeeded": row["resourcesNeeded"],
            "ready": ready,
            "developing": developing,
            "balance": ready - row["resourcesNeeded"],
            "strategy": _strategy(ready, developing, row["resourcesNeeded"]),
        })
    supply.sort(key=lambda r: (r["balance"], -r["resourcesNeeded"], r["skillName"]))

    # What closing every open gap would do: Skill proficiency recomputed with each
    # below-target skill at its target, every other component held where it is.
    factors = _factors(people, all_evidence, post_counts, _level1_scores(people))
    eri, coverage = _composite(factors)
    closed_skill = _mean([
        skill_score(
            [{**s, "currentLevel": max(s["currentLevel"], s["targetLevel"])} for s in p["levels"]],
            p["approved"],
        )
        for p in people
    ])
    projected_factors = [
        {**f, "score": closed_skill} if f["key"] == "skillProficiency" else f for f in factors
    ]
    projected_eri, _ = _composite(projected_factors)
    open_gaps = sum(1 for p in people for s in p["levels"] if s["currentLevel"] < s["targetLevel"])
    people_with_gaps = sum(
        1 for p in people if any(s["currentLevel"] < s["targetLevel"] for s in p["levels"])
    )

    pending_evidence = sum(1 for e in all_evidence if e["status"] == "pending")
    unmeasured = [f for f in factors if not f["measured"]]
    directives: list[str] = []
    if risk:
        top = risk[0]
        directives.append(
            f"Close the {top['skillName']} gap: {top['belowTarget']} of "
            f"{top['employeesTargeting']} employees working toward it are below target."
        )
    short = [r for r in supply if r["balance"] < 0]
    if short:
        worst = short[0]
        directives.append(
            f"{worst['skillName']}: {worst['resourcesNeeded']} needed across "
            f"{worst['openDemands']} open demand(s), {worst['ready']} ready. "
            f"{worst['strategy']}."
        )
    if pending_evidence:
        directives.append(
            f"Review {pending_evidence} pending evidence submission(s); each approval "
            "raises a skill level and the evidence component of the index."
        )
    if unmeasured:
        directives.append(
            f"Start recording {', '.join(f['label'] for f in unmeasured)}: "
            f"{sum(f['weight'] for f in unmeasured)}% of the index is not measured today."
        )

    return {
        "success": True,
        "riskRadar": risk,
        "supplyDemand": supply[:8],
        "pipeline": deployment_pipeline(),
        "projection": {
            "openGaps": open_gaps,
            "employeesWithGaps": people_with_gaps,
            "currentEri": eri,
            "projectedEri": projected_eri,
            "coverage": coverage,
        },
        "directives": directives,
    }


# --------------------------------------------------------------------------- #
# L&D: readiness by department, gap cohorts, campaigns
# --------------------------------------------------------------------------- #

def ld_overview(heatmap_rows: int = 12) -> dict[str, Any]:
    """For the skills most employees work toward, how far each department has got;
    and every skill cohort still below target, for campaigns."""
    with transaction():
        employees = [u for u in users.get_users() if u["role"] == "employee"]
        names = {s["id"]: s["name"] for s in catalog.get_skills()}
        levels = {e["id"]: user_skills.get_user_skills(e["id"]) for e in employees}

    department_of = {e["id"]: e["department"] for e in employees}
    headcount: dict[str, int] = {}
    for dept in department_of.values():
        headcount[dept] = headcount.get(dept, 0) + 1
    departments = sorted(headcount, key=lambda d: (-headcount[d], d))

    # skill -> department -> each targeting employee's progress (current / target, capped at 1)
    progress: dict[str, dict[str, list[float]]] = {}
    for user_id, rows in levels.items():
        for s in rows:
            if s["targetLevel"] > 0:
                progress.setdefault(s["skillId"], {}).setdefault(department_of[user_id], []).append(
                    min(1.0, s["currentLevel"] / s["targetLevel"])
                )
    ranked = sorted(
        progress,
        key=lambda k: (-sum(len(v) for v in progress[k].values()), names.get(k, k)),
    )[:heatmap_rows]

    heatmap = [
        {
            "skillId": skill_id,
            "skillName": names.get(skill_id, skill_id),
            "employees": sum(len(v) for v in progress[skill_id].values()),
            "cells": [
                {
                    "department": dept,
                    "employees": len(progress[skill_id].get(dept, [])),
                    "targetReached": _pct(sum(progress[skill_id][dept]), len(progress[skill_id][dept]))
                    if progress[skill_id].get(dept) else None,
                }
                for dept in departments
            ],
        }
        for skill_id in ranked
    ]
    people = [{"levels": rows} for rows in levels.values()]
    return {
        "success": True,
        "departments": [{"name": d, "employees": headcount[d]} for d in departments],
        "heatmap": heatmap,
        "cohorts": _skill_gaps(people, names),
    }


def launch_campaign(skill_id: str, launched_by: dict[str, Any]) -> dict[str, Any]:
    """Send every employee who is below target on `skill_id` a reminder to work on
    it. Returns who was reminded."""
    with transaction():
        skill = next((s for s in catalog.get_skills() if s["id"] == skill_id), None)
        if not skill:
            raise NotFound("Skill not found")
        reminded = []
        for emp in users.get_users():
            if emp["role"] != "employee":
                continue
            held = next(
                (s for s in user_skills.get_user_skills(emp["id"]) if s["skillId"] == skill_id), None
            )
            if not held or held["currentLevel"] >= held["targetLevel"]:
                continue
            reminders.create_reminder(
                emp["id"], "Employee", "campaign",
                f"Upskilling campaign: {skill['name']}",
                f"{launched_by['name']} has started a campaign on {skill['name']}. You are at "
                f"level {held['currentLevel']} of your target {held['targetLevel']}. Open your "
                "learning plan and submit evidence as you progress.",
            )
            reminded.append(emp["id"])
    return {"success": True, "skillName": skill["name"], "reminded": len(reminded), "employeeIds": reminded}


def escalate_to_ld(manager: dict[str, Any], employee_id: str) -> dict[str, Any]:
    """Ask L&D for help with one employee's skill gaps. The message is written here
    from the signed-in manager and the stored gap count, never taken from the request,
    so an escalation on the L&D page is always what it says it is."""
    with transaction():
        employee = users.get_user_by_id(employee_id)
        if not employee or employee["role"] != "employee":
            raise NotFound("Employee not found")
        below = sum(
            1 for s in user_skills.get_user_skills(employee_id) if s["currentLevel"] < s["targetLevel"]
        )
        return reminders.create_reminder(
            employee_id, "Employee", "ld_escalation",
            f"Escalated to L&D: {employee['name']}",
            f"{manager['name']} asked L&D for help with {employee['name']}'s skill gaps "
            f"({below} skill{'' if below == 1 else 's'} below target).",
        )


def org_context() -> str:
    """The organisation-level figures, as plain text for the analytics copilot."""
    index = readiness_index()
    overview = leadership_overview()
    lines = [
        f"Employees: {index['workforceCount']}; in Deploy Now: {index['deployNowCount']}.",
        (
            f"Enterprise Readiness Index: {index['enterpriseReadinessIndex']}% "
            f"(over the measured {index['coverage']}% of its weight)."
            if index["enterpriseReadinessIndex"] is not None
            else "Enterprise Readiness Index: not measurable yet."
        ),
        "\nComponents:\n",
        *(
            f"- {f['label']} ({f['weight']}%): "
            + (f"{f['score']}%" if f["measured"] else "not measured")
            + f" - {f['basis']}"
            for f in index["factors"]
        ),
        "\nDeployment pipeline (people and demands): "
        + ", ".join(f"{label} {overview['pipeline'][key]}" for key, label in (
            ("handedOff", "handed off"), ("assessed", "Level-1 assessed"),
            ("trackAssigned", "track assigned"), ("trained", "training complete"),
            ("cleared", "cleared by manager"), ("resumeReady", "resume ready"),
        )) + ".",
        "\nLargest skill gaps:\n",
        *(
            f"- {r['skillName']}: {r['belowTarget']} of {r['employeesTargeting']} below target"
            for r in overview["riskRadar"]
        ),
        "\nSupply against open demand:\n",
        *(
            f"- {r['skillName']}: {r['resourcesNeeded']} needed, {r['ready']} ready, "
            f"{r['developing']} developing ({r['strategy']})"
            for r in overview["supplyDemand"]
        ),
    ]
    return "\n".join(lines)
