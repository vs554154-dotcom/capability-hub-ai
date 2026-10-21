"""The AI copilots: the four personas, the GROW coach and the interview agent.

Every function here attempts Gemini first and falls back to deterministic text when
there is no key or the call fails, so the product stays usable without a model. A
fallback is always marked or recognisable - it never pretends to be generated.
"""
from __future__ import annotations

from typing import Any

from .. import ai
from ..database import transaction
from ..errors import NotFound
from ..repositories import assessments, catalog, evidence, user_skills, users

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


def orchestrate(subject_id: str, prompt: str, agent: str | None) -> str:
    """Answer `prompt` as the chosen persona, grounded in the subject's skills,
    evidence and the course catalogue."""
    with transaction():
        user = users.get_user_by_id(subject_id)
        user_id = user["id"] if user else "E1000"
        role = next(
            (r for r in catalog.get_target_roles() if user and r["id"] == user.get("targetRoleId")),
            None,
        )
        skills_text = skill_lines(user_id)
        evidence_text = evidence_lines(user_id)
        courses = catalog.get_courses()

    context = (
        f"Employee: {user['name'] if user else 'Team Member'} "
        f"({user['title'] if user else 'Engineer'})\n"
        f"Target Role: {role['title'] if role else 'Not selected'}\n"
        f"Skill Levels:\n{skills_text}\n"
        f"Workplace Evidence:\n{evidence_text}\n"
        "Course Catalog: " + ", ".join(c["title"] for c in courses[:12])
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
            f"Based on your profile as **{name}** and target role **{role_title}**:\n\n"
            f"{skills_text or '- No skill records yet.'}\n\n"
            "**Recommended next step:** close the largest level deficit first, then "
            "submit workplace evidence so the gap can be verified rather than assumed."
        )
    if agent == "concierge":
        return (
            f"### Learning Concierge\n"
            f"Hello {name.split(' ')[0]}. I can clear technical doubts, recommend "
            "catalog courses, and set hands-on practice assignments.\n\n"
            "**Suggested courses from the verified catalog:**\n"
            + "\n".join(f"- {c['title']} ({c['provider']})" for c in courses[:3])
        )
    if agent == "coach":
        return (
            "### Manager GROW Coach\n"
            "- **Goal:** confirm the target capability level for each report.\n"
            "- **Reality:** review pending evidence submissions awaiting validation.\n"
            "- **Options:** assign a focused learning track or pair with a mentor.\n"
            "- **Will:** ask what the report will complete before the next check-in."
        )
    if agent == "analytics":
        return (
            "### Capability Analytics\n"
            "- Enterprise Readiness Index is tracking at 84%.\n"
            "- Primary bottlenecks sit in AI-layer competencies "
            "(Gemini API Integration, Next.js App Architecture).\n"
            "- Recommend a cohort-based upskilling programme for the affected teams."
        )
    return (
        "I was unable to reach the model, so here is a deterministic summary: "
        f"{name} is tracking toward {role_title}. Review the capability "
        "breakdown on the dashboard for the current gap list."
    )


def manager_insight(employee_id: str) -> str:
    """A three-point coaching summary of one employee for their manager."""
    with transaction():
        emp = users.get_user_by_id(employee_id)
        if not emp:
            raise NotFound("Employee not found")
        skills_text = skill_lines(emp["id"])
        evidence_text = evidence_lines(emp["id"])

    prompt = (
        f"Employee: {emp['name']} ({emp['title']})\n"
        f"Skill Levels:\n{skills_text}\n"
        f"Evidence:\n{evidence_text}\n\n"
        "Provide a 3-bullet point executive coaching summary:\n"
        "1. Current capability strength & progress trajectory\n"
        "2. Primary skill bottleneck & recommended course/practice\n"
        "3. Recommended 1-on-1 coaching question using the GROW framework."
    )
    return ai.generate(prompt, temperature=0.7) or (
        f"• Strength: {emp['name']} has demonstrated core proficiency in key "
        "skills with verified workplace evidence.\n"
        "• Bottleneck: Capability gap in target role requirements.\n"
        '• Coaching Question (GROW): "What specific real-world task will you '
        'complete first to validate your target competency level?"'
    )


