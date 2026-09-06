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

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Web Speech API (Speech Recognition & Speech Synthesis), MediaRecorder / MediaDevices API.
- **Backend**: Express.js server (`server.ts` or `server-db.ts`), bundled using `esbuild` to CommonJS (`dist/server.cjs`).
- **AI Integration**: Google Gemini API (`@google/genai` SDK, model `gemini-3.6-flash`) proxying requests server-side.
- **Port Requirement**: Binds to `0.0.0.0:3000`.

### ARCHITECTURE DECISION — Node.js is the single backend

**Decided 2026-09-06. Node.js/Express is the one and only backend. `backend/`
(FastAPI/Python) is FROZEN reference material and must not be extended.**

A complete Python port of all 38 endpoints exists under `backend/`. It reached
full behavioural parity and is preserved deliberately — but it is **not
maintained**, and no new work goes into it.

Rationale:

- **Google AI Studio runs Node only.** `metadata.json` declares
  `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`; a Python process cannot run in that
  applet host. Choosing Python means leaving the deployment target.
- **Node owns the data layer.** `server-db.ts` holds all 12 `CREATE TABLE`
  statements and the seed. The Python layer has zero and cannot start until Node
  has created the database — it is a consumer, not a peer.
- **The port adds no capability.** It is a faithful reimplementation by design;
  its own test suites assert *identical* behaviour.
- **Duplication is expensive.** ~2,800 lines of Python mirror ~4,000 lines of
  Node, plus ~1,100 lines of parity tooling whose only purpose is detecting
  drift between them.

Consequences for anyone (human or agent) working here:

1. Implement backend changes in `server.ts` / `server-db.ts` **only**.
2. Do **not** mirror changes into `backend/`. It will fall behind; that is
   intended and correct.
3. The parity suites in `backend/scripts/` are **not** a CI gate. Once Node moves
   ahead they will legitimately fail. Do not "fix" `backend/` to make them pass.
4. Revisit this decision only if all three become true: the project leaves AI
   Studio, Python's ecosystem is genuinely required, and schema ownership is
   deliberately migrated out of `server-db.ts`.

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

### `POST /api/agent/chat`
- **Purpose**: General cognitive copilot interaction for SkillGap, Concierge, Coach, and Analytics agents.
- **Body**: `{ "agentType": "skill_gap" | "concierge" | "coach" | "analytics", "userPrompt": "...", "currentUser": {...} }`

### `GET /api/matrix/data`
- **Purpose**: Returns employee skill/will scores, capability gaps, and Skill-vs-Will 2×2 quadrant distribution data.

---

## 4. Key Metrics & Terminology Standards

- **Skill-vs-Will Matrix (2×2 Quadrant Model)**: Categorizes workforce across Deploy Now (High Skill/High Will), Accelerate Learning (Low Skill/High Will), Retain & Coach (High Skill/Low Will), and Intervention Required (Low Skill/Low Will). (An optional 3×3 9-Box grid is supported for 9-cell classification).
- **Enterprise Readiness Index (ERI)**: Composite organizational capability metric (%) synthesized from Skill Proficiency (25%), Level-1 Video/MCQ Assessments (20%), Workplace Evidence Validation (15%), Certification Health (15%), Capability Readiness Index - CRI (10%), Deployment Availability (5%), Learning Engagement Velocity (5%), and Manager GROW Validation (5%).
- **Manager GROW Coach Positioning**: Focused strictly on team capability development, growth planning, and coaching conversations (avoiding administrative appraisal terminology).
- **Bird's-Eye Intelligence**: Always written with correct possessive punctuation (`bird's-eye`).

---

## 5. Development & Build Commands

- **Dev Server**: `npm run dev` (runs `tsx server.ts` on port 3000)
- **Production Build**: `npm run build`
- **Production Start**: `npm run start` (runs `node dist/server.cjs`)
- **Lint Verification**: `npm run lint` (`tsc --noEmit`)

---

## 6. Agent Instructions & Behavioral Constraints

When modifying or extending this application:
1. **Server-Side Security**: All Gemini AI calls must strictly remain server-side in `server.ts`. Never expose API keys to the browser.
2. **Camera & Microphone Permissions**: Hardware access (camera/mic) for interview scenarios must be handled gracefully with fallbacks and permission state indicators.
3. **Responsive UI**: Keep dark mode visual design (#141E30 canvas, #0F1724 cards, #4F8EF7 / #10B981 accents) consistent across components.

