import React, { useState, useEffect } from "react";
import { ProjectDemand, CandidateMatch, User, UserRole, ResumeEligibility } from "../types";
import { 
  FileText, Sparkles, Target, Briefcase, Users, Calendar, 
  CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Download, 
  Send, RefreshCw, Layers, MapPin, Award, Check, X, Video, Circle, ThumbsUp, ThumbsDown
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { SkillGapInterviewAgent } from "./SkillGapInterviewAgent";

interface ProjectDemandAgentProps {
  currentUser?: User;
}

// Small presentational row for the Client Resume Readiness checklist - one line per gate
// condition, with an optional detail line explaining what's still needed.
const ChecklistRow: React.FC<{ done: boolean; label: string; detail?: string }> = ({ done, label, detail }) => (
  <div className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${done ? "border-emerald-500/30 bg-emerald-500/5" : "border-[#2A384C] bg-[#0A0A0A]"}`}>
    {done ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
    ) : (
      <Circle className="h-4 w-4 text-[#4B5568] shrink-0 mt-0.5" />
    )}
    <div>
      <p className={`text-xs font-mono font-semibold ${done ? "text-emerald-400" : "text-[#E0E0E0]"}`}>{label}</p>
      {detail && <p className="text-[10px] font-mono text-[#94A3B8] mt-0.5">{detail}</p>}
    </div>
  </div>
);

export const ProjectDemandAgent: React.FC<ProjectDemandAgentProps> = ({ currentUser }) => {
  // Fallback default user if currentUser is not provided
  const activeUser: User = currentUser || {
    id: "usr_emp_1",
    name: "Aarav Sharma",
    role: UserRole.EMPLOYEE,
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    title: "Senior Full-Stack AI Engineer",
    department: "Engineering & Innovation",
    email: "aarav.sharma@enterprise.com",
    managerId: "usr_mgr_1",
    targetRoleId: "role_ai_arch"
  };

  // Direct 1st-Level Assessment Modal Launch State
  const [activeAssessmentCand, setActiveAssessmentCand] = useState<{
    roleTitle: string;
    jdText: string;
    candidateName: string;
  } | null>(null);

  // Requisitions State
  const [demands, setDemands] = useState<ProjectDemand[]>([]);
  const [selectedDemand, setSelectedDemand] = useState<ProjectDemand | null>(null);
  const [isLoadingDemands, setIsLoadingDemands] = useState(false);

  // Raw JD Intake Form State
  const [rawJdText, setRawJdText] = useState("");
  const [isParsingJd, setIsParsingJd] = useState(false);
  const [parsedCompetencies, setParsedCompetencies] = useState<any>(null);

  // New Requisition Form Data
  const [projectName, setProjectName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [businessUnit, setBusinessUnit] = useState("Banking & Financial Services");
  const [projectDescription, setProjectDescription] = useState("");
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [preferredSkills, setPreferredSkills] = useState<string[]>([]);
  const [techStack, setTechStack] = useState<string[]>([]);
  const [expMin, setExpMin] = useState(3);
  const [expMax, setExpMax] = useState(7);
  const [resourcesRequired, setResourcesRequired] = useState(2);
  const [clientInterviewDate, setClientInterviewDate] = useState("2026-08-15");
  const [expectedJoiningDate, setExpectedJoiningDate] = useState("2026-09-01");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [location, setLocation] = useState("Hybrid / New York");
  const [domain, setDomain] = useState("Financial Services & Fintech");
  const [employmentType, setEmploymentType] = useState<"Full-Time" | "Contract" | "Internal Mobility">("Full-Time");
  const [isCreatingDemand, setIsCreatingDemand] = useState(false);
  const [createSuccessMsg, setCreateSuccessMsg] = useState("");

  // AI Matching Engine State
  const [candidateMatches, setCandidateMatches] = useState<CandidateMatch[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateMatch | null>(null);

  // Client Resume Generator State
  const [clientResumeMarkdown, setClientResumeMarkdown] = useState("");
  const [isGeneratingResume, setIsGeneratingResume] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [activeResumeCandidate, setActiveResumeCandidate] = useState<CandidateMatch | null>(null);

  // Resume Eligibility Checklist State — the resume can only be generated once the backend
  // confirms training is complete, a manager has cleared the post-assessment, and skill
  // growth has actually been measured.
  const [eligibility, setEligibility] = useState<ResumeEligibility | null>(null);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);

  // Agent Handoff State
  const [handoffStatus, setHandoffStatus] = useState<any>(null);
  const [isHandingOff, setIsHandingOff] = useState(false);

  // 1. Load Project Demands on mount
  useEffect(() => {
    fetchDemands();
  }, []);

  const fetchDemands = async () => {
    try {
      setIsLoadingDemands(true);
      const res = await fetch("/api/project-demand/list");
      const isJson = res.headers.get("content-type")?.includes("application/json");
      if (res.ok && isJson) {
        const data = await res.json();
        setDemands(data.demands || []);
        if (data.demands && data.demands.length > 0 && !selectedDemand) {
          setSelectedDemand(data.demands[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load project demands:", err);
    } finally {
      setIsLoadingDemands(false);
    }
  };

  // 2. Parse Raw Job Description with Gemini AI
  const handleParseJd = async () => {
    if (!rawJdText.trim()) return;
    try {
      setIsParsingJd(true);
      const res = await fetch("/api/project-demand/parse-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescriptionText: rawJdText })
      });
      if (res.ok) {
        const data = await res.json();
        const comps = data.competencies;
        setParsedCompetencies(comps);
        if (comps) {
          if (comps.projectName) setProjectName(comps.projectName);
          if (comps.requiredSkills) setRequiredSkills(comps.requiredSkills);
          if (comps.preferredSkills) setPreferredSkills(comps.preferredSkills);
          if (comps.technologyStack) setTechStack(comps.technologyStack);
          if (comps.experienceRangeMin) setExpMin(comps.experienceRangeMin);
          if (comps.experienceRangeMax) setExpMax(comps.experienceRangeMax);
          if (comps.domain) setDomain(comps.domain);
        }
      }
    } catch (err) {
      console.error("JD Parsing failed:", err);
    } finally {
      setIsParsingJd(false);
    }
  };

  // 3. Create New Project Demand
  const handleCreateDemand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreatingDemand(true);
      setCreateSuccessMsg("");
      const payload = {
        projectName: projectName || "New Enterprise Project Demand",
        customerName: customerName || "Global Client",
        businessUnit,
        projectDescription: projectDescription || rawJdText.slice(0, 300) || "Enterprise client engagement requirement.",
        rawJobDescription: rawJdText,
        requiredSkills: requiredSkills.length > 0 ? requiredSkills : ["System Architecture", "TypeScript"],
        preferredSkills: preferredSkills.length > 0 ? preferredSkills : ["Vector DB"],
        experienceRangeMin: Number(expMin),
        experienceRangeMax: Number(expMax),
        technologyStack: techStack.length > 0 ? techStack : ["React", "TypeScript", "Node.js"],
        resourcesRequired: Number(resourcesRequired),
        clientInterviewDate,
        expectedJoiningDate,
        projectPriority: priority,
        location,
        domain,
        employmentType
      };

      const res = await fetch("/api/project-demand/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setCreateSuccessMsg("Project Demand Requisition Created & Published!");
        fetchDemands();
        setSelectedDemand(data.demand);
        // Clear form
        setRawJdText("");
        setParsedCompetencies(null);
      }
    } catch (err) {
      console.error("Create demand error:", err);
    } finally {
      setIsCreatingDemand(false);
    }
  };

  // 4. Run Explainable Candidate Matching Engine
  const handleRunMatch = async (demandToMatch?: ProjectDemand) => {
    const target = demandToMatch || selectedDemand;
    if (!target) return;
    try {
      setIsMatching(true);
      const res = await fetch("/api/project-demand/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandId: target.id })
      });
      if (res.ok) {
        const data = await res.json();
        setCandidateMatches(data.matches || []);
        if (data.matches && data.matches.length > 0) {
          setSelectedCandidate(data.matches[0]);
        }
      }
    } catch (err) {
      console.error("Match error:", err);
    } finally {
      setIsMatching(false);
    }
  };

  // Automatically trigger match when selectedDemand changes
  useEffect(() => {
    if (selectedDemand) {
      handleRunMatch(selectedDemand);
    }
  }, [selectedDemand?.id]);

  // 5. Open the Client Resume flow: check eligibility first
  const handleOpenResumeFlow = async (cand: CandidateMatch) => {
    if (!selectedDemand) return;
    setActiveResumeCandidate(cand);
    setShowResumeModal(true);
    setClientResumeMarkdown("");
    await checkEligibility(cand);
  };

  const checkEligibility = async (cand: CandidateMatch) => {
    if (!selectedDemand) return;
    try {
      setIsCheckingEligibility(true);
      const res = await fetch(`/api/project-demand/${selectedDemand.id}/resume-eligibility/${cand.employeeId}`);
      if (res.ok) {
        const data = await res.json();
        setEligibility(data);
      }
    } catch (err) {
      console.error("Eligibility check error:", err);
    } finally {
      setIsCheckingEligibility(false);
    }
  };

  // 6. Generate Zero-Hallucination Client Resume — only ever called once eligibility is
  // confirmed true; the button that triggers this is disabled otherwise.
  const handleGenerateResume = async () => {
    if (!selectedDemand || !activeResumeCandidate || !eligibility?.eligible) return;
    try {
      setIsGeneratingResume(true);
      const res = await fetch("/api/project-demand/generate-client-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: activeResumeCandidate.employeeId,
          demandId: selectedDemand.id
        })
      });
      if (res.ok) {
        const data = await res.json();
        setClientResumeMarkdown(data.markdownResume);
      } else {
        const err = await res.json().catch(() => ({}));
        // Backend re-checks the same gate - if the UI's cached eligibility went stale
        // (e.g. another manager acted in the meantime), refresh it instead of just failing.
        if (err.eligibility) setEligibility(err.eligibility);
      }
    } catch (err) {
      console.error("Generate resume error:", err);
    } finally {
      setIsGeneratingResume(false);
    }
  };

  // 6. Trigger Handoff to SkillGap-to-Growth Agent & Direct 1st-Level Assessment Launch
  const handleHandoff = async (cand: CandidateMatch) => {
    if (!selectedDemand) return;
    try {
      setIsHandingOff(true);
      setHandoffStatus(null);
      const res = await fetch("/api/project-demand/handoff-skillgap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: cand.employeeId,
          demandId: selectedDemand.id,
          missingSkills: cand.missingSkills,
          clientInterviewDate: selectedDemand.clientInterviewDate
        })
      });
      if (res.ok) {
        const data = await res.json();
        setHandoffStatus(data);

        // Directly trigger 1st-level video-based Q&A and MCQ assessment
        const roleTitle = `${selectedDemand.projectName} (${selectedDemand.customerName}) - ${cand.fullName}`;
        const jdText = `Project Requisition: ${selectedDemand.projectName}
Client: ${selectedDemand.customerName} | Domain: ${selectedDemand.domain}
Project Description: ${selectedDemand.projectDescription}
Required Skills: ${selectedDemand.requiredSkills.join(", ")}
Target Interview Date: ${selectedDemand.clientInterviewDate}

Shortlisted Candidate: ${cand.fullName}
Current Match Score: ${cand.overallMatchPct}%
Missing Competencies to Verify via 1st-Level Assessment: ${cand.missingSkills.join(", ")}`;

        setActiveAssessmentCand({
          roleTitle,
          jdText,
          candidateName: cand.fullName
        });
      }
    } catch (err) {
      console.error("Handoff error:", err);
    } finally {
      setIsHandingOff(false);
    }
  };

  return (
    <div className="space-y-8 py-6">
      
      {/* Agent Banner Header */}
      <div className="bg-[#0F1724] border border-[#2A384C] rounded-xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-[#4F8EF7]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#141E30] border border-[#4F8EF7]/40 rounded-lg text-[#4F8EF7]">
              <Target className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#4F8EF7] bg-[#4F8EF7]/10 px-2 py-0.5 rounded">
                  Entry-Point AI Agent
                </span>
                <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-wider">
                  Phase 0: Project Demand Discovery
                </span>
              </div>
              <h2 className="text-2xl font-bold text-[#F0F4FF] mt-1 tracking-tight">
                Talent Sourcing & Project Demand Agent
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5 max-w-2xl">
                Holds job opening details and manager-provided JDs. Scans candidate resumes across the organization to identify the single best fit resume, and triggers evaluation to discover skill gaps for targeted upskilling.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchDemands()}
              className="flex items-center gap-1.5 bg-[#141E30] hover:bg-[#1E293B] text-[#94A3B8] hover:text-white border border-[#2A384C] text-xs font-mono font-semibold py-2 px-3 rounded-lg transition-all cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingDemands ? "animate-spin" : ""}`} />
              Sync Requisitions
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Requisition Intake / Catalog & AI Matcher */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LEFT COLUMN: Requisition Catalog & JD Parser Intake */}
        <div className="lg:col-span-5 space-y-6">

          {/* Active Requisitions Selection Catalog */}
          <div className="bg-[#0F1724] border border-[#2A384C] rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-[#F0F4FF] flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-[#4F8EF7]" />
                Active Project Requisitions ({demands.length})
              </h3>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {demands.map((dem) => {
                const isSelected = selectedDemand?.id === dem.id;
                return (
                  <div
                    key={dem.id}
                    onClick={() => setSelectedDemand(dem)}
                    className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all ${
                      isSelected 
                        ? "bg-[#141E30] border-[#4F8EF7] shadow-md ring-1 ring-[#4F8EF7]/50" 
                        : "bg-[#0A0A0A]/60 border-[#2A384C] hover:border-[#4F8EF7]/50 hover:bg-[#141E30]/50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[9px] font-mono uppercase font-semibold text-[#4F8EF7] bg-[#4F8EF7]/10 px-1.5 py-0.5 rounded">
                          {dem.customerName}
                        </span>
                        <h4 className="text-xs font-bold text-white mt-1 leading-snug">{dem.projectName}</h4>
                      </div>
                      <span className={`text-[9px] font-mono uppercase font-bold px-1.5 py-0.5 rounded ${
                        dem.projectPriority === "CRITICAL" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}>
                        {dem.projectPriority}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] font-mono text-[#94A3B8]">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-[#4F8EF7]" /> {dem.resourcesRequired} Needed
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-emerald-400" /> Interview: {new Date(dem.clientInterviewDate).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-2">
                      {dem.requiredSkills.slice(0, 3).map((sk, idx) => (
                        <span key={idx} className="text-[9px] bg-[#1E293B] text-[#94A3B8] px-1.5 py-0.5 rounded border border-[#2A384C]">
                          {sk}
                        </span>
                      ))}
                      {dem.requiredSkills.length > 3 && (
                        <span className="text-[9px] text-[#4F8EF7] font-mono">+{dem.requiredSkills.length - 3} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Job Description Intake & Parsing Engine */}
          <div className="bg-[#0F1724] border border-[#2A384C] rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-[#F0F4FF] flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#4F8EF7]" />
                Ingest New Job Description (JD)
              </h3>
              <span className="text-[10px] font-mono text-[#4F8EF7] bg-[#4F8EF7]/10 px-2 py-0.5 rounded">
                Gemini AI Parser
              </span>
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Paste raw customer JD text or upload project specifications. The AI parser will extract structured skill matrices, required years of experience, and tech stack.
            </p>

            <textarea
              rows={5}
              value={rawJdText}
              onChange={(e) => setRawJdText(e.target.value)}
              placeholder="Paste raw customer Job Description text here (e.g. 'Seeking Senior Full-Stack AI Engineer with 4+ years experience in Next.js, Gemini API, TypeScript, Vector Databases...')"
              className="w-full bg-[#0A0A0A] border border-[#2A384C] rounded-lg p-3 text-xs text-[#F0F4FF] placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7] font-mono"
            />

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleParseJd}
                disabled={isParsingJd || !rawJdText.trim()}
                className="flex-1 bg-[#141E30] hover:bg-[#1E293B] text-[#4F8EF7] border border-[#4F8EF7]/50 text-xs font-mono font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <Sparkles className={`h-4 w-4 ${isParsingJd ? "animate-spin" : ""}`} />
                {isParsingJd ? "Analyzing Competency Matrix..." : "AI Competency Extraction"}
              </button>
            </div>

            {/* Render Parsed Competency Preview */}
            {parsedCompetencies && (
              <div className="bg-[#141E30] border border-emerald-500/40 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 font-mono uppercase flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Competencies Extracted
                  </span>
                  <span className="text-[10px] font-mono text-[#94A3B8]">Domain: {parsedCompetencies.domain}</span>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-[#94A3B8]">Extracted Required Skills:</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {parsedCompetencies.requiredSkills?.map((sk: string, idx: number) => (
                      <span key={idx} className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-mono">
                        {sk}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-[#94A3B8]">Extracted Tech Stack:</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {parsedCompetencies.technologyStack?.map((t: string, idx: number) => (
                      <span key={idx} className="text-[10px] bg-[#0A0A0A] text-[#F0F4FF] border border-[#2A384C] px-2 py-0.5 rounded font-mono">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Publish Requisition Form */}
            <form onSubmit={handleCreateDemand} className="space-y-3 pt-2 border-t border-[#2A384C]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono uppercase text-[#94A3B8]">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Wealth Mgmt Advisory AI"
                    className="w-full bg-[#0A0A0A] border border-[#2A384C] rounded p-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-[#94A3B8]">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Apex Global Financials"
                    className="w-full bg-[#0A0A0A] border border-[#2A384C] rounded p-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono uppercase text-[#94A3B8]">Client Interview Date</label>
                  <input
                    type="date"
                    value={clientInterviewDate}
                    onChange={(e) => setClientInterviewDate(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#2A384C] rounded p-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-[#94A3B8]">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full bg-[#0A0A0A] border border-[#2A384C] rounded p-2 text-xs text-white"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreatingDemand}
                className="w-full bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-bold text-xs py-2.5 px-4 rounded-lg font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Briefcase className="h-4 w-4" />
                {isCreatingDemand ? "Publishing Requisition..." : "Publish Requisition to Agent Hub"}
              </button>

              {createSuccessMsg && (
                <p className="text-xs font-mono text-emerald-400 text-center">{createSuccessMsg}</p>
              )}
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Explainable Candidate Matching Engine & Handoff */}
        <div className="lg:col-span-7 space-y-6">

          {/* Demand Context Overview Card */}
          {selectedDemand && (
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-xl p-5 shadow-lg space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#2A384C] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase font-bold text-[#4F8EF7] bg-[#4F8EF7]/10 px-2 py-0.5 rounded">
                      Selected Requisition
                    </span>
                    <span className="text-xs font-mono text-[#94A3B8]">ID: {selectedDemand.id}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white mt-1">{selectedDemand.projectName}</h3>
                  <p className="text-xs font-mono text-[#4F8EF7]">{selectedDemand.customerName} • {selectedDemand.businessUnit}</p>
                </div>

                <button
                  onClick={() => handleRunMatch(selectedDemand)}
                  disabled={isMatching}
                  className="bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-bold text-xs py-2 px-4 rounded-lg font-mono uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md shrink-0"
                >
                  <Sparkles className={`h-4 w-4 ${isMatching ? "animate-spin" : ""}`} />
                  {isMatching ? "Ranking Candidates..." : "Run AI Matching Engine"}
                </button>
              </div>

              <p className="text-xs text-[#94A3B8] leading-relaxed">
                {selectedDemand.projectDescription}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0A0A0A] p-3 rounded-lg border border-[#2A384C] text-[11px] font-mono">
                <div>
                  <span className="text-[#94A3B8] text-[9px] uppercase block">Location:</span>
                  <span className="text-white font-semibold">{selectedDemand.location}</span>
                </div>
                <div>
                  <span className="text-[#94A3B8] text-[9px] uppercase block">Exp Range:</span>
                  <span className="text-white font-semibold">{selectedDemand.experienceRangeMin} - {selectedDemand.experienceRangeMax} Years</span>
                </div>
                <div>
                  <span className="text-[#94A3B8] text-[9px] uppercase block">Interview Date:</span>
                  <span className="text-emerald-400 font-semibold">{new Date(selectedDemand.clientInterviewDate).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-[#94A3B8] text-[9px] uppercase block">Joining Target:</span>
                  <span className="text-white font-semibold">{new Date(selectedDemand.expectedJoiningDate).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase text-[#94A3B8]">Required Competencies Matrix:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDemand.requiredSkills.map((sk, idx) => (
                    <span key={idx} className="text-xs bg-[#141E30] text-[#4F8EF7] border border-[#4F8EF7]/40 px-2.5 py-1 rounded-md font-mono font-medium">
                      {sk}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Best Fit Resume Selection & Candidate Mass Rankings */}
          <div className="bg-[#0F1724] border border-[#2A384C] rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-[#F0F4FF] flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#4F8EF7]" />
                  Best Fit Resume Selection & Candidate Mass Analysis ({candidateMatches.length})
                </h3>
                <p className="text-[11px] text-[#94A3B8] font-mono mt-0.5">
                  Scans internal resumes against manager job opening details to pick the best fit resume and trigger skill gap evaluations.
                </p>
              </div>
            </div>

            {isMatching ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                <RefreshCw className="h-8 w-8 text-[#4F8EF7] animate-spin" />
                <p className="text-xs font-mono text-[#94A3B8]">Scanning candidate mass & ranking best fit resumes...</p>
              </div>
            ) : candidateMatches.length === 0 ? (
              <div className="p-8 text-center bg-[#0A0A0A] border border-[#2A384C] rounded-lg">
                <p className="text-xs font-mono text-[#94A3B8]">Select a requisition above and click 'Run AI Matching Engine'.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {candidateMatches.map((cand, idx) => {
                  const isSelected = selectedCandidate?.employeeId === cand.employeeId;
                  const isHighMatch = cand.overallMatchPct >= 80;
                  const isTopFit = idx === 0;

                  return (
                    <div
                      key={cand.employeeId}
                      onClick={() => setSelectedCandidate(cand)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                        isTopFit 
                          ? "bg-[#141E30] border-emerald-500/80 ring-2 ring-emerald-500/40 shadow-lg" 
                          : isSelected 
                          ? "bg-[#141E30] border-[#4F8EF7] ring-1 ring-[#4F8EF7]" 
                          : "bg-[#0A0A0A]/80 border-[#2A384C] hover:border-[#4F8EF7]/60"
                      }`}
                    >
                      {/* Top Fit Ribbon Badge */}
                      {isTopFit && (
                        <div className="absolute -top-3 right-4 bg-emerald-500 text-[#0F1724] font-mono text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> #1 Best Fit Resume
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <img
                              src={cand.avatar}
                              alt={cand.fullName}
                              className={`h-11 w-11 rounded-full border-2 object-cover ${isTopFit ? "border-emerald-400" : "border-[#4F8EF7]"}`}
                            />
                            <span className={`absolute -bottom-1 -right-1 text-[9px] font-mono font-bold bg-[#0F1724] border px-1 rounded-full ${isTopFit ? "text-emerald-400 border-emerald-400" : "text-[#4F8EF7] border-[#4F8EF7]"}`}>
                              #{idx + 1}
                            </span>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-white leading-tight">{cand.fullName}</h4>
                              <span className="text-[10px] font-mono text-[#94A3B8]">({cand.primaryRole || cand.currentRole})</span>
                              <span className="text-[9px] font-mono font-bold bg-[#4F8EF7]/10 text-[#4F8EF7] border border-[#4F8EF7]/30 px-1.5 py-0.5 rounded">
                                ID: {cand.employeeId}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-mono text-[#4F8EF7] mt-0.5">
                              <span>{cand.department}</span>
                              {cand.domain && <span className="text-[#94A3B8]">• Domain: {cand.domain}</span>}
                              {cand.experienceYears !== undefined && <span className="text-[#10B981]">• Exp: {cand.experienceYears} Yrs</span>}
                            </div>
                            {cand.primarySkills && cand.primarySkills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {cand.primarySkills.slice(0, 5).map((sk, i) => (
                                  <span key={i} className="text-[9px] font-mono bg-[#141E30] text-[#94A3B8] border border-[#2A384C] px-1.5 py-0.5 rounded">
                                    {sk}
                                  </span>
                                ))}
                                {cand.primarySkills.length > 5 && (
                                  <span className="text-[9px] font-mono text-[#94A3B8] self-center">+{cand.primarySkills.length - 5} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Match Score Badge */}
                        <div className="flex items-center gap-3">
                          <div className="text-right font-mono">
                            <span className="text-[9px] uppercase text-[#94A3B8] block">Overall Match</span>
                            <span className={`text-lg font-extrabold ${isHighMatch ? "text-emerald-400" : "text-amber-400"}`}>
                              {cand.overallMatchPct}%
                            </span>
                          </div>

                          <div className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase border ${
                            isHighMatch 
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" 
                              : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          }`}>
                            {isTopFit ? "Top Best Fit Resume" : isHighMatch ? "Client Ready" : "SkillGap Handoff Needed"}
                          </div>
                        </div>
                      </div>

                      {/* Sub-Score Metrics Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-[#2A384C]/60 text-[10px] font-mono">
                        <div className="bg-[#0A0A0A] p-2 rounded border border-[#2A384C]/80">
                          <span className="text-[#94A3B8] block">Technical Match</span>
                          <span className="text-white font-bold text-xs">{cand.technicalMatchPct}%</span>
                        </div>
                        <div className="bg-[#0A0A0A] p-2 rounded border border-[#2A384C]/80">
                          <span className="text-[#94A3B8] block">Domain Match</span>
                          <span className="text-white font-bold text-xs">{cand.domainMatchPct}%</span>
                        </div>
                        <div className="bg-[#0A0A0A] p-2 rounded border border-[#2A384C]/80">
                          <span className="text-[#94A3B8] block">Capability Index</span>
                          <span className="text-white font-bold text-xs">{cand.capabilityReadiness}/100</span>
                        </div>
                        <div className="bg-[#0A0A0A] p-2 rounded border border-[#2A384C]/80">
                          <span className="text-[#94A3B8] block">Verified Evidence</span>
                          <span className="text-emerald-400 font-bold text-xs">{cand.verifiedEvidenceCount} Artifacts</span>
                        </div>
                      </div>

                      {/* Natural Language Explanation Card */}
                      <div className="mt-3 p-3 bg-[#0A0A0A] rounded-lg border border-[#2A384C] text-xs text-[#E0E0E0] space-y-2">
                        <p className="leading-relaxed text-[#94A3B8] font-mono text-[11px]">
                          <strong className="text-white">Fit Rationale:</strong> {cand.matchExplanation}
                        </p>

                        {cand.missingSkills.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>Identified Competency Gaps:</span>
                            {cand.missingSkills.map((sk, i) => (
                              <span key={i} className="bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                {sk}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions Toolbar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenResumeFlow(cand);
                          }}
                          className="flex items-center gap-1.5 bg-[#141E30] hover:bg-[#1E293B] text-[#4F8EF7] border border-[#4F8EF7]/50 text-xs font-mono font-semibold py-1.5 px-3 rounded transition-all cursor-pointer"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Client Resume Readiness
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleHandoff(cand);
                          }}
                          disabled={isHandingOff}
                          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-[#0F1724] text-xs font-mono font-bold py-1.5 px-3 rounded transition-all cursor-pointer shadow-md"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {isHandingOff ? "Triggering Evaluation..." : "Trigger Evaluation & Find Skill Gaps"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Client Resume Readiness Checklist & Generator */}
      {showResumeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0F1724] border border-[#2A384C] rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl relative my-8">
            <div className="flex items-center justify-between border-b border-[#2A384C] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#141E30] text-[#4F8EF7] rounded-lg border border-[#4F8EF7]/40">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Client Resume Readiness</h3>
                  <p className="text-xs font-mono text-[#94A3B8]">
                    {activeResumeCandidate?.fullName} • {selectedDemand?.projectName || "Requisition"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowResumeModal(false);
                  setActiveResumeCandidate(null);
                  setEligibility(null);
                }}
                className="text-xs font-mono text-[#94A3B8] hover:text-white bg-[#141E30] px-3 py-1.5 rounded border border-[#2A384C] cursor-pointer"
              >
                Close Window
              </button>
            </div>

            {isCheckingEligibility && !eligibility ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <RefreshCw className="h-8 w-8 text-[#4F8EF7] animate-spin" />
                <p className="text-xs font-mono text-[#94A3B8]">Checking training, assessment, and skill growth status...</p>
              </div>
            ) : (
              <>
                {/* Eligibility Checklist */}
                {eligibility && (
                  <div className="space-y-2">
                    <ChecklistRow
                      done={eligibility.trainingComplete}
                      label="Project-hiring training track completed"
                      detail={!eligibility.trainingComplete ? "Assign and complete a learning track tied to this demand via the handoff below." : undefined}
                    />
                    <ChecklistRow
                      done={eligibility.assessmentCleared}
                      label="Post-training GROW assessment cleared by manager"
                      detail={!eligibility.assessmentCleared ? "Manager must evaluate and clear post-training readiness in the Manager GROW Coach Dashboard." : undefined}
                    />
                    <ChecklistRow
                      done={eligibility.skillGrowthIdentified}
                      label="Measurable skill growth since handoff"
                      detail={!eligibility.skillGrowthIdentified ? "Skill level increases must be recorded after completing training." : undefined}
                    />
                  </div>
                )}

                {/* Skill growth detail, when available */}
                {eligibility && eligibility.growthDetail.length > 0 && (
                  <div className="bg-[#0A0A0A] border border-[#2A384C] rounded-lg p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] font-mono">
                    {eligibility.growthDetail.map(g => (
                      <div key={g.skillId} className={`p-2 rounded border ${g.currentLevel > g.baselineLevel ? "border-emerald-500/40 bg-emerald-500/5" : "border-[#2A384C]"}`}>
                        <span className="text-[#94A3B8] block">{g.skillName}</span>
                        <span className={g.currentLevel > g.baselineLevel ? "text-emerald-400 font-bold" : "text-white"}>
                          {g.baselineLevel}/5 {g.currentLevel > g.baselineLevel ? `→ ${g.currentLevel}/5` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Guidance callout when resume generation is locked */}
                {eligibility && !eligibility.eligible && (
                  <div className="bg-[#141E30] border border-amber-500/30 rounded-lg p-3 text-xs font-mono text-amber-300 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <span className="font-bold block uppercase text-[10px] text-amber-400 mb-0.5">Resume Generation Locked</span>
                      <p className="text-[11px] leading-relaxed text-[#94A3B8]">
                        The Client Resume Generator unlocks once the candidate completes their assigned learning track and passes the Post-Training GROW Assessment evaluated by their manager in the Manager GROW Coach Dashboard.
                      </p>
                    </div>
                  </div>
                )}

                {/* Final Resume Generation - only reachable once eligible */}
                {isGeneratingResume ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-3 text-center">
                    <RefreshCw className="h-8 w-8 text-[#4F8EF7] animate-spin" />
                    <p className="text-xs font-mono text-[#94A3B8]">Generating verified client resume...</p>
                  </div>
                ) : clientResumeMarkdown ? (
                  <div className="bg-[#0A0A0A] border border-[#2A384C] rounded-xl p-6 text-xs text-[#E0E0E0] max-h-[50vh] overflow-y-auto font-sans leading-relaxed space-y-4">
                    <div className="markdown-body text-xs leading-relaxed space-y-3">
                      <ReactMarkdown>{clientResumeMarkdown}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleGenerateResume}
                    disabled={!eligibility?.eligible}
                    title={!eligibility?.eligible ? "All three checklist items must be complete first." : undefined}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#4F8EF7] hover:bg-[#3B82F6] disabled:bg-[#1E293B] disabled:text-[#64748B] disabled:cursor-not-allowed text-[#0F1724] font-bold text-xs py-2.5 px-4 rounded-lg font-mono uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5" /> Generate Client Resume
                  </button>
                )}

                {clientResumeMarkdown && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#2A384C]">
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Verified, zero-hallucination client resume generated.
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(clientResumeMarkdown);
                        alert("Client resume copied to clipboard!");
                      }}
                      className="bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-bold text-xs py-2 px-4 rounded-lg font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" /> Copy Resume Markdown
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL / BANNER: Multi-Agent Handoff Confirmation */}
      {handoffStatus && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0F1724] border-2 border-amber-500 rounded-xl p-5 max-w-md shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400 font-mono uppercase flex items-center gap-1.5">
              <Send className="h-4 w-4" /> Multi-Agent Payload Handoff Delivered
            </span>
            <button
              onClick={() => setHandoffStatus(null)}
              className="text-xs font-mono text-[#94A3B8] hover:text-white"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-[#E0E0E0] font-mono leading-relaxed">
            {handoffStatus.message}
          </p>

          <div className="bg-[#0A0A0A] p-3 rounded border border-[#2A384C] text-[11px] font-mono text-[#94A3B8] space-y-1">
            <p><strong className="text-white">Target Role:</strong> {handoffStatus.targetRole}</p>
            <p><strong className="text-white">Missing Competencies:</strong> {handoffStatus.missingSkills?.join(", ") || "None"}</p>
            <p><strong className="text-white">Client Interview Target:</strong> {handoffStatus.clientInterviewDate ? new Date(handoffStatus.clientInterviewDate).toLocaleDateString() : "Upcoming"}</p>
          </div>

          <p className="text-[10px] font-mono text-emerald-400 italic">
            → SkillGap-to-Growth Agent has dynamically scheduled a flexible, adaptive upskilling roadmap prioritized for this client interview date.
          </p>
        </div>
      )}

      {/* MODAL: Direct 1st-Level Assessment (MCQs + Video Q&A) */}
      {activeAssessmentCand && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-[#0F1724] border border-[#2A384C] rounded-2xl max-w-5xl w-full p-4 sm:p-6 space-y-4 shadow-2xl relative my-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30 rounded-lg">
                  <Video className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 px-2 py-0.5 rounded uppercase">
                      Direct 1st-Level Assessment Launched
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-0.5">
                    Candidate Evaluation: {activeAssessmentCand.candidateName}
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setActiveAssessmentCand(null)}
                className="text-xs font-mono text-[#94A3B8] hover:text-white bg-[#141E30] px-3 py-1.5 rounded border border-[#2A384C] cursor-pointer flex items-center gap-1"
              >
                <X className="h-4 w-4" />
                Close Assessment
              </button>
            </div>

            <SkillGapInterviewAgent
              currentUser={activeUser}
              initialRoleTitle={activeAssessmentCand.roleTitle}
              initialJobDescription={activeAssessmentCand.jdText}
              autoStartAssessment={true}
              candidateName={activeAssessmentCand.candidateName}
              onCloseModal={() => setActiveAssessmentCand(null)}
              onRedirectToConcierge={() => {
                setActiveAssessmentCand(null);
              }}
            />
          </div>
        </div>
      )}

    </div>
  );
};

