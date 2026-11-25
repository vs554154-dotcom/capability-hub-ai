# AGENTS.md — CyBridge Agent & System Specification

This document provides system instructions, architectural specs, and operational guidelines for AI coding agents (such as Kiro, AI Studio, or Cursor) working on **CyBridge - Workforce Capability Agent**.

---

## 1. Project Overview & Mission

**CyBridge - Workforce Capability Agent** is an enterprise-grade AI Workforce Capability Agent. It transforms corporate upskilling and career development through evidence-based capability validation, Skill-vs-Will 2×2 matrix analytics, Enterprise Readiness Index (ERI) metrics, and 4 dedicated AI Copilots.

### Strategic Positioning
While the **SkillGap-to-Growth Agent** focuses on identifying individual capability gaps, the **Learning Concierge Agent** provides personalized learning guidance, and the **Manager GROW Coach** supports workforce growth planning and coaching conversations, **Capability Analytics AI** serves as the strategic intelligence layer of CyBridge. It transforms workforce capability data, workplace evidence, learning outcomes, deployment readiness signals, and organizational capability metrics into actionable enterprise intelligence that enables leadership teams to forecast capability supply, mitigate workforce risks, optimize learning investments, improve deployment readiness, and build a future-ready workforce aligned with evolving business demands.

### Key Capabilities & Copilots

This section describes the product's intent. `ARCHITECTURE.md` describes what is built, and its section 15 lists what is not yet.

- **Demand-to-Deployment Agent**: Drives project demand intake, parses client JDs, matches internal talent with explainable fitment ("Why This Candidate?"), calculates Signature Metrics (Time-to-Readiness - TTR, Time-to-Deployment - TTD, Evidence Provenance), and generates post-training client resumes with zero-hallucination guardrails.
- **SkillGap-to-Growth Agent**: Analyzes career experience, creates flexible/adaptive capability roadmaps (ranging from 1-week emergency sprints to multi-week tracks depending on interview dates), runs interactive Job Description (JD) video/audio interview scenarios with MCQ validation and spoken response AI evaluation, and automatically redirects identified skill gaps to the Learning Concierge for hands-on assignments.
- **Learning Concierge Agent**: Functions as a 1-on-1 AI Technical Mentor to clear employee doubts and clarify complex software concepts/patterns, while curating verified course recommendations, certification pathways, bite-sized learning modules, and hands-on practice assignments tailored to skill gaps.
- **Manager GROW Coach Agent**: Empowers managers on team capability development and coaching outcomes using coaching scripts, GROW framework structured guidance, 1-on-1 team capability reviews, and Post-Training GROW Readiness Assessments to evaluate resources after Learning Concierge training, recalculate readiness %, and verify closed skill gaps.
- **Capability Analytics AI**: Serves as the strategic intelligence layer providing bird's-eye intelligence. Delivers Skill-vs-Will Matrix (2×2 Quadrant Model) insights, calculates the Enterprise Readiness Index (ERI), runs predictive workforce forecasting, aligns capability supply & demand, mitigates 8 critical workforce risks, and quantifies learning ROI.

---

## 2. Technical Stack & Environment

- **Frontend** (in `frontend/`): React 19, Vite, TypeScript, Tailwind CSS, Lucide Icons, Web Speech API (Speech Recognition & Speech Synthesis), MediaRecorder / MediaDevices API.
- **Backend**: Python / FastAPI in `backend/app/`, served by Uvicorn. Owns the SQLite schema (versioned migrations) and seed, and serves the built frontend from `frontend/dist/`. It is the only backend.
- **AI Integration**: Google Gemini (model `gemini-3.6-flash`, with backup models when it is busy) through `google-genai`, called server-side only from `backend/app/ai.py`.
- **Port**: Binds `0.0.0.0:$PORT`, default `8000`. In development the Vite server (`npm run dev` in `frontend/`, `:5173`) proxies `/api` to it.

### ARCHITECTURE DECISION — one backend: Python/FastAPI

**Decided 2026-10-21, completing the 2026-09-09 decision below. The Node server
(`server.ts` / `server-db.ts`) has been removed. `backend/` is the only backend,
and Google AI Studio is no longer a deployment target.**

The Python service is self-sufficient: it owns its schema
(`backend/app/migrations.py`), seeds itself (`backend/seed/seed.json`), serves the
built frontend from `frontend/dist/`, and runs on any container host (see `DEPLOY.md`).

Rationale:

- **Two implementations of one API drift.** The Node path had been frozen since
  2026-09-09; every change since (object-level authorization, revocable sessions,
  shared rate limits, the computed readiness index) existed only in Python, so the
  frozen copy was an older, weaker version of the product still in the tree.
