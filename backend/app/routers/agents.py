"""AI agent routes (Stage 4).

Port of the Gemini-backed handlers in server.ts. Every one keeps the same
posture as the Node original: attempt generation, and on a missing key or any
API failure return a deterministic fallback with HTTP 200 rather than an error.
The UI is built on the assumption that these endpoints always answer.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import ai, db
from ..deps import require_auth, require_manager_or_above, require_self_or_elevated_body

router = APIRouter(prefix="/api", tags=["agents"])


def _skill_lines(user_id: str) -> str:
    skills_dict = db.get_skills()
    lines = []
    for s in db.get_user_skills(user_id):
        name = next(
            (sk["name"] for sk in skills_dict if sk["id"] == s["skillId"]), s["skillId"]
        )
        lines.append(
            f"- {name}: Baseline Level {s['currentLevel']}/5 (Target {s['targetLevel']}/5)"
        )
    return "\n".join(lines)


def _evidence_lines(user_id: str) -> str:
    items = [e for e in db.get_evidences() if e["userId"] == user_id]
    if not items:
        return "No custom evidence submitted yet."
    return "\n".join(
        f"- {e['title']}: "
        + ("✅ Approved Evidence" if e["status"] == "approved" else "⏳ Pending Review")
        for e in items
    )


# --------------------------------------------------------------------------- #
# Cognitive orchestrator
# --------------------------------------------------------------------------- #

_PERSONAS = {
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

_DEFAULT_PERSONA = """
You are the **Capability Orchestrator** on the Capability Hub AI platform.
Decide which of the specialized agents is most suited to answer the user query
and respond in that persona.
"""


@router.post("/ai/orchestrator")
async def orchestrator(
    request: Request, _: dict = Depends(require_auth)
) -> dict[str, Any]:
    body = await request.json()
    prompt = body.get("prompt")
    agent = body.get("agent")

    if not prompt:
        raise HTTPException(
            status_code=400, detail="A prompt is required for AI interactions."
        )

    user = db.get_user_by_id(body.get("userId") or "E1000")
    user_id = user["id"] if user else "E1000"
    target_role = next(
        (r for r in db.get_target_roles()
         if user and r["id"] == user.get("targetRoleId")),
        None,
    )

    context = (
        f"Employee: {user['name'] if user else 'Team Member'} "
        f"({user['title'] if user else 'Engineer'})\n"
        f"Target Role: {target_role['title'] if target_role else 'Not selected'}\n"
        f"Skill Levels:\n{_skill_lines(user_id)}\n"
        f"Workplace Evidence:\n{_evidence_lines(user_id)}\n"
        "Course Catalog: "
        + ", ".join(c["title"] for c in db.get_courses()[:12])
    )

    system_instruction = _PERSONAS.get(agent, _DEFAULT_PERSONA)
    text = ai.generate(
        prompt,
        system_instruction=(
            f"{system_instruction}\n\n=== RELEVANT ORGANIZATION DATA CONTEXT ===\n{context}"
        ),
        temperature=0.7,
    )
    if text:
        return {"response": text}

    # Deterministic fallback, matching the Node behaviour when the key is absent
    # or the API errors.
    name = user["name"] if user else "Team Member"
    role_title = target_role["title"] if target_role else "Target Role"

    if agent == "skill_gap":
        fallback = (
            f"### SkillGap-to-Growth Analysis (Intelligent Agent)\n"
            f"Based on your profile as **{name}** and target role **{role_title}**:\n\n"
            f"{_skill_lines(user_id) or '- No skill records yet.'}\n\n"
            "**Recommended next step:** close the largest level deficit first, then "
            "submit workplace evidence so the gap can be verified rather than assumed."
        )
    elif agent == "concierge":
        fallback = (
            f"### Learning Concierge\n"
            f"Hello {name.split(' ')[0]}. I can clear technical doubts, recommend "
            "catalog courses, and set hands-on practice assignments.\n\n"
            "**Suggested courses from the verified catalog:**\n"
            + "\n".join(f"- {c['title']} ({c['provider']})" for c in db.get_courses()[:3])
        )
    elif agent == "coach":
        fallback = (
            "### Manager GROW Coach\n"
            "- **Goal:** confirm the target capability level for each report.\n"
            "- **Reality:** review pending evidence submissions awaiting validation.\n"
            "- **Options:** assign a focused learning track or pair with a mentor.\n"
            "- **Will:** ask what the report will complete before the next check-in."
        )
    elif agent == "analytics":
        fallback = (
            "### Capability Analytics\n"
            "- Enterprise Readiness Index is tracking at 84%.\n"
            "- Primary bottlenecks sit in AI-layer competencies "
            "(Gemini API Integration, Next.js App Architecture).\n"
            "- Recommend a cohort-based upskilling programme for the affected teams."
        )
    else:
        fallback = (
            "I was unable to reach the model, so here is a deterministic summary: "
            f"{name} is tracking toward {role_title}. Review the capability "
            "breakdown on the dashboard for the current gap list."
        )

    return {"response": fallback}


# --------------------------------------------------------------------------- #
# Manager insight & post-training assessment
# --------------------------------------------------------------------------- #

@router.post("/manager/insight")
async def manager_insight(
    request: Request, _: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    body = await request.json()
    emp = db.get_user_by_id(body.get("employeeId") or "E1000")
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    prompt = (
        f"Employee: {emp['name']} ({emp['title']})\n"
        f"Skill Levels:\n{_skill_lines(emp['id'])}\n"
        f"Evidence:\n{_evidence_lines(emp['id'])}\n\n"
        "Provide a 3-bullet point executive coaching summary:\n"
        "1. Current capability strength & progress trajectory\n"
        "2. Primary skill bottleneck & recommended course/practice\n"
        "3. Recommended 1-on-1 coaching question using the GROW framework."
    )

    text = ai.generate(prompt, temperature=0.7)
    if text:
        return {"insight": text}

    return {
        "insight": (
            f"• Strength: {emp['name']} has demonstrated core proficiency in key "
            "skills with verified workplace evidence.\n"
            "• Bottleneck: Capability gap in target role requirements.\n"
            '• Coaching Question (GROW): "What specific real-world task will you '
            'complete first to validate your target competency level?"'
        )
    }


@router.post("/manager/post-assessment")
async def post_assessment(
    request: Request, session_user: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    body = await request.json()
    emp = db.get_user_by_id(body.get("employeeId") or "E1000")
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    demand_id = body.get("demandId")
    target_role = next(
        (r for r in db.get_target_roles() if r["id"] == emp.get("targetRoleId")), None
    )

    prompt = (
        "Conduct a Post-Training GROW Readiness Assessment for an employee who has "
        "completed training & practice assignments from the Learning Concierge.\n\n"
        f"Employee Name: {emp['name']} ({emp['title']})\n"
        f"Target Role: {target_role['title'] if target_role else emp.get('targetRoleId')}\n"
        f"Baseline Skill Levels:\n{_skill_lines(emp['id'])}\n"
        f"Evidence:\n{_evidence_lines(emp['id'])}\n\n"
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

    # Persisted so the Client Resume Generator can require a real, signed-off
    # assessment rather than an AI narrative generated and thrown away.
    assessment = db.create_post_assessment(
        emp["id"], demand_id, session_user["id"], narrative
    )
    return {"success": True, "assessment": assessment, "narrative": narrative}


@router.post("/manager/post-assessment/{id}/signoff")
async def signoff_post_assessment(
    id: str, request: Request, session_user: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    body = await request.json()
    decision = body.get("decision")
    if decision not in ("cleared", "not_ready"):
        raise HTTPException(
            status_code=400, detail="decision must be 'cleared' or 'not_ready'."
        )

    assessment = db.sign_off_post_assessment(id, session_user["id"], decision)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return {"success": True, "assessment": assessment}


# --------------------------------------------------------------------------- #
# SkillGap interview agent
# --------------------------------------------------------------------------- #

@router.post("/agent/generate-jd-assessment")
async def generate_jd_assessment(
    request: Request, _: dict = Depends(require_auth)
) -> dict[str, Any]:
    body = await request.json()
    target_role = body.get("targetRole")
    job_description = body.get("jobDescription")

    if not target_role or not job_description:
        raise HTTPException(
            status_code=400,
            detail="targetRole and jobDescription are required.",
        )

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
        return {"success": True, "assessment": parsed}

    return {
        "success": True,
        "assessment": {
            "roleTitle": target_role,
            "mcqs": [
                {
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
                }
            ],
            "videoQuestions": [
                {
                    "id": "vq_1",
                    "title": "Role scenario",
                    "questionText": (
                        f"Describe how you would approach a typical delivery problem "
                        f"as a {target_role}."
                    ),
                    "keyRubrics": [
                        "Structured problem framing",
                        "Relevant technical depth",
                        "Clear communication",
                    ],
                }
            ],
            "_fallback": True,
        },
    }


@router.post("/agent/evaluate-interview-answer")
async def evaluate_interview_answer(
    request: Request, _: dict = Depends(require_auth)
) -> dict[str, Any]:
    body = await request.json()
    candidate_answer = body.get("candidateAnswer")
    if not candidate_answer:
        raise HTTPException(status_code=400, detail="candidateAnswer is required.")

    rubrics = body.get("keyRubrics") or []
    prompt = (
        "Evaluate this candidate's spoken interview answer against the rubric.\n\n"
        f"Job Description: {body.get('jobDescription', '')}\n"
        f"Question: {body.get('questionTitle', '')} - {body.get('questionText', '')}\n"
        f"Key Rubrics: {', '.join(rubrics)}\n"
        f"Candidate Answer: {candidate_answer}\n\n"
        "Return JSON only, shaped as:\n"
        '{"overallScore": number, "technicalScore": number, '
        '"problemSolvingScore": number, "communicationScore": number, '
        '"strengths": [string], "missingConcepts": [string], "feedback": string, '
        '"recommendedLearning": [string]}'
    )

    parsed = ai.generate_json(prompt, temperature=0.3)
    if parsed:
        return {"success": True, "evaluation": parsed}

    # Length-based heuristic so the UI still advances without a key.
    words = len(candidate_answer.split())
    base = max(40, min(88, 40 + words))
    return {
        "success": True,
        "evaluation": {
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
        },
    }


@router.post("/agent/complete-skillgap-assessment")
async def complete_skillgap_assessment(
    request: Request, _: dict = Depends(require_self_or_elevated_body)
) -> dict[str, Any]:
    body = await request.json()
    user_id = body.get("userId")
    if not user_id:
        raise HTTPException(status_code=400, detail="userId is required.")

    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "success": True,
        "userId": user_id,
        "overallScore": body.get("overallScore"),
        "message": f"SkillGap assessment recorded for {user['name']}.",
    }
