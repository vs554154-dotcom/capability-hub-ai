# CyBridge — Executive Overview & Strategic Mission

## Executive Overview & Strategic Mission

CyBridge - Workforce Capability Agent is an enterprise AI Workforce Capability Agent designed to bridge the gap between enterprise project demand and workforce deployment readiness. It transforms traditional corporate upskilling and talent operations into a dynamic, evidence-based capability engine powered by Google Gemini AI and automated talent-matching workflows.

> **Positioning note:** this is currently a working prototype/pilot-stage platform, not a hardened production system. The "Known Limitations & Hardening Roadmap" section at the end of this document is included deliberately — an executive reader should know what's real today versus what's on the roadmap, so this doc doesn't overstate current maturity.

## Platform Vision

In modern enterprise environments, business units struggle with talent shortages, skill gaps, delayed project handoffs, and misaligned upskilling investments. Capability Hub AI addresses these challenges by providing:

- **Capability Visibility:** Tracking of workforce skills, workplace evidence, and target-role readiness.
- **AI-Driven Interactive Evaluation:** Live video/audio speech recognition and AI evaluation against Job Description (JD) rubrics.
- **Project Demand-to-Talent Alignment:** Parsing client job descriptions, scoring internal candidate compatibility, and executing upskilling handoffs.
- **Skill-vs-Will Matrix:** 2×2 quadrant modeling of workforce capability and motivation for manager and leadership decision-making.

## Technical Stack & System Architecture

- **Frontend Framework:** React **19** with Vite, TypeScript, Tailwind CSS, Lucide Icons.
- **Interactive Multimedia:**
  - Web Speech API (`webkitSpeechRecognition`, `window.speechSynthesis`)
  - MediaRecorder & MediaDevices API for camera/microphone capture
- **Backend Architecture:** Express.js server (`server.ts`), bundled with esbuild to CommonJS (`dist/server.cjs`).
- **Database Layer:** SQLite (`capability-hub.db`) via `better-sqlite3`, with a service layer in `server-db.ts`.
- **AI Integration:** Google Gemini API (`@google/genai` SDK, `gemini-3.6-flash`), called server-side.
- **Network & Server Port:** Binds to `0.0.0.0:3000` (currently a fixed port, not yet read from `process.env.PORT`).

## Core AI Copilots & Key Agents

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CAPABILITY HUB AI                               │
│              AI Workforce Capability Intelligence Platform              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                            AI ORCHESTRATOR
                                    │
 ┌───────────────────┬──────────────┴────┬───────────────────┬───────────────────┐
 │                   │                   │                   │                   │
 ▼                   ▼                   ▼                   ▼                   ▼
