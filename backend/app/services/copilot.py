"""The AI copilots: the four personas and the GROW coach.

Every function here attempts Gemini first and falls back to deterministic text when
there is no key or the call fails, so the product stays usable without a model. A
fallback is always marked or recognisable - it never pretends to be generated.
"""
from __future__ import annotations

from typing import Any

from .. import ai
from ..database import transaction
from ..errors import NotFound
from ..repositories import assessments, catalog, demands, evidence, learning, user_skills, users
from .analytics import org_context
from .capability import team_rollup
from .journey import course_lines, gap_line, journey, journey_lines
from .matching import mentioned_skills, names_word
from .talent import project_readiness

PERSONAS = {
    "skill_gap": """
You are the **SkillGap-to-Growth Agent** on the Capability Hub AI platform.
Analyse the employee's current capability against their target role, name the
specific gaps, and lay out an adaptive roadmap to close them.
""",
    "concierge": """
You are the **Learning Concierge & 1-on-1 AI Mentor** on the Capability Hub AI platform.
Clear technical doubts step by step, recommend catalog courses, and suggest
hands-on workplace practice assignments.
""",
    "coach": """
You are the **Manager GROW Coach** on the Capability Hub AI platform.
Summarise direct reports' skill gaps, review pending evidence, and produce GROW
framework coaching questions.
""",
    "analytics": """
You are the **Capability Analytics AI** on the Capability Hub AI platform.
1. Synthesize team-wide capability readiness metrics.
2. Highlight high-risk organizational bottlenecks.
3. Offer concrete upskilling programs to run.
4. Forecast readiness gains for the executive suite.

Style instructions: Data-driven, strategic, objective, and authoritative.
""",
}

DEFAULT_PERSONA = """
You are the **Capability Orchestrator** on the Capability Hub AI platform.
Decide which of the specialized agents is most suited to answer the user query
and respond in that persona.
"""


def skill_lines(user_id: str) -> str:
    names = catalog.get_skills()
    lines = []
    for s in user_skills.get_user_skills(user_id):
        name = next((sk["name"] for sk in names if sk["id"] == s["skillId"]), s["skillId"])
        lines.append(f"- {name}: Baseline Level {s['currentLevel']}/5 (Target {s['targetLevel']}/5)")
    return "\n".join(lines)


def evidence_lines(user_id: str) -> str:
    items = evidence.get_for_user(user_id)
    if not items:
        return "No custom evidence submitted yet."
    return "\n".join(
        f"- {e['title']}: "
        + ("✅ Approved Evidence" if e["status"] == "approved" else "⏳ Pending Review")
        for e in items
    )


COMPUTED = "(computed from records; the AI model was unavailable)"


def record_facts(user_id: str) -> dict[str, Any]:
    """What the records say about one person, for summaries written without a model:
    strongest skill, gaps largest first, approved evidence, learning-plan progress."""
    names = {s["id"]: s["name"] for s in catalog.get_skills()}
    levels = user_skills.get_user_skills(user_id)
    gaps = sorted(
        (
            {"skill": names.get(s["skillId"], s["skillId"]), "current": s["currentLevel"], "target": s["targetLevel"]}
            for s in levels if s["currentLevel"] < s["targetLevel"]
        ),
        key=lambda g: (g["current"] - g["target"], g["skill"]),
    )
    strongest = max(levels, key=lambda s: s["currentLevel"], default=None)
    plan = learning.get_learning_plan(user_id)
    return {
        "strongest": (names.get(strongest["skillId"], strongest["skillId"]), strongest["currentLevel"])
        if strongest else None,
        "gaps": gaps,
        "approved": sum(1 for e in evidence.get_for_user(user_id) if e["status"] == "approved"),
        "steps_done": sum(1 for p in plan if p["status"] == "completed"),
        "steps_total": len(plan),
    }


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _focused(j: dict[str, Any], prompt: str, skill_id: str | None) -> list[dict[str, Any]]:
    """The person's gaps, with the skills asked about first - also ones that are not a
    gap, so a question about any catalogue skill is answered with that skill in view.
    A skill that is only part of the project's name was not asked about."""
    gaps, skills = j["gaps"], catalog.get_skills()
    if j["project"]:
        prompt = prompt.replace(j["project"]["projectName"], " ")
    asked_ids = [s["id"] for s in skills if s["id"] == skill_id]
    asked_ids += [s["id"] for s in mentioned_skills(prompt, skills) if s["id"] not in asked_ids]
    by_id = {g["skillId"]: g for g in gaps if g["skillId"]}
    names = {s["id"]: s["name"] for s in skills}
    asked = [
        by_id.get(i) or {"skillId": i, "skillName": names[i], "current": None, "target": None,
                         "sources": ["asked about"]}
        for i in asked_ids
    ]
    return asked + [g for g in gaps if g["skillId"] not in asked_ids]


