# PROJECT DEMAND & TALENT READINESS AGENT
## Complete Enterprise Architectural Specification & Product Requirements Document

**Platform:** Capability Hub AI  
**Author:** Principal AI Solutions Architect & Enterprise Product Architecture Team  
**Status:** Approved for Engineering Implementation  
**Version:** 1.0.0  

---

## EXECUTIVE SUMMARY

The **Project Demand & Talent Readiness Agent** is the entry-point agent within **Capability Hub AI**. Positioned upstream of the **SkillGap-to-Growth Agent**, it bridges business demand (client project requisitions, statements of work, job descriptions) with internal workforce capability intelligence.

Instead of delivery managers manually searching resource databases, cross-referencing resumes, scheduling interviews, and guessing client interview readiness, this AI agent automates end-to-end talent matching, capability gap quantification, client-ready resume enhancement, mock interview generation, and seamless handoff to downstream agents (**SkillGap-to-Growth**, **Learning Concierge**, and **Manager Coach**).

---

## TABLE OF CONTENTS
1. Product Requirements Document (PRD)
2. Epics & User Stories with Acceptance Criteria
3. Database Architecture & Entity Relationship (ER) Diagram
4. Clean Architecture Directory Structures (Backend & Frontend)
5. Pydantic Schemas & SQLAlchemy Models
6. FastAPI Endpoint Specifications
7. AI Prompt Engine & Tool Definitions
8. React / Next.js Component Specifications
9. Workflow, Sequence & Class Diagrams
10. API Specifications & Integration Contracts
11. Test Strategy & Test Cases
12. Implementation Roadmap & Future Enhancements

---

## 1. PRODUCT REQUIREMENTS DOCUMENT (PRD)

### 1.1 Business Goals & Success Metrics
- **70% Reduction in Time-to-Fulfill**: From project requisition creation to interview-ready resource allocation.
- **90%+ First-Time Client Interview Pass Rate**: Through automated mock interviews, rubric evaluations, and targeted gap remediation before client submission.
- **100% Talent Visibility**: Unlocking internal mobility by surfacing hidden employee capabilities, certifications, and workplace evidence across business units.
- **Zero Hallucination Guarantee**: Strict prohibition on experience fabrication in generated client-ready resumes.

### 1.2 Target Personas
| Persona | Key Pain Point | Primary Workflow |
| :--- | :--- | :--- |
| **Delivery Manager (DM)** | Needs client-ready resources within tight project deadlines. | Submits project demand, reviews match %, approves readiness scorecards. |
| **Resource Manager (RM)** | Hard to track real-time capability readiness across 500+ bench resources. | Views capability heatmaps, assigns best-fit candidates, monitors readiness. |
| **Practice Head** | Needs visibility into business unit skill gaps and bench utilization. | Analyzes demand trends, skill shortages, and targeted upskilling returns. |
| **L&D Lead** | Course completion doesn't guarantee interview readiness. | Configures prioritized learning paths linked to upcoming client interview dates. |
| **Employee Candidate** | Unaware of exact skill gaps needed for high-impact project roles. | Completes mock interviews, uploads workplace evidence, updates capability profile. |

---

## 2. EPICS & USER STORIES

### EPIC 1: Demand Intake & Automated JD Competency Parsing
- **User Story 1.1**: *As a Delivery Manager, I want to create a Project Demand by uploading a Job Description (PDF/Text) or filling a requisition form so that the AI can extract required competencies.*
  - **Acceptance Criteria**:
    - System accepts PDF, DOCX, and plain text uploads up to 10MB.
    - AI extracts required skills, preferred skills, experience range, technology stack, domain, certifications, and soft skills into structured JSON within 3 seconds.
    - User can review, edit, and confirm extracted competencies before initiating candidate matching.

### EPIC 2: Explainable Talent Matching Engine
- **User Story 2.1**: *As a Resource Manager, I want to view a ranked list of internal candidates with explainable match percentages so that I understand why an employee is recommended.*
  - **Acceptance Criteria**:
    - Match Engine computes 6 dimensional sub-scores: Technical Match, Domain Match, Experience Match, Capability Readiness, Learning History, and Evidence Verification.
    - Each candidate card displays a natural language explanation (e.g., *"Matched 92% due to recent AWS Solution Architect certification and 4 completed microservice projects in Healthcare domain"*).
    - Supports filtering by availability date, location, and minimum match threshold.

