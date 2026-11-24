"""One person's place in the demand-to-deployment flow, read from what each agent
stored: the project they were handed off to, their SkillGap result, their gaps, and
their learning plan. Every agent that works on a person starts from this, so the
Concierge, the track builder, the GROW coach and the manager's board never disagree
about what is missing."""
from __future__ import annotations

import re
from typing import Any

from ..repositories import assessments, catalog, learning, user_skills
from . import skillgap
from .matching import VERIFIED_LEVEL, courses_for
from .talent import active_shortlist, project_readiness


def topic(label: str) -> str:
    """A gap as a topic name: without the examples in brackets, and not too long to be
    the title of a learning step."""
    name = re.sub(r"\s*\([^)]*\)?", "", label).strip().rstrip(".")
    if len(name) > 70:
        name = name[:70].rsplit(" ", 1)[0].rstrip(",;:") + "..."
    return name or label


def gaps_for(
    person: dict[str, Any],
    shortlist: dict[str, Any] | None,
    assessment: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """What this person still has to close, most urgent first: skills their project
    requires, then what the assessment found, then their target role, largest deficit
    first. A skill that several of them name appears once, with every reason.
    How an answer was told is feedback on the result, not something to study, so
    communication notes are not gaps here."""
    names = {s["id"]: s["name"] for s in catalog.get_skills()}
    held = {s["skillId"]: s for s in user_skills.get_user_skills(person["id"])}
    gaps: dict[str, dict[str, Any]] = {}

    def add(skill_id: str | None, name: str, target: int | None, source: str) -> None:
        gap = gaps.setdefault(skill_id or name.lower(), {
            "skillId": skill_id,
            "skillName": name,
            "current": held[skill_id]["currentLevel"] if skill_id in held else None,
            "target": None,
            "sources": [],
        })
        if target is not None:
            gap["target"] = max(target, gap["target"] or 0)
        if source not in gap["sources"]:
            gap["sources"].append(source)

    for r in (shortlist or {}).get("requirements", []):
        if not r["met"]:
            add(r["skillId"], r["skillName"], VERIFIED_LEVEL, "project")
    for g in ((assessment or {}).get("result") or {}).get("gaps", []):
        if g["source"] != "communication":
            add(g["skillId"], g["skillName"] or topic(g["label"]), None, "assessment")
    below = [s for s in held.values() if s["currentLevel"] < s["targetLevel"]]
    for s in sorted(below, key=lambda s: (s["currentLevel"] - s["targetLevel"], names.get(s["skillId"], ""))):
        add(s["skillId"], names.get(s["skillId"], s["skillId"]), s["targetLevel"], "target role")
    return list(gaps.values())


def journey(person: dict[str, Any]) -> dict[str, Any]:
    """Everything the agents have recorded about this person's way to deployment."""
    shortlist = active_shortlist(person["id"])
    assessment = skillgap.latest(person["id"])
    plan = learning.get_learning_plan(person["id"])
    done = [p for p in plan if p["status"] == "completed"]
    scored = [p["quizScore"] for p in done if p["quizScore"]]
    demand = shortlist["demand"] if shortlist else None
    return {
        "project": demand,
        "interviewPassed": shortlist["interviewPassed"] if shortlist else False,
        "readiness": project_readiness(person, demand) if demand else None,
        "assessment": assessment,
        "gaps": gaps_for(person, shortlist, assessment),
        "plan": {
            "total": len(plan),
            "done": len(done),
            "forProject": bool(demand) and any(p.get("demandId") == demand["id"] for p in plan),
            "averageQuiz": round(sum(scored) / len(scored)) if scored else None,
            "next": next((p for p in plan if p["status"] != "completed"), None),
        },
        "postAssessment": (
            assessments.get_latest_post_assessment(person["id"], demand["id"]) if demand else None
        ),
    }


def gap_line(gap: dict[str, Any]) -> str:
    """"React: level 2 of 4 (project, target role)"."""
    if gap["target"] is None:
        level = ""
    elif gap["current"] is None:
        level = f": no record yet, target {gap['target']}"
    else:
        level = f": level {gap['current']} of {gap['target']}"
    return f"{gap['skillName']}{level} ({', '.join(gap['sources'])})"


def journey_lines(j: dict[str, Any]) -> list[str]:
    """The journey as plain text, for the copilots' prompts and their fallbacks."""
    lines: list[str] = []
    if j["project"]:
        lines.append(f"Active project: {j['project']['projectName']} for {j['project']['customerName']}")
        readiness = j["readiness"]
        if readiness["now"] is not None:
            start = f" (was {readiness['atHandoff']}% at handoff)" if readiness["atHandoff"] is not None else ""
            lines.append(f"Project requirements met: {readiness['now']}%{start}")
        if readiness["closed"]:
            lines.append(f"Closed since handoff: {', '.join(readiness['closed'])}")
    else:
        lines.append("Active project: none")
    if j["assessment"]:
        score = j["assessment"]["result"]["overallScore"]
        lines.append(
            f"Level-1 SkillGap assessment score ({j['assessment']['roleTitle']}): "
            + (f"{score}%" if score is not None else "taken, not graded")
        )
    else:
        lines.append("Level-1 SkillGap assessment score: not taken yet")
    plan = j["plan"]
    lines.append(
        f"Learning plan: {plan['done']} of {plan['total']} steps done"
        + (f", average knowledge check {plan['averageQuiz']}%" if plan["averageQuiz"] is not None else "")
        if plan["total"] else "Learning plan: none assigned"
    )
    if j["postAssessment"]:
        lines.append(f"Post-training assessment: {j['postAssessment']['status'].replace('_', ' ')}")
    return lines


def course_lines(gaps: list[dict[str, Any]], limit: int = 5) -> list[str]:
    """For each of the first `limit` gaps, the catalogue course that teaches it - or
    that there is none."""
    courses, skills = catalog.get_courses(), catalog.get_skills()
    lines = []
    for gap in gaps[:limit]:
        found = courses_for(gap["skillId"], gap["skillName"], courses, skills)
        lines.append(
            f"{gap['skillName']}: " + (
                "; ".join(f"{c['title']} ({c['provider']}, {c['duration']})" for c in found[:2])
                if found else "no course in the catalogue yet"
            )
        )
    return lines
