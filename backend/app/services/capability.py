"""Capability scoring and the writes that move a person's skill levels.

Two scores describe a person and are deliberately independent:

* Skill - capability, from skill levels plus manager-approved evidence.
* Will  - motivation, from learning follow-through, evidence initiative, goal
          progress and goal commitment (see `compute_motivation_scores`).

The Capability Readiness Score (CRS) on an employee's dashboard is a third, related
view: how close their levels are to what their chosen target role requires.
"""
from __future__ import annotations

from typing import Any

from ..database import transaction
from ..errors import Invalid, NotFound
from ..numeric import js_round
from ..repositories import assessments, catalog, demands, evidence, learning, skillgap, user_skills, users


def skill_score(levels: list[dict[str, Any]], approved_evidence: int) -> int:
    """Skill axis, 0-100: average level as a share of the maximum (5), plus 5 points
    per piece of manager-approved evidence. Shared by the team view and the
    organisation metrics so the two always agree."""
    total = sum(s["currentLevel"] for s in levels)
    average = (total / (len(levels) * 5)) * 100 if levels else 0
    return min(100, js_round(average + approved_evidence * 5))


def compute_motivation_scores(user_id: str) -> dict[str, int]:
    """Will and Engagement, computed only from recorded behaviour:

        40% learning follow-through - plan completion, quiz scores, time invested
        30% evidence initiative     - submissions made, approved or pending
        20% goal progress           - how far skills have moved toward their targets
        10% goal commitment         - whether a target role has been chosen

    Engagement is the plain learning-plan completion percentage. Pending evidence
    counts toward Will (initiative) but not Skill (only approved evidence does),
    which keeps the two axes of the matrix independent.
    """
    levels = user_skills.get_user_skills(user_id)
    plan = learning.get_learning_plan(user_id)
    submitted = evidence.get_for_user(user_id)
    user = users.get_user_by_id(user_id)

    total_steps = len(plan)
    completed_steps = sum(1 for p in plan if p["status"] == "completed")
    completion_ratio = completed_steps / total_steps if total_steps else 0.0

    scored = [p for p in plan if p["status"] == "completed" and (p.get("quizScore") or 0) > 0]
    avg_quiz = sum(p.get("quizScore") or 0 for p in scored) / len(scored) if scored else 0.0

    minutes = sum(p.get("timeSpentMins") or 0 for p in plan)
    time_norm = min(1.0, minutes / 300)  # ~5h of study reads as fully invested

    learning_score = 0.5 * completion_ratio * 100 + 0.3 * avg_quiz + 0.2 * time_norm * 100
    initiative = min(100, len(submitted) * 30)

    with_target = [s for s in levels if s["targetLevel"] > 0]
    progress = (
        sum(min(1.0, s["currentLevel"] / s["targetLevel"]) for s in with_target)
        / len(with_target) * 100
        if with_target else 0.0
    )
    commitment = 100 if (user or {}).get("targetRoleId") else 0

    will = js_round(max(0.0, min(100.0,
        0.40 * learning_score + 0.30 * initiative + 0.20 * progress + 0.10 * commitment)))
    return {"willScore": will, "engagementScore": js_round(completion_ratio * 100)}