### EPIC 3: Client-Ready Resume Enhancement
- **User Story 3.1**: *As a Delivery Manager, I want to generate a client-formatted resume for a selected candidate highlighting relevant project experience without fabricating data.*
  - **Acceptance Criteria**:
    - System reformats candidate resume against corporate template and target project JD.
    - AI highlights verified achievements linked to workplace evidence (GitHub commits, Jira tickets).
    - Implements strict validation preventing hallucination of non-existent employers, dates, or skills.

### EPIC 4: Interview Readiness & Mock Evaluation
- **User Story 4.1**: *As an Employee Candidate, I want to undergo an AI-driven mock interview tailored to the project JD so that I can practice and receive immediate feedback.*
  - **Acceptance Criteria**:
    - AI generates 3 technical, 2 scenario-based, and 2 behavioral questions directly derived from project JD.
    - Evaluates spoken/written answers against rubrics, outputting scores for Technical Depth, Problem Solving, and Communication.
    - Generates a PDF/JSON Interview Readiness Scorecard with estimated preparation time.

### EPIC 5: Multi-Agent Handoff
- **User Story 5.1**: *As the Demand Agent, I want to invoke the SkillGap-to-Growth Agent when candidate readiness is < 80% so that a 6-week prioritized roadmap is automatically generated.*
  - **Acceptance Criteria**:
    - Asynchronous tool call payload delivered to `SkillGap-to-Growth Agent` with missing skills, target role, and client interview date.
    - Learning tasks are strictly prioritized by urgency relative to `Client Interview Date`.

---

## 3. DATABASE ARCHITECTURE & ENTITY RELATIONSHIP (ER) DIAGRAM

### 3.1 ER Diagram Representation
```
+------------------------+          +---------------------------+          +-------------------------+
|  project_requirements  | 1      * |    requirement_skills     | *      1 |         skills          |
+------------------------+----------+---------------------------+----------+-------------------------+
| id (PK)                |          | id (PK)                   |          | id (PK)                 |
| project_name           |          | project_requirement_id(FK)|          | skill_name              |
| customer_name          |          | skill_id (FK)             |          | category                |
| business_unit          |          | skill_type (REQUIRED/PREF)|          +-------------------------+
| experience_range_min   |          | min_years                 |
| experience_range_max   |          +---------------------------+
| interview_date         |
| status                 |          +---------------------------+          +-------------------------+
+------------------------+          |     employee_matches      | *      1 |        employees        |
            |                       +---------------------------+----------+-------------------------+
            | 1                     | id (PK)                   |          | id (PK)                 |
            |                       | project_requirement_id(FK)|          | full_name               |
            | *                     | employee_id (FK)          |          | email                   |
+------------------------+          | overall_match_pct         |          | current_designation     |
|   interview_schedules  |          | technical_match_pct       |          | capability_index        |
+------------------------+          | readiness_pct             |          +-------------------------+
| id (PK)                |          | match_explanation (JSON)  |                       |
| project_requirement_id |          +---------------------------+                       | 1
| candidate_id (FK)      |                                                              |
| scheduled_at           |          +---------------------------+                       | *
| status                 |          |    workplace_evidence     |-----------------------+
+------------------------+          +---------------------------+
                                    | id (PK)                   |
                                    | employee_id (FK)          |
                                    | evidence_type (GITHUB/JIRA|
                                    | evidence_url / payload    |
                                    | ai_summary                |
                                    +---------------------------+
```

---

## 4. CLEAN ARCHITECTURE DIRECTORY STRUCTURES

