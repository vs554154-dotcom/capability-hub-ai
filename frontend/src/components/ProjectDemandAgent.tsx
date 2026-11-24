import React, { useState, useEffect, useRef } from "react";
import { ProjectDemand, CandidateMatch, ResumeEligibility } from "../types";
import { 
  FileText, Sparkles, Target, Briefcase, Users, Calendar, 
  CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Download, 
  Send, RefreshCw, Layers, MapPin, Award, Check, X, Circle, ThumbsUp, ThumbsDown, Search, Upload
} from "lucide-react";
import { parseUploadedFile } from "../utils/fileParser";
import { PageHeader } from "./ui/Page";
import { Markdown } from "./ui/Markdown";

// A demand date, or a dash when none was given.
const demandDate = (value?: string) => {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString() : "-";
};
const datePassed = (value?: string) => {
  const parsed = value ? new Date(value) : null;
  return !!parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() < new Date().setHours(0, 0, 0, 0);
};
// "5+ years" is stored as 5 to 5, and nothing at all as 0 to 0.
const yearsRange = (low: number, high: number) =>
  high > low ? `${low} - ${high} Years` : low > 0 ? `${low}+ Years` : "Any";
const PAGE = 10;
// The ranking in bands of overall fitment; 80 is the line below which a handoff is advised.
const BANDS = [
  { id: "strong", label: "Strong", range: "80%+", holds: (pct: number) => pct >= 80, tone: "text-emerald-400 border-emerald-500/40" },
  { id: "partial", label: "Partial", range: "60-79%", holds: (pct: number) => pct >= 60 && pct < 80, tone: "text-amber-400 border-amber-500/40" },
  { id: "low", label: "Low", range: "below 60%", holds: (pct: number) => pct < 60, tone: "text-[#94A3B8] border-[#2A384C]" },
] as const;
const asList = (text: string) => Array.from(new Set(text.split(",").map(s => s.trim()).filter(Boolean)));

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

