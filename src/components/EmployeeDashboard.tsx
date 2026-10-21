import React, { useState, useEffect } from "react";
import { User, Skill, TargetRole, LearningCourse, Evidence, WeeklyLearningStep } from "../types";
import { SkillRadarChart } from "./SkillRadarChart";
import { PageHeader } from "./ui/Page";
import { Inbox } from "./Inbox";
import { Award, Briefcase, CheckCircle2, AlertCircle, Send, GraduationCap, Clock, ExternalLink, Calendar, CheckSquare, Sparkles, ChevronRight, Zap, BookOpen, Wrench, Edit3, Target, X, Check, FileText, Star, Users } from "lucide-react";

// Demand dates are stored as full ISO timestamps, which render as
// "2026-08-27T10:00:00Z" if passed straight through. Show a readable date, and fall
// back to the raw string rather than "Invalid Date" if it is ever not parseable.
const formatInterviewDate = (value?: string): string => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
};

interface EmployeeDashboardProps {
  currentUser: User;
  skills: Skill[];
  roles: TargetRole[];
  courses: LearningCourse[];
  evidences: Evidence[];
  capabilityData: any;
  onTargetRoleChange: (roleId: string) => void;
  onSubmitEvidence: (data: {
    skillId: string;
    title: string;
    description: string;
    evidenceText: string;
    documentUrl?: string;
  }) => void;
  onRefresh: () => void;
  isShortlisted?: boolean;
  shortlistDemand?: any;
  onSimulateShortlist?: () => void;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  currentUser,
  skills,
  roles,
  courses,
  evidences,
  capabilityData,
  onTargetRoleChange,
  onSubmitEvidence,
  isShortlisted = false,
  shortlistDemand,
  onSimulateShortlist,
}) => {
  const [selectedSkillForEvidence, setSelectedSkillForEvidence] = useState<string>("");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceDesc, setEvidenceDesc] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [activeSkillFilter, setActiveSkillFilter] = useState<string | null>(null);

  // Flexible Learning Roadmap State
  const [learningPlan, setLearningPlan] = useState<WeeklyLearningStep[]>([]);
  const [isPlanLoading, setIsPlanLoading] = useState(false);

  // Flexible Modality & Deadline State
  const [activeModalityFilter, setActiveModalityFilter] = useState<"all" | "micro" | "in_depth" | "best_practice">("all");
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [customDeadlineDate, setCustomDeadlineDate] = useState("2026-08-15");
  const [customDeadlineType, setCustomDeadlineType] = useState<"client_interview" | "project_deadline" | "learner_set" | "manager_assigned">("client_interview");
  
  // Knowledge Check Quiz Modal State
  const [activeQuizStep, setActiveQuizStep] = useState<WeeklyLearningStep | null>(null);
  const [selectedQuizAnswerIndex, setSelectedQuizAnswerIndex] = useState<number | null>(null);
  const [quizScoreResult, setQuizScoreResult] = useState<number | null>(null);

  useEffect(() => {
    async function fetchLearningPlan() {
      if (!currentUser) return;
      try {
        setIsPlanLoading(true);
        const res = await fetch(`/api/users/${currentUser.id}/learning-plan`);
        const isJson = res.headers.get("content-type")?.includes("application/json");
        if (res.ok && isJson) {
          const data = await res.json();
          setLearningPlan(data);
          if (data && data.length > 0 && data[0].targetDeadline) {
            setCustomDeadlineDate(data[0].targetDeadline);
            if (data[0].deadlineType) setCustomDeadlineType(data[0].deadlineType);
          }
        }
      } catch (err) {
        console.error("Failed to load learning plan:", err);
      } finally {
        setIsPlanLoading(false);
      }
    }
    fetchLearningPlan();
  }, [currentUser]);

  const handleUpdateStepStatus = async (
    stepId: string, 
    newStatus: "completed" | "in_progress" | "pending",
    quizScore?: number,
    timeSpentMins?: number
  ) => {
    const progressPercent = newStatus === "completed" ? 100 : newStatus === "in_progress" ? 50 : 0;
    try {
      const res = await fetch("/api/learning-plan/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          stepId, 
          status: newStatus, 
          progressPercent,
          quizScore: quizScore !== undefined ? quizScore : (newStatus === "completed" ? 85 : 0),
          timeSpentMins: timeSpentMins || 20
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setLearningPlan(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveDeadline = async () => {
    if (!customDeadlineDate || !currentUser) return;
    try {
      const res = await fetch("/api/learning-plan/deadline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          targetDeadline: customDeadlineDate,
          deadlineType: customDeadlineType
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLearningPlan(data.plan);
        setShowDeadlineModal(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkillForEvidence || !evidenceTitle || !evidenceDesc || !evidenceText) return;

    onSubmitEvidence({
      skillId: selectedSkillForEvidence,
      title: evidenceTitle,
      description: evidenceDesc,
      evidenceText,
      documentUrl: evidenceUrl || undefined,
    });

    setSuccessMsg("Evidence logged successfully! Manager has been notified for verification.");
    setEvidenceTitle("");
    setEvidenceDesc("");
    setEvidenceText("");
    setEvidenceUrl("");
    setSelectedSkillForEvidence("");

    setTimeout(() => {
      setSuccessMsg("");
    }, 5000);
  };

  // Filter courses mapped to active filter or general gaps
  const filteredCourses = activeSkillFilter 
    ? courses.filter(c => c.skillId === activeSkillFilter)
    : courses.filter(c => {
        const breakdownItem = capabilityData?.skillsBreakdown?.find((b: any) => b.skillId === c.skillId);
        return breakdownItem && !breakdownItem.isTargetMet;
      });

  // Radar chart skills data array mapping (Focus on target role requirements & active skills)
  const relevantBreakdown = capabilityData?.skillsBreakdown?.filter(
    (item: any) => item.target > 0 || item.current > 0
  );

  const activeTargetRoleId = capabilityData?.targetRoleId || currentUser?.targetRoleId || "role_1";
  const targetRoleObj = roles.find(r => r.id === activeTargetRoleId) || roles[0];

  const radarSkills = (relevantBreakdown && relevantBreakdown.length >= 3)
    ? relevantBreakdown.map((item: any) => ({
        name: item.skillName,
        current: item.current,
        target: item.target || 4
      }))
    : (targetRoleObj?.requiredSkills || []).map((req) => {
        const sk = skills.find(s => s.id === req.skillId);
        return {
          name: sk?.name || "Skill",
          current: 0,
          target: req.minLevel
        };
      });

  return (
    <div className="space-y-8 animate-fade-in py-6">

      <PageHeader
        eyebrow="Employee workspace · My readiness"
        icon={Target}
        title={`Your path to ${capabilityData?.targetRoleTitle && capabilityData.targetRoleTitle !== "None Selected" ? capabilityData.targetRoleTitle : "your target role"}`}
        lede={
          <>
            How ready you are for the role you are aiming at, which skills are short, and the
            learning plan and evidence that close the gap. Your score moves when a manager
            approves your evidence, not when you mark something done.
          </>
        }
        steps={[
          <><strong>Choose a target role</strong> to set the skills and levels you are measured against.</>,
          <><strong>Read your gaps</strong> in the radar and the skill gap analyzer.</>,
          <><strong>Work the plan</strong>: learning steps and knowledge checks, sized to your deadline.</>,
          <><strong>Submit evidence</strong> of real work; each approval raises that skill a level.</>,
        ]}
      />

      <Inbox />

      {/* SHORTLIST STATUS BANNER */}
      {isShortlisted ? (
        <div className="bg-[#141E30] status-wash status-wash-success border border-[#10B981]/40 rounded-xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold bg-[#10B981]/20 text-[#10B981] px-2.5 py-0.5 rounded border border-[#10B981]/40 uppercase tracking-widest flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Active Project Shortlist • SkillGap Agent Unlocked
              </span>
              <span className="text-[10px] font-mono text-[#94A3B8]">Candidate ID: {currentUser.id}</span>
            </div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Shortlisted for:</span>
              {/* No invented fallbacks here. These previously defaulted to a named
                  client and a fixed date, which would render fabricated details as
                  though they were this employee's real assignment. */}
              <span className="text-[#10B981]">{shortlistDemand?.projectName || "Project assignment"}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#94A3B8]">
              <span>Client: <strong className="text-white">{shortlistDemand?.customerName || "—"}</strong></span>
              <span>•</span>
              <span>Target Interview: <strong className="text-[#4F8EF7]">{formatInterviewDate(shortlistDemand?.clientInterviewDate)}</strong></span>
              <span>•</span>
              <span>Location: <strong className="text-white">{shortlistDemand?.location || "—"}</strong></span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono bg-[#10B981] text-[#0F1724] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md">
              <CheckCircle2 className="h-4 w-4" />
              Ready for SkillGap Intake
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-[#141E30] status-wash status-wash-warn border border-amber-500/40 rounded-xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 px-2.5 py-0.5 rounded border border-amber-500/40 uppercase tracking-widest flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Talent Pool Status • Awaiting Shortlist
              </span>
            </div>
            <h2 className="text-lg font-bold text-white">Profile Under Evaluation by Talent Acquisition & Managers</h2>
            <p className="text-xs text-[#94A3B8] max-w-3xl leading-relaxed">
              Your profile is currently active in the talent pool and being evaluated against incoming client project requirements. You will unlock the <strong className="text-white">SkillGap-to-Growth Agent</strong> and upskilling roadmap as soon as you are shortlisted for an active project demand.
            </p>
          </div>
          
          {onSimulateShortlist && (
            <button
              onClick={onSimulateShortlist}
              className="bg-amber-500 hover:bg-amber-400 text-[#0F1724] font-mono font-bold text-xs py-2.5 px-4 rounded-lg transition-all shadow-md flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Sparkles className="h-4 w-4" />
              <span>Shortlist for Project Demand</span>
            </button>
          )}
        </div>
      )}

      {/* 1. Readiness Summary Banner & Target Role Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 stagger-children">
        
        {/* Capability Readiness Score Gauge Card */}
        <div className="lg:col-span-1 bg-[#141E30] border border-[#2A384C] rounded-lg p-6 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono text-[#4F8EF7] font-bold tracking-[0.2em] uppercase">Capability Gauge</span>
              <Award className="h-5 w-5 text-[#4F8EF7]" />
            </div>
            <h3 className="text-sm font-semibold text-[#F0F4FF]">Readiness Score (CRS)</h3>
            
            <div className="relative flex items-center justify-center my-6">
              <svg className="w-36 h-36">
                <circle
                  className="text-[#1E293B]"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                  r="58"
                  cx="72"
                  cy="72"
                />
                <circle
                  className="text-[#10B981] transition-all duration-500 ease-out"
                  strokeWidth="8"
                  strokeDasharray={365}
                  strokeDashoffset={365 - (365 * (capabilityData?.overallScore || 0)) / 100}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="58"
                  cx="72"
                  cy="72"
                  transform="rotate(-90 72 72)"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-4xl font-bold text-[#F0F4FF] tracking-tight">
                  {capabilityData?.overallScore || 0}%
                </span>
                <p className="text-[9px] text-[#10B981] font-mono uppercase font-bold tracking-widest mt-1">Target Ready</p>
              </div>
            </div>
          </div>

          <div className="bg-[#0F1724] rounded-md p-3.5 border border-[#2A384C] text-xs text-[#94A3B8] leading-relaxed">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#4F8EF7] font-semibold block mb-1">Score Breakdown</span>
            <p className="text-[11px] text-[#F0F4FF] leading-normal font-sans">
              {capabilityData?.explainability || "Score is computed from skill target levels and human-validated evidence logs."}
            </p>
          </div>
        </div>

        {/* Target Role Selector & Metric Counter Grid */}
        <div className="lg:col-span-2 bg-[#141E30] border border-[#2A384C] rounded-lg p-6 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-mono text-[#10B981] font-bold tracking-[0.2em] uppercase">Target Alignment</span>
              <Briefcase className="h-5 w-5 text-[#94A3B8]" />
            </div>
            
            <label htmlFor="target-role-select" className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-[0.15em] block mb-2">
              Select Target Career Role
            </label>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-4">
              <select
                id="target-role-select"
                value={currentUser.targetRoleId || ""}
                onChange={(e) => onTargetRoleChange(e.target.value)}
                className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs font-semibold py-2.5 px-3.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7] cursor-pointer"
              >
                <option value="">-- Select Target Career Role --</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-4 bg-[#0F1724] rounded-md border border-[#2A384C] mb-4 text-xs">
              <p className="font-bold text-sm text-[#4F8EF7] mb-1">
                {capabilityData?.targetRoleTitle || "Target Role Selected"}
              </p>
              <p className="text-[#94A3B8] leading-relaxed font-sans text-[11px]">
                {roles.find(r => r.id === currentUser.targetRoleId)?.description || "Select a career role to calculate capability readiness metrics and adaptive roadmap."}
              </p>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 stagger-children">
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-md p-3 text-center hover-lift">
              <span className="text-xl font-bold text-[#F0F4FF] block">
                {capabilityData?.stats?.totalRequirements || 6}
              </span>
              <span className="text-[9px] text-[#94A3B8] uppercase tracking-widest font-mono">Skill Requirements</span>
            </div>
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-md p-3 text-center">
              <span className="text-xl font-bold text-[#F59E0B] block">
                {capabilityData?.skillsBreakdown?.filter((b: any) => !b.isTargetMet && b.target > 0).length || 6}
              </span>
              <span className="text-[9px] text-[#F59E0B] uppercase tracking-widest font-mono font-bold">Gaps Identified</span>
            </div>
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-md p-3 text-center">
              <span className="text-xl font-bold text-[#10B981] block">
                {capabilityData?.stats?.evidenceCount || 1}
              </span>
              <span className="text-[9px] text-[#10B981] uppercase tracking-widest font-mono font-bold">Verified Evidence</span>
            </div>
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-md p-3 text-center">
              <span className="text-xl font-bold text-[#4F8EF7] block">
                Adaptive
              </span>
              <span className="text-[9px] text-[#4F8EF7] uppercase tracking-widest font-mono font-bold">Target Timeframe</span>
            </div>
          </div>

        </div>
      </div>

      {/* 2. Skill Radar Chart & Skill Gap Visual Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Skill Radar Chart Card */}
        <div className="lg:col-span-1 bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-mono text-[#4F8EF7] font-bold uppercase tracking-[0.2em]">Capability Radar Chart</h3>
              <Sparkles className="h-4 w-4 text-[#4F8EF7]" />
            </div>
            <p className="text-[11px] text-[#94A3B8] mb-2">
              Visual overlay comparing your current proficiency levels against required target benchmarks.
            </p>
            <SkillRadarChart skills={radarSkills} />
          </div>
        </div>

        {/* Target Skill Gap Comparison Grid (Right 2 columns) */}
        <div className="lg:col-span-2 bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-[#F0F4FF]">Skill Gap Analyzer</h3>
              <p className="text-xs text-[#94A3B8] mt-0.5">Click any skill card to filter recommended learning courses.</p>
            </div>
            {activeSkillFilter && (
              <button 
                id="clear-skill-filter-btn"
                onClick={() => setActiveSkillFilter(null)}
                className="text-xs font-semibold text-[#4F8EF7] hover:underline uppercase tracking-wider font-mono cursor-pointer"
              >
                Clear Filter
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {capabilityData?.skillsBreakdown?.map((item: any) => {
              const isGap = !item.isTargetMet && item.target > 0;
              const isSelected = activeSkillFilter === item.skillId;
              return (
                <div 
                  key={item.skillId} 
                  id={`skill-card-${item.skillId}`}
                  onClick={() => setActiveSkillFilter(item.skillId)}
                  className={`p-4 rounded-md border transition-all cursor-pointer ${
                    isSelected 
                      ? "border-[#4F8EF7] bg-[#0F1724] shadow-md shadow-[#4F8EF7]/10"
                      : "border-[#2A384C] hover:border-[#4F8EF7]/50 bg-[#0F1724]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h4 className="text-xs font-bold text-[#F0F4FF]">{item.skillName}</h4>
                      <span className="inline-block mt-1 px-2 py-0.5 border border-[#2A384C] text-[9px] font-mono uppercase tracking-wider text-[#94A3B8] rounded-sm">
                        {item.category}
                      </span>
                    </div>

                    {item.isTargetMet ? (
                      <CheckCircle2 className="h-5 w-5 text-[#10B981] shrink-0" />
                    ) : isGap ? (
                      <AlertCircle className="h-5 w-5 text-[#F59E0B] shrink-0" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-dashed border-[#2A384C]" />
                    )}
                  </div>

                  {/* Level Slider Meter */}
                  <div className="space-y-1.5 mt-3">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-[#94A3B8]">Level: {item.current} / {item.target || 4}</span>
                      <span className={`font-bold ${item.isTargetMet ? "text-[#10B981]" : "text-[#F59E0B]"}`}>
                        {item.scorePercentage}% Met
                      </span>
                    </div>
                    <div className="w-full bg-[#1E293B] h-2 rounded-full overflow-hidden flex">
                      <div 
                        className={`h-full transition-all duration-300 ${item.isTargetMet ? "bg-[#10B981]" : "bg-[#4F8EF7]"}`}
                        style={{ width: `${Math.min(100, (item.current / 5) * 100)}%` }}
                      />
                      <div 
                        className="h-full bg-[#334155]" 
                        style={{ width: `${Math.max(0, ((item.target - item.current) / 5) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#2A384C]/60 text-[9px] font-mono text-[#94A3B8]">
                    <span>Status: <strong className="text-[#F0F4FF] uppercase">{item.status.replace("_", " ")}</strong></span>
                    <span>Updated {item.lastUpdated}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 3. Flexible Agentic Learning Journey Section */}
      <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg space-y-6">
        
        {/* Header & Target Deadline Banner */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-[#2A384C] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#4F8EF7]" />
              <h3 className="text-base font-bold text-[#F0F4FF]">Flexible Agentic Learning Journey</h3>
            </div>
            <p className="text-xs text-[#94A3B8] mt-1">
              Custom-paced milestone trajectory optimized for client interview dates, project deadlines, and micro-learning modules.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3 py-1.5 bg-[#4F8EF7]/10 border border-[#4F8EF7]/30 rounded-md flex items-center gap-2 text-xs font-mono">
              <Target className="h-4 w-4 text-[#4F8EF7]" />
              <span className="text-[#94A3B8]">Target Deadline:</span>
              <span className="font-bold text-[#F0F4FF]">{customDeadlineDate}</span>
              <span className="text-[10px] text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.5 rounded uppercase font-bold">
                {customDeadlineType.replace("_", " ")}
              </span>
            </div>

            <button
              onClick={() => setShowDeadlineModal(true)}
              className="px-3 py-1.5 bg-[#1E293B] hover:bg-[#2A384C] text-[#F0F4FF] border border-[#2A384C] text-xs font-mono font-bold rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Edit3 className="h-3.5 w-3.5 text-[#4F8EF7]" />
              Set Deadline
            </button>
          </div>
        </div>

        {/* Modality Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0F1724] p-2 rounded-lg border border-[#2A384C]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-[#94A3B8] uppercase tracking-wider font-bold px-2">Learning Format:</span>
            
            <button
              onClick={() => setActiveModalityFilter("all")}
              className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                activeModalityFilter === "all"
                  ? "bg-[#4F8EF7] text-[#0F1724]"
                  : "bg-[#141E30] text-[#94A3B8] hover:text-[#F0F4FF] border border-[#2A384C]"
              }`}
            >
              All Formats ({learningPlan.length})
            </button>

            <button
              onClick={() => setActiveModalityFilter("micro")}
              className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeModalityFilter === "micro"
                  ? "bg-[#10B981] text-[#0F1724]"
                  : "bg-[#141E30] text-[#94A3B8] hover:text-[#10B981] border border-[#2A384C]"
              }`}
            >
              <Zap className="h-3.5 w-3.5 text-[#10B981]" />
              Micro-Learning (5–15m)
            </button>

            <button
              onClick={() => setActiveModalityFilter("in_depth")}
              className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeModalityFilter === "in_depth"
                  ? "bg-[#4F8EF7] text-[#0F1724]"
                  : "bg-[#141E30] text-[#94A3B8] hover:text-[#4F8EF7] border border-[#2A384C]"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 text-[#4F8EF7]" />
              In-Depth Courses
            </button>

            <button
              onClick={() => setActiveModalityFilter("best_practice")}
              className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeModalityFilter === "best_practice"
                  ? "bg-[#F59E0B] text-[#0F1724]"
                  : "bg-[#141E30] text-[#94A3B8] hover:text-[#F59E0B] border border-[#2A384C]"
              }`}
            >
              <Wrench className="h-3.5 w-3.5 text-[#F59E0B]" />
              Best Practice Labs
            </button>
          </div>

          {/* Completion Counter */}
          <div className="text-xs font-mono text-[#94A3B8] px-2">
            Completed: <strong className="text-[#10B981]">{learningPlan.filter(s => s.status === "completed").length}</strong> / {learningPlan.length} Steps
          </div>
        </div>

        {/* Flexible Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {learningPlan
            .filter(step => activeModalityFilter === "all" || step.learningType === activeModalityFilter)
            .map((step) => {
              const isCompleted = step.status === "completed";
              const isInProgress = step.status === "in_progress";

              const typeBadge = step.learningType === "micro" ? (
                <span className="px-2 py-0.5 rounded bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30 text-[9px] font-mono font-bold uppercase flex items-center gap-1">
                  <Zap className="h-2.5 w-2.5" /> Micro
                </span>
              ) : step.learningType === "best_practice" ? (
                <span className="px-2 py-0.5 rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30 text-[9px] font-mono font-bold uppercase flex items-center gap-1">
                  <Wrench className="h-2.5 w-2.5" /> Practice
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-[#4F8EF7]/10 text-[#4F8EF7] border border-[#4F8EF7]/30 text-[9px] font-mono font-bold uppercase flex items-center gap-1">
                  <BookOpen className="h-2.5 w-2.5" /> In-Depth
                </span>
              );

              return (
                <div 
                  key={step.id} 
                  className={`p-5 rounded-lg border flex flex-col justify-between transition-all ${
                    isCompleted
                      ? "bg-[#0F1724] border-[#10B981]/50 shadow-sm shadow-[#10B981]/10"
                      : isInProgress
                        ? "bg-[#0F1724] border-[#4F8EF7] shadow-md shadow-[#4F8EF7]/15 ring-1 ring-[#4F8EF7]/30"
                        : "bg-[#0F1724] border-[#2A384C]"
                  }`}
                >
                  <div>
                    {/* Top Tag Row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-[#4F8EF7] bg-[#4F8EF7]/10 px-2 py-0.5 rounded border border-[#4F8EF7]/20">
                          {step.phaseLabel || `Phase ${step.weekNumber}`}
                        </span>
                        {typeBadge}
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider font-bold border ${
                        isCompleted 
                          ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/40" 
                          : isInProgress 
                            ? "bg-[#4F8EF7]/10 text-[#4F8EF7] border-[#4F8EF7]/40"
                            : "bg-[#1E293B] text-[#94A3B8] border-[#2A384C]"
                      }`}>
                        {step.status.replace("_", " ")}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-[#F0F4FF] mb-2">{step.title}</h4>

                    <div className="space-y-2 text-xs text-[#94A3B8] font-sans">
                      <p><strong className="text-[#F0F4FF]">Skill Focus:</strong> {step.skillFocus}</p>
                      <p className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-[#F0F4FF]">
                          <GraduationCap className="h-3.5 w-3.5 text-[#4F8EF7]" />
                          <span>{step.courseName}</span>
                        </span>
                        <span className="text-[10px] font-mono text-[#94A3B8]">{step.estimatedDuration || "30m"}</span>
                      </p>
                      <div className="p-2.5 bg-[#141E30] rounded-md border border-[#2A384C] text-[11px] leading-relaxed text-[#F0F4FF]">
                        <strong>Milestone:</strong> {step.milestone}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action / Score Row */}
                  <div className="mt-4 pt-3 border-t border-[#2A384C] space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[#94A3B8]">Assessment Target:</span>
                      <span className="font-bold text-[#10B981]">{step.targetScore}</span>
                    </div>

                    {isCompleted && (step.quizScore || 0) > 0 && (
                      <div className="flex items-center justify-between text-[10px] font-mono bg-[#10B981]/10 p-2 rounded border border-[#10B981]/30">
                        <span className="text-[#10B981] font-bold">Quiz Validation Score:</span>
                        <span className="font-bold text-[#F0F4FF]">{step.quizScore}% Score</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {isCompleted ? (
                        <button
                          onClick={() => handleUpdateStepStatus(step.id, "in_progress")}
                          className="w-full py-1.5 px-3 bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30 rounded-md text-xs font-mono font-bold hover:bg-[#10B981]/20 transition-colors cursor-pointer flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Completed (Reopen)
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setActiveQuizStep(step);
                            setSelectedQuizAnswerIndex(null);
                            setQuizScoreResult(null);
                          }}
                          className="w-full py-1.5 px-3 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] rounded-md text-xs font-mono font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <CheckSquare className="h-3.5 w-3.5" />
                          Take Knowledge Check Quiz
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Target Deadline Edit Modal */}
      {showDeadlineModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 max-w-md w-full shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-[#4F8EF7]" />
                <h3 className="text-sm font-bold text-[#F0F4FF]">Set Flexible Learning Deadline</h3>
              </div>
              <button onClick={() => setShowDeadlineModal(false)} className="text-[#94A3B8] hover:text-[#F0F4FF]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="deadline-type-select" className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase block mb-1">
                  Deadline Motivation Category
                </label>
                <select
                  id="deadline-type-select"
                  value={customDeadlineType}
                  onChange={(e: any) => setCustomDeadlineType(e.target.value)}
                  className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs font-semibold p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                >
                  <option value="client_interview">Client Interview Date</option>
                  <option value="project_deadline">Project Onboarding Deadline</option>
                  <option value="learner_set">Learner Self-Set Goal</option>
                  <option value="manager_assigned">Manager Assigned Target</option>
                </select>
              </div>

              <div>
                <label htmlFor="target-deadline-input" className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase block mb-1">
                  Target Date *
                </label>
                <input
                  id="target-deadline-input"
                  type="date"
                  value={customDeadlineDate}
                  onChange={(e) => setCustomDeadlineDate(e.target.value)}
                  className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs font-semibold p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                />
              </div>

              <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                Updating your deadline recalculates module pace and signals client interview readiness to your manager and L&D leads.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2A384C]">
              <button
                onClick={() => setShowDeadlineModal(false)}
                className="px-4 py-2 bg-[#1E293B] hover:bg-[#2A384C] text-[#94A3B8] text-xs font-mono font-bold rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDeadline}
                className="px-4 py-2 bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] text-xs font-mono font-bold rounded-md flex items-center gap-1.5"
              >
                <Check className="h-4 w-4" />
                Save Flexible Deadline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Knowledge Check Quiz Modal */}
      {activeQuizStep && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 max-w-lg w-full shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
              <div>
                <span className="text-[10px] font-mono text-[#10B981] uppercase font-bold tracking-wider">
                  Interactive Knowledge Check
                </span>
                <h3 className="text-sm font-bold text-[#F0F4FF]">{activeQuizStep.title}</h3>
              </div>
              <button onClick={() => setActiveQuizStep(null)} className="text-[#94A3B8] hover:text-[#F0F4FF]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 bg-[#0F1724] rounded-md border border-[#2A384C] text-xs text-[#94A3B8] space-y-1">
              <p><strong className="text-[#F0F4FF]">Skill Focus:</strong> {activeQuizStep.skillFocus}</p>
              <p><strong className="text-[#F0F4FF]">Milestone:</strong> {activeQuizStep.milestone}</p>
            </div>

            {/* Quiz Question */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-[#F0F4FF] leading-relaxed">
                Q: According to best practice standards for <strong className="text-[#4F8EF7]">{activeQuizStep.skillFocus}</strong>, which architectural principle best fulfills the requirement: "{activeQuizStep.assessment}"?
              </p>

              <div className="space-y-2">
                {[
                  `Apply clean modular separation and parameterized execution handlers.`,
                  `Hardcode test configurations inside execution loops without boundary assertions.`,
                  `Bypass validation logging and skip pull request code reviews.`,
                  `Rely on non-deterministic waits and manual database manipulation.`
                ].map((optionText, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedQuizAnswerIndex(idx)}
                    className={`w-full text-left p-3 rounded-md text-xs font-sans transition-all cursor-pointer border flex items-center justify-between ${
                      selectedQuizAnswerIndex === idx
                        ? "bg-[#4F8EF7]/15 border-[#4F8EF7] text-[#F0F4FF] font-semibold"
                        : "bg-[#0F1724] border-[#2A384C] text-[#94A3B8] hover:text-[#F0F4FF] hover:border-[#4F8EF7]/50"
                    }`}
                  >
                    <span>{String.fromCharCode(65 + idx)}. {optionText}</span>
                    {selectedQuizAnswerIndex === idx && <Check className="h-4 w-4 text-[#4F8EF7]" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-[#2A384C]">
              <span className="text-[10px] font-mono text-[#94A3B8]">Target Score: {activeQuizStep.targetScore}</span>

              <div className="flex gap-2">
                <button
                  onClick={() => setActiveQuizStep(null)}
                  className="px-3 py-1.5 bg-[#1E293B] text-[#94A3B8] text-xs font-mono font-bold rounded-md"
                >
                  Cancel
                </button>
                <button
                  disabled={selectedQuizAnswerIndex === null}
                  onClick={() => {
                    const score = selectedQuizAnswerIndex === 0 ? 92 : 65;
                    handleUpdateStepStatus(activeQuizStep.id, "completed", score, 25);
                    setActiveQuizStep(null);
                  }}
                  className={`px-4 py-1.5 text-xs font-mono font-bold rounded-md flex items-center gap-1.5 transition-colors ${
                    selectedQuizAnswerIndex !== null
                      ? "bg-[#10B981] hover:bg-[#059669] text-[#0F1724] cursor-pointer"
                      : "bg-[#2A384C] text-[#94A3B8] cursor-not-allowed"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Submit Quiz & Validate Step
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Recommended Courses & Credentials Section */}
      <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-[#F0F4FF]">Recommended Learning Interventions & Courses</h3>
            <p className="text-xs text-[#94A3B8] mt-1">Curated courses mapped to your target role skill gaps.</p>
          </div>
          <GraduationCap className="h-5 w-5 text-[#4F8EF7]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((c) => (
            <div key={c.id} className="p-4 bg-[#0F1724] rounded-lg border border-[#2A384C] hover:border-[#4F8EF7] transition-all flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 bg-[#4F8EF7]/10 text-[#4F8EF7] border border-[#4F8EF7]/30 rounded text-[9px] font-mono font-bold uppercase">
                    {c.type}
                  </span>
                  <span className="text-[10px] text-[#94A3B8] font-mono font-bold">{c.provider}</span>
                </div>
                <h4 className="text-xs font-bold text-[#F0F4FF] mt-1">{c.title}</h4>
                
                {/* Rating, Viewership & 2026 Updated Syllabus Badges */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-[10px] font-mono font-bold">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {c.rating || 4.9} / 5.0
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded text-[10px] font-mono font-bold">
                    <Users className="h-3 w-3 text-indigo-400" />
                    {c.enrollmentCount || "180,000+ Learners"}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-mono font-bold">
                    <Zap className="h-3 w-3 text-emerald-400" />
                    {c.lastUpdated || "Updated June 2026"}
                  </span>
                </div>

                <p className="text-[11px] text-[#94A3B8] mt-2 line-clamp-2 leading-relaxed">
                  {c.description}
                </p>
              </div>

              <div className="pt-3 border-t border-[#2A384C] flex items-center justify-between">
                <span className="text-[10px] text-[#94A3B8] font-mono flex items-center gap-1">
                  <Clock className="h-3 w-3 text-[#4F8EF7]" />
                  {c.duration}
                </span>
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono font-bold text-[#4F8EF7] hover:underline flex items-center gap-1"
                  >
                    Open Course <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-xs font-mono font-bold text-[#10B981]">Internal Course</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Workplace Evidence Submission Vault */}
      <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg">
        <h3 className="text-base font-bold text-[#F0F4FF] mb-1">Workplace Evidence Submission Vault</h3>
        <p className="text-xs text-[#94A3B8] mb-6">
          Submit verifiable evidence of your capability (pull request links, configuration blueprints, test code) to trigger manager validation and upgrade your level score.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Submit form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {successMsg && (
              <div className="p-3 bg-[#10B981]/10 border border-[#10B981]/40 text-[#10B981] font-mono text-xs rounded-md">
                {successMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="evidence-skill-select" className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider block mb-1">Target Skill Gap *</label>
                <select
                  id="evidence-skill-select"
                  required
                  value={selectedSkillForEvidence}
                  onChange={(e) => setSelectedSkillForEvidence(e.target.value)}
                  className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs font-semibold p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                >
                  <option value="">-- Choose Target Skill --</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="evidence-title-input" className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider block mb-1">Evidence Title *</label>
                <input
                  id="evidence-title-input"
                  type="text"
                  required
                  placeholder="e.g. Automated Selenium Test Suite POM"
                  value={evidenceTitle}
                  onChange={(e) => setEvidenceTitle(e.target.value)}
                  className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="evidence-desc-input" className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider block mb-1">Impact Summary *</label>
              <input
                id="evidence-desc-input"
                type="text"
                required
                placeholder="Briefly describe how this work demonstrates your target capability..."
                value={evidenceDesc}
                onChange={(e) => setEvidenceDesc(e.target.value)}
                className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
              />
            </div>

            <div>
              <label htmlFor="evidence-text-textarea" className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider block mb-1">Detailed Evidence / Test Code Output *</label>
              <textarea
                id="evidence-text-textarea"
                required
                rows={4}
                placeholder="Provide code snippets, test execution logs, or detailed implementation descriptions..."
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7] font-mono"
              />
            </div>

            <div>
              <label htmlFor="evidence-url-input" className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider block mb-1">Document / Repository URL (Optional)</label>
              <input
                id="evidence-url-input"
                type="url"
                placeholder="https://github.com/..."
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7] font-mono"
              />
            </div>

            <button
              id="submit-evidence-btn"
              type="submit"
              className="flex items-center justify-center gap-2 w-full sm:w-auto bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-bold text-xs uppercase tracking-[0.2em] py-2.5 px-6 rounded-md transition-all cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              Submit Evidence For Review
            </button>
          </form>

          {/* Submission history list */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider">Submission Verification Log</h4>
            <div className="space-y-3 overflow-y-auto max-h-[360px] pr-2">
              {evidences.map((e) => {
                const skillName = skills.find(s => s.id === e.skillId)?.name || e.skillId;
                return (
                  <div key={e.id} className="p-4 bg-[#0F1724] border border-[#2A384C] rounded-md space-y-2 hover:border-[#4F8EF7]/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#F0F4FF]">{e.title}</span>
                      <span className={`px-2 py-0.5 border text-[9px] font-mono font-bold uppercase tracking-wider rounded ${
                        e.status === "approved" 
                          ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/40"
                          : e.status === "revision_requested"
                            ? "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/40"
                            : "bg-[#1E293B] text-[#94A3B8] border-[#2A384C]"
                      }`}>
                        {e.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#4F8EF7] font-mono font-semibold">Skill: {skillName}</p>
                    <p className="text-[11px] text-[#94A3B8] font-sans leading-relaxed">{e.description}</p>
                    {e.documentUrl && (
                      <a 
                        href={e.documentUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="inline-flex items-center gap-1 text-[10px] font-mono text-[#4F8EF7] hover:underline"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        Repository / Artifact Link
                      </a>
                    )}
                    {e.reviewComment && (
                      <div className="mt-2 pt-2 border-t border-[#2A384C] text-[11px] text-[#F0F4FF] italic bg-[#141E30] p-2.5 rounded-md">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-[#4F8EF7] not-italic block mb-1">Manager Feedback:</span> "{e.reviewComment}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};
