import React from "react";
import {
  ArrowRight, BarChart3, BookOpen, CheckCircle2, ClipboardCheck, FileText, GraduationCap,
  Lock, MessagesSquare, Search, Sparkles, Target, TrendingUp, UserCheck, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { User, UserRole } from "../types";
import { NAV_BY_ROLE, ROLE_LABEL } from "./navigation";
import { PageHeader, SectionCard, Tag } from "./ui/Page";

interface GuidePageProps {
  currentUser: User | null;
  onNavigate: (tab: string) => void;
}

interface Step {
  title: string;
  icon: LucideIcon;
  who: UserRole[];
  /** The page where this step happens, as a tab id. */
  where: string;
  whereLabel: string;
  what: string;
  recorded: string;
}

const STAFF = [UserRole.MANAGER, UserRole.LD, UserRole.LEADERSHIP];

const LOOP: Step[] = [
  {
    title: "Capture the demand", icon: FileText, who: STAFF,
    where: "project_demand", whereLabel: "Demand to deploy",
    what: "Paste a client's job description. Gemini extracts the required skills, experience band and interview date.",
    recorded: "A project demand",
  },
  {
    title: "Match the bench", icon: Search, who: STAFF,
    where: "project_demand", whereLabel: "Demand to deploy",
    what: "Every employee is scored against the demand: 45% technical, 20% domain, 15% experience, 20% readiness, with a written \"why this candidate\".",
    recorded: "Nothing until you act - matching is read-only",
  },
  {
    title: "Hand off the gaps", icon: ArrowRight, who: STAFF,
    where: "project_demand", whereLabel: "Demand to deploy",
    what: "Missing skills go to the SkillGap agent: today's levels are captured as a baseline and the employee is told to start. A manager or L&D then assigns a project learning track.",
    recorded: "Skill baselines and an escalation to the employee",
  },
  {
    title: "Learn and prove it", icon: GraduationCap, who: [UserRole.EMPLOYEE],
    where: "dashboard", whereLabel: "My readiness",
    what: "Work through the learning steps, practise the JD interview, and submit workplace evidence for each skill.",
    recorded: "Step progress, quiz scores, evidence",
  },
  {
    title: "Validate", icon: UserCheck, who: [UserRole.MANAGER],
    where: "manager_dash", whereLabel: "Team board",
    what: "The manager reviews evidence; each approval raises that skill one level. After training, a GROW post-assessment is signed off as cleared or not ready.",
    recorded: "Evidence verdicts, new skill levels, the signed-off assessment",
  },
  {
    title: "Present to the client", icon: ClipboardCheck, who: STAFF,
    where: "project_demand", whereLabel: "Demand to deploy",
    what: "A completed project track, a cleared sign-off and growth over the baseline unlock the client resume, written only from verified facts.",
    recorded: "Nothing new: the resume is built from the records above",
  },
  {
    title: "Watch readiness", icon: TrendingUp, who: [UserRole.LD, UserRole.LEADERSHIP],
    where: "leadership_dash", whereLabel: "Readiness / L&D insights",
    what: "The Enterprise Readiness Index, skill-gap risk and supply against open demand show where the workforce stands.",
    recorded: "One readiness reading per day",
  },
];

const ROLES: { role: UserRole; scope: string; does: string; copilot: string }[] = [
  {
    role: UserRole.EMPLOYEE, scope: "Your own records",
    does: "Sees their capability score and learning plan, practises interviews, submits evidence.",
    copilot: "SkillGap-to-Growth agent and Learning Concierge",
  },
  {
    role: UserRole.MANAGER, scope: "You and your direct reports",
    does: "Places the team on the Skill-vs-Will matrix, reviews evidence, coaches, signs off readiness, sources talent for demands.",
    copilot: "Manager GROW Coach",
  },
  {
    role: UserRole.LD, scope: "The whole organisation",
    does: "Tracks workforce readiness and the most common gaps, assigns learning tracks and campaigns.",
    copilot: "Capability Analytics AI",
  },
  {
    role: UserRole.LEADERSHIP, scope: "The whole organisation",
    does: "Reads the readiness index, risk and supply against demand, and drafts board briefings.",
    copilot: "Capability Analytics AI",
  },
];

const COPILOTS: { name: string; icon: LucideIcon; for: string; does: string }[] = [
  { name: "SkillGap-to-Growth", icon: Target, for: "Employees", does: "Compares your levels with your target role, names the gaps and lays out a roadmap sized to your interview date." },
  { name: "Learning Concierge", icon: BookOpen, for: "Employees", does: "A 1-on-1 technical mentor: explains concepts and recommends courses from the catalogue." },
  { name: "Manager GROW Coach", icon: MessagesSquare, for: "Managers", does: "Turns a report's skills and evidence into Goal, Reality, Options and Will coaching questions." },
  { name: "Capability Analytics", icon: BarChart3, for: "L&D and leadership", does: "Briefs from the organisation's figures - the index, its components, risk and supply - and says when a figure is not measured." },
];

const NUMBERS: { name: string; means: string }[] = [
  { name: "Skill", means: "Average skill level as a share of level 5, plus 5 points per manager-approved piece of evidence. The matrix's vertical axis." },
  { name: "Will", means: "Behaviour, not a survey: 40% learning follow-through, 30% evidence initiative, 20% goal progress, 10% having chosen a target role." },
  { name: "Skill-vs-Will quadrant", means: "Skill and Will both 60+ is Deploy Now; high Will only, Accelerate Learning; high Skill only, Retain & Coach; neither, Intervention Required." },
  { name: "Capability Readiness Score", means: "How close current levels are to what the target role requires, plus up to 15 points for approved evidence." },
  { name: "Match score", means: "How well a person fits a demand: 45% technical, 20% domain, 15% experience, 20% readiness." },
  { name: "Enterprise Readiness Index", means: "Eight weighted components. Those with no stored data (today: interview assessments, certifications) are shown as not measured and left out, never estimated." },
];

export const GuidePage: React.FC<GuidePageProps> = ({ currentUser, onNavigate }) => {
  const reachable = new Set(currentUser ? NAV_BY_ROLE[currentUser.role].map(n => n.id) : []);
  // L&D reaches readiness through its own dashboard.
  const resolve = (tab: string) =>
    tab === "leadership_dash" && currentUser?.role === UserRole.LD ? "ld_dash" : tab;

  return (
    <div className="space-y-6 py-6">
      <PageHeader
        eyebrow="Guide"
        icon={BookOpen}
        title="How CyBridge works"
        lede={
          <>
            CyBridge turns a client's demand for skills into people who are ready to deploy, and
            shows leadership how ready the workforce is. Below: the loop from demand to deployment,
            who does each step and where, what each role can see, the four AI copilots, and what
            every number means.
          </>
        }
        steps={[
          <><strong>Follow the loop</strong> from a client demand to a deployed, evidenced person.</>,
          <><strong>Find your role</strong> to see your workspaces and what data you can reach.</>,
          <><strong>Check a number</strong> in the definitions at the end.</>,
        ]}
      />

      <SectionCard
        title="From demand to deployment"
        subtitle="Seven steps. Each happens on one page and leaves a record the next step builds on."
        icon={Sparkles}
      >
        <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {LOOP.map((step, i) => {
            const Icon = step.icon;
            const target = resolve(step.where);
            const canOpen = reachable.has(target);
            return (
              <li key={step.title} className="stat-tile flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid place-items-center h-7 w-7 rounded-full text-[12px] font-bold font-mono flex-none"
                        style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "var(--on-accent)" }}>
                    {i + 1}
                  </span>
                  <Icon className="h-4 w-4 flex-none" style={{ color: "var(--accent)" }} aria-hidden="true" />
                  <strong className="text-[13.5px]" style={{ color: "var(--text)" }}>{step.title}</strong>
                </div>
                <p className="text-[12.5px] leading-relaxed flex-1" style={{ color: "var(--text-dim)" }}>{step.what}</p>
                <div className="flex flex-wrap gap-1.5">
                  {step.who.map(r => <Tag key={r}>{ROLE_LABEL[r]}</Tag>)}
                </div>
                <p className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>
                  <strong>Recorded:</strong> {step.recorded}
                </p>
                {canOpen ? (
                  <button type="button" onClick={() => onNavigate(target)}
                          className="self-start inline-flex items-center gap-1.5 text-[12px] font-semibold cursor-pointer"
                          style={{ color: "var(--accent)" }}>
                    Open {step.whereLabel} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>On: {step.whereLabel}</span>
                )}
              </li>
            );
          })}
        </ol>
      </SectionCard>

      <SectionCard
        title="Who sees what"
        subtitle="Access is enforced by the server on every request, not only hidden in the interface."
        icon={Users}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ROLES.map(r => {
            const you = currentUser?.role === r.role;
            return (
              <div key={r.role} className="stat-tile flex flex-col gap-2"
                   style={you ? { borderColor: "rgb(var(--accent-rgb) / 55%)", boxShadow: "var(--shadow-glow)" } : undefined}>
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-[14px]" style={{ color: "var(--text)" }}>{ROLE_LABEL[r.role]}</strong>
                  {you && <Tag tone="accent">You</Tag>}
                </div>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-dim)" }}>{r.does}</p>
                <p className="text-[11.5px] flex items-center gap-1.5" style={{ color: "var(--text-mute)" }}>
                  <Lock className="h-3 w-3 flex-none" aria-hidden="true" /> Data: {r.scope}
                </p>
                <p className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>Copilot: {r.copilot}</p>
                <p className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>
                  Pages: {NAV_BY_ROLE[r.role].map(n => n.label).join(" · ")}
                </p>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="The four copilots"
          subtitle="Answered by Gemini on the server. Without a model they reply with a clearly marked summary computed from your data."
          icon={MessagesSquare}
        >
          <ul className="space-y-3">
            {COPILOTS.map(c => {
              const Icon = c.icon;
              return (
                <li key={c.name} className="flex gap-3">
                  <span className="section-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-[13.5px]" style={{ color: "var(--text)" }}>{c.name}</strong>
                      <Tag>{c.for}</Tag>
                    </div>
                    <p className="text-[12.5px] leading-relaxed mt-0.5" style={{ color: "var(--text-dim)" }}>{c.does}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard
          title="What the numbers mean"
          subtitle="Every score is computed from stored records."
          icon={CheckCircle2}
        >
          <dl className="space-y-3">
            {NUMBERS.map(n => (
              <div key={n.name}>
                <dt className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{n.name}</dt>
                <dd className="text-[12.5px] leading-relaxed mt-0.5" style={{ color: "var(--text-dim)" }}>{n.means}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>

      {!currentUser && (
        <div className="flex justify-center">
          <button type="button" onClick={() => onNavigate("login")} className="header-btn header-btn-primary">
            Sign in to your workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};