def orchestrate(
    subject_id: str, prompt: str, agent: str | None, org_view: bool = False, skill_id: str | None = None
) -> str:
    """Answer `prompt` as the chosen persona, grounded in the subject's skills,
    evidence, project, assessment, learning plan and the courses for their gaps - or,
    for the analytics persona when the caller may see organisation-wide figures
    (`org_view`), in those figures."""
    if agent == "analytics" and org_view:
        context = org_context()
        text = ai.generate(
            prompt,
            system_instruction=(
                f"{PERSONAS['analytics']}\n\n"
                "Use only the figures below. Where a component is not measured, say so "
                "rather than estimating it.\n\n"
                f"=== ORGANISATION METRICS ===\n{context}"
            ),
            temperature=0.7,
        )
        return text or (
            "### Capability Analytics - computed summary (the AI model was unavailable)\n"
            f"{context}"
        )

    with transaction():
        user = users.get_user_by_id(subject_id)
        # An unknown subject grounds the answer in nothing. (It used to fall back to
        # E1000, putting one real employee's records into anyone's prompt.)
        user_id = user["id"] if user else subject_id
        role = next(
            (r for r in catalog.get_target_roles() if user and r["id"] == user.get("targetRoleId")),
            None,
        )
        skills_text = skill_lines(user_id)
        evidence_text = evidence_lines(user_id)
        current = journey(user) if user else None
        gaps = _focused(current, prompt, skill_id) if current else []
        courses = course_lines(gaps)
        focus = next((s["name"] for s in catalog.get_skills() if s["id"] == skill_id), None)

    where = "\n".join(journey_lines(current)) if current else "No record."
    gap_text = "\n".join(f"- {gap_line(g)}" for g in gaps) or "- None on record."
    course_text = "\n".join(f"- {line}" for line in courses) or "- No gaps to find courses for."
    context = (
        f"Employee: {user['name'] if user else 'Team Member'} "
        f"({user['title'] if user else 'Engineer'})\n"
        f"Target Role: {role['title'] if role else 'Not selected'}\n"
        + (f"Skill asked about: {focus}\n" if focus else "")
        + f"{where}\n"
        f"Gaps, most urgent first:\n{gap_text}\n"
        f"Skill Levels:\n{skills_text}\n"
        f"Workplace Evidence:\n{evidence_text}\n"
        f"Catalogue courses for those gaps:\n{course_text}"
    )
    text = ai.generate(
        prompt,
        system_instruction=(
            f"{PERSONAS.get(agent, DEFAULT_PERSONA)}\n\n"
            f"=== RELEVANT ORGANIZATION DATA CONTEXT ===\n{context}"
        ),
        temperature=0.7,
    )
    if text:
        return text

    name = user["name"] if user else "Team Member"
    role_title = role["title"] if role else "Target Role"
    if agent == "skill_gap":
        return (
            f"### SkillGap-to-Growth Analysis (Intelligent Agent)\n"
            f"{COMPUTED}\n\n"
            f"Based on your profile as **{name}** and target role **{role_title}**:\n\n"
            f"{where}\n\n"
            f"**Your gaps, most urgent first:**\n{gap_text}\n\n"
            "**Recommended next step:** "
            + (f"close {gaps[0]['skillName']} first, then " if gaps else "")
            + "submit workplace evidence so the skill can be verified rather than assumed. "
            "The Learning Concierge can find courses and practice for each gap."
        )
    if agent == "concierge":
        practice = "\n".join(
            f"- **{g['skillName']}:** use it in one piece of real work, then submit it as evidence for review."
            for g in gaps[:3]
        )
        return (
            f"### Learning Concierge\n"
            f"{COMPUTED}\n\n"
            f"Hello {name.split(' ')[0]}. I cannot explain concepts until the AI model is back, "
            "but here is what your records say.\n\n"
            f"**Your gaps, most urgent first:**\n{gap_text}\n\n"
            f"**Courses in the catalogue for them:**\n{course_text}\n\n"
            f"**Practice assignments:**\n{practice or '- No gaps on record, so none is needed.'}"
        )
    if agent == "coach":
        return (
            "### Manager GROW Coach\n"
            f"{COMPUTED}\n\n{grow_lines(name, current)}"
            if current else "### Manager GROW Coach\nNo record of this person."
        )
    if agent == "analytics":
        return (
            "### Capability Analytics\n"
            "Organisation-wide figures are available to managers, L&D and leadership. "
            f"Here is {name}'s own skill picture:\n\n"
            f"{skills_text or '- No skill records yet.'}"
        )
    return (
        "I was unable to reach the model, so here is a deterministic summary: "
        f"{name} is tracking toward {role_title}. Review the capability "
        "breakdown on the dashboard for the current gap list."
    )


