import { useState, useEffect } from "react";
import { User, UserRole, Skill, TargetRole, LearningCourse, Evidence, Message, TeamMemberCapability } from "./types";
import { RoleHeader } from "./components/RoleHeader";
import { EmployeeDashboard } from "./components/EmployeeDashboard";
import { ManagerDashboard } from "./components/ManagerDashboard";
import { LDDashboard } from "./components/LDDashboard";
import { LeadershipDashboard } from "./components/LeadershipDashboard";
import { GuidePage } from "./components/GuidePage";
import { AgentHub } from "./components/AgentHub";
import { ProjectDemandAgent } from "./components/ProjectDemandAgent";
import { ResourceLoginPage } from "./components/ResourceLoginPage";
import { HomeLandingPage } from "./components/HomeLandingPage";
import { ThemeSelectorModal } from "./components/ThemeSelectorModal";
import { ThemeId, THEME_OPTIONS, applyThemeToDocument, getCurrentTheme } from "./lib/theme";
import { BrandMark, BrandLockup } from "./components/BrandLogo";
import { RefreshCw, AlertCircle } from "lucide-react";

/**
 * Fixed, non-interactive backdrop, painted back to front:
 *   1. the CyBridge hero photograph, drifting slowly (Ken Burns)
 *   2. a light beam sweeping across it
 *   3. a palette-coloured scrim that keeps body copy readable
 *   4. three drifting aurora blobs tinted from the active palette
 *   5. grid / contour / grain textures
 */
function AtmosphereLayer() {
  return (
    <div className="app-aurora" aria-hidden="true">
      <span className="aurora-photo" />
      <span className="aurora-photo-beam" />
      <span className="aurora-photo-scrim" />
      <span className="aurora-blob blob-1" />
      <span className="aurora-blob blob-2" />
      <span className="aurora-blob blob-3" />
      <span className="aurora-relief" />
      <span className="aurora-grid" />
      <span className="aurora-noise" />
    </div>
  );
}

