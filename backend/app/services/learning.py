"""Learning plans: building a track from a person's gaps, assigning it, step progress,
knowledge checks, deadlines and the tracker roll-up."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from ..database import transaction
from ..errors import Invalid, NotFound
from ..numeric import js_round
from ..repositories import catalog, demands, learning, reminders, users
from . import questions, talent
from .journey import gaps_for, journey
from .matching import courses_for, find_skill, mentioned_skills, names_word

STATUSES = ("pending", "in_progress", "completed")
DEADLINE_TYPES = ("client_interview", "project_deadline", "learner_set", "manager_assigned")
FORMATS = ("balanced", "micro", "in_depth", "best_practice")
PASS_MARK = 60
QUIZ_LENGTH = 5


def plan_for(user_id: str) -> list[dict[str, Any]]:
    return learning.get_learning_plan(user_id)


# --------------------------------------------------------------------------- #
# Knowledge checks
# --------------------------------------------------------------------------- #

def _quiz_questions(step: dict[str, Any]) -> list[dict[str, Any]]:
    """The question-bank questions for a step's skill focus. A practice step has
    none: it is shown by evidence of real work, not by a quiz."""
    if step.get("learningType") == "best_practice":
        return []
    skills = catalog.get_skills()
    focus = step["skillFocus"]
    names = [s["name"] for s in mentioned_skills(focus, skills)]
    for part in re.split(r"[,;&/]", focus):
        skill = find_skill(part, skills) if len(part.strip()) > 1 else None
        if skill:
            names.append(skill["name"])
    if not names and names_word("target role", focus):
        # "Target Role Competencies": ask about the role itself. Any other topic the bank
        # does not hold has no check, rather than one about something else.
        owner = users.get_user_by_id(step["userId"]) or {}
        by_id = {s["id"]: s["name"] for s in skills}
        names = [
            by_id[r["skillId"]]
            for r in catalog.get_role_requirements(owner.get("targetRoleId") or "")
            if r["skillId"] in by_id
        ]
    return questions.pick(names, QUIZ_LENGTH)


def _pass_mark(step: dict[str, Any]) -> int:
    found = re.search(r"\d+", step.get("targetScore") or "")
    return min(100, int(found.group())) if found else PASS_MARK


def _step(step_id: str) -> dict[str, Any]:
    owner = learning.get_step_owner_id(step_id)
    step = next((s for s in learning.get_learning_plan(owner) if s["id"] == step_id), None) if owner else None
    if not step:
        raise NotFound("Learning step not found.")
    return step


def quiz_for(step_id: str) -> dict[str, Any]:
    """A step's knowledge check, without its answers."""
    with transaction():
        step = _step(step_id)
        return {
            "stepId": step_id,
            "title": step["title"],
            "passMark": _pass_mark(step),
            "questions": [
                {"id": q["id"], "skill": q["skill"], "question": q["question"],
                 "options": questions.shuffled_options(q, step["userId"])}
                for q in _quiz_questions(step)
            ],
        }


def submit_quiz(step_id: str, answers: Any, minutes: Any) -> dict[str, Any]:
    """Score a knowledge check. A pass completes the step; otherwise the score is
    kept and the step stays open to be tried again."""
    answers = answers if isinstance(answers, dict) else {}
    with transaction():
        step = _step(step_id)
        asked = _quiz_questions(step)
        if not asked:
            raise Invalid("This step has no knowledge check.")
        if any(q["id"] not in answers for q in asked):
            raise Invalid("Answer every question before submitting.")
        results = [
            {"id": q["id"], "correct": answers[q["id"]] == q["correct"],
             "answer": q["correct"], "explanation": q["explanation"]}
            for q in asked
        ]
        score = js_round(sum(r["correct"] for r in results) / len(results) * 100)
        passed = score >= _pass_mark(step)
        learning.update_step(
            step_id, "completed" if passed else "in_progress", 100 if passed else 50,
            score, _minutes(minutes),
        )
        return {
            "score": score, "passMark": _pass_mark(step), "passed": passed, "results": results,
            "plan": learning.get_learning_plan(step["userId"]),
        }


