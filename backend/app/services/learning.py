"""Learning plans: step progress, deadlines, track assignment and the tracker roll-up."""
from __future__ import annotations

from typing import Any

from ..database import transaction
from ..numeric import js_round
from ..repositories import catalog, learning, users


def plan_for(user_id: str) -> list[dict[str, Any]]:
    return learning.get_learning_plan(user_id)


def update_step(
    step_id: str,
    status: str,
    progress_percent: int,
    quiz_score: int | None,
    time_spent_mins: int | None,
) -> list[dict[str, Any]]:
    """Update one step and return its owner's whole plan."""
    with transaction():
        learning.update_step(step_id, status, progress_percent, quiz_score, time_spent_mins)
        owner = learning.get_step_owner_id(step_id)
        return learning.get_learning_plan(owner) if owner else []


def update_deadline(user_id: str, target_deadline: str, deadline_type: str | None) -> list[dict[str, Any]]:
    with transaction():
        learning.set_deadline(user_id, target_deadline, deadline_type or "client_interview")
        return learning.get_learning_plan(user_id)


def assign_track(
    user_id: str,
    target_deadline: str,
    deadline_type: str,
    steps: list[dict[str, Any]],
    demand_id: str | None,
    purpose: str,
) -> list[dict[str, Any]]:
    """Replace the user's plan with a new track. Destructive by design - reassigning
    discards prior progress - and atomic: the old plan is only gone if the whole new
    one was written."""
    with transaction():
        learning.replace_plan(user_id, target_deadline, deadline_type, steps, demand_id, purpose)
        return learning.get_learning_plan(user_id)


def resource_learning_progress() -> list[dict[str, Any]]:
    """Per-employee learning roll-up for the manager and L&D tracker."""
    with transaction():
        employees = [u for u in users.get_users() if u["role"] == "employee"]
        target_roles = catalog.get_target_roles()
        result = []

        for user in employees:
            steps = learning.get_learning_plan(user["id"])
            total_steps = len(steps)
            completed = [s for s in steps if s["status"] == "completed"]
            in_progress = [s for s in steps if s["status"] == "in_progress"]

            overall = (
                js_round(sum(s["progressPercent"] for s in steps) / total_steps)
                if total_steps else 0
            )
            scored = [s for s in steps if (s.get("quizScore") or 0) > 0]
            if scored:
                avg_quiz = js_round(sum(s["quizScore"] for s in scored) / len(scored))
            else:
                avg_quiz = 82 if completed else 0

            status = "not_started"
            if total_steps and len(completed) == total_steps:
                status = "completed"
            elif completed or in_progress:
                status = "in_progress"

            role = next((r for r in target_roles if r["id"] == user.get("targetRoleId")), None)

            result.append({
                "userId": user["id"],
                "userName": user["name"],
                "userTitle": user["title"],
                "userAvatar": user["avatar"],
                "department": user["department"],
                "trackName": f"{role['title'] if role else 'Custom Capability Track'} Fast-Track",
                "targetDeadline": steps[0]["targetDeadline"] if steps else "2026-08-15",
                "deadlineType": steps[0]["deadlineType"] if steps else "client_interview",
                "totalSteps": total_steps,
                "completedSteps": len(completed),
                "overallProgressPercent": overall,
                "averageQuizScore": avg_quiz,
                "totalTimeSpentMins": sum(s.get("timeSpentMins") or 0 for s in steps),
                "microCount": sum(1 for s in steps if s["learningType"] == "micro"),
                "inDepthCount": sum(1 for s in steps if s["learningType"] == "in_depth"),
                "bestPracticeCount": sum(1 for s in steps if s["learningType"] == "best_practice"),
                "status": status,
                "lastActive": "Today",
                "steps": steps,
            })
    return result