- **The only reason to keep it was AI Studio**, which cannot run Python. The app
  is container-deployable (`Dockerfile`, `$PORT`, `/api/health`), so that host is
  no longer needed.

Consequences for anyone (human or agent) working here:

1. Implement backend changes in `backend/app/`, respecting its layers — routers
   (HTTP only) → `services/` (business rules, transactions) → `repositories/` (SQL
   only). `ARCHITECTURE.md` defines what each layer may and may not do.
2. Node is a build tool only: it builds `frontend/` into `frontend/dist/`. Nothing in
   the runtime image is Node.
3. `backend/scripts/verify_authz_scenarios.py` against a running server is the gate
   that matters: **65/65**.
4. Databases created by the old Node server still upgrade in place: migration 1
   reconciles any older schema (see `ARCHITECTURE.md`, section 6).

<details>
<summary>Superseded: 2026-09-09 — Python live, Node kept for AI Studio</summary>

Python became the production backend and the Node path was frozen, kept only so
the existing AI Studio applet kept working. Removed on 2026-10-21 for the reasons
above.

</details>

<details>
<summary>Superseded: 2026-09-06 — Node.js as the single backend</summary>

The earlier decision made Node the sole backend on the grounds that AI Studio
runs Node only, that `server-db.ts` owned all 12 `CREATE TABLE` statements, and
that duplication was expensive. Python now owns its schema and the app is
container-deployable, so neither ground holds. Recorded here so the reasoning is
not lost.

</details>

---

## 3. Server API Specifications

### `POST /api/agent/generate-jd-assessment`
- **Purpose**: Builds and stores a Level-1 assessment for the signed-in person. Questions come from Gemini, or from the question bank when it is unavailable (`_fallback: true`). The answer key is never sent.
- **Body**: `{ "assessmentMode": "project_hiring" | "self_upskilling", "targetRole": "...", "jobDescription": "...", "demandId": "...", "targetSkillsToUpgrade": "...", "currentDesignation": "...", "candidateResume": "..." }`. Project mode needs a role and a job description, or the `demandId` of the person's own handoff; self-upskilling needs a role and skills.
- **Response**: `{ "success": true, "assessment": { "id": "...", "roleTitle": "...", "mcqs": [{ "id", "question", "options", "skillArea" }], "videoQuestions": [{ "id", "title", "question", "keyRubrics", "maxDurationSeconds" }], "practicalExercise": {...} } }`

### `POST /api/agent/assessment-answer`
- **Purpose**: Records the first answer to a multiple-choice question and says whether it was right.
- **Body**: `{ "assessmentId": "...", "questionId": "...", "optionIndex": 0 }`
- **Response**: `{ "success": true, "correct": true, "correctIndex": 0, "explanation": "..." }`

### `POST /api/agent/complete-skillgap-assessment`
- **Purpose**: Scores the stored answers and keeps the result, which the Concierge, the manager and analytics read. Any score in the request is ignored.
- **Body**: `{ "assessmentId": "...", "willAnswers": { ... } }`
- **Response**: `{ "success": true, "assessment": { "id", "roleTitle", "result": { "overallScore", "mcqScore", "spokenScore", "practicalScore", "gaps": [...] } } }`

### `POST /api/agent/evaluate-interview-answer`
- **Purpose**: Evaluates candidate's transcribed spoken answer against JD rubrics. With `{ "assessmentId", "questionId", "candidateAnswer" }` it answers a stored question and counts; with the body below it is practice and nothing is kept. A `_fallback` evaluation is provisional and never counted.
- **Body**: `{ "jobDescription": "...", "questionTitle": "...", "questionText": "...", "keyRubrics": [...], "candidateAnswer": "..." }`
- **Response**: `{ "success": true, "evaluation": { "overallScore": 85, "technicalScore": 88, "problemSolvingScore": 82, "communicationScore": 86, "strengths": [...], "missingConcepts": [...], "feedback": "...", "recommendedLearning": [...] } }`

### `POST /api/ai/orchestrator`
- **Purpose**: General cognitive copilot interaction for SkillGap, Concierge, Coach, and Analytics agents. Falls back to deterministic text when `GEMINI_API_KEY` is absent or the model call fails.
- **Body**: `{ "userId": "...", "prompt": "...", "agent": "skill_gap" | "concierge" | "coach" | "analytics", "skillId": "..." }`. `skillId` (optional) puts that skill first. A manager's `coach` question is answered from their direct reports' records.
- **Response**: `{ "response": "..." }`

### `GET /api/manager/:id/team`
- **Purpose**: Returns each direct report's skill/will/engagement scores, gap counts, risk status, and pending validations — the data that drives the Skill-vs-Will 2×2 quadrant view. Requires a manager/L&D/leadership session; a manager may only read their own team.
- **Response**: `[{ "userId": "...", "userName": "...", "skillScore": 0, "willScore": 0, "engagementScore": 0, "gapCount": 0, "riskStatus": "Low" | "Medium" | "High", ... }]`

