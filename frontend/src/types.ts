export enum UserRole {
  EMPLOYEE = "employee",
  MANAGER = "manager",
  LD = "ld",
  LEADERSHIP = "leadership",
}
 
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  title: string;
  department: string;
  targetRoleId?: string;
  managerId?: string;
  experienceYears?: number;
  domain?: string;
  primaryRole?: string;
  primarySkills?: string[];
}
 
export interface Skill {
  id: string;
  name: string;
  category: "Technical" | "Leadership" | "Domain" | "Methodology";
  description: string;
}
 
export interface UserSkill {
  skillId: string;
  currentLevel: number; // 0 to 5
  targetLevel: number;  // 0 to 5
  status: "not_started" | "learning" | "practicing" | "validated";
  lastUpdated: string;
}
 
export interface TargetRole {
  id: string;
  title: string;
  description: string;
  requiredSkills: {
    skillId: string;
    minLevel: number;
  }[];
}
 
export interface LearningCourse {
  id: string;
  title: string;
  provider: string;
  duration: string;
  skillId: string;
  description: string;
  type: "Course" | "Certification" | "Workshop";
  url?: string;
  rating?: number;
  enrollmentCount?: string;
  lastUpdated?: string;
  isLatest2026?: boolean;
}
 
export interface Evidence {
  id: string;
  userId: string;
  skillId: string;
  title: string;
  description: string;
  evidenceText: string;
  documentUrl?: string;
  status: "pending" | "approved" | "revision_requested";
  submittedAt: string;
  reviewedBy?: string;
  reviewComment?: string;
  reviewedAt?: string;
}
 
export interface CapabilityScore {
  overallScore: number | null; // 0 to 100; null when no skill has a target
  skillsBreakdown: {
    skillId: string;
    score: number; // 0 to 100
  }[];
  explainability: string;
}
 
export interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  agentUsed: "skill_gap" | "concierge" | "coach" | "analytics";
}
 
export interface TeamMemberCapability {
  userId: string;
  userName: string;
  title: string;
  avatar: string;
  overallScore: number;
  gapCount: number;
  pendingValidationCount: number;
  targetRoleTitle?: string | null;
  approvedEvidenceCount?: number;
  experienceYears?: number | null;
  skillScore?: number;
  willScore?: number;
  engagementScore?: number;
  learningProgressPercent?: number;
  riskStatus?: string;
  readiness?: string;
  quadrant?: string;
  // Where they stand between handoff and deployment.
  activeProject?: { id: string; projectName: string } | null;
  level1Score?: number | null;
  level1Taken?: boolean;
  projectStepsDone?: number;
  projectStepsTotal?: number;
  postAssessmentStatus?: "pending_signoff" | "cleared" | "not_ready" | null;
}
 
export interface WeeklyLearningStep {
  id: string;
  userId: string;
  weekNumber: number; // Step or phase index
  title: string;
  skillFocus: string;
  courseName: string;
  provider: string;
  milestone: string;
  assessment: string;
  targetScore: string;
  status: "completed" | "in_progress" | "pending";
  progressPercent: number;
  // Flexible Learning Extensions
  learningType?: "micro" | "in_depth" | "best_practice";
  estimatedDuration?: string;
  phaseLabel?: string;
  targetDeadline?: string;
  deadlineType?: "client_interview" | "project_deadline" | "learner_set" | "manager_assigned";
  quizScore?: number;
  timeSpentMins?: number;
  completedAt?: string;
  // Client Resume Generator gating: a track is only eligible to back a client resume when
  // it's explicitly tied to a project demand and marked project_hiring - purely
  // self-directed / career-transition tracks (demandId absent, purpose career_growth)
  // can never satisfy that gate.
  demandId?: string;
  purpose?: "project_hiring" | "career_growth";
}
 
// A manager-reviewed readiness assessment taken after training. Persisted (unlike the
// live-generated-and-discarded version this replaced) so there's an audit trail, and so
// the Client Resume Generator can require an actual "cleared" sign-off before running.
export interface PostAssessment {
  id: string;
  employeeId: string;
  demandId?: string;
  managerId: string;
  narrative: string;
  status: "pending_signoff" | "cleared" | "not_ready";
  createdAt: string;
  signedOffBy?: string;
  signedOffAt?: string;
}
 
