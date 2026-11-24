# Capability Hub AI — Enterprise Workforce Capability Intelligence Platform

Capability Hub AI is a full-stack web application designed to help organizations validate workforce capabilities, close skill gaps, align talent with project demand, and accelerate career mobility through AI-driven coaching, Skill-vs-Will 2×2 matrix analytics, Enterprise Readiness Index (ERI) metrics, and interactive video/audio interview assessment scenarios.

For full technical specifications, architecture details, API specs, and database schemas, see [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md).

---

## 🚀 Key Features & 5 Cognitive Agents

1. **SkillGap-to-Growth Agent**:
   - **Job Description (JD) Assessment Generator**: Automatically constructs an assessment scenario with technical MCQs, theoretical spoken video/audio questions, and practical exercises.
   - **Live Camera & Audio Evaluation**: Candidates record answers via browser webcam and microphone. Gemini AI transcribes and rates technical depth, problem-solving, and communication.
   - **Interactive Streamlined Evaluation**: Reduced question sets (5 MCQs, 3 Spoken Video Questions, and 5 Core Will Dimensions) for fast, low-friction candidate assessment.
   - **Adaptive Capability Roadmap**: Maps identified skill gaps to actionable 1-to-6-week upskilling plans prioritizing upcoming interview dates.

2. **Talent Sourcing & Project Demand Agent**:
   - **Enterprise Demand Intake**: Captures open project opportunities, technical stacks, domain requirements, and target start dates.
   - **AI Job Description Parser**: Extracts key required and preferred skills automatically from raw client JDs using Gemini AI.
   - **AI Candidate Matching & Scoring**: Ranks internal bench and active talent based on skill overlap, experience fit, and domain relevance.
   - **Client-Facing Resume Generator**: Generates custom candidate resumes tailored to specific client project demands.
   - **Upskilling Handoff**: Instantly transfers identified capability gaps for a project demand directly into the candidate's learning plan.

3. **Learning Concierge Agent**:
   - Functions as a 1-on-1 AI Technical Mentor clearing employee doubts, explaining complex software patterns, and recommending curated catalog courses, certifications, and hands-on practice assignments.

4. **Manager GROW Coach Agent**:
   - Empowers managers on team capability development and coaching outcomes using structured GROW framework scripts, 1-on-1 check-ins, and Post-Training GROW Readiness Assessments to evaluate resources after Learning Concierge training and verify closed skill gaps.

5. **Capability Analytics AI & Skill-vs-Will Matrix**:
   - **Skill-vs-Will Matrix (2×2 Quadrant Model)**: Maps team members across Capability (Skill) and Interest/Drive (Will) into Deploy Now, Accelerate Learning, Retain & Coach, and Intervention Required quadrants.
   - **Enterprise Readiness Index (ERI)**: An eight-component composite computed from workforce records, with a daily trend. Components with no stored data are shown as not measured rather than estimated.
   - **Leadership overview**: Skill-gap risk, capability supply against open client demand, the index if every open gap closed, and directives derived from those figures.

---

## 🛠️ Project Structure

```
├── ARCHITECTURE.md        # How the system works: layers, data, auth, metrics, limitations
├── AGENTS.md              # Rules and decisions for AI coding agents
├── DEPLOY.md              # Docker and host deployment, every environment variable
├── PROJECT_DOCUMENTATION.md
├── backend/
│   ├── app/               # FastAPI: routers -> services -> repositories, migrations
│   ├── seed/              # Data for an empty database, and the question bank
│   ├── tests/             # pytest suite (no server needed)
│   └── scripts/           # Probes run against a live server (authorization gate)
├── frontend/
│   ├── src/
│   │   ├── App.tsx        # Session, role-based navigation, shared data
│   │   ├── components/    # One workspace per role, plus the AI agents
│   │   │   └── ui/        # Shared page header, section cards, meters, charts
│   │   └── index.css      # Design tokens for the six themes, page primitives
│   ├── public/            # Static files copied into the build
│   ├── index.html  package.json  vite.config.ts  tsconfig.json
│   └── dist/              # The build, served by the backend (not in git)
├── Dockerfile             # Builds the frontend with Node, runs Python only
└── .env.example           # Every setting, with defaults
```

---

## ⚡ Running the Application

The backend is Python (FastAPI); Node is used only to build the frontend.

1. **Set up** (dependencies, virtualenv, first build, tests):
   ```bash
   ./setup.sh
   ```
   Then set `GEMINI_API_KEY` in `.env` to enable the AI copilots. Without it every
   AI feature still works, with clearly marked deterministic answers.

2. **Run** the API and the built app on `http://localhost:8000`:
   ```bash
   python -m uvicorn backend.app.main:app --reload --reload-dir backend/app
   ```
   On Windows, `scripts\dev-python.cmd` does the same.

3. **Frontend work with hot reload** (optional, proxies `/api` to the backend):
   ```bash
   cd frontend
   npm run dev
   ```
   Open `http://localhost:5173`.

4. **Verify**:
   ```bash
   npm --prefix frontend run lint
   backend/.venv/Scripts/python -m pytest backend/tests
   python backend/scripts/verify_authz_scenarios.py http://localhost:8000
   ```

Deployment: see [DEPLOY.md](./DEPLOY.md).

---

## 🤖 Running with Kiro or AI Coding Assistants

This repository contains an `AGENTS.md` file at the root directory. Kiro, Cursor and other coding agents read it to understand the codebase structure, API routes and architectural constraints. `ARCHITECTURE.md` describes how the system works in depth.