def _minutes(value: Any) -> int | None:
    """Study time as the learner reported it, or None when they did not."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 < value <= 1000:
        return None
    return int(value)


# --------------------------------------------------------------------------- #
# Progress and deadlines
# --------------------------------------------------------------------------- #

def update_step(step_id: str, status: str, time_spent_mins: Any) -> list[dict[str, Any]]:
    """Move one step to `status` and return its owner's whole plan. A step with a
    knowledge check is only completed by passing it, so a score cannot be asserted."""
    if status not in STATUSES:
        raise Invalid(f"status must be one of: {', '.join(STATUSES)}.")
    with transaction():
        step = _step(step_id)
        if status == "completed" and step["status"] != "completed" and _quiz_questions(step):
            raise Invalid("Pass this step's knowledge check to complete it.")
        learning.update_step(
            step_id, status, {"pending": 0, "in_progress": 50, "completed": 100}[status],
            # Reopened, a step has to be passed again.
            None if status == "completed" else 0, _minutes(time_spent_mins),
        )
        return learning.get_learning_plan(step["userId"])


def update_deadline(user_id: str, target_deadline: str, deadline_type: str | None) -> list[dict[str, Any]]:
    with transaction():
        learning.set_deadline(user_id, target_deadline, deadline_type or "client_interview")
        return learning.get_learning_plan(user_id)


# --------------------------------------------------------------------------- #
# Building and assigning a track
# --------------------------------------------------------------------------- #

def _in_days(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%d")


def _skill_steps(
    skill_id: str | None, name: str, fmt: str, courses: list[dict[str, Any]], skills: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    course = next(iter(courses_for(skill_id, name, courses, skills)), None)
    has_quiz = bool(questions.for_skill(name))
    check = f"{name} knowledge check" if has_quiz else "Discuss with your manager"
    target = f"{PASS_MARK}%" if has_quiz else "Reviewed"
    study = {
        "title": f"Study: {name}",
        "skillFocus": name,
        "courseName": course["title"] if course else f"Guided study of {name}",
        "provider": course["provider"] if course else "Learning Concierge",
        "milestone": (
            f"Finish the course and pass the {check}" if course and has_quiz
            else f"Study {name} with the Learning Concierge" + (f" and pass the {check}" if has_quiz else "")
        ),
        "assessment": check,
        "targetScore": target,
        "learningType": "in_depth",
        "estimatedDuration": course["duration"] if course else "Self-paced",
    }
    micro = {
        **study,
        "title": f"Quick check: {name}",
        "courseName": f"{name} essentials",
        "provider": "Learning Concierge",
        "milestone": f"Pass the {check}" if has_quiz else f"Explain the essentials of {name} to your manager",
        "learningType": "micro",
        "estimatedDuration": "15 minutes",
    }
    practice = {
        "title": f"Use {name} in real work",
        "skillFocus": name,
        "courseName": "Workplace evidence",
        "provider": "Your own project work",
        "milestone": f"Use {name} in a piece of real work and submit it as evidence",
        "assessment": "Manager review of the evidence",
        "targetScore": "Approved",
        "learningType": "best_practice",
        "estimatedDuration": "Self-paced",
    }
    return {
        "balanced": [study, practice], "micro": [micro],
        "in_depth": [study], "best_practice": [practice],
    }[fmt]


def suggest_track(user_id: str, demand_id: str | None, fmt: str) -> dict[str, Any]:
    """A track built from what this person still has to close: for a project, the
    skills its client requires and what their assessment for it found; otherwise
    every open gap. The closer the deadline, the fewer skills it covers."""
    fmt = fmt if fmt in FORMATS else "balanced"
    with transaction():
        person = users.get_user_by_id(user_id)
        if not person:
            raise NotFound("Employee not found.")
        j = journey(person)
        demand = None
        if demand_id:
            demand = demands.get_project_demand_by_id(demand_id)
            if not demand:
                raise NotFound("Project Demand not found.")
            requirements = talent.requirements_for(person, demand)
            assessment = j["assessment"] if (j["assessment"] or {}).get("demandId") == demand["id"] else None
            gaps = [
                g for g in gaps_for(person, {"requirements": requirements}, assessment)
                if {"project", "assessment"} & set(g["sources"])
            ]
            if not gaps:
                # Every requirement is met: strengthen the lowest of them.
                weakest = sorted(requirements, key=lambda r: r["level"] or 0)[:3]
                gaps = [
                    {"skillId": r["skillId"], "skillName": r["skillName"], "current": r["level"],
                     "target": None, "sources": ["project strength"]}
                    for r in weakest
                ]
        else:
            gaps = j["gaps"]

        interview = (demand or {}).get("clientInterviewDate")
        deadline = interview[:10] if interview and not talent.has_passed(interview) else _in_days(14)
        days = talent.days_until(deadline)
        chosen = gaps[:3 if days <= 7 else 4 if days <= 14 else 5 if days <= 21 else 6]
        courses, skills = catalog.get_courses(), catalog.get_skills()
        steps: list[dict[str, Any]] = []
        for i, gap in enumerate(chosen, start=1):
            for step in _skill_steps(gap["skillId"], gap["skillName"], fmt, courses, skills):
                steps.append({**step, "phaseLabel": f"Skill {i} of {len(chosen)}"})
        return {
            "demand": {"id": demand["id"], "projectName": demand["projectName"]} if demand else None,
            "activeProject": (
                {"id": j["project"]["id"], "projectName": j["project"]["projectName"]} if j["project"] else None
            ),
            "interviewPassed": talent.has_passed(interview),
            "suggestedDeadline": deadline,
            "gaps": chosen,
            "gapsNotCovered": len(gaps) - len(chosen),
            "steps": steps,
            "replacesSteps": j["plan"]["total"],
        }


STEP_FIELDS = (
    "title", "skillFocus", "courseName", "provider", "milestone", "assessment", "targetScore",
)


def _clean_steps(steps: list[Any]) -> list[dict[str, Any]]:
    cleaned = []
    for step in steps:
        if not isinstance(step, dict) or any(
            not isinstance(step.get(f), str) or not step[f].strip() for f in STEP_FIELDS
        ):
            raise Invalid(f"Every step needs: {', '.join(STEP_FIELDS)}.")
        kind = step.get("learningType")
        cleaned.append({
            **{f: step[f].strip() for f in STEP_FIELDS},
            "learningType": kind if kind in ("micro", "in_depth", "best_practice") else "in_depth",
            "estimatedDuration": step.get("estimatedDuration") or "Self-paced",
            "phaseLabel": step.get("phaseLabel") or f"Step {len(cleaned) + 1}",
        })
    return cleaned


def assign_track(
    user_id: str,
    target_deadline: str,
    deadline_type: str,
    steps: list[dict[str, Any]],
    demand_id: str | None,
    assigned_by: dict[str, Any],
) -> list[dict[str, Any]]:
    """Replace the user's plan with a new track and tell them. Destructive by design -
    reassigning discards prior progress - and atomic: the old plan is only gone if the
    whole new one was written.

    A track tied to a demand is a project-hiring track, the kind the client resume
    requires; its baseline is captured here too, in case no handoff did."""
    steps = _clean_steps(steps)
    with transaction():
        demand = demands.get_project_demand_by_id(demand_id) if demand_id else None
        if demand_id and not demand:
            raise NotFound("Project Demand not found.")
        if demand:
            talent.capture_project_baseline(user_id, demand)
        learning.replace_plan(
            user_id, target_deadline,
            deadline_type if deadline_type in DEADLINE_TYPES else "client_interview",
            steps, demand["id"] if demand else None,
            "project_hiring" if demand else "career_growth",
        )
        purpose = f"for {demand['projectName']}" if demand else "for your target role"
        reminders.create_reminder(
            user_id, "Employee", "manager_notice",
            "New learning track",
            f"{assigned_by['name']} assigned you a track {purpose}: {len(steps)} "
            f"step{'' if len(steps) == 1 else 's'}, due {target_deadline}. It is in your learning plan.",
        )
        return learning.get_learning_plan(user_id)


# --------------------------------------------------------------------------- #
# Tracker
# --------------------------------------------------------------------------- #

def resource_learning_progress(visible: set[str] | None = None) -> list[dict[str, Any]]:
    """Per-employee learning roll-up for the manager and L&D tracker, limited to the
    user ids in `visible` (None means everyone). What is not recorded is None."""
    with transaction():
        employees = [
            u for u in users.get_users()
            if u["role"] == "employee" and (visible is None or u["id"] in visible)
        ]
        result = []

        for user in employees:
            steps = learning.get_learning_plan(user["id"])
            total_steps = len(steps)
            completed = [s for s in steps if s["status"] == "completed"]
            in_progress = [s for s in steps if s["status"] == "in_progress"]
            scored = [s["quizScore"] for s in steps if (s.get("quizScore") or 0) > 0]

            status = "not_started"
            if total_steps and len(completed) == total_steps:
                status = "completed"
            elif completed or in_progress:
                status = "in_progress"

            shortlist = talent.active_shortlist(user["id"])
            project = shortlist["demand"] if shortlist else None
            result.append({
                "userId": user["id"],
                "userName": user["name"],
                "userTitle": user["title"],
                "userAvatar": user["avatar"],
                "department": user["department"],
                "activeProject": (
                    {"id": project["id"], "projectName": project["projectName"],
                     "customerName": project["customerName"]} if project else None
                ),
                "planIsForProject": bool(project) and any(s.get("demandId") == project["id"] for s in steps),
                "targetDeadline": steps[0].get("targetDeadline") if steps else None,
                "deadlineType": steps[0]["deadlineType"] if steps else None,
                "totalSteps": total_steps,
                "completedSteps": len(completed),
                "overallProgressPercent": (
                    js_round(sum(s["progressPercent"] for s in steps) / total_steps) if total_steps else 0
                ),
                "averageQuizScore": js_round(sum(scored) / len(scored)) if scored else None,
                "totalTimeSpentMins": sum(s.get("timeSpentMins") or 0 for s in steps),
                "microCount": sum(1 for s in steps if s["learningType"] == "micro"),
                "inDepthCount": sum(1 for s in steps if s["learningType"] == "in_depth"),
                "bestPracticeCount": sum(1 for s in steps if s["learningType"] == "best_practice"),
                "status": status,
                "steps": steps,
            })
    return result
