# AGENTS.md — CyBridge Agent & System Specification

This document provides system instructions, architectural specs, and operational guidelines for AI coding agents (such as Kiro, AI Studio, or Cursor) working on **CyBridge - Workforce Capability Agent**.

---

## 1. Project Overview & Mission

**CyBridge - Workforce Capability Agent** is an enterprise-grade AI Workforce Capability Agent. It transforms corporate upskilling and career development through evidence-based capability validation, Skill-vs-Will 2×2 matrix analytics, Enterprise Readiness Index (ERI) metrics, and 4 dedicated AI Copilots.

### Strategic Positioning
While the **SkillGap-to-Growth Agent** focuses on identifying individual capability gaps, the **Learning Concierge Agent** provides personalized learning guidance, and the **Manager GROW Coach** supports workforce growth planning and coaching conversations, **Capability Analytics AI** serves as the strategic intelligence layer of CyBridge. It transforms workforce capability data, workplace evidence, learning outcomes, deployment readiness signals, and organizational capability metrics into actionable enterprise intelligence that enables leadership teams to forecast capability supply, mitigate workforce risks, optimize learning investments, improve deployment readiness, and build a future-ready workforce aligned with evolving business demands.

### Key Capabilities & Copilots
- **Demand-to-Deployment Agent**: Drives project demand intake, parses client JDs, matches internal talent with explainable fitment ("Why This Candidate?"), calculates Signature Metrics (Time-to-Readiness - TTR, Time-to-Deployment - TTD, Evidence Provenance), and generates post-training client resumes with zero-hallucination guardrails.
- **SkillGap-to-Growth Agent**: Analyzes career experience, creates flexible/adaptive capability roadmaps (ranging from 1-week emergency sprints to multi-week tracks depending on interview dates), runs interactive Job Description (JD) video/audio interview scenarios with MCQ validation and spoken response AI evaluation, and automatically redirects identified skill gaps to the Learning Concierge for hands-on assignments.
- **Learning Concierge Agent**: Functions as a 1-on-1 AI Technical Mentor to clear employee doubts and clarify complex software concepts/patterns, while curating verified course recommendations, certification pathways, bite-sized learning modules, and hands-on practice assignments tailored to skill gaps.
- **Manager GROW Coach Agent**: Empowers managers on team capability development and coaching outcomes using coaching scripts, GROW framework structured guidance, 1-on-1 team capability reviews, and Post-Training GROW Readiness Assessments to evaluate resources after Learning Concierge training, recalculate readiness %, and verify closed skill gaps.
- **Capability Analytics AI**: Serves as the strategic intelligence layer providing bird's-eye intelligence. Delivers Skill-vs-Will Matrix (2×2 Quadrant Model) insights, calculates the Enterprise Readiness Index (ERI), runs predictive workforce forecasting, aligns capability supply & demand, mitigates 8 critical workforce risks, and quantifies learning ROI.

---

## 2. Technical Stack & Environment

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, Lucide Icons, Web Speech API (Speech Recognition & Speech Synthesis), MediaRecorder / MediaDevices API.
- **Backend**: Python / FastAPI in `backend/app/`, served by Uvicorn. Owns the SQLite schema (versioned migrations) and seed, and serves the built frontend from `dist/`. It is the only backend.
- **AI Integration**: Google Gemini (model `gemini-3.6-flash`) through `google-genai`, called server-side only from `backend/app/ai.py`.
- **Port**: Binds `0.0.0.0:$PORT`, default `8000`. In development the Vite server (`npm run dev`, `:5173`) proxies `/api` to it.

### ARCHITECTURE DECISION — one backend: Python/FastAPI

**Decided 2026-10-21, completing the 2026-09-09 decision below. The Node server
(`server.ts` / `server-db.ts`) has been removed. `backend/` is the only backend,
and Google AI Studio is no longer a deployment target.**

The Python service is self-sufficient: it owns its schema
(`backend/app/migrations.py`), seeds itself (`backend/seed/seed.json`), serves the
built frontend from `dist/`, and runs on any container host (see `DEPLOY.md`).

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
2. Node is a build tool only: it builds the frontend into `dist/`. Nothing in the
   runtime image is Node.
3. `backend/scripts/verify_authz_scenarios.py` against a running server is the gate
   that matters: **59/59**.
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
- **Purpose**: Takes a target role title and Job Description (JD) text and generates a structured interview assessment using Gemini AI.
- **Body**: `{ "targetRole": "...", "jobDescription": "..." }`
- **Response**: `{ "success": true, "assessment": { "roleTitle": "...", "mcqs": [...], "videoQuestions": [...] } }`