export const ProjectDemandAgent: React.FC = () => {
  // Requisitions State
  const [demands, setDemands] = useState<ProjectDemand[]>([]);
  const [selectedDemand, setSelectedDemand] = useState<ProjectDemand | null>(null);
  const [isLoadingDemands, setIsLoadingDemands] = useState(false);

  // Raw JD Intake Form State
  const [rawJdText, setRawJdText] = useState("");
  const [isParsingJd, setIsParsingJd] = useState(false);
  const [parsedCompetencies, setParsedCompetencies] = useState<any>(null);
  const [parseError, setParseError] = useState("");
  const jdFileRef = useRef<HTMLInputElement>(null);
  const [jdFileName, setJdFileName] = useState("");

  // New Requisition Form Data. Every field starts empty and is on screen: the form used
  // to publish a hidden domain, location, team size and dates nobody had entered.
  const [projectName, setProjectName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [businessUnit, setBusinessUnit] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [requiredSkillsText, setRequiredSkillsText] = useState("");
  const [preferredSkills, setPreferredSkills] = useState<string[]>([]);
  const [techStack, setTechStack] = useState<string[]>([]);
  const [expMin, setExpMin] = useState("");
  const [expMax, setExpMax] = useState("");
  const [resourcesRequired, setResourcesRequired] = useState("1");
  const [clientInterviewDate, setClientInterviewDate] = useState("");
  const [expectedJoiningDate, setExpectedJoiningDate] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [location, setLocation] = useState("");
  const [domain, setDomain] = useState("");
  const [employmentType, setEmploymentType] = useState("Full-Time");
  const [isCreatingDemand, setIsCreatingDemand] = useState(false);
  const [createSuccessMsg, setCreateSuccessMsg] = useState("");
  const [createError, setCreateError] = useState("");

  // AI Matching Engine State
  const [candidateMatches, setCandidateMatches] = useState<CandidateMatch[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateMatch | null>(null);
  const [uncoveredSkills, setUncoveredSkills] = useState<string[]>([]);
  const [shownCandidates, setShownCandidates] = useState(PAGE);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [band, setBand] = useState<string | null>(null);
  const [demandSearch, setDemandSearch] = useState("");

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
  const [resumeError, setResumeError] = useState("");

  // Agent Handoff State
  const [handoffStatus, setHandoffStatus] = useState<any>(null);
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [handoffError, setHandoffError] = useState("");

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

  const handleJdFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = await parseUploadedFile(file);
      setRawJdText(parsed.extractedText);
      setJdFileName(parsed.fileName);
      setParseError("");
    } catch (err: any) {
      setJdFileName("");
      setParseError(err?.message || "The file could not be read.");
    } finally {
      if (jdFileRef.current) jdFileRef.current.value = "";   // the same file can be chosen again
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
      // Fill in only what was found; what the manager has typed is kept otherwise.
      const found = data.parsed;
      setParsedCompetencies(found);
      setParseError("");
      const fill = (value: string | undefined, set: (v: string) => void) => { if (value) set(value); };
      fill(found.projectName, setProjectName);
      fill(found.customerName, setCustomerName);
      fill(found.businessUnit, setBusinessUnit);
      fill(found.projectDescription, setProjectDescription);
      fill(found.requiredSkills.join(", "), setRequiredSkillsText);
      setPreferredSkills(found.preferredSkills);
      setTechStack(found.technologyStack);
      if (found.experienceRangeMax) {
        setExpMin(String(found.experienceRangeMin));
        setExpMax(String(found.experienceRangeMax));
      }
      setResourcesRequired(String(found.resourcesRequired));
      fill(found.clientInterviewDate?.slice(0, 10), setClientInterviewDate);
      fill(found.expectedJoiningDate?.slice(0, 10), setExpectedJoiningDate);
      setPriority(found.projectPriority);
      fill(found.location, setLocation);
      fill(found.domain, setDomain);
      fill(found.employmentType, setEmploymentType);
    } catch (err: any) {
      setParseError(err?.message || "The job description could not be read.");
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
      setCreateError("");
      const payload = {
        projectName,
        customerName,
        businessUnit,
        projectDescription: projectDescription || rawJdText.slice(0, 600),
        rawJobDescription: rawJdText,
        requiredSkills: asList(requiredSkillsText),
        preferredSkills,
        experienceRangeMin: Number(expMin) || 0,
        experienceRangeMax: Number(expMax) || 0,
        technologyStack: techStack,
        resourcesRequired: Number(resourcesRequired) || 1,
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

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
      setCreateSuccessMsg(`Published "${data.demand.projectName}". It is selected, and candidates are being matched.`);
      fetchDemands();
      setSelectedDemand(data.demand);
      setRawJdText("");
      setJdFileName("");
      setDemandSearch("");
      setParsedCompetencies(null);
      [setProjectName, setCustomerName, setBusinessUnit, setProjectDescription, setRequiredSkillsText,
        setExpMin, setExpMax, setClientInterviewDate, setExpectedJoiningDate, setLocation, setDomain]
        .forEach(clear => clear(""));
      setPreferredSkills([]);
      setTechStack([]);
      setResourcesRequired("1");
      setPriority("MEDIUM");
    } catch (err: any) {
      setCreateError(err?.message || "The requisition could not be published.");
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
      setMatchError("");
      setCandidateMatches(data.matches || []);
      setUncoveredSkills(data.uncoveredSkills || []);
      setShownCandidates(PAGE);
      setCandidateSearch("");
      setBand(null);
      setSelectedCandidate(data.matches?.[0] ?? null);
    } catch (err: any) {
      // Never leave another demand's ranking on screen under this one.
      setCandidateMatches([]);
      setUncoveredSkills([]);
      setMatchError(err?.message || "Candidates could not be matched.");
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
    setEligibility(null);
    setResumeError("");
    await checkEligibility(cand);
  };

  const checkEligibility = async (cand: CandidateMatch) => {
    if (!selectedDemand) return;
    try {
      setIsCheckingEligibility(true);
      const res = await fetch(`/api/project-demand/${selectedDemand.id}/resume-eligibility/${cand.employeeId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
      setEligibility(data);
    } catch (err: any) {
      setResumeError(err?.message || "Readiness could not be checked.");
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
      setResumeError("");
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
        // Sent as `resume`; this read `markdownResume`, so the resume never appeared.
        setClientResumeMarkdown(data.resume);
      } else {
        const err = await res.json().catch(() => ({}));
        setResumeError(err.error || `The server answered ${res.status}.`);
        // Backend re-checks the same gate - if the UI's cached eligibility went stale
        // (e.g. another manager acted in the meantime), refresh it instead of just failing.
        if (err.eligibility) setEligibility(err.eligibility);
      }
    } catch {
      setResumeError("The server could not be reached.");
    } finally {
      setIsGeneratingResume(false);
    }
  };

  // 7. Hand off to the SkillGap-to-Growth agent. The Level-1 assessment is then the
  // candidate's to take, in their own SkillGap agent, which opens with this project. (It
  // used to open here, so the manager would have answered it, for nobody's record.)
  const handleHandoff = async (cand: CandidateMatch) => {
    if (!selectedDemand) return;
    try {
      setIsHandingOff(true);
      setHandoffStatus(null);
      setHandoffError("");
      const res = await fetch("/api/project-demand/handoff-skillgap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: cand.employeeId,
          demandId: selectedDemand.id
        })
      });
      if (res.ok) {
        const data = await res.json();
        setHandoffStatus({ ...data, candidateName: cand.fullName });
      } else {
        const data = await res.json().catch(() => ({}));
        setHandoffError(`Not handed off: ${data.error || `the server answered ${res.status}`}.`);
      }
    } catch {
      setHandoffError("Not handed off: the server could not be reached.");
    } finally {
      setIsHandingOff(false);
    }
  };

  const wanted = demandSearch.trim().toLowerCase();
  const visibleDemands = demands.filter(d => !wanted || [d.projectName, d.customerName, d.domain, ...d.requiredSkills]
    .some(text => (text || "").toLowerCase().includes(wanted)));
  const whom = candidateSearch.trim().toLowerCase();
  // The place in the ranking is kept, so a filtered list still says who is first.
  const inBand = BANDS.find(b => b.id === band);
  const ranked = candidateMatches.map((cand, idx) => ({ cand, idx }))
    .filter(({ cand }) => !inBand || inBand.holds(cand.overallMatchPct)).filter(({ cand }) => !whom ||
    [cand.fullName, cand.employeeId, cand.currentRole, cand.department, ...(cand.primarySkills || [])]
      .some(text => (text || "").toLowerCase().includes(whom)));
  const bestTechnical = candidateMatches[0]?.technicalMatchPct ?? 0;

  return (
    <div className="space-y-8 py-6">
      
      <PageHeader
        eyebrow="Demand to deploy · Talent sourcing"
        icon={Target}
        title="From client demand to the right people"
        lede={
          <>
            Where the loop starts. Capture a client's demand, rank every employee against it with
            a written reason for each, and hand the missing skills to the SkillGap agent. Once a
            person has trained, been assessed and signed off, generate their client resume from
            verified facts only.
          </>
        }
        steps={[
          <><strong>Pick a demand</strong> or paste a new job description for Gemini to parse.</>,
          <><strong>Match</strong>: every employee scored, with "why this candidate".</>,
          <><strong>Hand off gaps</strong> to start upskilling against a captured baseline.</>,
          <><strong>Generate the resume</strong> once training is signed off.</>,
        ]}
        actions={
          <button type="button" onClick={() => fetchDemands()} className="header-btn">
            <RefreshCw className={`h-4 w-4 ${isLoadingDemands ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh demands
          </button>
        }
      />

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

            <label className="flex items-center gap-2 bg-[#0A0A0A] border border-[#2A384C] rounded-lg px-3 py-2">
              <Search className="h-3.5 w-3.5 text-[#94A3B8] shrink-0" aria-hidden="true" />
              <input
                id="demand-search"
                value={demandSearch}
                onChange={(e) => setDemandSearch(e.target.value)}
                placeholder="Find by project, client, industry or skill"
                aria-label="Find a requisition"
                className="w-full bg-transparent text-xs text-[#F0F4FF] placeholder-[#555] focus:outline-none"
              />
            </label>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {visibleDemands.length === 0 && !isLoadingDemands && (
                <p className="text-xs text-[#94A3B8]">No requisition matches "{demandSearch}".</p>
              )}
              {visibleDemands.map((dem) => {
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
                        <Calendar className="h-3 w-3 text-emerald-400" /> Interview: {demandDate(dem.clientInterviewDate)}{datePassed(dem.clientInterviewDate) ? " (passed)" : ""}
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
              Paste a job description or upload it as PDF, Word or text. The parser reads the required and
              optional skills, years of experience and dates; check them, then publish to rank everyone.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => jdFileRef.current?.click()}
                className="flex items-center gap-1.5 bg-[#141E30] hover:bg-[#1E293B] text-[#4F8EF7] border border-[#4F8EF7]/50 text-xs font-mono font-semibold py-1.5 px-3 rounded cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Upload a JD file
              </button>
              {jdFileName && <span className="text-[11px] text-[#94A3B8] truncate">{jdFileName}</span>}
              <input
                ref={jdFileRef}
                id="demand-jd-file"
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={(e) => handleJdFile(e.target.files?.[0])}
                className="hidden"
              />
            </div>

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

            {parseError && <p role="alert" className="text-[11px] text-rose-400">{parseError}</p>}

            {/* Render Parsed Competency Preview */}
            {parsedCompetencies && (
              <div className="bg-[#141E30] border border-emerald-500/40 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 font-mono uppercase flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Competencies Extracted
                  </span>
                  {parsedCompetencies.domain && (
                    <span className="text-[10px] font-mono text-[#94A3B8]">Domain: {parsedCompetencies.domain}</span>
                  )}
                </div>
                {parsedCompetencies._fallback && (
                  <p role="status" className="text-[11px] text-amber-400">
                    The AI model was unavailable. Skills in the catalogue, years and the interview date were read from the text; fill in the rest below.
                  </p>
                )}
                {parsedCompetencies.requiredSkills.length === 0 && (
                  <p className="text-[11px] text-[#94A3B8]">No skill was recognised in the text. Enter the required skills below.</p>
                )}

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
                  <label className="text-[10px] font-mono uppercase text-[#94A3B8]">
                    {parsedCompetencies.preferredSkills?.length ? "Optional Skills:" : "Extracted Tech Stack:"}
                  </label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(parsedCompetencies.preferredSkills?.length
                      ? parsedCompetencies.preferredSkills : parsedCompetencies.technologyStack
                    )?.map((t: string, idx: number) => (
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
                    required
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
                    required
                    placeholder="e.g. Apex Global Financials"
                    className="w-full bg-[#0A0A0A] border border-[#2A384C] rounded p-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="demand-skills" className="text-[10px] font-mono uppercase text-[#94A3B8]">Required Skills (separated by commas)</label>
                <input
                  id="demand-skills"
                  type="text"
                  required
                  value={requiredSkillsText}
                  onChange={(e) => setRequiredSkillsText(e.target.value)}
                  placeholder="e.g. Java, Spring Boot, SQL"
                  className="w-full bg-[#0A0A0A] border border-[#2A384C] rounded p-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {([
                  ["demand-unit", "Business Unit", businessUnit, setBusinessUnit, "text", true, "e.g. Banking"],
                  ["demand-domain", "Domain", domain, setDomain, "text", false, "e.g. Banking"],
                  ["demand-exp-min", "Experience from (years)", expMin, setExpMin, "number", false, ""],
                  ["demand-exp-max", "Experience to (years)", expMax, setExpMax, "number", false, ""],
                  ["demand-people", "People needed", resourcesRequired, setResourcesRequired, "number", true, ""],
                  ["demand-location", "Location", location, setLocation, "text", false, "e.g. Hybrid"],
                ] as [string, string, string, (v: string) => void, string, boolean, string][]).map(
                  ([id, label, value, set, type, required, hint]) => (
                    <div key={id}>
                      <label htmlFor={id} className="text-[10px] font-mono uppercase text-[#94A3B8]">{label}</label>
                      <input
                        id={id}
                        type={type}
                        min={type === "number" ? 0 : undefined}
                        required={required}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        placeholder={hint}
                        className="w-full bg-[#0A0A0A] border border-[#2A384C] rounded p-2 text-xs text-white"
                      />
                    </div>
                  )
                )}
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
                  <label htmlFor="demand-joining" className="text-[10px] font-mono uppercase text-[#94A3B8]">Expected Joining Date</label>
                  <input
                    id="demand-joining"
                    type="date"
                    value={expectedJoiningDate}
                    onChange={(e) => setExpectedJoiningDate(e.target.value)}
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
                <p role="status" className="text-xs font-mono text-emerald-400 text-center">{createSuccessMsg}</p>
              )}
              {createError && (
                <p role="alert" className="text-xs font-mono text-rose-400 text-center">Not published: {createError}</p>
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
                  <span className="text-white font-semibold">{yearsRange(selectedDemand.experienceRangeMin, selectedDemand.experienceRangeMax)}</span>
                </div>
                <div>
                  <span className="text-[#94A3B8] text-[9px] uppercase block">Interview Date:</span>
                  <span className="text-emerald-400 font-semibold">{demandDate(selectedDemand.clientInterviewDate)}{datePassed(selectedDemand.clientInterviewDate) ? " (passed)" : ""}</span>
                </div>
                <div>
                  <span className="text-[#94A3B8] text-[9px] uppercase block">Joining Target:</span>
                  <span className="text-white font-semibold">{demandDate(selectedDemand.expectedJoiningDate)}</span>
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
            ) : matchError ? (
              <div role="alert" className="p-8 text-center bg-[#0A0A0A] border border-rose-500/40 rounded-lg">
                <p className="text-xs font-mono text-rose-400">{matchError}</p>
              </div>
            ) : candidateMatches.length === 0 ? (
              <div className="p-8 text-center bg-[#0A0A0A] border border-[#2A384C] rounded-lg">
                <p className="text-xs font-mono text-[#94A3B8]">Select a requisition above and click 'Run AI Matching Engine'.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {handoffError && <p role="alert" className="text-xs font-mono text-rose-400">{handoffError}</p>}
                {uncoveredSkills.length > 0 && (
                  <div role="status" id="uncovered-skills" className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-lg text-xs text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      No one in the pool has {uncoveredSkills.join(", ")}.{" "}
                      {bestTechnical < 50
                        ? "The people below are the closest profiles, not a fit; consider hiring or longer training."
                        : "Plan training or hiring for that."}
                    </span>
                  </div>
                )}
                <div id="fitment-bands" className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Filter the ranking by fitment">
                  {[{ id: null, label: "All", range: "everyone", holds: () => true, tone: "text-[#4F8EF7] border-[#4F8EF7]/40" }, ...BANDS].map(b => (
                    <button
                      key={b.label}
                      type="button"
                      aria-pressed={band === b.id}
                      onClick={() => { setBand(b.id); setShownCandidates(PAGE); }}
                      className={`text-left rounded-lg border px-3 py-2 bg-[#0A0A0A] cursor-pointer ${b.tone} ${band === b.id ? "ring-2 ring-[#4F8EF7]" : ""}`}
                    >
                      <span className="block text-lg font-extrabold leading-tight">{candidateMatches.filter(c => b.holds(c.overallMatchPct)).length}</span>
                      <span className="block text-[10px] font-mono text-[#94A3B8]">{b.label} · {b.range}</span>
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 bg-[#0A0A0A] border border-[#2A384C] rounded-lg px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-[#94A3B8] shrink-0" aria-hidden="true" />
                  <input
                    id="candidate-search"
                    value={candidateSearch}
                    onChange={(e) => { setCandidateSearch(e.target.value); setShownCandidates(PAGE); }}
                    placeholder="Find by name, role, department or skill"
                    aria-label="Find a person in the ranking"
                    className="w-full bg-transparent text-xs text-[#F0F4FF] placeholder-[#555] focus:outline-none"
                  />
                </label>
                {ranked.length === 0 && <p className="text-xs text-[#94A3B8]">{whom ? `No one here matches "${candidateSearch}".` : "No one is in this band for this opening."}</p>}
                {ranked.slice(0, shownCandidates).map(({ cand, idx }) => {
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
                        <div className={`absolute -top-3 right-4 ${bestTechnical >= 50 ? "bg-emerald-500" : "bg-amber-500"} text-[#0F1724] font-mono text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1`}>
                          {bestTechnical >= 50 ? <><CheckCircle2 className="h-3 w-3" /> #1 Best Fit Resume</> : "Closest profile"}
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
                            {isHighMatch ? (cand.missingSkills.length ? "Strong match, with gaps" : "Meets every skill") : "SkillGap Handoff Needed"}
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
                          {isHandingOff ? "Handing off..." : "Hand off to SkillGap agent"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {ranked.length > shownCandidates && (
                  <button
                    id="show-more-candidates"
                    type="button"
                    onClick={() => setShownCandidates(n => n + PAGE)}
                    className="w-full bg-[#141E30] hover:bg-[#1E293B] text-[#4F8EF7] border border-[#4F8EF7]/50 text-xs font-mono font-bold py-2.5 px-4 rounded-lg cursor-pointer"
                  >
                    Show {Math.min(PAGE, ranked.length - shownCandidates)} more of {ranked.length}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Client Resume Readiness Checklist & Generator */}
      {showResumeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0F1724] border border-[#2A384C] rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl relative">
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
                      detail={!eligibility.trainingComplete ? "Assign a track for this project on the Team board or the L&D page; the employee completes it." : undefined}
                    />
                    <ChecklistRow
                      done={eligibility.assessmentCleared}
                      label="Post-training GROW assessment cleared by manager"
                      detail={!eligibility.assessmentCleared ? "Their manager runs the Post-Training GROW Assessment on the Team board and clears it." : undefined}
                    />
                    <ChecklistRow
                      done={eligibility.skillGrowthIdentified}
                      label="Measurable skill growth since handoff"
                      detail={!eligibility.skillGrowthIdentified ? "A skill level must rise: the employee submits evidence and their manager approves it." : undefined}
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
                      <ul className="text-[11px] leading-relaxed text-[#94A3B8] list-disc pl-4">
                        {eligibility.reasons.map(reason => <li key={reason}>{reason}</li>)}
                      </ul>
                    </div>
                  </div>
                )}

                {resumeError && <p role="alert" className="text-xs font-mono text-rose-400">{resumeError}</p>}

                {/* Final Resume Generation - only reachable once eligible */}
                {isGeneratingResume ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-3 text-center">
                    <RefreshCw className="h-8 w-8 text-[#4F8EF7] animate-spin" />
                    <p className="text-xs font-mono text-[#94A3B8]">Generating verified client resume...</p>
                  </div>
                ) : clientResumeMarkdown ? (
                  <div className="bg-[#0A0A0A] border border-[#2A384C] rounded-xl p-6 text-xs text-[#E0E0E0] max-h-[50vh] overflow-y-auto font-sans leading-relaxed space-y-4">
                    <Markdown className="text-xs leading-relaxed">{clientResumeMarkdown}</Markdown>
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
                      <CheckCircle2 className="h-3.5 w-3.5" /> Written from verified records only. Review it before sending.
                    </span>
                    <button
                      onClick={() => {
                        // Say whether the copy worked; it can be refused by the browser.
                        navigator.clipboard.writeText(clientResumeMarkdown).then(
                          () => alert("Client resume copied to the clipboard."),
                          () => alert("The browser did not allow copying. Select the resume text and copy it instead."),
                        );
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
              <Send className="h-4 w-4" /> Handed off to the SkillGap agent
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
            <p><strong className="text-white">Client Interview Target:</strong> {demandDate(handoffStatus.clientInterviewDate)}{handoffStatus.interviewPassed ? " (passed - agree a new date)" : ""}</p>
          </div>

          <p className="text-[10px] font-mono text-emerald-400 italic">
            Next: {handoffStatus.candidateName} takes the Level-1 assessment in their SkillGap agent, which opens with this project. Then assign a project track from the Team board or the L&D page.
          </p>
        </div>
      )}

    </div>
  );
};