export default function App() {
  // Headline profile count for the signed-out landing page. The directory itself is
  // never fetched into the browser - see /api/directory/summary.
  const [profileCount, setProfileCount] = useState<number>(0);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [roles, setRoles] = useState<TargetRole[]>([]);
  const [courses, setCourses] = useState<LearningCourse[]>([]);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberCapability[]>([]);
  const [activeTab, setActiveTab] = useState<string>("home");

  // UI/UX Theme Customizer State
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(getCurrentTheme());
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  // Apply default theme on initial load
  useEffect(() => {
    applyThemeToDocument(currentTheme);
  }, []);

  // Capability Metrics
  const [capabilityData, setCapabilityData] = useState<any>(null);

  // Whether the signed-in employee has been shortlisted onto a project demand.
  // Kept in its own effect keyed on the user id rather than folded into the bootstrap
  // fetches, because it also has to clear on sign-out and re-run on account switch.
  const [shortlist, setShortlist] = useState<{ isShortlisted: boolean; demand: any } | null>(null);

  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) {
      setShortlist(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${userId}/shortlist`);
        // A stale response from a previous user must not overwrite the current one.
        if (!cancelled && res.ok) setShortlist(await res.json());
      } catch (err) {
        console.error("Shortlist lookup failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // Dynamic initial greeting generator based on active user
  const getInitialMessagesForUser = (user: User, rolesList: TargetRole[]): Message[] => {
    const firstName = user.name ? user.name.split(" ")[0] : "there";
    const targetRole = rolesList.find(r => r.id === user.targetRoleId);
    const roleTitle = targetRole?.title || "your target role";

    if (user.role === UserRole.EMPLOYEE) {
      return [
        {
          id: `m_init_1_${user.id}`,
          sender: "ai",
          text: `Hello ${firstName}! I am your SkillGap-to-Growth Agent.`,
          timestamp: new Date().toISOString(),
          agentUsed: "skill_gap"
        },
        {
          id: `m_init_2_${user.id}`,
          sender: "ai",
          text: `Welcome, ${firstName}! I am your Learning Concierge & 1-on-1 AI Mentor. Ask me to clear any technical doubt, explain complex software concepts step-by-step, recommend catalog courses, or suggest hands-on workplace practice assignments!`,
          timestamp: new Date().toISOString(),
          agentUsed: "concierge"
        }
      ];
    } else if (user.role === UserRole.MANAGER) {
      return [
        {
          id: `m_init_3_${user.id}`,
          sender: "ai",
          text: `Welcome ${firstName}! I am your Manager GROW Coach cockpit assistant. Ask me to summarize direct reports' skill gaps, review pending evidence logs, or suggest GROW coaching questions for your team.`,
          timestamp: new Date().toISOString(),
          agentUsed: "coach"
        }
      ];
    } else {
      return [
        {
          id: `m_init_4_${user.id}`,
          sender: "ai",
          text: `Hello ${firstName}! L&D Strategic Analyst ready. Ask me to analyze enterprise capability bottlenecks across teams or forecast upskilling cohort readiness.`,
          timestamp: new Date().toISOString(),
          agentUsed: "analytics"
        }
      ];
    }
  };

  // AI Orchestration States
  const [messages, setMessages] = useState<Message[]>([]);

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [coachingGuidance, setCoachingGuidance] = useState("");
  const [isCoachingLoading, setIsCoachingLoading] = useState(false);
  const [analyticsReport, setAnalyticsReport] = useState("");
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Every /api route except the public probes (/api/health, /api/directory/summary) is
  // session-gated on the server (requireAuth / requireRole). If a login attempt is not
  // honoured we must not
  // render a "logged in" shell - the screens would silently fill with empty state while
  // every request 401s. This notice keeps the two halves in step.
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Routes the current session to its home screen.
  const goToRoleDashboard = (role: UserRole) => {
    if (role === UserRole.EMPLOYEE) setActiveTab("dashboard");
    else if (role === UserRole.MANAGER) setActiveTab("manager_dash");
    else if (role === UserRole.LD) setActiveTab("ld_dash");
    else if (role === UserRole.LEADERSHIP) setActiveTab("leadership_dash");
  };

  // 1. Initial Load
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Only the headline count, not the directory itself. The landing page displays a
        // number, so there is no reason to ship 27 people's names and emails to a browser
        // that has not signed in.
        const summaryRes = await fetch("/api/directory/summary");
        if (!summaryRes.ok) throw new Error("Failed to load directory summary");
        const summary = await summaryRes.json();
        setProfileCount(summary.totalProfiles ?? 0);

        // No auto-login. The app opens signed out; a session is only ever created by
        // the user entering a credential. Restore an existing session if the browser
        // still holds a valid cookie from a previous visit.
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.user) {
            setCurrentUser(me.user);
            goToRoleDashboard(me.user.role);
          }
        }

      } catch (err: any) {
        console.error(err);
        setError("Database communication failure: " + err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // 2. Fetch User-Specific Stats (Refreshed on user change or updates)
  useEffect(() => {
    if (!currentUser) return;

    // Reset chat messages to personalized greeting for the logged in user
    setMessages(getInitialMessagesForUser(currentUser, roles));

    async function loadUserSpecifics() {
      try {
        // Fetch capability data
        const capRes = await fetch(`/api/users/${currentUser.id}/capability`);
        if (capRes.status === 401) {
          setSessionNotice("Your session has expired. Please sign in again to reload capability data.");
          return;
        }
        if (capRes.ok) setCapabilityData(await capRes.json());

        // Fetch user evidences
        const evRes = await fetch(`/api/evidence?userId=${currentUser.id}`);
        if (evRes.ok) setEvidences(await evRes.json());

        // Fetch manager direct reports if current user is Manager
        if (currentUser.role === UserRole.MANAGER) {
          const teamRes = await fetch(`/api/manager/${currentUser.id}/team`);
          if (teamRes.ok) setTeamMembers(await teamRes.json());
          // Also fetch all evidences for manager review
          const allEvRes = await fetch("/api/evidence");
          if (allEvRes.ok) setEvidences(await allEvRes.json());
        }
      } catch (err) {
        console.error("Error loading user details:", err);
      }
    }

    loadUserSpecifics();
  }, [currentUser, roles]);

  // Load the session-gated reference data once a session actually exists (covers the
  // case where the first load stayed signed out and the user logged in afterwards).
  useEffect(() => {
    if (!currentUser || skills.length > 0) return;

    async function loadReferenceData() {
      try {
        const [skillsRes, rolesRes, coursesRes] = await Promise.all([
          fetch("/api/skills"),
          fetch("/api/roles"),
          fetch("/api/courses")
        ]);
        if (skillsRes.ok) setSkills(await skillsRes.json());
        if (rolesRes.ok) setRoles(await rolesRes.json());
        if (coursesRes.ok) setCourses(await coursesRes.json());
      } catch (err) {
        console.error("Error loading reference data:", err);
      }
    }

    loadReferenceData();
  }, [currentUser, skills.length]);

  /**
   * Called by the login screens *after* the server has accepted a credential and
   * issued a session cookie. There is deliberately no client-side path that opens a
   * session from a bare user id - that is what let anyone step into a manager's
   * cockpit. The user object here is the one the server returned, never a local pick.
   */
  const handleAuthenticated = (authedUser: User) => {
    setSessionNotice(null);
    setCurrentUser(authedUser);
    goToRoleDashboard(authedUser.role);
  };

  // Re-pull the signed-in user's own data. Used by dashboard refresh buttons - it must
  // never re-authenticate, or a refresh would silently become a login attempt.
  const refreshCurrentUser = async () => {
    if (!currentUser) return;
    try {
      const [userRes, capRes, evRes] = await Promise.all([
        fetch(`/api/users/${currentUser.id}`),
        fetch(`/api/users/${currentUser.id}/capability`),
        fetch(`/api/evidence?userId=${currentUser.id}`)
      ]);

      if (userRes.status === 401 || capRes.status === 401) {
        setSessionNotice("Your session has expired. Please sign in again.");
        setCurrentUser(null);
        setActiveTab("home");
        return;
      }

      if (userRes.ok) setCurrentUser(await userRes.json());
      if (capRes.ok) setCapabilityData(await capRes.json());
      if (evRes.ok) setEvidences(await evRes.json());
    } catch (err) {
      console.error("Refresh failed:", err);
    }
  };

  // Change Target Career Role (Elena Vance action)
  const handleTargetRoleChange = async (roleId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/users/${currentUser.id}/target-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId })
      });
      if (res.ok) {
        // Refetch user profile
        const userRes = await fetch(`/api/users/${currentUser.id}`);
        if (userRes.ok) {
          setCurrentUser(await userRes.json());
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Submit new Workplace Evidence (Elena Vance action)
  const handleSubmitEvidence = async (evidencePayload: {
    skillId: string;
    title: string;
    description: string;
    evidenceText: string;
    documentUrl?: string;
  }) => {
    if (!currentUser) return;
    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          ...evidencePayload
        })
      });
      if (res.ok) {
        // Refresh evidence logs
        const evRes = await fetch(`/api/evidence?userId=${currentUser.id}`);
        if (evRes.ok) setEvidences(await evRes.json());

        // Refresh score
        const capRes = await fetch(`/api/users/${currentUser.id}/capability`);
        if (capRes.ok) setCapabilityData(await capRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Review & Approve/Reject Evidence (Marcus Sterling action)
  const handleReviewEvidence = async (evidenceId: string, status: "approved" | "revision_requested", comment: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch("/api/validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidenceId,
          reviewerId: currentUser.id,
          status,
          comment
        })
      });
      if (res.ok) {
        // Refresh manager's direct reports and general evidences
        const teamRes = await fetch(`/api/manager/${currentUser.id}/team`);
        if (teamRes.ok) setTeamMembers(await teamRes.json());
        
        const allEvRes = await fetch("/api/evidence");
        if (allEvRes.ok) setEvidences(await allEvRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Generate coaching brief (Manager sidebar action)
  const handleGenerateCoaching = async () => {
    try {
      setIsCoachingLoading(true);
      const res = await fetch("/api/ai/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser?.id,
          prompt: "Draft a team upskilling summary for my direct reports, review pending evidence logs, and suggest 3 GROW coaching questions for my team.",
          agent: "coach"
        })
      });
      if (res.ok) {
        const data = await res.json();
        setCoachingGuidance(data.response);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCoachingLoading(false);
    }
  };

  // Generate Strategic Gaps & Analytics report (Sarah/David action)
  const handleGenerateAnalytics = async () => {
    try {
      setIsAnalyticsLoading(true);
      const res = await fetch("/api/ai/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No userId: the server grounds the briefing in the signed-in caller, and for
        // managers and above in the organisation-wide figures.
        body: JSON.stringify({
          prompt: "Synthesize enterprise capability statistics, map key bottlenecks, and prepare a board upskilling recommendation report.",
          agent: "analytics"
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsReport(data.response);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyticsLoading(false);
    }
  };

  // Chat message send handler in AI Hub
  const handleSendMessage = async (text: string, agentUsed: "skill_gap" | "concierge" | "coach" | "analytics") => {
    const userMsg: Message = {
      id: "user_" + Date.now(),
      sender: "user",
      text,
      timestamp: new Date().toISOString(),
      agentUsed
    };

    setMessages(prev => [...prev, userMsg]);
    setIsAiLoading(true);

    try {
      const res = await fetch("/api/ai/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser?.id,
          prompt: text,
          agent: agentUsed
        })
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg: Message = {
          id: "ai_" + Date.now(),
          sender: "ai",
          text: data.response,
          timestamp: new Date().toISOString(),
          agentUsed
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        throw new Error("Unable to contact Cognitive Orchestrator API.");
      }
    } catch (err: any) {
      const errorMsg: Message = {
        id: "ai_err_" + Date.now(),
        sender: "ai",
        text: "Error orchestrating model generation: " + err.message,
        timestamp: new Date().toISOString(),
        agentUsed
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="app-shell min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center">
        <AtmosphereLayer />
        <div className="app-content flex flex-col items-center gap-6">
          <div className="relative animate-float">
            <span className="absolute inset-0 rounded-3xl animate-glow" />
            <BrandLockup width={280} />
          </div>
          <span className="text-xs font-mono uppercase tracking-[0.25em]" style={{ color: "var(--text-mute)" }}>
            Connecting to Capability Hub Database
          </span>
          <div className="w-56 h-1.5 rounded-full overflow-hidden shimmer" />
        </div>
      </div>
    );
  }

  // Log out on the server too - leaving the session open while the UI shows a signed-out
  // state is exactly the kind of drift this screen used to have.
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.warn("Logout request failed:", e);
    }
    setCurrentUser(null);
    setCapabilityData(null);
    setEvidences([]);
    setTeamMembers([]);
    setSessionNotice(null);
    setActiveTab("home");
  };

  if (loading && profileCount === 0) {
    return (
      <div className="app-shell min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AtmosphereLayer />
        <div className="app-content flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} />
          <p className="font-mono text-xs tracking-widest uppercase" style={{ color: "var(--text-mute)" }}>
            Connecting to Capability Intelligence Engine...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AtmosphereLayer />
        <div className="app-content glass rounded-2xl p-8 max-w-md w-full space-y-4 animate-scale-in">
          <div className="mx-auto w-fit p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30">
            <AlertCircle className="h-9 w-9 text-rose-500 animate-pulse" />
          </div>
          <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>Connection Interrupted</h3>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-mute)" }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-1 bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-bold text-xs py-2.5 px-6 rounded-lg transition-all uppercase tracking-widest cursor-pointer sheen"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // There is no "default user" any more. Falling back to users[0] or a hard-coded
  // employee meant a signed-out visitor was rendered as a real person's account.
  const activeUser = currentUser;
  const isAuthenticated = !!activeUser;

  // Tabs reachable without a session. Anything else falls back to the landing page,
  // so a stale tab can never render someone else's workspace.
  const PUBLIC_TABS = ["home", "login"];
  // Reachable signed out as well as signed in: the guide holds no one's data.
  const OPEN_TABS = [...PUBLIC_TABS, "guide"];

  // The workspace each role lands on after signing in.
  const roleLandingTab = (role: UserRole) =>
    role === UserRole.MANAGER ? "manager_dash"
    : role === UserRole.LD ? "ld_dash"
    : role === UserRole.LEADERSHIP ? "leadership_dash"
    : "dashboard";

  // Signed in, the landing/login pages are no longer meaningful destinations - they are
  // the signed-out surface. Resolve them to the user's own workspace so a stale tab (or
  // a browser restore) can't drop an authenticated person back onto the marketing page.
  const effectiveTab = isAuthenticated
    ? (PUBLIC_TABS.includes(activeTab) ? roleLandingTab(activeUser.role) : activeTab)
    : (OPEN_TABS.includes(activeTab) ? activeTab : "home");

  // Screens that belong to people who manage others. An employee session never
  // reaches these, matching the requireRole guards on the server.
  const canManage =
    isAuthenticated && activeUser.role !== UserRole.EMPLOYEE;

  // Render Resource Login Page ONLY if explicitly activeTab is "login"
  if (effectiveTab === "login") {
    return (
      <ResourceLoginPage
        onAuthenticated={handleAuthenticated}
        onBack={() => setActiveTab("home")}
        isLoading={loading}
      />
    );
  }

  const activeThemeOption = THEME_OPTIONS.find(t => t.id === currentTheme);

  return (
    <div
      className="app-shell min-h-screen font-sans flex flex-col"
      style={{
        backgroundColor: activeThemeOption?.previewColors.bg || "#F8FAFC",
        color: activeThemeOption?.previewColors.text || "#0F172A"
      }}
    >
      <AtmosphereLayer />

      <div className="app-content flex flex-col min-h-screen">
      <RoleHeader
        currentUser={activeUser}
        activeTab={effectiveTab}
        onTabChange={setActiveTab}
        onLogout={handleLogout}
        onOpenThemeModal={() => setIsThemeModalOpen(true)}
        currentThemeName={activeThemeOption?.name}
      />

      {/* Theme Customizer Modal */}
      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        currentTheme={currentTheme}
        onSelectTheme={(newTheme) => {
          setCurrentTheme(newTheme);
          setIsThemeModalOpen(false);
        }}
      />

      {/* Session / API alignment notice */}
      {sessionNotice && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 animate-fade-in-down">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed flex-1" style={{ color: "var(--text-dim)" }}>
              {sessionNotice}
            </p>
            <button
              onClick={() => setSessionNotice(null)}
              className="text-[10px] font-mono uppercase tracking-wider text-amber-400 hover:text-amber-300 cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area — remounts on tab change so each screen animates in */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div key={effectiveTab} className="page-transition">
        {effectiveTab === "home" && (
          <HomeLandingPage
            profileCount={profileCount}
            currentUser={activeUser}
            onAuthenticated={handleAuthenticated}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {/* Demand-to-Deployment is a talent-sourcing cockpit: managers, L&D and
            leadership only, mirroring the requireRole guards on those endpoints. */}
        {effectiveTab === "project_demand" && canManage && (
          <ProjectDemandAgent currentUser={activeUser} />
        )}

        {effectiveTab === "dashboard" && isAuthenticated && (
          <EmployeeDashboard
            currentUser={activeUser}
            skills={skills}
            roles={roles}
            courses={courses}
            evidences={evidences}
            capabilityData={capabilityData}
            onTargetRoleChange={handleTargetRoleChange}
            onSubmitEvidence={handleSubmitEvidence}
            onRefresh={refreshCurrentUser}
            isShortlisted={!!shortlist?.isShortlisted}
            shortlistDemand={shortlist?.demand ?? undefined}
          />
        )}

        {effectiveTab === "manager_dash" && canManage && (
          <ManagerDashboard
            currentUser={activeUser}
            skills={skills}
            roles={roles}
            evidences={evidences}
            teamMembers={teamMembers}
            onReviewEvidence={handleReviewEvidence}
            coachingGuidance={coachingGuidance}
            isCoachingLoading={isCoachingLoading}
            onGenerateCoaching={handleGenerateCoaching}
          />
        )}

        {effectiveTab === "ld_dash" && canManage && (
          <LDDashboard
            courses={courses}
            roles={roles}
            analyticsReport={analyticsReport}
            isAnalyticsLoading={isAnalyticsLoading}
            onGenerateAnalytics={handleGenerateAnalytics}
          />
        )}

        {effectiveTab === "leadership_dash" && canManage && (
          <LeadershipDashboard
            analyticsReport={analyticsReport}
            isAnalyticsLoading={isAnalyticsLoading}
            onGenerateAnalytics={handleGenerateAnalytics}
          />
        )}

        {effectiveTab === "guide" && (
          <GuidePage currentUser={activeUser} onNavigate={setActiveTab} />
        )}

        {effectiveTab === "ai_hub" && isAuthenticated && (
          <AgentHub
            currentUser={activeUser}
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isAiLoading}
            onNavigateToDashboard={() => setActiveTab("dashboard")}
          />
        )}
        </div>
      </main>

      {/* Footer: what the product is, the loop it runs, and the way into the guide.
          No status claims - nothing here checks the system's health. */}
      <footer className="app-footer mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid gap-6 md:grid-cols-[1fr_1.6fr] items-start">
          <div className="flex items-start gap-3">
            <BrandMark size={38} />
            <div>
              <strong className="block text-[15px] font-bold" style={{ color: "var(--text)" }}>CyBridge</strong>
              <p className="text-[12.5px] leading-relaxed mt-1" style={{ color: "var(--text-mute)" }}>
                From business demand to workforce readiness. Scores are computed from workforce
                records; the AI copilots run on Google Gemini, called from the server only.
              </p>
            </div>
          </div>
          <div>
            <p className="stat-label mb-2">The loop</p>
            <ol className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Demand to deployment">
              {["Demand", "Match", "Hand off", "Learn", "Validate", "Present", "Readiness"].map((step, i, all) => (
                <li key={step} className="flex items-center gap-1.5">
                  <span className="tag">{step}</span>
                  {i < all.length - 1 && <span aria-hidden="true" style={{ color: "var(--text-mute)" }}>→</span>}
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setActiveTab("guide")}
              className="mt-3 text-[12.5px] font-semibold cursor-pointer"
              style={{ color: "var(--accent)" }}
            >
              How it works →
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 text-[11.5px]" style={{ color: "var(--text-mute)" }}>
          © 2026 CyBridge
        </div>
      </footer>
      </div>
    </div>
  );
}

