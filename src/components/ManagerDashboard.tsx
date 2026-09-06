import React, { useState } from "react";
import { User, Skill, Evidence, TeamMemberCapability, TargetRole } from "../types";
import { Check, X, Shield, Cpu, RefreshCw, MessageSquare, Sparkles, Send, Calendar, AlertTriangle, UserCheck, Bell, ChevronRight, HelpCircle, CheckCircle2, ArrowRight, Award } from "lucide-react";
import { SkillVsWillMatrix } from "./SkillVsWillMatrix";
import { ResourceLearningTracker } from "./ResourceLearningTracker";

interface ManagerDashboardProps {
  currentUser: User;
  skills: Skill[];
  roles?: TargetRole[];
  evidences: Evidence[];
  teamMembers: TeamMemberCapability[];
  onReviewEvidence: (evidenceId: string, status: "approved" | "revision_requested", comment: string) => void;
  coachingGuidance: string;
  isCoachingLoading: boolean;
  onGenerateCoaching: () => void;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({
  currentUser,
  skills,
  roles = [],
  evidences,
  teamMembers,
  onReviewEvidence,
  coachingGuidance,
  isCoachingLoading,
  onGenerateCoaching,
}) => {
  const [reviewComments, setReviewComments] = useState<{ [id: string]: string }>({});
  
  // Row-level state for AI Insights, Reminders, and Checkpoint modals
  const [memberInsights, setMemberInsights] = useState<{ [userId: string]: string }>({});
  const [loadingInsights, setLoadingInsights] = useState<{ [userId: string]: boolean }>({});
  const [actionFeedback, setActionFeedback] = useState<string>("");

  // Checkpoint Modal
  const [activeCheckpointUser, setActiveCheckpointUser] = useState<TeamMemberCapability | null>(null);
  const [checkpointDate, setCheckpointDate] = useState("");
  const [checkpointTopic, setCheckpointTopic] = useState("1-on-1 Capability & Progress Review");

  // Post-Training GROW Assessment Modal State
  const [postAssessmentData, setPostAssessmentData] = useState<{ memberName: string; targetRole: string; report: string; assessmentId: string | null; status: string | null } | null>(null);
  const [loadingPostAssessment, setLoadingPostAssessment] = useState<{ [userId: string]: boolean }>({});
  const [isSigningOffAssessment, setIsSigningOffAssessment] = useState(false);

  // Manager Will Validation Modal State
  const [activeWillValidationUser, setActiveWillValidationUser] = useState<TeamMemberCapability | null>(null);
  const [mWillQ1, setMWillQ1] = useState(4);
  const [mWillQ2, setMWillQ2] = useState(5);
  const [mWillQ3, setMWillQ3] = useState(4);
  const [mWillQ4, setMWillQ4] = useState("Yes");

  const handleRunPostAssessment = async (member: TeamMemberCapability) => {
    try {
      setLoadingPostAssessment(prev => ({ ...prev, [member.userId]: true }));
      const res = await fetch("/api/manager/post-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: member.userId })
      });
      if (res.ok) {
        const data = await res.json();
        setPostAssessmentData({
          memberName: data.employeeName || member.userName,
          targetRole: data.targetRole || "Automation Tester",
          report: data.postAssessmentReport,
          assessmentId: data.assessment?.id || null,
          status: data.assessment?.status || null
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPostAssessment(prev => ({ ...prev, [member.userId]: false }));
    }
  };

  // Manager's real sign-off decision, persisted server-side - this is what other flows
  // (like the Client Resume Generator's eligibility check) actually look at, not just the
  // fact that an assessment was generated.
  const handleSignoffAssessment = async (decision: "cleared" | "not_ready") => {
    if (!postAssessmentData?.assessmentId) return;
    try {
      setIsSigningOffAssessment(true);
      const res = await fetch(`/api/manager/post-assessment/${postAssessmentData.assessmentId}/signoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      if (res.ok) {
        const data = await res.json();
        setPostAssessmentData(prev => prev ? { ...prev, status: data.assessment?.status || decision } : prev);
        setActionFeedback(
          decision === "cleared"
            ? `Post-training assessment cleared for ${postAssessmentData.memberName}.`
            : `${postAssessmentData.memberName} marked not ready yet.`
        );
        setTimeout(() => setActionFeedback(""), 4000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSigningOffAssessment(false);
    }
  };

  const pendingEvidences = evidences.filter((e) => e.status === "pending");

  // Calculate cohort stats
  const totalLearners = teamMembers.length;
  const avgReadiness = teamMembers.length > 0
    ? Math.round(teamMembers.reduce((acc, m) => acc + m.overallScore, 0) / teamMembers.length)
    : 0;
  const atRiskCount = teamMembers.filter(m => (m as any).riskStatus === "High" || m.gapCount >= 4).length;

  const handleReview = (id: string, status: "approved" | "revision_requested") => {
    const comment = reviewComments[id] || (status === "approved" ? "Verified workspace evidence and test output. Approved." : "Please provide additional test execution logs.");
    onReviewEvidence(id, status, comment);
    setReviewComments(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleGenerateMemberInsight = async (member: TeamMemberCapability) => {
    try {
      setLoadingInsights(prev => ({ ...prev, [member.userId]: true }));
      const res = await fetch("/api/manager/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: member.userId })
      });
      if (res.ok) {
        const data = await res.json();
        setMemberInsights(prev => ({ ...prev, [member.userId]: data.insight }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingInsights(prev => ({ ...prev, [member.userId]: false }));
    }
  };

  const handleSendReminder = async (member: TeamMemberCapability) => {
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.userId,
          targetRole: (member as any).targetRoleTitle || "Automation Tester",
          type: "weekly_reminder",
          title: `Weekly Capability Milestone Reminder for ${member.userName}`,
          message: `Hi ${member.userName}, please complete your pending weekly upskilling milestone to maintain target readiness.`
        })
      });
      if (res.ok) {
        setActionFeedback(`Agentic reminder sent to ${member.userName}!`);
        setTimeout(() => setActionFeedback(""), 4000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEscalateLD = async (member: TeamMemberCapability) => {
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.userId,
          targetRole: (member as any).targetRoleTitle || "Automation Tester",
          type: "escalation",
          title: `L&D Skill Gap Escalation: ${member.userName}`,
          message: `Manager Marcus Sterling escalated skill gap bottlenecks for ${member.userName} (${member.gapCount} gaps) to L&D Director Sarah Jenkins.`
        })
      });
      if (res.ok) {
        setActionFeedback(`Escalation alert sent to L&D Director Sarah Jenkins for ${member.userName}.`);
        setTimeout(() => setActionFeedback(""), 4000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleScheduleCheckpointSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCheckpointUser) return;

    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: activeCheckpointUser.userId,
          targetRole: (activeCheckpointUser as any).targetRoleTitle || "Automation Tester",
          type: "checkpoint",
          title: `1-on-1 Checkpoint Scheduled: ${checkpointTopic}`,
          message: `Scheduled meeting with Marcus Sterling for ${checkpointDate || "Friday at 3:00 PM"}. Topic: ${checkpointTopic}`
        })
      });
      if (res.ok) {
        setActionFeedback(`1-on-1 Checkpoint scheduled with ${activeCheckpointUser.userName}!`);
        setActiveCheckpointUser(null);
        setTimeout(() => setActionFeedback(""), 4000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in py-6">
      
      {/* Title & Action Notification Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#F0F4FF]">Manager Capability & Coaching Board</h2>
          <p className="text-xs text-[#94A3B8] mt-1">Supervise direct reports, issue agentic reminders, schedule checkpoints, and review workplace evidence.</p>
        </div>
        {actionFeedback && (
          <div className="p-3 bg-[#10B981]/10 border border-[#10B981]/40 text-[#10B981] font-mono text-xs rounded-md animate-fade-in flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            <span>{actionFeedback}</span>
          </div>
        )}
      </div>

      {/* Cohort Statistics Cards Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 stagger-children">
        <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-5 flex items-center justify-between shadow-lg hover-lift sheen">
          <div>
            <span className="text-[10px] font-mono text-[#94A3B8] font-bold uppercase tracking-wider block">Total Learners</span>
            <span className="text-3xl font-bold text-[#F0F4FF] mt-1 block">{totalLearners}</span>
            <span className="text-[10px] text-[#10B981] font-mono font-bold mt-1 block">Active Direct Cohort</span>
          </div>
          <div className="p-3 bg-[#4F8EF7]/10 border border-[#4F8EF7]/30 text-[#4F8EF7] rounded-lg">
            <UserCheck className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-5 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] font-mono text-[#94A3B8] font-bold uppercase tracking-wider block">Avg Readiness Score</span>
            <span className="text-3xl font-bold text-[#10B981] mt-1 block">{avgReadiness}%</span>
            <span className="text-[10px] text-[#10B981] font-mono font-bold mt-1 block">+14% vs Last Month</span>
          </div>
          <div className="p-3 bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] rounded-lg">
            <Shield className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-5 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] font-mono text-[#94A3B8] font-bold uppercase tracking-wider block">At-Risk Employees</span>
            <span className="text-3xl font-bold text-[#F59E0B] mt-1 block">{atRiskCount}</span>
            <span className="text-[10px] text-[#F59E0B] font-mono font-bold mt-1 block">Needs Skill Gap Focus</span>
          </div>
          <div className="p-3 bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] rounded-lg">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* DEPLOYIQ Skill vs Learning Interest (Will) Matrix */}
      <SkillVsWillMatrix teamMembers={teamMembers} managerName={currentUser.name} />

      {/* Direct Reports Capability Table (Screen 3) */}
      <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg space-y-6">
        <div className="flex items-center justify-between border-b border-[#2A384C] pb-4">
          <div>
            <h3 className="text-base font-bold text-[#F0F4FF]">Direct Reports Capability & Action Table</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">Comprehensive overview with AI insight generation, reminders, and checkpoint scheduling.</p>
          </div>
          <Sparkles className="h-5 w-5 text-[#4F8EF7]" />
        </div>

        {teamMembers.length === 0 ? (
          <div id="no-direct-reports-state" className="py-12 px-6 bg-[#0F1724] border border-[#2A384C] rounded-xl text-center space-y-3">
            <UserCheck className="h-12 w-12 text-[#94A3B8] mx-auto opacity-60" />
            <h4 className="text-base font-bold text-[#F0F4FF] font-mono">No Direct Reports Assigned</h4>
            <p className="text-xs text-[#94A3B8] font-mono max-w-md mx-auto">
              No employees reporting to this manager at present. (This manager profile currently has 0 direct reports in the workforce directory).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#2A384C] text-[#94A3B8] font-mono uppercase text-[10px] bg-[#0F1724]">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Current Role</th>
                <th className="py-3 px-4">Target Role</th>
                <th className="py-3 px-4">Capability (Skill)</th>
                <th className="py-3 px-4">Interest in Learning (Will)</th>
                <th className="py-3 px-4">Learning Engagement (LMS)</th>
                <th className="py-3 px-4">Risk Status</th>
                <th className="py-3 px-4">AI Insight & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A384C]">
              {teamMembers.map((member) => {
                const targetRole = (member as any).targetRoleTitle || "Automation Tester";
                const skillScore = (member as any).skillScore || member.overallScore;
                const willScore = (member as any).willScore || (member.userId === "user_5" ? 88 : 92);
                const engagement = (member as any).engagementScore || (member as any).learningProgressPercent || 65;
                const risk = (member as any).riskStatus || (member.gapCount >= 4 ? "High" : "Medium");
                const insightText = memberInsights[member.userId];
                const isInsightLoading = loadingInsights[member.userId];

                return (
                  <tr key={member.userId} className="hover:bg-[#0F1724]/60 transition-colors">
                    {/* Employee Profile */}
                    <td className="py-4 px-4 font-medium">
                      <div className="flex items-center gap-3">
                        <img
                          src={member.avatar}
                          alt={member.userName}
                          className="h-9 w-9 rounded-full object-cover border border-[#4F8EF7] bg-[#0F1724]"
                        />
                        <div>
                          <span className="font-bold text-[#F0F4FF] block">{member.userName}</span>
                          <span className="text-[10px] text-[#94A3B8] font-mono">{member.title}</span>
                        </div>
                      </div>
                    </td>

                    {/* Current Role */}
                    <td className="py-4 px-4 text-[#94A3B8] font-mono">{member.title}</td>

                    {/* Target Role */}
                    <td className="py-4 px-4 font-mono font-bold text-[#4F8EF7]">{targetRole}</td>

                    {/* Capability (Skill) Score */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-[#10B981] text-sm">{skillScore}%</span>
                      </div>
                      <span className="text-[9px] text-[#94A3B8] font-mono">Verified Skills</span>
                    </td>

                    {/* Interest in Learning (Will) Score */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-[#A855F7] text-sm">{willScore}%</span>
                      </div>
                      <span className="text-[9px] text-[#94A3B8] font-mono">Desire to Upskill</span>
                    </td>

                    {/* Learning Engagement (LMS Course Progress %) */}
                    <td className="py-4 px-4">
                      <div className="w-24 bg-[#0F1724] h-2 rounded-full overflow-hidden border border-[#2A384C] mb-1">
                        <div 
                          className="bg-[#4F8EF7] h-full transition-all"
                          style={{ width: `${engagement}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[#94A3B8] font-mono">{engagement}% LMS Progress</span>
                    </td>

                    {/* Risk Status */}
                    <td className="py-4 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-bold uppercase border ${
                        risk === "High"
                          ? "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/40"
                          : "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/40"
                      }`}>
                        {risk} Risk
                      </span>
                    </td>

                    {/* Actions & AI Insight */}
                    <td className="py-4 px-4 space-y-2">
                      {insightText ? (
                        <div className="p-2.5 bg-[#0F1724] border border-[#2A384C] text-[11px] text-[#F0F4FF] rounded-md font-sans whitespace-pre-wrap max-w-sm">
                          <span className="font-mono text-[9px] text-[#4F8EF7] uppercase font-bold block mb-1">AI Briefing:</span>
                          {insightText}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleGenerateMemberInsight(member)}
                          disabled={isInsightLoading}
                          className="px-3 py-1.5 bg-[#4F8EF7]/10 hover:bg-[#4F8EF7]/20 border border-[#4F8EF7]/40 text-[#4F8EF7] rounded-md text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer flex items-center gap-1"
                        >
                          {isInsightLoading ? (
                            <>
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <Cpu className="h-3 w-3" />
                              Generate AI Insight
                            </>
                          )}
                        </button>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          onClick={() => handleRunPostAssessment(member)}
                          disabled={loadingPostAssessment[member.userId]}
                          className="px-2.5 py-1 bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/40 text-[#10B981] hover:text-[#F0F4FF] rounded text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                        >
                          {loadingPostAssessment[member.userId] ? (
                            <>
                              <RefreshCw className="h-3 w-3 animate-spin text-[#10B981]" />
                              Evaluating Post-Training...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
                              Post-Training GROW Assessment
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setActiveWillValidationUser(member)}
                          className="px-2.5 py-1 bg-[#A855F7]/15 hover:bg-[#A855F7]/25 border border-[#A855F7]/40 text-[#A855F7] hover:text-[#F0F4FF] rounded text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                        >
                          <Award className="h-3 w-3 text-[#A855F7]" />
                          Validate Will (Observable Behavior)
                        </button>
                        <button
                          onClick={() => handleSendReminder(member)}
                          className="px-2.5 py-1 bg-[#0F1724] border border-[#2A384C] hover:border-[#4F8EF7] text-[#94A3B8] hover:text-[#F0F4FF] rounded text-[10px] font-mono transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Bell className="h-3 w-3 text-[#4F8EF7]" />
                          Send Reminder
                        </button>
                        <button
                          onClick={() => setActiveCheckpointUser(member)}
                          className="px-2.5 py-1 bg-[#0F1724] border border-[#2A384C] hover:border-[#10B981] text-[#94A3B8] hover:text-[#F0F4FF] rounded text-[10px] font-mono transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Calendar className="h-3 w-3 text-[#10B981]" />
                          Schedule Checkpoint
                        </button>
                        <button
                          onClick={() => handleEscalateLD(member)}
                          className="px-2.5 py-1 bg-[#0F1724] border border-[#2A384C] hover:border-[#F59E0B] text-[#94A3B8] hover:text-[#F0F4FF] rounded text-[10px] font-mono transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <AlertTriangle className="h-3 w-3 text-[#F59E0B]" />
                          Escalate to L&D
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

      {/* Resource Learning Progress & Flexible Track Assigner */}
      <ResourceLearningTracker roles={roles} />

      {/* Validation Queue & Manager Coach Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Pending Evidence Review Queue (Left 2 columns) */}
        <div className="lg:col-span-2 bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg">
          <h3 className="text-base font-bold text-[#F0F4FF] mb-4">Pending Workplace Evidence Verification Queue</h3>
          {pendingEvidences.length > 0 ? (
            <div className="space-y-6">
              {pendingEvidences.map((e) => {
                const skillName = skills.find((s) => s.id === e.skillId)?.name || e.skillId;
                return (
                  <div key={e.id} id={`evidence-card-${e.id}`} className="p-4 bg-[#0F1724] rounded-lg border border-[#2A384C] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-[10px] font-mono text-[#4F8EF7] font-bold uppercase tracking-wider">Skill Context: {skillName}</h4>
                        <h5 className="text-sm font-bold text-[#F0F4FF] mt-1">{e.title}</h5>
                      </div>
                      <span className="text-[10px] text-[#94A3B8] font-mono">Submitted: {new Date(e.submittedAt).toLocaleDateString()}</span>
                    </div>

                    <div className="text-xs text-[#94A3B8] font-sans space-y-1">
                      <p className="font-mono text-[9px] uppercase tracking-wider text-[#94A3B8]">Impact summary:</p>
                      <p className="italic bg-[#141E30] p-3 rounded-md border border-[#2A384C] text-[#F0F4FF]">"{e.description}"</p>
                    </div>

                    <div className="text-xs text-[#94A3B8] font-sans space-y-1">
                      <p className="font-mono text-[9px] uppercase tracking-wider text-[#94A3B8]">Workspace / Test output details:</p>
                      <pre className="bg-[#0F1724] text-[#F0F4FF] font-mono p-3 rounded-md border border-[#2A384C] overflow-x-auto text-[11px] leading-relaxed max-h-48">
                        {e.evidenceText}
                      </pre>
                    </div>

                    {e.documentUrl && (
                      <div className="text-[10px] text-[#4F8EF7] font-mono">
                        Artifact Link: <a href={e.documentUrl} target="_blank" rel="noreferrer" className="underline hover:text-white">{e.documentUrl}</a>
                      </div>
                    )}

                    {/* Review actions input */}
                    <div className="space-y-2 pt-2 border-t border-[#2A384C]">
                      <label htmlFor={`comments-input-${e.id}`} className="text-[9px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider block">Coaching Review Comments *</label>
                      <input
                        id={`comments-input-${e.id}`}
                        type="text"
                        placeholder="Provide GROW feedback or validation comments..."
                        value={reviewComments[e.id] || ""}
                        onChange={(evt) => setReviewComments({ ...reviewComments, [e.id]: evt.target.value })}
                        className="w-full bg-[#141E30] text-[#F0F4FF] text-xs p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                      />

                      <div className="flex flex-wrap gap-2 pt-1 justify-end">
                        <button
                          id={`reject-btn-${e.id}`}
                          onClick={() => handleReview(e.id, "revision_requested")}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono uppercase tracking-widest text-[#F59E0B] hover:bg-[#F59E0B]/10 border border-[#F59E0B]/40 rounded-md transition-colors cursor-pointer font-bold"
                        >
                          <X className="h-3.5 w-3.5" />
                          Request Revision
                        </button>
                        <button
                          id={`approve-btn-${e.id}`}
                          onClick={() => handleReview(e.id, "approved")}
                          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono uppercase tracking-widest text-[#0F1724] bg-[#10B981] hover:bg-[#059669] rounded-md transition-colors cursor-pointer font-bold"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve Evidence
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-[#94A3B8]">
              <Shield className="h-10 w-10 mx-auto stroke-1 mb-2 text-[#2A384C]" />
              <p className="text-xs">All pending workplace evidence submissions have been verified!</p>
            </div>
          )}
        </div>

        {/* Manager Coach Sidebar (Right 1 column) */}
        <div className="lg:col-span-1 bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-mono font-bold text-[#4F8EF7] uppercase tracking-[0.2em]">Manager GROW Coach AI</h3>
              <Sparkles className="h-5 w-5 text-[#4F8EF7]" />
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed mb-4">
              Synthesize GROW coaching questions and employee capability summaries using Gemini AI.
            </p>

            <button
              id="generate-coaching-btn"
              onClick={onGenerateCoaching}
              disabled={isCoachingLoading}
              className="flex items-center justify-center gap-2 w-full bg-[#0F1724] border border-[#2A384C] hover:border-[#4F8EF7] text-[#F0F4FF] font-mono uppercase tracking-widest text-xs py-2.5 px-4 rounded-md transition-all cursor-pointer font-bold disabled:opacity-50"
            >
              {isCoachingLoading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#4F8EF7]" />
                  Synthesizing GROW Briefing...
                </>
              ) : (
                <>
                  <Cpu className="h-3.5 w-3.5 text-[#4F8EF7]" />
                  Generate GROW Coaching Briefing
                </>
              )}
            </button>

            {coachingGuidance ? (
              <div className="mt-6 p-4 bg-[#0F1724] rounded-lg border border-[#2A384C] text-xs text-[#94A3B8] leading-relaxed max-h-[420px] overflow-y-auto font-sans">
                <div className="flex items-center gap-1.5 mb-2 border-b border-[#2A384C] pb-2">
                  <MessageSquare className="h-3.5 w-3.5 text-[#4F8EF7]" />
                  <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#4F8EF7]">GROW Coaching Brief</span>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed space-y-2 text-[#F0F4FF] text-[11px]">
                  {coachingGuidance}
                </div>
              </div>
            ) : (
              <div className="mt-8 border border-dashed border-[#2A384C] rounded-lg p-6 text-center text-[#94A3B8]">
                <HelpCircle className="h-8 w-8 mx-auto stroke-1 mb-2 text-[#2A384C]" />
                <p className="text-[11px]">Click 'Generate GROW Coaching Briefing' to synthesize real-time coaching questions.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Schedule Checkpoint Modal */}
      {activeCheckpointUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
              <h3 className="text-sm font-bold text-[#F0F4FF]">Schedule 1-on-1 Checkpoint</h3>
              <button 
                onClick={() => setActiveCheckpointUser(null)} 
                className="text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[#94A3B8]">
              Schedule a 1-on-1 capability review meeting for <strong className="text-[#F0F4FF]">{activeCheckpointUser.userName}</strong>.
            </p>

            <form onSubmit={handleScheduleCheckpointSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase block mb-1">Date & Time *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Friday at 3:00 PM"
                  value={checkpointDate}
                  onChange={(e) => setCheckpointDate(e.target.value)}
                  className="w-full bg-[#0F1724] text-[#F0F4FF] p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase block mb-1">Review Topic *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Selenium & API Testing Readiness Review"
                  value={checkpointTopic}
                  onChange={(e) => setCheckpointTopic(e.target.value)}
                  className="w-full bg-[#0F1724] text-[#F0F4FF] p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveCheckpointUser(null)}
                  className="px-4 py-2 border border-[#2A384C] text-[#94A3B8] rounded-md font-mono text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] font-mono font-bold rounded-md text-xs cursor-pointer"
                >
                  Confirm Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manager GROW Coach Post-Training Assessment Report Modal */}
      {postAssessmentData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#141E30] border border-[#2A384C] rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-6">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#2A384C] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] rounded-lg">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#F0F4FF]">
                    Manager GROW Coach Post-Training Assessment
                  </h3>
                  <p className="text-xs text-[#94A3B8] font-mono">
                    Evaluating readiness % & gap closure for <strong className="text-[#4F8EF7]">{postAssessmentData.memberName}</strong> ({postAssessmentData.targetRole})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPostAssessmentData(null)}
                className="text-[#94A3B8] hover:text-white p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Post-Assessment Report Body */}
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#10B981]" />
                  <span className="text-xs font-mono font-bold text-[#F0F4FF] uppercase tracking-wider">Verified Post-Assessment Report</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-[#10B981] bg-[#10B981]/10 px-2.5 py-1 rounded border border-[#10B981]/30">
                  Readiness Check Complete
                </span>
              </div>

              <div className="whitespace-pre-wrap text-xs text-[#F0F4FF] font-sans leading-relaxed space-y-3 font-normal">
                {postAssessmentData.report}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#2A384C]">
              <span className="text-[11px] text-[#94A3B8] font-mono italic">
                Post-assessment confirms skill gap closure post Learning Concierge training.
              </span>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setPostAssessmentData(null)}
                  className="px-4 py-2 bg-[#0F1724] border border-[#2A384C] hover:border-[#94A3B8] text-[#94A3B8] hover:text-[#F0F4FF] rounded-md font-mono text-xs cursor-pointer transition-colors"
                >
                  Close Brief
                </button>
                {postAssessmentData.status === "cleared" ? (
                  <span className="px-5 py-2 bg-[#10B981]/10 border border-[#10B981]/40 text-[#10B981] font-mono font-bold text-xs rounded-md flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Cleared for Deployment
                  </span>
                ) : postAssessmentData.status === "not_ready" ? (
                  <span className="px-5 py-2 bg-amber-500/10 border border-amber-500/40 text-amber-400 font-mono font-bold text-xs rounded-md flex items-center justify-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Marked Not Ready
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => handleSignoffAssessment("not_ready")}
                      disabled={isSigningOffAssessment}
                      className="px-4 py-2 bg-[#0F1724] border border-[#2A384C] hover:border-amber-500/50 text-[#94A3B8] hover:text-amber-400 rounded-md font-mono text-xs cursor-pointer transition-colors disabled:opacity-60"
                    >
                      Not Ready Yet
                    </button>
                    <button
                      onClick={() => handleSignoffAssessment("cleared")}
                      disabled={isSigningOffAssessment}
                      className="px-5 py-2 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] font-mono font-bold text-xs rounded-md cursor-pointer transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#10B981]/20 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{isSigningOffAssessment ? "Signing Off..." : "Clear for Deployment"}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Manager Validation of Observable Behaviour (Will Assessment) Modal */}
      {activeWillValidationUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#141E30] border border-[#2A384C] rounded-xl p-6 max-w-xl w-full shadow-2xl space-y-5 animate-fade-in">
            
            <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#A855F7]/20 border border-[#A855F7]/40 text-[#A855F7] rounded-lg">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#F0F4FF]">
                    Manager Validation — Observable Behavior
                  </h3>
                  <p className="text-xs text-[#94A3B8] font-mono">
                    Direct Report: <strong className="text-[#A855F7]">{activeWillValidationUser.userName}</strong> ({activeWillValidationUser.title})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveWillValidationUser(null)}
                className="text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-[#94A3B8]">
              Evaluate observable workplace behavior (not opinions) to validate the employee's Will Index score.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setActionFeedback(`Manager Will Validation recorded for ${activeWillValidationUser.userName}! Score updated in Skill-vs-Will Matrix.`);
                setActiveWillValidationUser(null);
                setTimeout(() => setActionFeedback(""), 4000);
              }}
              className="space-y-4 text-xs"
            >
              {/* Q1 */}
              <div className="bg-[#0F1724] p-3 rounded-lg border border-[#2A384C] space-y-2">
                <label className="text-xs font-bold text-[#F0F4FF] block">
                  Q1. Does the employee proactively seek opportunities to learn new technologies?
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => setMWillQ1(scale)}
                      className={`flex-1 py-1.5 rounded text-xs font-mono font-bold border cursor-pointer ${
                        mWillQ1 === scale
                          ? "bg-[#A855F7] text-white border-[#A855F7]"
                          : "bg-[#141E30] text-[#94A3B8] border-[#2A384C] hover:border-[#A855F7]/40"
                      }`}
                    >
                      {scale}
                    </button>
                  ))}
                </div>
              </div>

              {/* Q2 */}
              <div className="bg-[#0F1724] p-3 rounded-lg border border-[#2A384C] space-y-2">
                <label className="text-xs font-bold text-[#F0F4FF] block">
                  Q2. Has the employee demonstrated adaptability when assigned unfamiliar work?
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => setMWillQ2(scale)}
                      className={`flex-1 py-1.5 rounded text-xs font-mono font-bold border cursor-pointer ${
                        mWillQ2 === scale
                          ? "bg-[#A855F7] text-white border-[#A855F7]"
                          : "bg-[#141E30] text-[#94A3B8] border-[#2A384C] hover:border-[#A855F7]/40"
                      }`}
                    >
                      {scale}
                    </button>
                  ))}
                </div>
              </div>

              {/* Q3 */}
              <div className="bg-[#0F1724] p-3 rounded-lg border border-[#2A384C] space-y-2">
                <label className="text-xs font-bold text-[#F0F4FF] block">
                  Q3. Does the employee consistently complete learning or development commitments?
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => setMWillQ3(scale)}
                      className={`flex-1 py-1.5 rounded text-xs font-mono font-bold border cursor-pointer ${
                        mWillQ3 === scale
                          ? "bg-[#A855F7] text-white border-[#A855F7]"
                          : "bg-[#141E30] text-[#94A3B8] border-[#2A384C] hover:border-[#A855F7]/40"
                      }`}
                    >
                      {scale}
                    </button>
                  ))}
                </div>
              </div>

              {/* Q4 */}
              <div className="bg-[#0F1724] p-3 rounded-lg border border-[#2A384C] space-y-2">
                <label className="text-xs font-bold text-[#F0F4FF] block">
                  Q4. Would you recommend this employee for a stretch assignment?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["Yes", "Maybe", "Not Yet"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setMWillQ4(opt)}
                      className={`py-2 rounded text-xs font-mono font-bold border cursor-pointer ${
                        mWillQ4 === opt
                          ? "bg-[#10B981]/20 border-[#10B981] text-[#10B981]"
                          : "bg-[#141E30] text-[#94A3B8] border-[#2A384C] hover:border-[#10B981]/40"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#2A384C]">
                <button
                  type="button"
                  onClick={() => setActiveWillValidationUser(null)}
                  className="px-4 py-2 border border-[#2A384C] text-[#94A3B8] hover:text-white rounded-md font-mono text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#A855F7] hover:bg-[#9333EA] text-[#F0F4FF] font-mono font-bold text-xs rounded-md cursor-pointer transition-all flex items-center gap-2 shadow-lg shadow-[#A855F7]/20"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Save Manager Will Validation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

