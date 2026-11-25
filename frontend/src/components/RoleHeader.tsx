import React, { useEffect, useRef } from "react";
import { User, UserRole } from "../types";
import { BookOpen, LogIn, LogOut, Palette, Presentation } from "lucide-react";
import { BrandMark } from "./BrandLogo";
import { GUIDE, NAV_BY_ROLE, NavItem, ROLE_LABEL } from "./navigation";

interface RoleHeaderProps {
  currentUser: User | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
  onOpenThemeModal?: () => void;
  /** Set only where the demo tools are available. */
  onOpenDemo?: () => void;
  currentThemeName?: string;
  isShortlisted?: boolean;
}

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
  onOpenDemo,
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
              <span className="hidden sm:block lg:hidden xl:block text-[10px] font-mono uppercase tracking-[0.14em]" style={{ color: "var(--text-mute)" }}>
                Workforce capability
              </span>
            </span>
          </button>

          {currentUser && (
            <NavTabs items={items} activeTab={activeTab} onTabChange={onTabChange} className="hidden lg:flex items-center gap-1 ml-4" />
          )}

          <div className="ml-auto flex items-center gap-2 min-w-0">
            {!currentUser && (
              <button type="button" onClick={() => onTabChange("guide")} className="header-btn" aria-current={activeTab === "guide" ? "page" : undefined}>
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">How it works</span>
              </button>
            )}

            {onOpenDemo && (
              <button type="button" id="header-demo-btn" onClick={onOpenDemo} className="header-btn" title="Demo tools: switch person, script, reset">
                <Presentation className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline lg:hidden xl:inline">Demo</span>
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
                <div className="flex items-center gap-2.5 pl-1 min-w-0" title={`${currentUser.name}, ${ROLE_LABEL[currentUser.role]} · ${currentUser.title}`}>
                  <img
                    src={currentUser.avatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover shrink-0"
                    style={{ border: "2px solid rgb(var(--accent-rgb) / 45%)" }}
                  />
                  <span className="hidden md:block lg:hidden xl:block leading-tight text-left min-w-0">
                    <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--text)" }}>{currentUser.name}</span>
                    <span className="block truncate text-[11px]" style={{ color: "var(--text-mute)" }}>
                      {ROLE_LABEL[currentUser.role]} · {currentUser.title}
                    </span>
                  </span>
                </div>
                {onLogout && (
                  <button type="button" id="header-logout-btn" onClick={onLogout} className="header-btn" title="Sign out" aria-label="Sign out">
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline lg:hidden">Sign out</span>
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

