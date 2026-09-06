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
   - **Enterprise Readiness Index (ERI)**: Synthesizes multi-vector capability signals into a composite organizational readiness score (%).
   - **Predictive Workforce Intelligence**: Forecasts 30/60/90-day capability supply & demand, estimates employee Time-to-Readiness (TTR), detects workforce risks, and quantifies learning ROI.

---

## 🛠️ Project Structure

```
├── PROJECT_DOCUMENTATION.md             # Comprehensive technical, architectural, & API documentation
├── AGENTS.md                            # System instructions & operational guidelines for AI Coding Agents
├── docs/                                # Enterprise Architectural Specifications
│   ├── CAPABILITY_ANALYTICS_AI_SPEC.md   # Capability Analytics AI PRD, ERI formula & 10-point framework
│   └── PROJECT_DEMAND_TALENT_READINESS_SPEC.md # Demand & Talent Readiness Agent PRD & Schemas
├── server.ts                            # Express server & Gemini API endpoints
├── server-db.ts                         # Database service layer (SQLite interface)
├── capability-hub.db                    # Enterprise SQLite database storage
├── metadata.json                        # Platform metadata & permissions (camera, microphone)
├── .env.example                         # Environment variables template
├── src/
│   ├── App.tsx                          # Main layout and role-based navigation
│   ├── types.ts                         # Shared TypeScript types & interfaces
│   ├── components/
│   │   ├── AgentHub.tsx                 # AI Copilot navigation hub
│   │   ├── SkillGapInterviewAgent.tsx   # Live video/audio JD interview scenario component
│   │   ├── ProjectDemandAgent.tsx       # Talent Sourcing & Project Demand Agent component
│   │   ├── SkillVsWillMatrix.tsx        # Skill-vs-Will 2x2 Matrix & Cohort Analytics
│   │   ├── ManagerDashboard.tsx         # Team capability & GROW coaching dashboard
│   │   ├── LeadershipDashboard.tsx      # Executive Workforce Capability & ERI Dashboard
│   │   └── ...
```

---

## ⚡ Running the Application

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and set your Gemini API key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```
   The application will run on `http://localhost:3000`.

4. **Verify Code & Build for Production**:
   ```bash
   npm run lint
   npm run build
   npm start
   ```


---

## 🤖 Running with Kiro or AI Coding Assistants

This repository contains an `AGENTS.md` file at the root directory. Kiro, Cursor, and AI Studio will automatically read `AGENTS.md` to understand the codebase structure, API routes, and architectural constraints.