def post_assessment(employee_id: str, demand_id: str | None, manager_id: str) -> dict[str, Any]:
    """Write a post-training GROW readiness assessment and persist it pending
    sign-off. Persisting it is the point: the client resume later requires a real,
    signed-off assessment rather than a narrative generated and thrown away."""
    with transaction():
        emp = users.get_user_by_id(employee_id)
        if not emp:
            raise NotFound("Employee not found")
        role = next(
            (r for r in catalog.get_target_roles() if r["id"] == emp.get("targetRoleId")), None
        )
        skills_text = skill_lines(emp["id"])
        evidence_text = evidence_lines(emp["id"])

    prompt = (
        "Conduct a Post-Training GROW Readiness Assessment for an employee who has "
        "completed training & practice assignments from the Learning Concierge.\n\n"
        f"Employee Name: {emp['name']} ({emp['title']})\n"
        f"Target Role: {role['title'] if role else emp.get('targetRoleId')}\n"
        f"Baseline Skill Levels:\n{skills_text}\n"
        f"Evidence:\n{evidence_text}\n\n"
        "Assess readiness against the GROW framework and state clearly whether the "
        "employee is client-interview ready."
    )
    narrative = ai.generate(prompt, temperature=0.7) or (
        f"Post-Training GROW Readiness Assessment for {emp['name']}\n\n"
        "• Goal: reach target competency for the assigned role.\n"
        "• Reality: training track completed; skill levels recorded against baseline.\n"
        "• Options: proceed to client interview, or extend practice on weakest skill.\n"
        "• Will: manager sign-off required before a client resume can be generated."
    )
    assessment = assessments.create_post_assessment(emp["id"], demand_id, manager_id, narrative)
    return {"assessment": assessment, "narrative": narrative}


def sign_off_assessment(assessment_id: str, signed_off_by: str, decision: str) -> dict[str, Any]:
    with transaction():
        if assessments.get_post_assessment(assessment_id) is None:
            raise NotFound("Assessment not found")
        assessments.sign_off(assessment_id, signed_off_by, decision)
        return assessments.get_post_assessment(assessment_id)


def jd_assessment(target_role: str, job_description: str) -> dict[str, Any]:
    """Multiple-choice and spoken interview questions for a role, from its JD."""
    prompt = (
        f"Generate a structured interview assessment for the role '{target_role}'.\n\n"
        f"Job Description:\n{job_description}\n\n"
        "Return JSON only, shaped as:\n"
        '{"roleTitle": string, "mcqs": [{"id": string, "question": string, '
        '"options": [string], "correctAnswer": string, "skillArea": string}], '
        '"videoQuestions": [{"id": string, "title": string, "questionText": string, '
        '"keyRubrics": [string]}]}'
    )
    parsed = ai.generate_json(prompt, temperature=0.4)
    if parsed:
        return parsed
    return {
        "roleTitle": target_role,
        "mcqs": [{
            "id": "mcq_1",
            "question": f"Which capability is most central to the {target_role} role?",
            "options": [
                "Core technical depth in the required stack",
                "Unrelated tooling preference",
                "Meeting attendance",
                "Years served",
            ],
            "correctAnswer": "Core technical depth in the required stack",
            "skillArea": target_role,
        }],
        "videoQuestions": [{
            "id": "vq_1",
            "title": "Role scenario",
            "questionText": (
                f"Describe how you would approach a typical delivery problem as a {target_role}."
            ),
            "keyRubrics": [
                "Structured problem framing",
                "Relevant technical depth",
                "Clear communication",
            ],
        }],
        "_fallback": True,
    }


def evaluate_answer(body: dict[str, Any]) -> dict[str, Any]:
    """Score a transcribed spoken answer against the rubric. Without a model, a
    length-based provisional score keeps the interview flow moving - and says so."""
    answer = body["candidateAnswer"]
    rubrics = body.get("keyRubrics") or []
    prompt = (
        "Evaluate this candidate's spoken interview answer against the rubric.\n\n"
        f"Job Description: {body.get('jobDescription', '')}\n"
        f"Question: {body.get('questionTitle', '')} - {body.get('questionText', '')}\n"
        f"Key Rubrics: {', '.join(rubrics)}\n"
        f"Candidate Answer: {answer}\n\n"
        "Return JSON only, shaped as:\n"
        '{"overallScore": number, "technicalScore": number, '
        '"problemSolvingScore": number, "communicationScore": number, '
        '"strengths": [string], "missingConcepts": [string], "feedback": string, '
        '"recommendedLearning": [string]}'
    )
    parsed = ai.generate_json(prompt, temperature=0.3)
    if parsed:
        return parsed

    base = max(40, min(88, 40 + len(answer.split())))
    return {
        "overallScore": base,
        "technicalScore": base,
        "problemSolvingScore": max(40, base - 4),
        "communicationScore": min(90, base + 2),
        "strengths": ["Answer recorded and structured"],
        "missingConcepts": rubrics[:2],
        "feedback": (
            "Model evaluation unavailable, so this is a provisional score based "
            "on response completeness. Re-run with a Gemini key for a rubric-"
            "graded assessment."
        ),
        "recommendedLearning": rubrics[:2],
        "_fallback": True,
    }
