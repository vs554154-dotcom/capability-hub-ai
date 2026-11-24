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
- **Backend:** Python / FastAPI (`backend/app/`), layered into routers, services and repositories. It is the only backend and also serves the built frontend.
- **Database Layer:** SQLite (`capability-hub.db`), built and upgraded by versioned migrations and seeded on first boot.
- **AI Integration:** Google Gemini (`google-genai`, `gemini-3.6-flash`), called server-side only, with a bounded timeout and a marked fallback when no key is set.
- **Network & Server Port:** Binds to `0.0.0.0:$PORT` (default 8000).

`ARCHITECTURE.md` is the detailed, source-checked description of how the system works.

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
  > Each assessment is stored (`post_assessments`) and awaits a manager's sign-off as *cleared* or *not ready*; a cleared sign-off is one of the conditions for generating a client resume.

### 5. Capability Analytics (Skill-vs-Will Matrix)
- **Skill-vs-Will Matrix (2×2 Quadrant Model):**
  - **Deploy Now** (High Skill, High Will)
  - **Accelerate Learning** (Low Skill, High Will)
  - **Retain & Coach** (High Skill, Low Will)
  - **Intervention Required** (Low Skill, Low Will)

## Key Metrics — What's Computed Today

Every score is computed from stored records; `ARCHITECTURE.md` (section 8) gives each formula.

- **Capability Readiness Score (CRS):** how close an employee's current levels are to what their target role requires, plus up to 15 points for manager-approved evidence. Drives the readiness gauge on the employee dashboard.
- **Skill and Will:** the two axes of the Skill-vs-Will matrix. Skill comes from skill levels and approved evidence; Will from learning follow-through, evidence initiative, goal progress and goal commitment.
- **Match Score (Project Demand):** 45% technical + 20% domain + 15% experience + 20% capability readiness, used to rank candidates against a demand. Specialist skills count twice as much as general ones such as Git or SQL.
- **Enterprise Readiness Index (ERI):** the eight-component composite, computed over the components that have stored data. Two components (Level-1 interview assessments and certification health) have none yet, so the index covers 60% of its weight and reports that share. Its trend line is built from one real reading per day.
- **Supply against demand:** for each skill an open demand requires, the people ready now (level 3+) and those working toward it.

## Server API

The route map, with the access rule for every endpoint, is in `ARCHITECTURE.md`
(section 7, "Route map"). Authority always comes from the signed-in session; a user id
in a URL or body names the target of an action, never the caller.

## Database

The tables and their relationships are in `ARCHITECTURE.md` (section 6, "Tables").
The schema is versioned: `backend/app/migrations.py` builds a fresh database and
upgrades older ones in place.

## Development & Operations Guide

**Prerequisites**
- Python 3.12
- Node.js 20+ (to build the frontend only)
- A Google Gemini API key (`GEMINI_API_KEY`) to enable the copilots; optional

**Running locally**
```bash
./setup.sh                      # dependencies, virtualenv, first build, tests
scripts\dev-python.cmd          # Windows: API + built app on http://localhost:8000
npm --prefix frontend run dev   # optional: hot-reloading frontend on http://localhost:5173
```

**Production**: see `DEPLOY.md` (Docker image or any Python host).

---

## Known Limitations

The current list is kept in one place: `ARCHITECTURE.md`, section 15.