def capability_report(
    user_id: str,
    skills: list[dict[str, Any]] | None = None,
    roles: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """The Capability Readiness Score with its per-skill breakdown and a plain-text
    explanation of how it was reached. A caller reporting on everyone passes the
    catalogue it has already read."""
    with transaction():
        user = users.get_user_by_id(user_id)
        if not user:
            raise NotFound("User not found")

        skills = skills if skills is not None else catalog.get_skills()
        roles = roles if roles is not None else catalog.get_target_roles()
        levels = user_skills.get_user_skills(user_id)
        role = next((r for r in roles if r["id"] == user.get("targetRoleId")), None)
        submitted = evidence.get_for_user(user_id)

    met_count = 0
    total_requirements = 0
    score_accumulator = 0
    breakdown: list[dict[str, Any]] = []

    held_by_id = {s["skillId"]: s for s in levels}
    required_by_id = {s["skillId"]: s for s in role["requiredSkills"]} if role else {}
    for sk in skills:
        held = held_by_id.get(sk["id"])
        required = required_by_id.get(sk["id"])
        current = held["currentLevel"] if held else 0
        target = required["minLevel"] if required else (held["targetLevel"] if held else 0)

        met = False
        if target > 0:
            total_requirements += 1
            if current >= target:
                met_count += 1
                met = True

        # Only skills with a target count toward the score. (Every catalogue skill
        # without one used to count as 100%, so a person with 9 targets out of 39
        # skills scored about 40 points higher than their levels justified.)
        ratio = min(100, js_round((current / target) * 100)) if target > 0 else 100
        if target > 0:
            score_accumulator += ratio

        breakdown.append({
            "skillId": sk["id"],
            "skillName": sk["name"],
            "category": sk["category"],
            "current": current,
            "target": target,
            "status": held["status"] if held else "not_started",
            "isTargetMet": met,
            "scorePercentage": ratio,
            "lastUpdated": held["lastUpdated"] if held else "-",
        })

    approved = sum(1 for e in submitted if e["status"] == "approved")
    pending = sum(1 for e in submitted if e["status"] == "pending")

    # Up to 15 points for human-validated proof.
    progress_bonus = min(15, approved * 5)
    role_title = role["title"] if role else "selected role"
    if total_requirements:
        average_ratio = js_round(score_accumulator / total_requirements)
        final_score: int | None = min(100, max(0, js_round(average_ratio * 0.85 + progress_bonus)))
        met_percentage = js_round((met_count / total_requirements) * 100)
        explainability = (
            f"The score of {final_score}% is derived from:\n"
            f"- Current against target level over the {total_requirements} skill(s) with a target "
            f"for the '{role_title}' role: {average_ratio}%.\n"
            f"- Professional evidence threshold: {approved} verified submission(s) ({progress_bonus}% index bonus).\n"
            f"- Target goals successfully attained: {met_count} of {total_requirements} requirements ({met_percentage}% met)."
        )
    else:
        # Nothing to be ready for: not measured, rather than a score made up of
        # skills nobody asked for.
        final_score = None
        explainability = (
            "Not measured: no skill has a target level yet. Choose a target role to set them."
        )

    return {
        "overallScore": final_score,
        "targetRoleTitle": role["title"] if role else "None Selected",
        "targetRoleId": role["id"] if role else None,
        "skillsBreakdown": breakdown,
        "explainability": explainability,
        "stats": {
            "totalRequirements": total_requirements,
            "metCount": met_count,
            "evidenceCount": approved,
            "pendingValidation": pending,
        },
    }


def _flow_position(user_id: str) -> dict[str, Any]:
    """Where someone stands between handoff and deployment, for the manager's board."""
    handoff = assessments.get_latest_handoff(user_id)
    demand = demands.get_project_demand_by_id(handoff["demandId"]) if handoff else None
    level1 = skillgap.latest_completed(user_id)
    post = assessments.get_latest_post_assessment(user_id, demand["id"]) if demand else None
    steps = [
        s for s in learning.get_learning_plan(user_id) if demand and s.get("demandId") == demand["id"]
    ]
    return {
        "activeProject": {"id": demand["id"], "projectName": demand["projectName"]} if demand else None,
        "level1Score": level1["result"]["overallScore"] if level1 else None,
        "level1Taken": level1 is not None,
        "projectStepsDone": sum(1 for s in steps if s["status"] == "completed"),
        "projectStepsTotal": len(steps),
        "postAssessmentStatus": post["status"] if post else None,
    }


def team_rollup(manager_id: str) -> list[dict[str, Any]]:
    """Each direct report's Skill, Will and Engagement, gap count and risk - the data
    behind the Skill-vs-Will matrix."""
    with transaction():
        team = [
            u for u in users.get_users()
            if u["role"] == "employee" and u.get("managerId") == manager_id
        ]
        target_roles = catalog.get_target_roles()
        result: list[dict[str, Any]] = []

        for member in team:
            levels = user_skills.get_user_skills(member["id"])
            submitted = evidence.get_for_user(member["id"])
            approved = sum(1 for e in submitted if e["status"] == "approved")
            pending = sum(1 for e in submitted if e["status"] == "pending")
            role = next((r for r in target_roles if r["id"] == member.get("targetRoleId")), None)

            gap_count = sum(1 for s in levels if s["currentLevel"] < s["targetLevel"])
            risk = "High" if gap_count >= 4 else "Medium" if gap_count >= 2 else "Low"

            # Someone with no skill records scores from approved evidence alone - never
            # a made-up figure. (This used to derive a score from the employee id.)
            score = skill_score(levels, approved)

            motivation = compute_motivation_scores(member["id"])
            result.append({
                "userId": member["id"],
                "userName": member["name"],
                "title": member["title"],
                # None when no target role is chosen. (This used to say "Automation
                # Tester" for anyone without one.)
                "targetRoleTitle": role["title"] if role else None,
                "avatar": member["avatar"],
                "overallScore": score,
                "skillScore": score,
                "willScore": motivation["willScore"],
                "engagementScore": motivation["engagementScore"],
                "learningProgressPercent": motivation["engagementScore"],
                "gapCount": gap_count,
                "pendingValidationCount": pending,
                "approvedEvidenceCount": approved,
                "experienceYears": member.get("experienceYears"),
                "riskStatus": risk,
                **_flow_position(member["id"]),
            })
    return result


def submit_evidence(
    user_id: str,
    skill_id: str,
    title: str,
    description: str,
    evidence_text: str,
    document_url: str | None,
) -> dict[str, Any]:
    """Record a submission and move the skill into "practicing" - atomically, so a
    submission can never exist without its skill status following."""
    with transaction():
        evidence_id = evidence.insert(
            user_id, skill_id, title, description, evidence_text, document_url
        )
        user_skills.set_level(
            user_id, skill_id, user_skills.get_current_level(user_id, skill_id), "practicing"
        )
        return evidence.get_evidence_by_id(evidence_id)


def review_evidence(
    evidence_id: str, reviewer_id: str, status: str, comment: str
) -> dict[str, Any] | None:
    """Record a manager's verdict. Approval promotes the skill one level (capped at 5)
    and marks it validated; any other verdict returns it to "learning". The verdict
    and the level change commit together, and each submission is reviewed once: a
    second approval used to raise the level again."""
    with transaction():
        if evidence.get_evidence_by_id(evidence_id) is None:
            return None
        if not evidence.set_review(evidence_id, reviewer_id, status, comment):
            raise Invalid("This evidence has already been reviewed.")
        updated = evidence.get_evidence_by_id(evidence_id)

        held = next(
            (s for s in user_skills.get_user_skills(updated["userId"])
             if s["skillId"] == updated["skillId"]),
            None,
        )
        if held:
            if status == "approved":
                user_skills.set_level(
                    updated["userId"], updated["skillId"],
                    min(5, held["currentLevel"] + 1), "validated",
                )
            else:
                user_skills.set_level(
                    updated["userId"], updated["skillId"], held["currentLevel"], "learning"
                )
        return updated


def change_target_role(user_id: str, role_id: str) -> dict[str, Any] | None:
    """Set the user's target role and seed a skill row for each of its requirements:
    new pairings start at level 1 with the role's minimum as target, existing ones
    have their target raised. One transaction, so a half-seeded role cannot exist."""
    with transaction():
        users.set_target_role_id(user_id, role_id)
        user = users.get_user_by_id(user_id)
        if not user:
            return None
        for req in catalog.get_role_requirements(role_id):
            if user_skills.exists(user_id, req["skillId"]):
                user_skills.set_target_level(user_id, req["skillId"], req["minLevel"])
            else:
                user_skills.add_not_started(user_id, req["skillId"], req["minLevel"])
        return user