def grow_lines(name: str, j: dict[str, Any]) -> str:
    """Goal, Reality, Options and Will for one person, from their records."""
    first = name.split(" ")[0]
    gap = j["gaps"][0] if j["gaps"] else None
    project = j["project"]
    goal = (
        f"{project['projectName']} for {project['customerName']}" if project
        else "their target role"
    )
    step = j["plan"]["next"]
    return (
        f"- **Goal:** {goal}. Ask {first}: what would being ready for this look like?\n"
        f"- **Reality:** {'; '.join(journey_lines(j)[1:])}. "
        + (f"Largest gap: {gap_line(gap)}. " if gap else "No open gap on record. ")
        + f"Ask {first}: what have you tried so far?\n"
        "- **Options:** "
        + (
            f"practise {gap['skillName']} in real work, or pair with someone who has it. "
            if gap else "take on client-facing work that stretches them. "
        )
        + f"Ask {first}: which would help most?\n"
        "- **Will:** "
        + (f"next step in the plan is \"{step['title']}\". " if step else "no open learning step. ")
        + f"Ask {first}: what will you finish before we next meet?"
    )


def coach_team(manager: dict[str, Any], prompt: str) -> str:
    """Answer a manager's coaching question from their reports' records. A report
    named in the question is described in full. L&D and leadership, who have no
    reports, coach across everyone they may see."""
    with transaction():
        people = [u for u in users.get_direct_reports(manager["id"]) if u["role"] == "employee"]
        if not people and manager["role"] != "manager":
            people = [u for u in users.get_users() if u["role"] == "employee"]
        journeys = {p["id"]: journey(p) for p in people}
        pending = {
            p["id"]: [e["title"] for e in evidence.get_for_user(p["id"]) if e["status"] == "pending"]
            for p in people
        }
        scores = {m["userId"]: m for m in team_rollup(manager["id"])}
        named = [
            p for p in people
            if names_word(p["id"], prompt) or names_word(p["name"].split(" ")[0], prompt)
        ]
        detail = {p["id"]: (skill_lines(p["id"]), evidence_lines(p["id"])) for p in named}

    def line(p: dict[str, Any]) -> str:
        j, m = journeys[p["id"]], scores.get(p["id"])
        parts = [f"{p['name']} ({p['title']})"]
        if m:
            parts.append(f"Skill {m['skillScore']}, Will {m['willScore']}")
        parts += [l for l in journey_lines(j) if l != "Active project: none"]
        parts.append(_plural(len(j["gaps"]), "open gap"))
        if pending[p["id"]]:
            parts.append(f"evidence waiting for review: {', '.join(pending[p['id']])}")
        return "; ".join(parts)

    if not people:
        return "### Manager GROW Coach\nYou have no direct reports, so there is nobody to coach yet."
    team_text = "\n".join(f"- {line(p)}" for p in people)
    detail_text = "\n".join(
        f"\n{p['name']} in detail\nSkill levels:\n{detail[p['id']][0]}\nEvidence:\n{detail[p['id']][1]}\n"
        "Gaps, most urgent first:\n"
        + ("\n".join(f"- {gap_line(g)}" for g in journeys[p["id"]]["gaps"]) or "- None on record.")
        for p in named
    )
    text = ai.generate(
        prompt,
        system_instruction=(
            f"{PERSONAS['coach']}\n\nUse only the records below; say so when something is not recorded.\n\n"
            f"=== {manager['name']}'s REPORTS ===\n{team_text}\n{detail_text}"
        ),
        temperature=0.7,
    )
    if text:
        return text

    # Without a model: the person asked about, else whoever has most to close.
    focus = named or sorted(people, key=lambda p: -len(journeys[p["id"]]["gaps"]))[:1]
    waiting = [f"- {p['name']}: {', '.join(pending[p['id']])}" for p in people if pending[p["id"]]]
    return (
        f"### Manager GROW Coach\n{COMPUTED}\n\n"
        + ("" if named else f"**Your reports:**\n{team_text}\n\n")
        + (f"**Evidence waiting for your review:**\n" + "\n".join(waiting) + "\n\n" if waiting and not named else "")
        + "\n\n".join(
            f"**GROW questions for {p['name']}:**\n{grow_lines(p['name'], journeys[p['id']])}" for p in focus
        )
    )


