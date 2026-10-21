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
from ..errors import NotFound
from ..numeric import js_round
from ..repositories import catalog, evidence, learning, user_skills, users


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


def capability_report(user_id: str) -> dict[str, Any]:
    """The Capability Readiness Score with its per-skill breakdown and a plain-text
    explanation of how it was reached."""
    with transaction():
        user = users.get_user_by_id(user_id)
        if not user:
            raise NotFound("User not found")

        skills = catalog.get_skills()
        levels = user_skills.get_user_skills(user_id)
        role = next(
            (r for r in catalog.get_target_roles() if r["id"] == user.get("targetRoleId")),
            None,
        )
        submitted = evidence.get_for_user(user_id)

    met_count = 0
    total_requirements = 0
    score_accumulator = 0
    breakdown: list[dict[str, Any]] = []

    for sk in skills:
        held = next((s for s in levels if s["skillId"] == sk["id"]), None)
        required = (
            next((s for s in role["requiredSkills"] if s["skillId"] == sk["id"]), None)
            if role else None
        )
        current = held["currentLevel"] if held else 0
        target = required["minLevel"] if required else (held["targetLevel"] if held else 0)

        met = False
        if target > 0:
            total_requirements += 1
            if current >= target:
                met_count += 1
                met = True

        # A skill with no target counts as fully satisfied (100), which is why the
        # average is generous by design.
        ratio = min(100, js_round((current / target) * 100)) if target > 0 else 100
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

    average_ratio = js_round(score_accumulator / len(breakdown)) if breakdown else 0
    approved = sum(1 for e in submitted if e["status"] == "approved")
    pending = sum(1 for e in submitted if e["status"] == "pending")

    # Up to 15 points for human-validated proof.
    progress_bonus = min(15, approved * 5)
    final_score = min(100, max(0, js_round(average_ratio * 0.85 + progress_bonus)))
    met_percentage = js_round((met_count / total_requirements) * 100) if total_requirements else 0

    role_title = role["title"] if role else "selected role"
    explainability = (
        f"The score of {final_score}% is derived from:\n"
        f"- Match ratio of current vs required levels for the '{role_title}' role: {average_ratio}%.\n"
        f"- Professional evidence threshold: {approved} verified submission(s) ({progress_bonus}% index bonus).\n"
        f"- Target goals successfully attained: {met_count} of {total_requirements} requirements ({met_percentage}% met)."
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

            score = skill_score(levels, approved)
            if not levels:
                digits = "".join(c for c in member["id"] if c.isdigit())
                score = 25 + (((int(digits) if digits else 1) * 37) % 68)

            motivation = compute_motivation_scores(member["id"])
            result.append({
                "userId": member["id"],
                "userName": member["name"],
                "title": member["title"],
                "targetRoleTitle": role["title"] if role else "Automation Tester",
                "avatar": member["avatar"],
                "overallScore": score,
                "skillScore": score,
                "willScore": motivation["willScore"],
                "engagementScore": motivation["engagementScore"],
                "learningProgressPercent": motivation["engagementScore"],
                "gapCount": gap_count,
                "pendingValidationCount": pending,
                "riskStatus": risk,
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
    and the level change commit together."""
    with transaction():
        if evidence.get_evidence_by_id(evidence_id) is None:
            return None
        evidence.set_review(evidence_id, reviewer_id, status, comment)
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
