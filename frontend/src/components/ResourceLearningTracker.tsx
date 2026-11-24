import React, { useState, useEffect } from "react";
import { ResourceLearningProgress } from "../types";
import { GraduationCap, Clock, Target, Calendar, CheckCircle2, Zap, BookOpen, Wrench, Plus, RefreshCw, Search, Send, Sparkles, X, ChevronRight, Award } from "lucide-react";

const PAGE = 9;

interface ResourceLearningTrackerProps {
  /** Called after a track is assigned, so the page around it can refresh. */
  onAssigned?: () => void;
}

type Format = "balanced" | "micro" | "in_depth" | "best_practice";

// A track the server built from the employee's own gaps.
interface SuggestedTrack {
  demand: { id: string; projectName: string } | null;
  interviewPassed: boolean;
  suggestedDeadline: string;
  gaps: { skillName: string; current: number | null; target: number | null; sources: string[] }[];
  gapsNotCovered: number;
  steps: { title: string; courseName: string; provider: string; learningType: string; phaseLabel: string }[];
  replacesSteps: number;
}

export const ResourceLearningTracker: React.FC<ResourceLearningTrackerProps> = ({ onAssigned }) => {
  const [resources, setResources] = useState<ResourceLearningProgress[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [assignSuccessMsg, setAssignSuccessMsg] = useState("");
  const [assignErrorMsg, setAssignErrorMsg] = useState("");

  // Assign Modal State
  const [selectedUserForAssign, setSelectedUserForAssign] = useState<ResourceLearningProgress | null>(null);
  // Whether the track is for the project the employee was handed off to. Only such a
  // track can unlock a client resume, and no track used to be tied to one.
  const [forProject, setForProject] = useState(false);
  const [stepFormat, setStepFormat] = useState<Format>("balanced");
  const [customDeadline, setCustomDeadline] = useState("");
  const [customDeadlineType, setCustomDeadlineType] = useState<"client_interview" | "project_deadline" | "learner_set" | "manager_assigned">("client_interview");
  const [track, setTrack] = useState<SuggestedTrack | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  const fetchTrackerData = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/learning-tracker/resources");
      if (res.ok) {
        const data = await res.json();
        setResources(data);
      }
    } catch (err) {
      console.error("Failed to load resource learning progress:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackerData();
  }, []);

  const handleOpenAssignModal = (resItem: ResourceLearningProgress) => {
    setSelectedUserForAssign(resItem);
    setForProject(!!resItem.activeProject);
    setStepFormat("balanced");
    setCustomDeadlineType(resItem.activeProject ? "client_interview" : "manager_assigned");
    setAssignErrorMsg("");
  };

  const closeModal = () => {
    setSelectedUserForAssign(null);
    setTrack(null);
    setAssignErrorMsg("");
  };

  // The steps come from this person's gaps. (Everyone used to be assigned the same
  // fixed Java and Selenium steps, whatever they were missing.)
  useEffect(() => {
    if (!selectedUserForAssign) return;
    let cancelled = false;
    setTrack(null);
    fetch("/api/learning-plan/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: selectedUserForAssign.userId,
        demandId: forProject ? selectedUserForAssign.activeProject?.id : undefined,
        format: stepFormat,
      }),
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `The server answered ${res.status}`);
        if (cancelled) return;
        setTrack(data);
        setCustomDeadline(data.suggestedDeadline);
        setAssignErrorMsg("");
      })
      .catch(err => !cancelled && setAssignErrorMsg(`The track could not be built: ${err.message}.`));
    return () => { cancelled = true; };
  }, [selectedUserForAssign, forProject, stepFormat]);

  const handleAssignFlexibleTrack = async () => {
    if (!selectedUserForAssign || !track) return;
    setIsAssigning(true);
    try {
      const res = await fetch("/api/learning-plan/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserForAssign.userId,
          demandId: track.demand?.id,
          targetDeadline: customDeadline,
          deadlineType: customDeadlineType,
          steps: track.steps
        })
      });

      if (res.ok) {
        setAssignSuccessMsg(
          `Assigned ${track.steps.length} steps to ${selectedUserForAssign.userName}`
          + `${track.demand ? ` for ${track.demand.projectName}` : ""}, due ${customDeadline}. They have been told in their inbox.`
        );
        closeModal();
        fetchTrackerData();
        onAssigned?.();
        setTimeout(() => setAssignSuccessMsg(""), 6000);
      } else {
        // A refused assignment used to leave the dialog open with no explanation.
        const data = await res.json().catch(() => ({}));
        setAssignErrorMsg(`Not assigned: ${data.error || `the server answered ${res.status}`}.`);
      }
    } catch (err) {
      console.error(err);
      setAssignErrorMsg("Not assigned: the server could not be reached.");
    } finally {
      setIsAssigning(false);
    }
  };

  const wanted = search.trim().toLowerCase();
  const found = resources.filter(r => !wanted || [r.userName, r.userTitle, r.department, r.activeProject?.projectName]
    .some(text => (text || "").toLowerCase().includes(wanted)));

  return (
    <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg space-y-6">
      
      {/* Toast Alert */}
      {assignSuccessMsg && (
        <div className="p-3 bg-[#10B981]/10 border border-[#10B981]/40 text-[#10B981] font-mono text-xs rounded-md flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#10B981]" />
          <span>{assignSuccessMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#2A384C] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-[#4F8EF7]" />
            <h3 className="text-base font-bold text-[#F0F4FF]">Employee & Resource Learning Progress Tracker</h3>
          </div>
          <p className="text-xs text-[#94A3B8] mt-1">
            Real-time tracking of employee learning progress, target interview deadlines, quiz validation scores, and micro vs in-depth course completion.
          </p>
        </div>

        <button
          onClick={fetchTrackerData}
          disabled={isLoading}
          className="px-3 py-1.5 bg-[#1E293B] hover:bg-[#2A384C] text-[#F0F4FF] border border-[#2A384C] text-xs font-mono font-bold rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-[#4F8EF7] ${isLoading ? "animate-spin" : ""}`} />
          Refresh Progress
        </button>
      </div>

      {resources.length > PAGE && (
        <label className="flex items-center gap-2 bg-[#0F1724] border border-[#2A384C] rounded-lg px-3 py-2">
          <Search className="h-3.5 w-3.5 text-[#94A3B8] shrink-0" aria-hidden="true" />
          <input
            id="tracker-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }}
            placeholder="Find by name, job title, department or project"
            aria-label="Find a person in the learning tracker"
            className="w-full bg-transparent text-xs text-[#F0F4FF] placeholder-[#555] focus:outline-none"
          />
          <span className="text-[11px] text-[#94A3B8] whitespace-nowrap">{found.length} of {resources.length}</span>
        </label>
      )}

      {/* Resource Learning Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
        {found.slice(0, shown).map((item) => {
          const statusBadge = item.status === "completed" ? (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/40">
              Completed Track
            </span>
          ) : item.status === "in_progress" ? (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-[#4F8EF7]/10 text-[#4F8EF7] border border-[#4F8EF7]/40">
              In Progress
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-[#1E293B] text-[#94A3B8] border border-[#2A384C]">
              Not Started
            </span>
          );

          return (
            <div key={item.userId} className="p-5 bg-[#0F1724] border border-[#2A384C] rounded-lg hover:border-[#4F8EF7]/50 transition-all space-y-4 flex flex-col justify-between">
              <div>
                {/* Employee Info Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={item.userAvatar}
                      alt={item.userName}
                      className="h-10 w-10 rounded-full object-cover border border-[#4F8EF7]"
                    />
                    <div>
                      <h4 className="text-sm font-bold text-[#F0F4FF]">{item.userName}</h4>
                      <p className="text-[10px] text-[#94A3B8] font-mono">{item.userTitle} ({item.department})</p>
                    </div>
                  </div>
                  {statusBadge}
                </div>
                {item.activeProject && (
                  <p className="text-[11px] mb-3 text-[#94A3B8]">
                    Handed off to <strong className="text-[#F0F4FF]">{item.activeProject.projectName}</strong>
                    {item.planIsForProject ? " - this plan is for it." : " - no track for it yet."}
                  </p>
                )}

                {/* Target Deadline Badge */}
                <div className="p-2.5 bg-[#141E30] rounded-md border border-[#2A384C] space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#94A3B8] font-mono flex items-center gap-1">
                      <Target className="h-3.5 w-3.5 text-[#4F8EF7]" /> Target Deadline:
                    </span>
                    <span className="font-mono font-bold text-[#F0F4FF]">{item.targetDeadline ?? "not set"}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-[#94A3B8]">Category:</span>
                    <span className="text-[#10B981] font-bold uppercase">{item.deadlineType?.replace("_", " ") ?? "no plan"}</span>
                  </div>
                </div>

                {/* Overall Progress Meter */}
                <div className="space-y-1.5 mt-3">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-[#94A3B8]">Learning Track Progress:</span>
                    <span className="font-bold text-[#4F8EF7]">{item.overallProgressPercent}% ({item.completedSteps}/{item.totalSteps} Steps)</span>
                  </div>
                  <div className="w-full bg-[#1E293B] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#4F8EF7] h-full transition-all duration-300"
                      style={{ width: `${item.overallProgressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Formats & Time Stats */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[#2A384C]/60 text-[10px] font-mono">
                  <div className="p-2 bg-[#141E30] rounded border border-[#2A384C]">
                    <span className="text-[#94A3B8] block">Quiz Validation Avg:</span>
                    <span className="font-bold text-[#10B981] text-xs block">{item.averageQuizScore === null ? "None yet" : `${item.averageQuizScore}% Score`}</span>
                  </div>
                  <div className="p-2 bg-[#141E30] rounded border border-[#2A384C]">
                    <span className="text-[#94A3B8] block">Total Time Logged:</span>
                    <span className="font-bold text-[#F0F4FF] text-xs block">{item.totalTimeSpentMins} mins</span>
                  </div>
                </div>

                {/* Modalities Chips */}
                <div className="flex items-center gap-2 mt-3 text-[10px] font-mono">
                  <span className="text-[#94A3B8]">Format Mix:</span>
                  <span className="px-1.5 py-0.5 bg-[#10B981]/10 text-[#10B981] rounded border border-[#10B981]/30">
                    ⚡ {item.microCount} Micro
                  </span>
                  <span className="px-1.5 py-0.5 bg-[#4F8EF7]/10 text-[#4F8EF7] rounded border border-[#4F8EF7]/30">
                    🎓 {item.inDepthCount} In-Depth
                  </span>
                  <span className="px-1.5 py-0.5 bg-[#F59E0B]/10 text-[#F59E0B] rounded border border-[#F59E0B]/30">
                    🛠️ {item.bestPracticeCount} Practice
                  </span>
                </div>
              </div>

              {/* Assign Action */}
              <div className="pt-3 border-t border-[#2A384C]">
                <button
                  onClick={() => handleOpenAssignModal(item)}
                  className="w-full py-2 px-3 bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-mono text-xs font-bold rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Assign Tailored Learning Track
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {found.length === 0 && resources.length > 0 && (
        <p className="text-xs text-[#94A3B8]">No one matches "{search}".</p>
      )}
      {found.length > shown && (
        <button
          id="tracker-show-more"
          type="button"
          onClick={() => setShown(n => n + PAGE)}
          className="w-full bg-[#0F1724] hover:bg-[#1E293B] text-[#4F8EF7] border border-[#4F8EF7]/50 text-xs font-mono font-bold py-2.5 px-4 rounded-lg cursor-pointer"
        >
          Show {Math.min(PAGE, found.length - shown)} more of {found.length}
        </button>
      )}

      {/* Assign Tailored Track Modal */}
      {selectedUserForAssign && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-[#4F8EF7]" />
                <h3 className="text-sm font-bold text-[#F0F4FF]">Assign Flexible Learning Track</h3>
              </div>
              <button onClick={closeModal} aria-label="Close" className="text-[#94A3B8] hover:text-[#F0F4FF] cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 bg-[#0F1724] rounded-md border border-[#2A384C] flex items-center gap-3">
              <img
                src={selectedUserForAssign.userAvatar}
                alt={selectedUserForAssign.userName}
                className="h-10 w-10 rounded-full border border-[#4F8EF7]"
              />
              <div>
                <span className="font-bold text-[#F0F4FF] text-xs block">{selectedUserForAssign.userName}</span>
                <span className="text-[10px] text-[#94A3B8] font-mono">{selectedUserForAssign.userTitle} • {selectedUserForAssign.department}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="track-purpose" className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase block mb-1">
                  What this track is for
                </label>
                <select
                  id="track-purpose"
                  value={forProject ? "project" : "growth"}
                  onChange={(e) => setForProject(e.target.value === "project")}
                  className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs font-semibold p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                >
                  {selectedUserForAssign.activeProject && (
                    <option value="project">Project: {selectedUserForAssign.activeProject.projectName}</option>
                  )}
                  <option value="growth">Career growth (all open gaps)</option>
                </select>
                {!selectedUserForAssign.activeProject && (
                  <p className="text-[11px] text-[#94A3B8] mt-1">
                    Not handed off to a project yet, so this track cannot unlock a client resume.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase block mb-1">
                    Target Deadline Date
                  </label>
                  <input
                    type="date"
                    value={customDeadline}
                    onChange={(e) => setCustomDeadline(e.target.value)}
                    className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs font-semibold p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase block mb-1">
                    Deadline Type
                  </label>
                  <select
                    value={customDeadlineType}
                    onChange={(e: any) => setCustomDeadlineType(e.target.value)}
                    className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs font-semibold p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                  >
                    <option value="client_interview">Client Interview Date</option>
                    <option value="project_deadline">Project Onboarding Deadline</option>
                    <option value="learner_set">Learner Goal</option>
                    <option value="manager_assigned">Manager Target</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase block mb-1">
                  Learning Format Composition
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setStepFormat("balanced")}
                    className={`p-2.5 rounded-md text-xs font-mono font-bold text-center border cursor-pointer transition-all ${
                      stepFormat === "balanced"
                        ? "bg-[#4F8EF7]/20 border-[#4F8EF7] text-[#4F8EF7]"
                        : "bg-[#0F1724] border-[#2A384C] text-[#94A3B8]"
                    }`}
                  >
                    Balanced Mix
                  </button>
                  <button
                    type="button"
                    onClick={() => setStepFormat("micro")}
                    className={`p-2.5 rounded-md text-xs font-mono font-bold text-center border cursor-pointer transition-all ${
                      stepFormat === "micro"
                        ? "bg-[#10B981]/20 border-[#10B981] text-[#10B981]"
                        : "bg-[#0F1724] border-[#2A384C] text-[#94A3B8]"
                    }`}
                  >
                    ⚡ Micro (5-15m)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStepFormat("in_depth")}
                    className={`p-2.5 rounded-md text-xs font-mono font-bold text-center border cursor-pointer transition-all ${
                      stepFormat === "in_depth"
                        ? "bg-[#4F8EF7]/20 border-[#4F8EF7] text-[#4F8EF7]"
                        : "bg-[#0F1724] border-[#2A384C] text-[#94A3B8]"
                    }`}
                  >
                    🎓 In-Depth
                  </button>
                  <button
                    type="button"
                    onClick={() => setStepFormat("best_practice")}
                    className={`p-2.5 rounded-md text-xs font-mono font-bold text-center border cursor-pointer transition-all ${
                      stepFormat === "best_practice"
                        ? "bg-[#F59E0B]/20 border-[#F59E0B] text-[#F59E0B]"
                        : "bg-[#0F1724] border-[#2A384C] text-[#94A3B8]"
                    }`}
                  >
                    🛠️ Best Practice
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#0F1724] rounded-md border border-[#2A384C] text-xs space-y-2">
              <strong className="text-[#F0F4FF] block">Built from {selectedUserForAssign.userName}'s gaps</strong>
              {!track ? (
                !assignErrorMsg && <div className="skeleton h-16" />
              ) : track.steps.length === 0 ? (
                <p className="text-[#94A3B8]">No open gap is on record, so there is nothing to build a track from.</p>
              ) : (
                <>
                  <ol id="track-steps" className="space-y-1 text-[#94A3B8] list-decimal pl-4">
                    {track.steps.map((step, i) => (
                      <li key={i}><span className="text-[#F0F4FF]">{step.title}</span> - {step.courseName} ({step.provider})</li>
                    ))}
                  </ol>
                  {track.gapsNotCovered > 0 && (
                    <p className="text-[#94A3B8]">{track.gapsNotCovered} more gap{track.gapsNotCovered === 1 ? "" : "s"} left for later, to fit the deadline.</p>
                  )}
                  {track.interviewPassed && (
                    <p className="text-amber-400">The project's interview date has passed, so the suggested deadline is two weeks from today.</p>
                  )}
                </>
              )}
              {track && track.replacesSteps > 0 && (
                <p className="text-amber-400">This replaces the current plan and its progress ({track.replacesSteps} step{track.replacesSteps === 1 ? "" : "s"}).</p>
              )}
            </div>

            {assignErrorMsg && (
              <div role="alert" className="p-3 bg-rose-500/10 border border-rose-500/40 text-rose-400 font-mono text-xs rounded-md">
                {assignErrorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2A384C]">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-[#1E293B] text-[#94A3B8] text-xs font-mono font-bold rounded-md"
              >
                Cancel
              </button>
              <button
                id="assign-track"
                onClick={handleAssignFlexibleTrack}
                disabled={isAssigning || !track || track.steps.length === 0 || !customDeadline}
                className="px-4 py-2 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] text-xs font-mono font-bold rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
                {isAssigning ? "Assigning..." : "Assign Flexible Track"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
