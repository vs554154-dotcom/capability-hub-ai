import React, { useState, useEffect } from "react";
import { ResourceLearningProgress, TargetRole, User } from "../types";
import { GraduationCap, Clock, Target, Calendar, CheckCircle2, Zap, BookOpen, Wrench, Plus, RefreshCw, Send, Sparkles, X, ChevronRight, Award } from "lucide-react";

interface ResourceLearningTrackerProps {
  roles: TargetRole[];
  teamMembers?: User[];
}

export const ResourceLearningTracker: React.FC<ResourceLearningTrackerProps> = ({ roles }) => {
  const [resources, setResources] = useState<ResourceLearningProgress[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [assignSuccessMsg, setAssignSuccessMsg] = useState("");

  // Assign Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUserForAssign, setSelectedUserForAssign] = useState<ResourceLearningProgress | null>(null);
  const [customTrackTitle, setCustomTrackTitle] = useState("Target Role Acceleration Track");
  const [customDeadline, setCustomDeadline] = useState("2026-08-20");
  const [customDeadlineType, setCustomDeadlineType] = useState<"client_interview" | "project_deadline" | "learner_set" | "manager_assigned">("client_interview");
  
  // Track Steps Builder
  const [stepFormat, setStepFormat] = useState<"micro" | "in_depth" | "best_practice" | "balanced">("balanced");

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
    setCustomTrackTitle(`${resItem.userName} - ${resItem.userTitle} Client Interview Fast-Track`);
    setCustomDeadline(resItem.targetDeadline || "2026-08-20");
    setShowAssignModal(true);
  };

  const handleAssignFlexibleTrack = async () => {
    if (!selectedUserForAssign) return;

    let stepsToAssign = [];
    if (stepFormat === "micro") {
      stepsToAssign = [
        {
          title: "Micro-Flashcards: Java OOP & Syntax Refresher",
          skillFocus: "Java Core & OOP Principles",
          courseName: "Java QA Quick-Notes",
          provider: "CapabilityHub Flashcards",
          milestone: "Complete 10 rapid-fire OOP conceptual checks",
          assessment: "OOP Quiz Check",
          targetScore: "80%",
          learningType: "micro" as const,
          estimatedDuration: "10 mins",
          phaseLabel: "Day 1 Sprint"
        },
        {
          title: "Micro-Check: Selenium Locator Strategies",
          skillFocus: "Selenium Automation Framework",
          courseName: "XPath & CSS Selectors Cheat-Sheet",
          provider: "CapabilityHub Micro-Lab",
          milestone: "Write 5 dynamic locators without brittle absolute paths",
          assessment: "Locator Validation Check",
          targetScore: "85%",
          learningType: "micro" as const,
          estimatedDuration: "15 mins",
          phaseLabel: "Day 2 Sprint"
        },
        {
          title: "Micro-Check: Postman Collection Runner",
          skillFocus: "Postman & REST API Testing",
          courseName: "REST API Quick Test Suite",
          provider: "CapabilityHub Micro-Lab",
          milestone: "Run automated API assertion tests in Postman",
          assessment: "Collection Runner Pass",
          targetScore: "85%",
          learningType: "micro" as const,
          estimatedDuration: "15 mins",
          phaseLabel: "Day 3 Sprint"
        }
      ];
    } else if (stepFormat === "in_depth") {
      stepsToAssign = [
        {
          title: "In-Depth: Enterprise Test Automation Architecture",
          skillFocus: "Test Framework Design",
          courseName: "Enterprise Test Framework Masterclass",
          provider: "Udemy",
          milestone: "Design Page Object Model with ThreadLocal Parallel Execution",
          assessment: "Framework Code Review",
          targetScore: "90%",
          learningType: "in_depth" as const,
          estimatedDuration: "3 hours",
          phaseLabel: "Phase 1: Architecture"
        },
        {
          title: "In-Depth: CI/CD Pipeline Automation & Quality Gates",
          skillFocus: "Jenkins & GitHub Actions Pipelines",
          courseName: "Jenkins, From Zero To Hero: Become a DevOps Jenkins Master",
          provider: "Udemy",
          milestone: "Configure headless regression triggers on GitHub PR merge",
          assessment: "Pipeline Execution Log Analysis",
          targetScore: "90%",
          learningType: "in_depth" as const,
          estimatedDuration: "10.5 hours",
          phaseLabel: "Phase 2: CI/CD Automation"
        }
      ];
    } else {
      // Balanced mix
      stepsToAssign = [
        {
          title: "Micro-Check: Core OOP & Java Fundamentals",
          skillFocus: "Java Core & OOP Principles",
          courseName: "Java Programming Masterclass covering Java 11 & Java 17",
          provider: "Udemy",
          milestone: "Complete class inheritance & exception handling quiz",
          assessment: "Java Core Assessment",
          targetScore: "80%",
          learningType: "micro" as const,
          estimatedDuration: "135 hours",
          phaseLabel: "Day 1: Prep"
        },
        {
          title: "Hands-on Lab: Selenium Page Object Model Setup",
          skillFocus: "Selenium Automation Framework",
          courseName: "Selenium WebDriver with Java - Basics to Advanced+Frameworks",
          provider: "Udemy",
          milestone: "Build POM framework for multi-page login and dashboard flow",
          assessment: "POM Code Assertion",
          targetScore: "85%",
          learningType: "best_practice" as const,
          estimatedDuration: "54 hours",
          phaseLabel: "Day 2: Hands-on Lab"
        },
        {
          title: "In-Depth: REST API Test Automation Suite",
          skillFocus: "Postman & REST API Testing",
          courseName: "Postman: The Complete Guide - REST API Testing",
          provider: "Udemy",
          milestone: "Automate REST endpoints with JSON schema assertions",
          assessment: "API Automation Suite Run",
          targetScore: "85%",
          learningType: "in_depth" as const,
          estimatedDuration: "15 hours",
          phaseLabel: "Day 3: Deep Dive"
        }
      ];
    }

    try {
      const res = await fetch("/api/learning-plan/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserForAssign.userId,
          trackTitle: customTrackTitle,
          targetDeadline: customDeadline,
          deadlineType: customDeadlineType,
          steps: stepsToAssign
        })
      });

      if (res.ok) {
        setAssignSuccessMsg(`Assigned new flexible learning track to ${selectedUserForAssign.userName}! Target deadline set to ${customDeadline}.`);
        setShowAssignModal(false);
        fetchTrackerData();
        setTimeout(() => setAssignSuccessMsg(""), 6000);
      }
    } catch (err) {
      console.error(err);
    }
  };

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

      {/* Resource Learning Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
        {resources.map((item) => {
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

                {/* Target Deadline Badge */}
                <div className="p-2.5 bg-[#141E30] rounded-md border border-[#2A384C] space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#94A3B8] font-mono flex items-center gap-1">
                      <Target className="h-3.5 w-3.5 text-[#4F8EF7]" /> Target Deadline:
                    </span>
                    <span className="font-mono font-bold text-[#F0F4FF]">{item.targetDeadline}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-[#94A3B8]">Category:</span>
                    <span className="text-[#10B981] font-bold uppercase">{item.deadlineType.replace("_", " ")}</span>
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
                    <span className="font-bold text-[#10B981] text-xs block">{item.averageQuizScore}% Score</span>
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

      {/* Assign Tailored Track Modal */}
      {showAssignModal && selectedUserForAssign && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 max-w-lg w-full shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-[#4F8EF7]" />
                <h3 className="text-sm font-bold text-[#F0F4FF]">Assign Flexible Learning Track</h3>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="text-[#94A3B8] hover:text-[#F0F4FF]">
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
                <label className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase block mb-1">
                  Learning Track Name
                </label>
                <input
                  type="text"
                  value={customTrackTitle}
                  onChange={(e) => setCustomTrackTitle(e.target.value)}
                  className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs font-semibold p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                />
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

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2A384C]">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 bg-[#1E293B] text-[#94A3B8] text-xs font-mono font-bold rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignFlexibleTrack}
                className="px-4 py-2 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] text-xs font-mono font-bold rounded-md flex items-center gap-1.5"
              >
                <Send className="h-4 w-4" />
                Assign Flexible Track
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