### 4.1 Backend Folder Structure (Python FastAPI)
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                     # FastAPI application entry point
│   ├── core/
│   │   ├── config.py               # Settings & Environment vars
│   │   ├── security.py             # OAuth2, JWT, RBAC middleware
│   │   └── database.py             # SQLAlchemy Async Engine & Session
│   ├── controllers/                # API Route handlers / Routers
│   │   ├── project_demand_controller.py
│   │   ├── matching_controller.py
│   │   ├── resume_controller.py
│   │   ├── readiness_controller.py
│   │   └── dashboard_controller.py
│   ├── services/                   # Business Logic Layer
│   │   ├── demand_service.py
│   │   ├── matching_engine_service.py
│   │   ├── resume_analyzer_service.py
│   │   ├── mock_interview_service.py
│   │   └── orchestration_service.py
│   ├── ai_engine/                  # LLM, Prompts, Tools & Agents
│   │   ├── gemini_client.py        # Google GenAI SDK wrapper
│   │   ├── prompt_service.py       # Prompt templates repository
│   │   ├── tool_service.py         # Multi-agent tools definitions
│   │   └── workflows/
│   │       ├── jd_parser_workflow.py
│   │       └── handoff_workflow.py
│   ├── repositories/               # Data Access Layer
│   │   ├── demand_repository.py
│   │   ├── employee_repository.py
│   │   └── matching_repository.py
│   ├── models/                     # SQLAlchemy ORM Models
│   │   ├── demand.py
│   │   ├── employee.py
│   │   ├── matching.py
│   │   └── evidence.py
│   └── schemas/                    # Pydantic Schemas (DTOs)
│       ├── demand_schema.py
│       ├── matching_schema.py
│       ├── resume_schema.py
│       └── interview_schema.py
├── alembic/                        # Database Migration scripts
├── tests/                          # Pytest suite
├── requirements.txt
└── Dockerfile
```

### 4.2 Frontend Folder Structure (React / Next.js / TypeScript)
```
frontend/
├── src/
│   ├── app/                        # Next.js App Router / React Pages
│   │   ├── layout.tsx
│   │   ├── page.tsx                # Landing / Role Selection
│   │   ├── project-demand/
│   │   │   ├── new/page.tsx        # Create Project Demand Form
│   │   │   └── [id]/page.tsx       # Demand Detail & Matching View
│   │   ├── talent-matching/page.tsx
│   │   ├── mock-interview/page.tsx # Live Video/Audio Mock Interview
│   │   └── dashboard/
│   │       ├── delivery-manager/page.tsx
│   │       ├── practice-head/page.tsx
│   │       └── executive/page.tsx
│   ├── components/                 # UI Components
│   │   ├── demand/
│   │   │   ├── JdParserUpload.tsx
│   │   │   └── DemandForm.tsx
│   │   ├── matching/
│   │   │   ├── CandidateMatchCard.tsx
│   │   │   └── MatchExplanationModal.tsx
│   │   ├── resume/
│   │   │   └── ClientReadyResumeView.tsx
│   │   ├── interview/
│   │   │   ├── CameraAudioRecorder.tsx
│   │   │   └── InterviewReadinessScorecard.tsx
│   │   └── dashboard/
│   │       ├── CapabilityHeatmap.tsx
│   │       └── OpenDemandsTable.tsx
│   ├── services/                   # API Integration Clients
│   │   ├── api.ts
│   │   ├── demandApi.ts
│   │   ├── matchingApi.ts
│   │   └── interviewApi.ts
│   ├── types/                      # TypeScript Interfaces
│   │   ├── demand.ts
│   │   ├── matching.ts
│   │   └── interview.ts
│   └── lib/                        # Utilities & Constants
│       └── utils.ts
├── package.json
└── tailwind.config.js
```

---

## 5. PYDANTIC SCHEMAS & SQLALCHEMY MODELS

### 5.1 SQLAlchemy ORM Models (`backend/app/models/demand.py`)
```python
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, Enum as SQLEnum, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base