def manager_insight(employee_id: str) -> str:
    """A three-point coaching summary of one employee for their manager."""
    with transaction():
        emp = users.get_user_by_id(employee_id)
        if not emp:
            raise NotFound("Employee not found")
        skills_text = skill_lines(emp["id"])
        evidence_text = evidence_lines(emp["id"])
        facts = record_facts(emp["id"])
        current = journey(emp)

    prompt = (
        f"Employee: {emp['name']} ({emp['title']})\n"
        + "\n".join(journey_lines(current)) + "\n"
        f"Skill Levels:\n{skills_text}\n"
        f"Evidence:\n{evidence_text}\n\n"
        "Provide a 3-bullet point executive coaching summary:\n"
        "1. Current capability strength & progress trajectory\n"
        "2. Primary skill bottleneck & recommended course/practice\n"
        "3. Recommended 1-on-1 coaching question using the GROW framework."
    )
    text = ai.generate(prompt, temperature=0.7)
    if text:
        return text

    strongest = facts["strongest"]
    gap = facts["gaps"][0] if facts["gaps"] else None
    strength = (
        f"{strongest[0]} at level {strongest[1]} of 5; {_plural(facts['approved'], 'approved piece')} of evidence."
        if strongest else "No skill records yet."
    )
    bottleneck = (
        f"{gap['skill']}: level {gap['current']} against a target of {gap['target']}"
        + (f", and {_plural(len(facts['gaps']) - 1, 'other gap')}." if len(facts["gaps"]) > 1 else ".")
        if gap else "No skill is below target."
    )
    question = (
        f'"What piece of real work could show {gap["skill"]} at level {gap["target"]}?"'
        if gap else '"Which client-facing work would stretch you next?"'
    )
    return (
        f"{COMPUTED}\n"
        f"• Strength: {strength}\n"
        f"• Bottleneck: {bottleneck}\n"
        f"• Coaching question (GROW): {question}"
        + (f"\n• Project: {'; '.join(journey_lines(current))}" if current["project"] else "")
    )


