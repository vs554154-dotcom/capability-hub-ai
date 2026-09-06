# Kiro Agent Workspace Instructions — Capability Hub AI

## Project Overview
Capability Hub AI is a full-stack enterprise workforce intelligence platform powered by React, TypeScript, Express, and Google Gemini API (`@google/genai` SDK, model `gemini-3.6-flash`).

## Core Architecture & Rules
1. **Server-Side AI Proxy**:
   - All Gemini API calls **MUST** remain server-side in `server.ts`.
   - Never expose `GEMINI_API_KEY` to the client/browser code.
2. **Port & Host**:
   - Express server binds strictly to `0.0.0.0` on port `3000`.
3. **Camera & Microphone Permissions**:
   - The platform uses `navigator.mediaDevices.getUserMedia` for live video/audio interview scenarios in `SkillGapInterviewAgent.tsx`.
   - Ensure fallback handling for cases where camera or microphone access is denied.
4. **Build & Bundling**:
   - Dev Command: `npm run dev` (runs `tsx server.ts`).
   - Build Command: `npm run build` (bundles `server.ts` into CommonJS `dist/server.cjs` via `esbuild` and builds Vite assets).
   - Start Command: `npm run start` (runs `node dist/server.cjs`).
   - Verification: `npm run lint` (`tsc --noEmit`).

## Key API Endpoints
- `POST /api/agent/generate-jd-assessment`: Generates technical MCQs + Video interview scenario questions from a Job Description.
- `POST /api/agent/evaluate-interview-answer`: Evaluates transcribed candidate responses against JD rubrics.
- `POST /api/agent/chat`: General agent copilot chat router (`skill_gap`, `concierge`, `coach`, `analytics`).
- `GET /api/matrix/data`: Fetches employee Skill-vs-Will 9-box matrix distribution data.
