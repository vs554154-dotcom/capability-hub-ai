# Kiro Agent Workspace Instructions — Capability Hub AI

`AGENTS.md` at the repo root is the source of truth; this file summarises it.

## Project Overview
Capability Hub AI (CyBridge) is a full-stack enterprise workforce intelligence platform: a React 19 + TypeScript frontend, a Python/FastAPI backend, SQLite, and Google Gemini (model `gemini-3.6-flash`).

## Core Architecture & Rules
1. **One backend: Python**:
   - Backend work goes in `backend/app/`: `routers/` (HTTP only), `services/` (business rules), `repositories/` (SQL only). See `ARCHITECTURE.md`.
   - The backend owns its schema (versioned migrations in `backend/app/migrations.py`) and seed (`backend/seed/seed.json`), and serves the built frontend from `frontend/dist/`.
   - The React app lives in `frontend/`. Node is used only to build it; there is no Node server.
2. **Server-Side AI Proxy**:
   - All Gemini API calls **MUST** remain server-side, in `backend/app/ai.py`.
   - Never expose `GEMINI_API_KEY` to the client/browser code.
3. **Authorization**:
   - Identity comes from the session cookie only. A user id in a URL or body names a target, never the caller.
   - `backend/scripts/verify_authz_scenarios.py` must stay at 65/65.
4. **Port & Host**:
   - Binds `0.0.0.0:$PORT` — default `8000`.
5. **Camera & Microphone Permissions**:
   - The platform uses `navigator.mediaDevices.getUserMedia` for live video/audio interview scenarios in `SkillGapInterviewAgent.tsx`.
   - Ensure fallback handling for cases where camera or microphone access is denied.
6. **Build & Run**:
   - Frontend build (from `frontend/`): `npm run build` → `frontend/dist/`.
   - Dev server: `scripts\dev-python.cmd` (Uvicorn with reload on `:8000`); `npm run dev` in `frontend/` adds hot-reloading frontend on `:5173`, proxying `/api` to it.
   - Production: `python -m uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`, or the `Dockerfile`.
   - Frontend verification (from `frontend/`): `npm run lint` (`tsc --noEmit`).

## Key API Endpoints
- `POST /api/agent/generate-jd-assessment`: Builds and stores a Level-1 assessment; the answer key stays on the server.
- `POST /api/agent/assessment-answer`, `/complete-skillgap-assessment`: Records answers; scores and stores the result.
- `POST /api/agent/evaluate-interview-answer`: Scores a transcribed candidate answer against the JD rubrics.
- `POST /api/ai/orchestrator`: Copilot chat router (`skill_gap`, `concierge`, `coach`, `analytics`).
- `GET /api/manager/{id}/team`: Per-report Skill, Will and Engagement scores that drive the Skill-vs-Will 2×2 matrix.
- `GET /api/analytics/workforce`: Organisation-wide readiness, evidence and skill-gap metrics.
- `GET /api/analytics/eri`, `GET /api/analytics/leadership`: The computed Enterprise Readiness Index with its daily trend, and the leadership overview.
- `GET /api/health`: Liveness probe for hosting platforms.