def post_assessment(employee_id: str, demand_id: str | None, manager_id: str) -> dict[str, Any]:
    """Write a post-training GROW readiness assessment and persist it pending
    sign-off. Persisting it is the point: the client resume later requires a real,
    signed-off assessment rather than a narrative generated and thrown away.

    It belongs to the demand the person was handed off to unless another is named.
    Without a demand it could never unlock a resume, whatever the manager decided."""
    with transaction():
        emp = users.get_user_by_id(employee_id)
        if not emp:
            raise NotFound("Employee not found")
        role = next(
            (r for r in catalog.get_target_roles() if r["id"] == emp.get("targetRoleId")), None
        )
        skills_text = skill_lines(emp["id"])
        evidence_text = evidence_lines(emp["id"])
        facts = record_facts(emp["id"])
        current = journey(emp)
        demand = demands.get_project_demand_by_id(demand_id) if demand_id else current["project"]
        if demand_id and not demand:
            raise NotFound("Project Demand not found.")
        readiness = project_readiness(emp, demand) if demand else None

    prompt = (
        "Conduct a Post-Training GROW Readiness Assessment for an employee who has "
        "completed training & practice assignments from the Learning Concierge.\n\n"
        f"Employee Name: {emp['name']} ({emp['title']})\n"
        f"Target Role: {role['title'] if role else 'Not selected'}\n"
        + (
            f"Project: {demand['projectName']} for {demand['customerName']}\n"
            f"Requirements met at handoff: {readiness['atHandoff']}%, now: {readiness['now']}%\n"
            f"Closed since handoff: {', '.join(readiness['closed']) or 'none'}\n"
            f"Still open: {', '.join(readiness['open']) or 'none'}\n"
            if demand else ""
        )
        + "\n".join(journey_lines(current)) + "\n"
        f"Skill Levels:\n{skills_text}\n"
        f"Evidence:\n{evidence_text}\n\n"
        "Assess readiness against the GROW framework and state clearly whether the "
        "employee is client-interview ready."
    )
    gaps = facts["gaps"]
    # For a project, a skill it requires comes before any other gap.
    open_skills = readiness["open"] if readiness else [g["skill"] for g in gaps]
    to_practise = open_skills[0] if open_skills else None
    narrative = ai.generate(prompt, temperature=0.7) or (
        f"Post-Training GROW Readiness Assessment for {emp['name']} {COMPUTED}\n\n"
        f"• Goal: "
        + (f"{demand['projectName']} for {demand['customerName']}" if demand
           else role["title"] if role else "the target role")
        + ".\n"
        f"• Reality: {facts['steps_done']} of {_plural(facts['steps_total'], 'learning step')} completed; "
        + (
            f"{_plural(len(gaps), 'skill')} still below target "
            f"({', '.join(f'{g["skill"]} {g["current"]}/{g["target"]}' for g in gaps[:3])}"
            + (", ..." if len(gaps) > 3 else "") + "); "
            if gaps else "no skill below target; "
        )
        + f"{_plural(facts['approved'], 'approved piece')} of evidence.\n"
        + (
            f"• Readiness for the project: {readiness['now']}% of its required skills met"
            + (f", against {readiness['atHandoff']}% at handoff" if readiness["atHandoff"] is not None else "")
            + f". Closed: {', '.join(readiness['closed']) or 'none'}. "
            f"Still open: {', '.join(readiness['open']) or 'none'}.\n"
            if readiness else ""
        )
        + (
            f"• Level-1 assessment: {current['assessment']['result']['overallScore']}%.\n"
            if current["assessment"] and current["assessment"]["result"]["overallScore"] is not None else ""
        )
        + (
            f"• Options: extend practice on {to_practise} before the client interview, or proceed and accept the gap.\n"
            if to_practise else "• Options: proceed to the client interview.\n"
        )
        + "• Will: the manager's sign-off, as cleared or not ready, decides whether a client resume can be generated."
    )
    assessment = assessments.create_post_assessment(
        emp["id"], demand["id"] if demand else None, manager_id, narrative
    )
    return {
        "assessment": assessment,
        "narrative": narrative,
        "project": {"id": demand["id"], "projectName": demand["projectName"]} if demand else None,
        "readiness": {k: readiness[k] for k in ("atHandoff", "now", "closed", "open")} if readiness else None,
    }


def sign_off_assessment(assessment_id: str, signed_off_by: str, decision: str) -> dict[str, Any]:
    with transaction():
        if assessments.get_post_assessment(assessment_id) is None:
            raise NotFound("Assessment not found")
        assessments.sign_off(assessment_id, signed_off_by, decision)
        return assessments.get_post_assessment(assessment_id)
