import React, { useEffect, useRef } from "react";
import { User, UserRole } from "../types";
import {
  BarChart3, BookOpen, Compass, GraduationCap, LayoutDashboard, LogIn, LogOut,
  MessagesSquare, Palette, Sparkles, Target, TrendingUp, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Shown as a tooltip: what the page is for. */
  hint: string;
}

// The pages each role can open, home first. Mirrors the role guards on the server:
// a tab that is not listed here is also refused by the API.
export const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  [UserRole.EMPLOYEE]: [
    { id: "dashboard", label: "My readiness", icon: LayoutDashboard, hint: "Your capability score, learning plan, evidence and interview practice" },
    { id: "ai_hub", label: "SkillGap agent", icon: Sparkles, hint: "Talk to the SkillGap-to-Growth agent and the Learning Concierge" },
  ],
  [UserRole.MANAGER]: [
    { id: "manager_dash", label: "Team board", icon: Users, hint: "Your direct reports: Skill-vs-Will, evidence to review, coaching" },
    { id: "project_demand", label: "Demand to deploy", icon: Target, hint: "Capture client demand, match people, hand off skill gaps" },
    { id: "ai_hub", label: "GROW coach", icon: MessagesSquare, hint: "The Manager GROW Coach copilot" },
  ],
  [UserRole.LD]: [
    { id: "ld_dash", label: "L&D insights", icon: GraduationCap, hint: "Workforce readiness, skill gaps, learning tracks and campaigns" },
    { id: "project_demand", label: "Demand to deploy", icon: Target, hint: "Capture client demand, match people, hand off skill gaps" },
    { id: "ai_hub", label: "Analytics AI", icon: BarChart3, hint: "The Capability Analytics copilot" },
  ],
  [UserRole.LEADERSHIP]: [
    { id: "leadership_dash", label: "Readiness", icon: TrendingUp, hint: "The Enterprise Readiness Index, risk, and supply against demand" },
    { id: "project_demand", label: "Demand to deploy", icon: Target, hint: "Capture client demand, match people, hand off skill gaps" },
    { id: "ai_hub", label: "Strategy AI", icon: Compass, hint: "The Capability Analytics copilot for board briefings" },
  ],
};

const GUIDE: NavItem = { id: "guide", label: "How it works", icon: BookOpen, hint: "The demand-to-deployment loop, the roles, the copilots and the numbers" };

export const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.EMPLOYEE]: "Employee",
  [UserRole.MANAGER]: "Manager",
  [UserRole.LD]: "L&D",
  [UserRole.LEADERSHIP]: "Leadership",
};

const NavTabs: React.FC<{ items: NavItem[]; activeTab: string; onTabChange: (tab: string) => void; className?: string }> = ({
  items, activeTab, onTabChange, className = "",
}) => {
  const nav = useRef<HTMLElement>(null);
  // In the scrolling row on small screens, keep the current page's tab in view.
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const row = nav.current;
    if (!active || !row || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2, behavior: "smooth" });
  }, [activeTab]);

  return (
  <nav ref={nav} aria-label="Workspace" className={className}>
    {items.map(item => {
      const active = item.id === activeTab;
      const Icon = item.icon;
      return (
        <button
          key={item.id}
          id={`nav-${item.id}`}
          type="button"
          title={item.hint}
          aria-current={active ? "page" : undefined}
          data-active={active}
          onClick={() => onTabChange(item.id)}
          className="nav-link"
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{item.label}</span>
        </button>
      );
    })}
  </nav>
  );
};

export const RoleHeader: React.FC<RoleHeaderProps> = ({
  currentUser,
  activeTab,
  onTabChange,
  onLogout,
  onOpenThemeModal,
}) => {
  const items = currentUser ? [...NAV_BY_ROLE[currentUser.role], GUIDE] : [];

  return (
    <header className="app-header sticky top-0 z-40 animate-fade-in-down">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 h-16">
          <button
            type="button"
            onClick={() => onTabChange(currentUser ? NAV_BY_ROLE[currentUser.role][0].id : "home")}
            className="flex items-center gap-2.5 shrink-0 cursor-pointer"
            aria-label="CyBridge home"
          >
            <BrandMark size={36} />
            <span className="text-left leading-tight">
              <span className="block font-extrabold text-[17px] tracking-tight gradient-text">CyBridge</span>
              <span className="hidden sm:block text-[10px] font-mono uppercase tracking-[0.14em]" style={{ color: "var(--text-mute)" }}>
                Workforce capability
              </span>
            </span>
          </button>

          {currentUser && (
            <NavTabs items={items} activeTab={activeTab} onTabChange={onTabChange} className="hidden lg:flex items-center gap-1 ml-4" />
          )}

          <div className="ml-auto flex items-center gap-2">
            {!currentUser && (
              <button type="button" onClick={() => onTabChange("guide")} className="header-btn" aria-current={activeTab === "guide" ? "page" : undefined}>
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">How it works</span>
              </button>
            )}

            {onOpenThemeModal && (
              <button type="button" id="header-theme-btn" onClick={onOpenThemeModal} className="header-btn" title="Change the colour theme">
                <Palette className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Theme</span>
              </button>
            )}

            {currentUser ? (
              <>
                <div className="flex items-center gap-2.5 pl-1">
                  <img
                    src={currentUser.avatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                    style={{ border: "2px solid rgb(var(--accent-rgb) / 45%)" }}
                  />
                  <span className="hidden md:block leading-tight text-left">
                    <span className="block text-[13px] font-semibold" style={{ color: "var(--text)" }}>{currentUser.name}</span>
                    <span className="block text-[11px]" style={{ color: "var(--text-mute)" }}>
                      {ROLE_LABEL[currentUser.role]} · {currentUser.title}
                    </span>
                  </span>
                </div>
                {onLogout && (
                  <button type="button" id="header-logout-btn" onClick={onLogout} className="header-btn" title="Sign out">
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Sign out</span>
                  </button>
                )}
              </>
            ) : (
              <button type="button" onClick={() => onTabChange("login")} className="header-btn header-btn-primary">
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>Sign in</span>
              </button>
            )}
          </div>
        </div>

        {currentUser && (
          <NavTabs items={items} activeTab={activeTab} onTabChange={onTabChange} className="lg:hidden relative flex items-center gap-1 overflow-x-auto pb-2 -mx-1 px-1" />
        )}
      </div>
    </header>
  );
};