Demand-to-          SkillGap-to-Growth  Learning Concierge  Manager GROW Coach  Capability Analytics
Deployment Agent    Agent               Agent               Agent               (Skill-vs-Will)
```

> **Primary Tagline:** *From Business Demand to Workforce Readiness — Intelligently.*
> **Attention-Grabbing Tagline:** *Stop Searching for Talent. Start Discovering Capability.*
> **Campaign Tagline:** *Sahi Talent. Sahi Skills. Sahi Project.*
> **Closed-Loop Narrative:** `Demand → Discover → Assess → Gap → Grow → Validate → Interview → Deploy → Learn → Forecast`

### 1. Demand-to-Deployment Agent
- **Enterprise Demand Intake:** Captures open client project opportunities (priority, domain, required skills, tech stack, dates).
- **AI Job Description Parser:** Extracts structured skill requirements and metadata from raw unstructured JDs via Gemini.
- **Candidate Discovery & Explainable Fitment:** Scores candidates against project demands with "Why This Candidate?" rationale, Evidence Provenance, and Time-to-Readiness (TTR in days).
- **Evidence-Backed Client Resume:** Generates updated post-training client resumes with zero-hallucination guardrails.
- **Smart Candidate Matching:** Scores and ranks internal candidates against demand requirements.
- **AI Client Resume Generator:** Formats candidate profiles tailored to specific project demands.
- **Upskilling Handoff:** Bridges identified candidate skill gaps into the SkillGap-to-Growth and Learning Concierge pipelines.

### 3. Learning Concierge Agent
- **1-on-1 AI Technical Mentor:** Answers employee questions, explains architectures, and provides code snippets.
- **Curated Learning Hub:** Recommends courses from an internal catalog, mapped to identified capability gaps.

### 4. Manager GROW Coach Agent
- **Team Capability & Growth Planning:** Supports structured coaching conversations using the GROW framework (Goal, Reality, Options, Will).
- **Post-Training GROW Readiness Assessment:** Generates a recalculated readiness narrative after Learning Concierge training.
  > **Note:** this assessment is generated on demand and returned to the manager — it is not currently written back to the database, so there's no historical record of past GROW assessments to review later.

### 5. Capability Analytics (Skill-vs-Will Matrix)
- **Skill-vs-Will Matrix (2×2 Quadrant Model):**
  - **Deploy Now** (High Skill, High Will)
  - **Accelerate Learning** (Low Skill, High Will)
  - **Retain & Coach** (High Skill, Low Will)
  - **Intervention Required** (Low Skill, Low Will)

## Key Metrics — What's Actually Computed Today

- **Capability Readiness Score (CRS):** A real, implemented metric — the percentage of an employee's target-role required skills currently met at the required proficiency level. This drives the readiness gauge on the employee dashboard.
- **Match Score (Project Demand):** A weighted score combining skill match and capability readiness, used to rank candidates against a project demand.

> **What is *not* yet implemented:** an earlier draft of this document described a composite "Enterprise Readiness Index (ERI)" built from 8 weighted vectors (skill proficiency, certification health, deployment availability, etc.), plus 30/60/90-day predictive workforce forecasting, 8 workforce risk vectors, and learning-ROI quantification. None of these exist in the current codebase — the "48% → 84%" Enterprise Readiness figure shown on the Leadership dashboard today is static illustrative copy, not a live calculation. These are strong roadmap items, but this document previously presented them as shipped capability, which would set the wrong expectation with stakeholders.

## Server API Reference (`server.ts`) — Verified Against Source

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/login` | POST | Logs a user in by ID. |
| `/api/users` / `/api/users/:id` | GET | Lists users / fetches a single user profile. |
| `/api/users/:id/capability` | GET | Returns CRS and skill-gap breakdown for a user. |
| `/api/users/:id/learning-plan` | GET | Fetches the active learning plan for an employee. |
| `/api/users/:id/target-role` | POST | Sets/updates an employee's target role. |
| `/api/skills` / `/api/roles` / `/api/courses` | GET | Reference data: skills taxonomy, target roles, course catalog. |
| `/api/evidence` | GET / POST | Lists / submits workplace evidence. |
| `/api/validation` | POST | Manager approval/rejection of submitted evidence. |
| `/api/agent/generate-jd-assessment` | POST | Generates the MCQ + spoken-scenario assessment for a target role/JD. |
| `/api/agent/evaluate-interview-answer` | POST | Evaluates a transcribed spoken response against the JD rubric via Gemini. |
| `/api/ai/orchestrator` | POST | Shared chat/copilot backend used across agent chat surfaces. |
| `/api/manager/:id/team` | GET | Returns a manager's team with skill/will data (powers the Skill-vs-Will matrix). |
| `/api/manager/insight` | POST | Generates AI-written manager insight/summary for a team member. |
| `/api/manager/post-assessment` | POST | Generates the post-training GROW readiness narrative. |
| `/api/project-demand/list` / `create` | GET / POST | Lists / creates client project demand entries. |
| `/api/project-demand/parse-jd` | POST | Parses a raw client JD into structured requirements via Gemini. |
| `/api/project-demand/match` | POST | Scores and ranks candidates against a demand, evaluating post-training completion status. |
| `/api/project-demand/generate-client-resume` | POST | Generates an updated post-training candidate client resume (Restricted: Project Hiring Mode & Post-Training status only). |
| `/api/project-demand/complete-post-training` | POST | Simulates or records post-training upskilling & post-assessment clearance to unlock client resume generation. |
| `/api/project-demand/handoff-skillgap` | POST | Starts an upskilling handoff into the learning pipeline. |
| `/api/learning-plan/assign` / `step` / `deadline` | POST | Manage learning plan milestones. |
| `/api/reminders` | GET / POST | Manages agent/manager reminders. |

## Database Architecture (`capability-hub.db`)

Actual tables in `server-db.ts`:

- `users` — Employee and manager profiles.
- `skills` — Master taxonomy of technical/functional competencies.
- `user_skills` — Individual proficiency ratings (1–5) and target levels.
- `target_roles` / `target_role_skills` — Role definitions and required skill levels.
- `evidences` — Submitted workplace evidence and approval status.
- `project_demands` — Client demand listings.
- `learning_plans` — Milestone steps, deadlines, completion status.
- `courses` — Internal/external course catalog.
- `reminders` — Agent/manager reminder records.

## Development & Operations Guide

**Prerequisites**
- Node.js (v18+)
- Google Gemini API Key (`GEMINI_API_KEY`)

**Running Locally**
```bash
# 1. Install dependencies
npm install

# 2. Set environment variables in .env
GEMINI_API_KEY=your_gemini_api_key_here

# 3. Start development server (port 3000)
npm run dev

# 4. Verify code quality
npm run lint
```

**Production Build & Launch**
```bash
npm run build   # vite build + esbuild bundle to dist/server.cjs
npm run start
```

---

## Known Limitations & Hardening Roadmap

1. **No real authentication:** Login accepts a user ID with no verified password/session.
2. **Data persistence:** SQLite lives on local container disk.
3. **API Rate Limiting:** Gemini endpoints do not currently enforce rate-limiting.
4. **Assessment Persistence:** GROW assessments and manager insights are generated dynamically per request.
5. **Roadmap Capabilities:** The multi-vector Enterprise Readiness Index, 30/60/90-day predictive workforce forecasting, and automated risk-vector calculations represent planned future milestones.