---

## 4. Key Metrics & Terminology Standards

- **Skill-vs-Will Matrix (2×2 Quadrant Model)**: Categorizes workforce across Deploy Now (High Skill/High Will), Accelerate Learning (Low Skill/High Will), Retain & Coach (High Skill/Low Will), and Intervention Required (Low Skill/Low Will), split at 60 on both axes. (A 3×3 9-Box grid is not implemented.)
- **Enterprise Readiness Index (ERI)**: Composite organizational capability metric (%) synthesized from Skill Proficiency (25%), Level-1 Video/MCQ Assessments (20%), Workplace Evidence Validation (15%), Certification Health (15%), Capability Readiness Index - CRI (10%), Deployment Availability (5%), Learning Engagement Velocity (5%), and Manager GROW Validation (5%). Computed in `backend/app/services/analytics.py` over the components that have stored data; the rest are reported as not measured, never estimated (`ARCHITECTURE.md`, section 8).
- **Manager GROW Coach Positioning**: Focused strictly on team capability development, growth planning, and coaching conversations (avoiding administrative appraisal terminology).
- **Bird's-Eye Intelligence**: Always written with correct possessive punctuation (`bird's-eye`).

---

## 5. Development & Build Commands

**Backend** — run from the repo root:

- **Install**: `python -m venv backend/.venv` then `backend/.venv/Scripts/python -m pip install -r backend/requirements.txt` (or run `setup.sh`)
- **Dev Server**: `scripts\dev-python.cmd` (Uvicorn with reload on `:8000`, serves API + `frontend/dist/`)
- **Production Start**: `python -m uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT` (add `--workers N` for more cores; sessions and rate limits are shared through the database)
- **Test suite** (no server needed): `backend/.venv/Scripts/python -m pytest backend/tests` — install with `pip install -r backend/requirements-dev.txt`
- **Demo data**: edit `backend/seed/source/`, build with `python backend/scripts/build_demo_seed.py`, add to a database with `python backend/scripts/load_demo_data.py` (safe to run again). After that build, also run `python backend/scripts/build_demo_journeys.py`, which walks 41 demo people through the application itself. Never edit `demo_seed.json`, `demo_journeys.json` or `skill_aliases.json` by hand: they are built
- **Giving a demo**: `DEMO_TOOLS="true"` in `.env` shows the Demo panel (person switch, script, reset) on the same computer only. Its script is `frontend/src/components/demoScript.ts` and `docs/DEMO_SCRIPT.md`; a test keeps the two in step
- **Authorization gate** (against a running server): `python backend/scripts/verify_authz_scenarios.py http://localhost:8000` — must stay **65/65**

**Frontend** — run from `frontend/` (Node is used only to build it):

- **Install**: `npm install`
- **Dev Server**: `npm run dev` — Vite with hot reload on `:5173`, `/api` proxied to `:8000` (start the backend first)
- **Production Build**: `npm run build` → `frontend/dist/`, served by the backend
- **Lint Verification**: `npm run lint` (`tsc --noEmit`)

---

## 6. Agent Instructions & Behavioral Constraints

When modifying or extending this application:
1. **Server-Side Security**: All Gemini AI calls must strictly remain server-side — in `backend/app/ai.py` for the live backend. Never expose API keys to the browser. Authority comes from the session cookie only; a user id in a URL or body names a target, never the caller.
2. **Camera & Microphone Permissions**: Hardware access (camera/mic) for interview scenarios must be handled gracefully with fallbacks and permission state indicators.
3. **Schema changes go through migrations**: Append a `Migration` with the next version number in `backend/app/migrations.py`. Never edit `backend/app/schema_sql.py` — it is the frozen version-1 baseline, and a test fails if it changes. Editing it would give new databases a schema that already-deployed ones never receive.
4. **Consistent, themed UI**: Build pages from the shared primitives in `frontend/src/components/ui/` (`PageHeader` with what the page is for and how to use it, `SectionCard`, `StatTile`, `Meter`, `Tag`) and colour them with the theme tokens in `frontend/src/index.css` (`var(--surface)`, `var(--accent)`, `var(--ok)`…), so all six themes - one light, five dark - apply. Check new screens at phone and desktop width.
5. **One source for a person's state**: agents read a person's project, assessment, gaps and plan through `backend/app/services/journey.py`, never by recomputing them. When an agent adds something the next one needs, store it and read it there.
6. **No invented figures**: Every number on screen comes from stored records, is shown as not measured, or is left out. Product illustrations are labelled "Example" and use no real person's data. A button must do what its label says.

