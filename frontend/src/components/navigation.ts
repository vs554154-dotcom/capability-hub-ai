import {
  BarChart3, BookOpen, Compass, GraduationCap, LayoutDashboard, MessagesSquare, Sparkles,
  Target, TrendingUp, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { UserRole } from "../types";

// Navigation data, kept apart from the header component so hot reload keeps working.

export interface NavItem {
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
    { id: "ld_dash", label: "L&D insights", icon: GraduationCap, hint: "Readiness by department, upskilling campaigns and learning tracks" },
    { id: "project_demand", label: "Demand to deploy", icon: Target, hint: "Capture client demand, match people, hand off skill gaps" },
    { id: "ai_hub", label: "Strategy AI", icon: Compass, hint: "The Capability Analytics copilot for board briefings" },
  ],
};

export const GUIDE: NavItem = { id: "guide", label: "How it works", icon: BookOpen, hint: "The demand-to-deployment loop, the roles, the copilots and the numbers" };

export const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.EMPLOYEE]: "Employee",
  [UserRole.MANAGER]: "Manager",
  [UserRole.LD]: "L&D",
  [UserRole.LEADERSHIP]: "Leadership",
};