// One skill's level at the moment an employee was handed off to a specific project
// demand, captured so growth can later be measured against a real "before" - not
// inferred or assumed.
export interface SkillBaseline {
  userId: string;
  skillId: string;
  demandId: string;
  baselineLevel: number;
  capturedAt: string;
}
 
export interface ResumeEligibility {
  eligible: boolean;
  trainingComplete: boolean;
  assessmentCleared: boolean;
  skillGrowthIdentified: boolean;
  reasons: string[];
  growthDetail: { skillId: string; skillName: string; baselineLevel: number; currentLevel: number }[];
}
 
// What an employee's active handoff tells the SkillGap agent.
export interface ActiveProject {
  demand: ProjectDemand;
  missingSkills: string[];
  jobDescription: string;
  interviewPassed: boolean;
}

// Something a person still has to close, and which agents' records say so.
export interface CapabilityGap {
  skillId: string | null;
  skillName: string;
  current: number | null;
  target: number | null;
  sources: string[];
}

// A finished Level-1 assessment, scored and stored by the server. A null score means
// that part was not taken or could not be graded.
export interface SkillGapAssessment {
  id: string;
  userId: string;
  demandId?: string | null;
  mode: "project_hiring" | "self_upskilling";
  roleTitle: string;
  completedAt: string;
  result: {
    overallScore: number | null;
    mcqScore: number | null;
    mcqCorrect: number;
    mcqTotal: number;
    spokenScore: number | null;
    practicalScore: number | null;
    provisionalAnswers: number;
    unanswered: number;
    selfReportedWill: number | null;
    weights: { mcqsWeight: number; scenariosWeight: number; practicalWeight: number };
    gaps: { label: string; source: "mcq" | "spoken" | "communication"; skillId: string | null; skillName: string | null }[];
  };
}

export interface ResourceLearningProgress {
  userId: string;
  userName: string;
  userTitle: string;
  userAvatar: string;
  department: string;
  activeProject: { id: string; projectName: string; customerName: string } | null;
  planIsForProject: boolean;
  targetDeadline: string | null;
  deadlineType: "client_interview" | "project_deadline" | "learner_set" | "manager_assigned" | null;
  totalSteps: number;
  completedSteps: number;
  overallProgressPercent: number;
  averageQuizScore: number | null;
  totalTimeSpentMins: number;
  microCount: number;
  inDepthCount: number;
  bestPracticeCount: number;
  status: "not_started" | "in_progress" | "completed";
  steps: WeeklyLearningStep[];
}
 
export interface AgentReminder {
  id: string;
  userId: string;
  targetRole: string;
  type: "weekly_reminder" | "checkpoint" | "escalation" | "ld_escalation" | "manager_notice" | "campaign";
  title: string;
  message: string;
  status: "scheduled" | "sent" | "actioned";
  createdAt: string;
}
 
export interface ProjectDemand {
  id: string;
  projectName: string;
  customerName: string;
  businessUnit: string;
  projectDescription: string;
  rawJobDescription?: string;
  requiredSkills: string[];
  preferredSkills: string[];
  experienceRangeMin: number;
  experienceRangeMax: number;
  technologyStack: string[];
  resourcesRequired: number;
  clientInterviewDate: string;
  expectedJoiningDate: string;
  projectPriority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  location: string;
  domain: string;
  employmentType: "Full-Time" | "Contract" | "Internal Mobility";
  additionalNotes?: string;
  status: "OPEN" | "MATCHING" | "FULFILLED" | "CLOSED";
  createdAt: string;
}
 
export interface CandidateMatch {
  employeeId: string;
  fullName: string;
  currentRole: string;
  avatar: string;
  department: string;
  experienceYears?: number;
  domain?: string;
  primaryRole?: string;
  primarySkills?: string[];
  overallMatchPct: number;
  technicalMatchPct: number;
  domainMatchPct: number;
  experienceMatchPct: number;
  capabilityReadiness: number;
  matchExplanation: string;
  missingSkills: string[];
  handOffRequired: boolean;
  verifiedEvidenceCount: number;
  recommendedActions: string[];
  clientResumeSummary?: string;
}
 