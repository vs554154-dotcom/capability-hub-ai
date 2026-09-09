import React from "react";
import { User, UserRole } from "../types";
import { Users, Shield, Sparkles, Building2, TrendingUp, LogOut, Palette } from "lucide-react";
import { BrandMark } from "./BrandLogo";

interface RoleHeaderProps {
  currentUser: User | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
  onOpenThemeModal?: () => void;
  currentThemeName?: string;
  isShortlisted?: boolean;
}

export const RoleHeader: React.FC<RoleHeaderProps> = ({
  currentUser,
  activeTab,
  onTabChange,
  onLogout,
  onOpenThemeModal,
  currentThemeName = "Enterprise Midnight",
  isShortlisted = false,
}) => {
  // Unauthenticated or Home Landing Header
  if (!currentUser || activeTab === "home") {
    return (
      <header className="app-header relative bg-[#0F1724] text-[#F0F4FF] sticky top-0 z-40 border-b border-[#2A384C] shadow-lg animate-fade-in-down">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between py-3.5 gap-4">

            {/* Logo & Platform Name */}
            <div className="flex items-center gap-3">
              <BrandMark size={46} />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-lg sm:text-xl tracking-tight gradient-text">
                    CyBridge - Workforce Capability Agent
                  </h1>
                  <span className="text-[10px] font-mono font-bold bg-[#10B981]/15 text-[#10B981] px-2 py-0.5 rounded border border-[#10B981]/30 hidden sm:inline-flex items-center gap-1.5">
                    <span className="status-dot h-1.5 w-1.5 rounded-full bg-[#10B981] inline-block" />
                    Live Data
                  </span>
                </div>
                <p className="text-[10px] font-mono tracking-[0.12em] text-[#4F8EF7] uppercase font-semibold">
                  From Demand to Workforce Readiness
                </p>
              </div>
            </div>

            {/* Landing Header Right Actions */}
            <div className="flex items-center gap-2.5">
              {onOpenThemeModal && (
                <button
                  id="header-theme-btn"
                  onClick={onOpenThemeModal}
                  title="Customize UI/UX Visual Theme"
                  className="flex items-center gap-1.5 bg-[#141E30] hover:bg-[#1E293B] text-[#4F8EF7] hover:text-white border border-[#4F8EF7]/50 text-xs font-mono font-bold py-2 px-3 rounded-lg transition-all cursor-pointer shadow-sm"
                >
                  <Palette className="h-3.5 w-3.5 text-[#4F8EF7]" />
                  <span className="hidden md:inline">Theme Options</span>
                </button>
              )}

              {currentUser ? (
                <button
                  onClick={() => {
                    if (currentUser.role === UserRole.EMPLOYEE) onTabChange("dashboard");
                    else if (currentUser.role === UserRole.MANAGER) onTabChange("manager_dash");
                    else if (currentUser.role === UserRole.LD) onTabChange("ld_dash");
                    else onTabChange("leadership_dash");
                  }}
                  className="flex items-center gap-2 bg-[#4F8EF7] hover:bg-[#3B82F6] text-white text-xs font-mono font-bold py-2 px-4 rounded-lg transition-all cursor-pointer shadow-md"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Go to {currentUser.role === UserRole.EMPLOYEE ? "Employee Portal" : "Manager Cockpit"}</span>
                </button>
              ) : (
                <button
                  onClick={() => onTabChange("login")}
                  className="flex items-center gap-2 bg-[#4F8EF7] hover:bg-[#3B82F6] text-white text-xs font-mono font-bold py-2 px-4 rounded-lg transition-all cursor-pointer shadow-md"
                >
                  <LogOut className="h-3.5 w-3.5 rotate-180" />
                  <span>Log In to Portal</span>
                </button>
              )}
            </div>

          </div>
        </div>
      </header>
    );
  }

  // Human-readable label for the signed-in role. There is deliberately no persona
  // switcher: changing who you are requires signing out and authenticating again.
  const roleLabel =
    currentUser.role === UserRole.EMPLOYEE ? "Employee Portal" :
    currentUser.role === UserRole.MANAGER ? "Manager Cockpit" :
    currentUser.role === UserRole.LD ? "L&D Strategy Console" :
    "Executive Console";

  return (
    <header className="app-header relative bg-[#0F1724] text-[#F0F4FF] sticky top-0 z-40 border-b border-[#2A384C] shadow-lg animate-fade-in-down">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between py-4 gap-4">

          {/* Logo & Platform Name */}
          <div className="flex items-center gap-3">
            <BrandMark size={44} />
            <div>
              <h1 className="font-bold text-xl tracking-tight gradient-text">
                CyBridge - Workforce Capability Agent
              </h1>
              <p className="text-[10px] font-mono tracking-[0.15em] text-[#4F8EF7] uppercase font-semibold">
                Agentic Learning & Capability Intelligence Platform
              </p>
            </div>
          </div>

          {/* Role Header Center: Persona Switcher or Employee Badge */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Signed-in identity is fixed for the session. Switching accounts means
                logging out and authenticating as someone else. */}
            <div className="flex items-center gap-2.5 bg-[#141E30] py-1.5 px-3.5 rounded-md border border-[#2A384C]">
              <Shield className="h-4 w-4 text-[#4F8EF7]" />
              <span className="text-xs font-mono font-bold text-[#F0F4FF]">{roleLabel}</span>
              <span className="text-[10px] font-mono font-bold bg-[#4F8EF7]/20 text-[#4F8EF7] px-2 py-0.5 rounded border border-[#4F8EF7]/30">
                {currentUser.name}
              </span>
            </div>

            {onOpenThemeModal && (
              <button
                id="header-theme-btn"
                onClick={onOpenThemeModal}
                title="Customize UI/UX Visual Theme"
                className="flex items-center gap-1.5 bg-[#141E30] hover:bg-[#1E293B] text-[#4F8EF7] hover:text-white border border-[#4F8EF7]/50 text-xs font-mono font-bold py-2 px-3 rounded-md transition-all cursor-pointer shadow-sm"
              >
                <Palette className="h-3.5 w-3.5 text-[#4F8EF7]" />
                <span className="hidden md:inline">Theme Options</span>
              </button>
            )}

            {onLogout && (
              <button
                id="header-logout-btn"
                onClick={onLogout}
                title="Log out to Resource Login Gateway"
                className="flex items-center gap-1.5 bg-[#141E30] hover:bg-rose-500/20 text-[#94A3B8] hover:text-rose-400 border border-[#2A384C] hover:border-rose-500/40 text-xs font-mono font-semibold py-2 px-3 rounded-md transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout Portal</span>
              </button>
            )}

          </div>

          {/* User Profile Badge */}
          <div className="flex items-center gap-3">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="h-9 w-9 rounded-full border border-[#4F8EF7] bg-[#141E30] object-cover"
            />
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-[#F0F4FF] leading-tight">{currentUser.name}</p>
              <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-mono font-medium">{currentUser.title}</p>
            </div>
          </div>

        </div>

        {/* Global Navigation Tabs.
            No "Home Landing & Portal" tab here on purpose: that page is the signed-out
            marketing/login surface. Once someone is authenticated the nav should offer
            only the workspaces their role can actually use, plus Logout above - showing
            a route back to the sales page is confusing and has no function post-login. */}
        <div className="flex space-x-2 border-t border-[#2A384C]/80 overflow-x-auto pt-2 pb-0.5">
          {/* DEMAND-TO-DEPLOYMENT AGENT — talent sourcing, so managers and above only */}
          {currentUser.role !== UserRole.EMPLOYEE && (
          <button
            id="tab-btn-project-demand"
            onClick={() => onTabChange("project_demand")}
            className={`nav-tab flex items-center gap-2 px-4 py-2.5 text-xs uppercase font-mono font-bold rounded-t-lg border-b-2 cursor-pointer shrink-0 ${
              activeTab === "project_demand"
                ? "bg-[#141E30] text-[#4F8EF7] border-[#4F8EF7]"
                : "text-[#94A3B8] border-transparent hover:text-white hover:border-[#2A384C]"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-[#4F8EF7] shrink-0" />
            Demand-to-Deployment Agent
          </button>
          )}

          {/* EMPLOYEE VIEWS - FULL ACCESS TO SKILLGAP AGENT & LEARNING PORTAL */}
          {currentUser.role === UserRole.EMPLOYEE && (
            <>
              <button
                id="tab-btn-emp-ai"
                onClick={() => onTabChange("ai_hub")}
                className={`nav-tab flex items-center gap-2 px-4 py-2.5 text-xs uppercase font-mono font-bold rounded-t-lg border-b-2 cursor-pointer shrink-0 ${
                  activeTab === "ai_hub"
                    ? "bg-[#141E30] text-[#4F8EF7] border-[#4F8EF7]"
                    : "text-[#94A3B8] border-transparent hover:text-white hover:border-[#2A384C]"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-[#10B981] shrink-0" />
                SkillGap Agent: Interactive Intake
              </button>
              <button
                id="tab-btn-emp-dash"
                onClick={() => onTabChange("dashboard")}
                className={`nav-tab flex items-center gap-2 px-4 py-2.5 text-xs uppercase font-mono font-bold rounded-t-lg border-b-2 cursor-pointer shrink-0 ${
                  activeTab === "dashboard"
                    ? "bg-[#141E30] text-[#4F8EF7] border-[#4F8EF7]"
                    : "text-[#94A3B8] border-transparent hover:text-white hover:border-[#2A384C]"
                }`}
              >
                <Shield className="h-3.5 w-3.5 text-[#4F8EF7] shrink-0" />
                SkillGap Agent: Learning Plan & Assessment
              </button>
            </>
          )}

          {currentUser.role === UserRole.MANAGER && (
            <>
              <button
                id="tab-btn-mgr-dash"
                onClick={() => onTabChange("manager_dash")}
                className={`nav-tab flex items-center gap-2 px-4 py-2.5 text-xs uppercase font-mono font-bold rounded-t-lg border-b-2 cursor-pointer shrink-0 ${
                  activeTab === "manager_dash"
                    ? "bg-[#141E30] text-[#4F8EF7] border-[#4F8EF7]"
                    : "text-[#94A3B8] border-transparent hover:text-white hover:border-[#2A384C]"
                }`}
              >
                <Shield className="h-3.5 w-3.5 shrink-0" />
                Manager Capability Board
              </button>
              <button
                id="tab-btn-mgr-ai"
                onClick={() => onTabChange("ai_hub")}
                className={`nav-tab flex items-center gap-2 px-4 py-2.5 text-xs uppercase font-mono font-bold rounded-t-lg border-b-2 cursor-pointer shrink-0 ${
                  activeTab === "ai_hub"
                    ? "bg-[#141E30] text-[#4F8EF7] border-[#4F8EF7]"
                    : "text-[#94A3B8] border-transparent hover:text-white hover:border-[#2A384C]"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-[#4F8EF7] shrink-0" />
                Manager GROW Coach AI
              </button>
            </>
          )}

          {currentUser.role === UserRole.LD && (
            <>
              <button
                id="tab-btn-ld-dash"
                onClick={() => onTabChange("ld_dash")}
                className={`nav-tab flex items-center gap-2 px-4 py-2.5 text-xs uppercase font-mono font-bold rounded-t-lg border-b-2 cursor-pointer shrink-0 ${
                  activeTab === "ld_dash"
                    ? "bg-[#141E30] text-[#4F8EF7] border-[#4F8EF7]"
                    : "text-[#94A3B8] border-transparent hover:text-white hover:border-[#2A384C]"
                }`}
              >
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                L&D Strategy & Insights
              </button>
              <button
                id="tab-btn-ld-ai"
                onClick={() => onTabChange("ai_hub")}
                className={`nav-tab flex items-center gap-2 px-4 py-2.5 text-xs uppercase font-mono font-bold rounded-t-lg border-b-2 cursor-pointer shrink-0 ${
                  activeTab === "ai_hub"
                    ? "bg-[#141E30] text-[#4F8EF7] border-[#4F8EF7]"
                    : "text-[#94A3B8] border-transparent hover:text-white hover:border-[#2A384C]"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-[#4F8EF7] shrink-0" />
                Capability Analytics AI
              </button>
            </>
          )}

          {currentUser.role === UserRole.LEADERSHIP && (
            <>
              <button
                id="tab-btn-exec-dash"
                onClick={() => onTabChange("leadership_dash")}
                className={`nav-tab flex items-center gap-2 px-4 py-2.5 text-xs uppercase font-mono font-bold rounded-t-lg border-b-2 cursor-pointer shrink-0 ${
                  activeTab === "leadership_dash"
                    ? "bg-[#141E30] text-[#4F8EF7] border-[#4F8EF7]"
                    : "text-[#94A3B8] border-transparent hover:text-white hover:border-[#2A384C]"
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                Executive Capability Trends
              </button>
              <button
                id="tab-btn-exec-ai"
                onClick={() => onTabChange("ai_hub")}
                className={`nav-tab flex items-center gap-2 px-4 py-2.5 text-xs uppercase font-mono font-bold rounded-t-lg border-b-2 cursor-pointer shrink-0 ${
                  activeTab === "ai_hub"
                    ? "bg-[#141E30] text-[#4F8EF7] border-[#4F8EF7]"
                    : "text-[#94A3B8] border-transparent hover:text-white hover:border-[#2A384C]"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-[#4F8EF7] shrink-0" />
                Strategic AI Orchestrator
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