class PriorityEnum(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class ProjectRequirement(Base):
    __tablename__ = "project_requirements"

    id = Column(String(36), primary_key=True, index=True)
    project_name = Column(String(255), nullable=False)
    customer_name = Column(String(255), nullable=False)
    business_unit = Column(String(100), nullable=False)
    project_description = Column(Text, nullable=False)
    raw_job_description = Column(Text, nullable=True)
    experience_range_min = Column(Integer, nullable=False, default=0)
    experience_range_max = Column(Integer, nullable=False, default=10)
    resources_required = Column(Integer, nullable=False, default=1)
    client_interview_date = Column(DateTime, nullable=False)
    expected_joining_date = Column(DateTime, nullable=False)
    project_priority = Column(SQLEnum(PriorityEnum), default=PriorityEnum.HIGH)
    location = Column(String(100), nullable=False)
    domain = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    skills = relationship("RequirementSkill", back_populates="requirement", cascade="all, delete-orphan")
    matches = relationship("EmployeeMatch", back_populates="requirement", cascade="all, delete-orphan")

class RequirementSkill(Base):
    __tablename__ = "requirement_skills"

    id = Column(String(36), primary_key=True, index=True)
    project_requirement_id = Column(String(36), ForeignKey("project_requirements.id"), nullable=False)
    skill_name = Column(String(100), nullable=False)
    is_required = Column(Integer, default=1) # 1=Required, 0=Preferred
    min_years_experience = Column(Float, default=1.0)

    requirement = relationship("ProjectRequirement", back_populates="skills")
```

### 5.2 Pydantic Schemas (`backend/app/schemas/demand_schema.py`)
```python
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime

class RequirementSkillCreate(BaseModel):
    skill_name: str
    is_required: bool = True
    min_years_experience: float = 1.0

class ProjectDemandCreateRequest(BaseModel):
    project_name: str = Field(..., example="FinTech GenAI Modernization")
    customer_name: str = Field(..., example="Global Wealth Corp")
    business_unit: str = Field(..., example="Banking & Capital Markets")
    project_description: str
    job_description_text: Optional[str] = None
    required_skills: List[str]
    preferred_skills: List[str] = []
    experience_range_min: int = 3
    experience_range_max: int = 8
    technology_stack: List[str]
    resources_required: int = 2
    client_interview_date: datetime
    expected_joining_date: datetime
    project_priority: str = "HIGH"
    location: str = "Hybrid / New York"
    domain: str = "Financial Services"

class CandidateMatchResponse(BaseModel):
    employee_id: str
    full_name: str
    current_role: str
    overall_match_pct: float
    technical_match_pct: float
    domain_match_pct: float
    experience_match_pct: float
    readiness_score: float
    confidence_score: float
    match_explanation: str
    missing_skills: List[str]
    hand_off_required: bool
```

---

## 6. FASTAPI ENDPOINT SPECIFICATIONS

```python
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from typing import List
from app.schemas.demand_schema import ProjectDemandCreateRequest, CandidateMatchResponse
from app.services.demand_service import DemandService
from app.services.matching_engine_service import MatchingEngineService

router = APIRouter(prefix="/api/v1/project-demand", tags=["Project Demand & Talent Readiness"])

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_project_demand(
    payload: ProjectDemandCreateRequest,
    demand_service: DemandService = Depends()
):
    """
    Creates a new Project Requisition and triggers JD Competency Parsing.
    """
    result = await demand_service.create_demand(payload)
    return {"status": "success", "data": result}

@router.post("/parse-jd")
async def parse_job_description(file: UploadFile = File(...)):
    """
    Parses PDF/DOCX Job Description file and extracts structured competencies.
    """
    if not file.filename.endswith(('.pdf', '.docx', '.txt')):
        raise HTTPException(status_code=400, detail="Invalid file format.")
    parsed = await DemandService.parse_jd_file(file)
    return {"status": "success", "competencies": parsed}

@router.get("/{demand_id}/best-fit-resources", response_model=List[CandidateMatchResponse])
async def get_best_fit_resources(
    demand_id: str,
    matching_service: MatchingEngineService = Depends()
):
    """
    Ranks internal employees against project demand using explainable multi-vector matching.
    """
    candidates = await matching_service.find_best_fit_resources(demand_id)
    return candidates
```

---

## 7. AI PROMPT ENGINE & TOOL DEFINITIONS

### 7.1 Gemini Prompt Template: JD Competency Extractor
```python
JD_PARSER_SYSTEM_PROMPT = """
You are the Lead Competency Architect for Capability Hub AI.
Analyze the following Job Description (JD) and extract a structured JSON profile.

Return ONLY valid JSON matching this schema:
{
  "extracted_skills": [{"name": string, "type": "REQUIRED" | "PREFERRED", "min_years": float}],
  "experience_range": {"min": int, "max": int},
  "domain": string,
  "tech_stack": [string],
  "certifications": [string],
  "responsibilities": [string],
  "soft_skills": [string]
}

DO NOT include conversational text or markdown wrappers outside the JSON block.

Job Description Content:
\"\"\"
{jd_text}
\"\"\"
"""
```

### 7.2 Gemini Tool Definition: Handoff to SkillGap Agent
```python
SKILL_GAP_HANDOFF_TOOL = {
    "name": "invoke_skillgap_agent",
    "description": "Triggers the downstream SkillGap-to-Growth Agent when candidate readiness is below 80% threshold.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "employee_id": {"type": "STRING"},
            "project_demand_id": {"type": "STRING"},
            "target_role": {"type": "STRING"},
            "missing_skills": {
                "type": "ARRAY",
                "items": {"type": "STRING"}
            },
            "client_interview_date": {"type": "STRING"},
            "urgency_level": {"type": "STRING", "enum": ["NORMAL", "HIGH", "CRITICAL"]}
        },
        "required": ["employee_id", "project_demand_id", "target_role", "missing_skills", "client_interview_date"]
    }
}
```

---

## 8. REACT / NEXT.JS FRONTEND COMPONENT

```tsx
import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Sparkles, UserCheck } from 'lucide-react';