### `POST /api/agent/evaluate-interview-answer`
- **Purpose**: Evaluates candidate's transcribed spoken answer against JD rubrics.
- **Body**: `{ "jobDescription": "...", "questionTitle": "...", "questionText": "...", "keyRubrics": [...], "candidateAnswer": "..." }`
- **Response**: `{ "success": true, "evaluation": { "overallScore": 85, "technicalScore": 88, "problemSolvingScore": 82, "communicationScore": 86, "strengths": [...], "missingConcepts": [...], "feedback": "...", "recommendedLearning": [...] } }`

### `POST /api/ai/orchestrator`
- **Purpose**: General cognitive copilot interaction for SkillGap, Concierge, Coach, and Analytics agents. Falls back to deterministic text when `GEMINI_API_KEY` is absent or the model call fails.
- **Body**: `{ "userId": "...", "prompt": "...", "agent": "skill_gap" | "concierge" | "coach" | "analytics", "skillId": "..." }`
- **Response**: `{ "response": "..." }`

### `GET /api/manager/:id/team`
- **Purpose**: Returns each direct report's skill/will/engagement scores, gap counts, risk status, and pending validations — the data that drives the Skill-vs-Will 2×2 quadrant view. Requires a manager/L&D/leadership session; a manager may only read their own team.
- **Response**: `[{ "userId": "...", "userName": "...", "skillScore": 0, "willScore": 0, "engagementScore": 0, "gapCount": 0, "riskStatus": "Low" | "Medium" | "High", ... }]`

---

## 4. Key Metrics & Terminology Standards

- **Skill-vs-Will Matrix (2×2 Quadrant Model)**: Categorizes workforce across Deploy Now (High Skill/High Will), Accelerate Learning (Low Skill/High Will), Retain & Coach (High Skill/Low Will), and Intervention Required (Low Skill/Low Will). (An optional 3×3 9-Box grid is supported for 9-cell classification).
- **Enterprise Readiness Index (ERI)**: Composite organizational capability metric (%) synthesized from Skill Proficiency (25%), Level-1 Video/MCQ Assessments (20%), Workplace Evidence Validation (15%), Certification Health (15%), Capability Readiness Index - CRI (10%), Deployment Availability (5%), Learning Engagement Velocity (5%), and Manager GROW Validation (5%). Computed in `backend/app/services/analytics.py` over the components that have stored data; the rest are reported as not measured, never estimated (`ARCHITECTURE.md`, section 8).
- **Manager GROW Coach Positioning**: Focused strictly on team capability development, growth planning, and coaching conversations (avoiding administrative appraisal terminology).
- **Bird's-Eye Intelligence**: Always written with correct possessive punctuation (`bird's-eye`).

---

## 5. Development & Build Commands

**Backend** — run from the repo root:

- **Install**: `python -m venv backend/.venv` then `backend/.venv/Scripts/python -m pip install -r backend/requirements.txt` (or run `setup.sh`)
- **Dev Server**: `scripts\dev-python.cmd` (Uvicorn with reload on `:8000`, serves API + `dist/`)
- **Production Start**: `python -m uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT` (add `--workers N` for more cores; sessions and rate limits are shared through the database)
- **Test suite** (no server needed): `backend/.venv/Scripts/python -m pytest backend/tests` — install with `pip install -r backend/requirements-dev.txt`
- **Authorization gate** (against a running server): `python backend/scripts/verify_authz_scenarios.py http://localhost:8000` — must stay **59/59**

**Frontend** (Node is used only to build it):

- **Dev Server**: `npm run dev` — Vite with hot reload on `:5173`, `/api` proxied to `:8000` (start the backend first)
- **Production Build**: `npm run build` → `dist/`, served by the backend
- **Lint Verification**: `npm run lint` (`tsc --noEmit`)

---

## 6. Agent Instructions & Behavioral Constraints

When modifying or extending this application:
1. **Server-Side Security**: All Gemini AI calls must strictly remain server-side — in `backend/app/ai.py` for the live backend. Never expose API keys to the browser. Authority comes from the session cookie only; a user id in a URL or body names a target, never the caller.
2. **Camera & Microphone Permissions**: Hardware access (camera/mic) for interview scenarios must be handled gracefully with fallbacks and permission state indicators.
3. **Schema changes go through migrations**: Append a `Migration` with the next version number in `backend/app/migrations.py`. Never edit `backend/app/schema_sql.py` — it is the frozen version-1 baseline, and a test fails if it changes. Editing it would give new databases a schema that already-deployed ones never receive.
4. **Consistent, themed UI**: Build pages from the shared primitives in `src/components/ui/` (`PageHeader` with what the page is for and how to use it, `SectionCard`, `StatTile`, `Meter`, `Tag`) and colour them with the theme tokens in `src/index.css` (`var(--surface)`, `var(--accent)`, `var(--ok)`…), so all six themes - one light, five dark - apply. Check new screens at phone and desktop width.
5. **No invented figures**: Every number on screen comes from stored records, is shown as not measured, or is left out. Product illustrations are labelled "Example" and use no real person's data. A button must do what its label says.