export const JdParserUploadComponent: React.FC<{ onParsed: (data: any) => void }> = ({ onParsed }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/v1/project-demand/parse-jd', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.status === 'success') {
        onParsed(data.competencies);
      }
    } catch (err) {
      console.error("JD Parsing failed:", err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[#4F8EF7]" />
        <h3 className="text-sm font-bold text-[#F0F4FF]">AI Job Description Competency Extractor</h3>
      </div>
      <p className="text-xs text-[#94A3B8]">
        Upload a client Job Description (PDF, DOCX) or paste text to automatically extract required technical skills, domain context, and experience range.
      </p>

      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          dragActive ? 'border-[#4F8EF7] bg-[#4F8EF7]/10' : 'border-[#2A384C] bg-[#141E30]/50 hover:border-[#4F8EF7]/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
        }}
      >
        <Upload className="h-8 w-8 text-[#4F8EF7] mx-auto mb-2 animate-bounce" />
        <span className="text-xs font-bold text-[#F0F4FF] block">
          {isUploading ? "AI Parsing Competency Requirements..." : "Drop Client JD File Here or Click to Browse"}
        </span>
        <span className="text-[10px] text-[#64748B] font-mono mt-1 block">Supports PDF, DOCX, TXT up to 10MB</span>
      </div>
    </div>
  );
};
```

---

## 9. WORKFLOW, SEQUENCE & CLASS DIAGRAMS

### 9.1 Handoff Sequence Diagram
```
DeliveryManager       DemandAgent        MatchingEngine       SkillGapAgent       Database
       |                     |                  |                   |                 |
       |-- 1. Submit Demand ->|                  |                   |                 |
       |   (JD + Date)       |                  |                   |                 |
       |                     |-- 2. Parse JD -->|                   |                 |
       |                     |   Competencies   |                   |                 |
       |                     |                  |-- 3. Query Bench ->|                 |
       |                     |                  |   & Capability DB  |                 |
       |                     |<-- 4. Ranked ----|                    |                 |
       |                     |    Candidates    |                    |                 |
       |                     |                  |                    |                 |
       |                     |-- 5. Match < 80% Threshold Check ---->|                 |
       |                     |    (Missing Skills Identified)        |                 |
       |                     |-------------------------------------->|                 |
       |                     |    6. Invoke SkillGap Handoff Payload |                 |
       |                     |       (Prioritized by Client Date)    |                 |
       |<-- 7. Display Match-|                                       |                 |
       |    & Readiness Card |                                       |                 |
```

---

## 10. TEST CASES & QUALITY ASSURANCE MATRIX

| Test ID | Module | Scenario | Input | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | JD Parser | Valid PDF Upload | 4-page Cloud Architect JD | Returns extracted JSON with >= 95% skill accuracy within 3s. |
| **TC-02** | Match Engine | Sub-score Calculation | Employee with 5/5 required skills, 0 domain exp | Technical match = 100%, Domain match = 40%, Overall explainable. |
| **TC-03** | Resume Engine | Hallucination Defense | Resume enhancement request | Output contains zero non-verified companies or fake dates. |
| **TC-04** | Agent Handoff | Low Readiness (<80%) | Candidate with 65% readiness score | Automatically fires `invoke_skillgap_agent` tool event. |

---

## 11. IMPLEMENTATION ROADMAP

- **Phase 1 (Sprint 1-2)**: Core Demand Schema, FastAPI Controllers, & Gemini JD Parser.
- **Phase 2 (Sprint 3-4)**: Multi-vector Explainable Matching Engine & Resume Enhancement.
- **Phase 3 (Sprint 5-6)**: Live Video/Audio Mock Interview Engine & Readiness Scorecard.
- **Phase 4 (Sprint 7)**: Multi-Agent Handoff Event Bus Integration with **SkillGap-to-Growth Agent**.
- **Phase 5 (Sprint 8)**: Enterprise Security Hardening, Audit Logging, & RBAC Validation.

---

## 12. CONCLUSION & NEXT STEPS
This specification establishes the architectural foundation for the **Project Demand & Talent Readiness Agent** as the entry-point capability orchestrator in **Capability Hub AI**. Engineering teams may immediately consume the Pydantic schemas, SQLAlchemy models, API specs, and React components to commence Phase 1 development.
