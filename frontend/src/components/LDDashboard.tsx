import React, { useEffect, useState } from "react";
import { AgentReminder, LearningCourse } from "../types";
import {
  AlertTriangle, BellRing, BookOpen, CheckCircle2, Cpu, FileText, GraduationCap, Grid3x3, Info,
  LifeBuoy, RefreshCw, Sparkles,
} from "lucide-react";
import { ResourceLearningTracker } from "./ResourceLearningTracker";
import { PageHeader, SectionCard, StatTile, Tag } from "./ui/Page";
import { Markdown } from "./ui/Markdown";

interface LDDashboardProps {
  courses: LearningCourse[];
  analyticsReport: string;
  isAnalyticsLoading: boolean;
  onGenerateAnalytics: () => void;
}

interface WorkforceMetrics {
  employeeCount: number;
  readinessIndex: number;
  activeLearners: number;
  verifiedEvidence: number;
  topSkillGap: { skillName: string; employeesBelowTarget: number } | null;
}

interface Cohort {
  skillId: string;
  skillName: string;
  employeesTargeting: number;
  belowTarget: number;
  gapShare: number;
}

interface LDOverview {
  departments: { name: string; employees: number }[];
  heatmap: {
    skillId: string;
    skillName: string;
    employees: number;
    cells: { department: string; employees: number; targetReached: number | null }[];
  }[];
  cohorts: Cohort[];
}

/** One hue, stronger where more of the target has been reached. */
const cellStyle = (value: number | null): React.CSSProperties =>
  value === null
    ? { background: "var(--surface-2)", color: "var(--text-mute)" }
    : { background: `rgb(var(--accent-rgb) / ${(0.06 + (value / 100) * 0.4).toFixed(3)})`, color: "var(--text)" };

export const LDDashboard: React.FC<LDDashboardProps> = ({
  courses,
  analyticsReport,
  isAnalyticsLoading,
  onGenerateAnalytics,
}) => {
  const [metrics, setMetrics] = useState<WorkforceMetrics | null>(null);
  const [overview, setOverview] = useState<LDOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [escalations, setEscalations] = useState<AgentReminder[] | null>(null);
  const [cohortId, setCohortId] = useState("");
  const [campaignState, setCampaignState] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "done"; text: string } | { kind: "error"; text: string }
  >({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    // Managers' requests for L&D help, newest first.
    fetch("/api/reminders")
      .then(res => (res.ok ? res.json() : []))
      .then((rows: AgentReminder[]) => !cancelled && setEscalations(rows.filter(r => r.type === "ld_escalation")))
      .catch(() => !cancelled && setEscalations([]));

    Promise.all([fetch("/api/analytics/workforce"), fetch("/api/analytics/ld")])
      .then(async ([m, o]) => {
        if (!m.ok || !o.ok) throw new Error(`analytics answered ${m.status} / ${o.status}`);
        const [mj, oj] = await Promise.all([m.json(), o.json()]);
        if (cancelled) return;
        setMetrics(mj);
        setOverview(oj);
        if (oj.cohorts.length) setCohortId(oj.cohorts[0].skillId);
      })
      .catch(err => !cancelled && setLoadError(err.message));
    return () => { cancelled = true; };
  }, []);

  const cohort = overview?.cohorts.find(c => c.skillId === cohortId);

  const launchCampaign = async () => {
    if (!cohort) return;
    setCampaignState({ kind: "sending" });
    try {
      const res = await fetch("/api/analytics/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: cohort.skillId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `The server answered ${res.status}`);
      setCampaignState({
        kind: "done",
        text: `Reminded ${data.reminded} employee${data.reminded === 1 ? "" : "s"} about ${data.skillName}.`,
      });
    } catch (err: any) {
      setCampaignState({ kind: "error", text: err.message });
    }
  };

  const stat = (value: number | undefined | null, suffix = "") =>
    metrics && value !== undefined && value !== null ? `${value}${suffix}` : "–";

  return (
    <div className="space-y-6 py-6">
      <PageHeader
        eyebrow="L&D workspace · Insights"
        icon={GraduationCap}
        title="Workforce learning and readiness"
        lede={
          <>
            Where skills stand across the organisation, which groups are furthest from their
            targets, and the levers L&D pulls: campaigns that remind the people below target, and
            learning tracks sized to each person's deadline.
          </>
        }
        steps={[
          <><strong>Read the totals</strong> for the whole workforce.</>,
          <><strong>Scan the heatmap</strong> for departments lagging on a skill.</>,
          <><strong>Launch a campaign</strong> to remind everyone below target.</>,
          <><strong>Assign tracks</strong> to individuals at the bottom of the page.</>,
        ]}
      />

      {loadError && (
        <SectionCard title="Analytics unavailable" icon={AlertTriangle}>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            The workforce figures could not be loaded ({loadError}). Refresh the page to try again.
          </p>
        </SectionCard>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <StatTile label="Average Skill score" value={stat(metrics?.readinessIndex, "%")}
                  hint={`Across ${stat(metrics?.employeeCount)} employees`} />
        <StatTile label="Verified evidence" value={stat(metrics?.verifiedEvidence)} hint="Manager-approved submissions" />
        <StatTile label="Active learners" value={stat(metrics?.activeLearners)} hint="With a learning step under way or done" />
        <StatTile
          label="Largest skill gap"
          value={<span className="text-[20px] leading-tight block">{metrics?.topSkillGap?.skillName ?? "–"}</span>}
          hint={metrics?.topSkillGap ? `${metrics.topSkillGap.employeesBelowTarget} employees below target` : "No gaps recorded"}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <SectionCard
          className="xl:col-span-2"
          title="Skill readiness by department"
          subtitle="Share of the target level reached, averaged over the employees in each department working toward the skill. The skills most people work toward are listed first."
          icon={Grid3x3}
        >
          {!overview ? (
            <div className="skeleton h-64" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="data-table min-w-[620px]">
                  <thead>
                    <tr>
                      <th>Skill</th>
                      {overview.departments.map(d => (
                        <th key={d.name} className="num" title={`${d.employees} employees`}>{d.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overview.heatmap.map(row => (
                      <tr key={row.skillId}>
                        <td>
                          <span className="font-semibold block" style={{ color: "var(--text)" }}>{row.skillName}</span>
                          <span className="text-[11px]" style={{ color: "var(--text-mute)" }}>{row.employees} working toward it</span>
                        </td>
                        {row.cells.map(cell => (
                          <td key={cell.department} className="num" style={{ padding: "6px" }}>
                            <span
                              className="block rounded-md px-2 py-1.5 text-center text-[12px] font-semibold"
                              style={cellStyle(cell.targetReached)}
                              title={cell.targetReached === null
                                ? `Nobody in ${cell.department} works toward this skill`
                                : `${cell.employees} employee${cell.employees === 1 ? "" : "s"} in ${cell.department}`}
                            >
                              {cell.targetReached === null ? "–" : `${cell.targetReached}%`}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note mt-3">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-none" aria-hidden="true" />
                Darker means closer to target. A dash means nobody in that department works toward the skill.
              </p>
            </>
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard
            title="Upskilling campaign"
            subtitle="Remind everyone below target on one skill. Each person gets the reminder in their workspace inbox, with their own current and target level."
            icon={BellRing}
          >
            {!overview ? (
              <div className="skeleton h-32" />
            ) : overview.cohorts.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-dim)" }}>Nobody is below target on any skill.</p>
            ) : (
              <div className="space-y-3">
                <label htmlFor="campaign-cohort" className="stat-label block">Skill</label>
                <select
                  id="campaign-cohort"
                  value={cohortId}
                  onChange={e => { setCohortId(e.target.value); setCampaignState({ kind: "idle" }); }}
                  className="w-full text-[13px] p-2.5 rounded-lg"
                  style={{ border: "1px solid var(--line)" }}
                >
                  {overview.cohorts.map(c => (
                    <option key={c.skillId} value={c.skillId}>
                      {c.skillName} - {c.belowTarget} of {c.employeesTargeting} below target
                    </option>
                  ))}
                </select>
                <button
                  id="launch-cohort-campaign-btn"
                  type="button"
                  onClick={launchCampaign}
                  disabled={!cohort || campaignState.kind === "sending"}
                  className="header-btn header-btn-primary w-full justify-center disabled:opacity-60"
                >
                  {campaignState.kind === "sending"
                    ? <><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending…</>
                    : <><BellRing className="h-4 w-4" aria-hidden="true" /> Remind {cohort?.belowTarget ?? 0} employees</>}
                </button>
                {campaignState.kind === "done" && (
                  <p role="status"><Tag tone="ok"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />{campaignState.text}</Tag></p>
                )}
                {campaignState.kind === "error" && (
                  <p role="alert"><Tag tone="risk"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{campaignState.text}</Tag></p>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Escalations from managers"
            subtitle="Reports a manager has asked L&D to help with, from their Team board."
            icon={LifeBuoy}
            aside={escalations && escalations.length > 0 ? <Tag tone="warn">{escalations.length}</Tag> : undefined}
          >
            {escalations === null ? (
              <div className="skeleton h-16" />
            ) : escalations.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-dim)" }}>No escalations yet.</p>
            ) : (
              <ul className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {escalations.map(e => (
                  <li key={e.id} className="stat-tile" style={{ padding: "10px 12px" }}>
                    <span className="text-[12.5px] font-semibold block" style={{ color: "var(--text)" }}>{e.title}</span>
                    <span className="text-[11.5px] block mt-0.5" style={{ color: "var(--text-dim)" }}>{e.message}</span>
                    <span className="text-[11px]" style={{ color: "var(--text-mute)" }}>
                      {new Date(e.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Course catalogue" subtitle={`${courses.length} courses the copilots recommend from.`} icon={BookOpen}>
            <ul className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {courses.map(c => (
                <li key={c.id} className="stat-tile" style={{ padding: "10px 12px" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text)" }}>{c.title}</span>
                    <Tag>{c.type}</Tag>
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--text-mute)" }}>{c.provider}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="Workforce analytics brief"
        subtitle="The Capability Analytics AI writes from the organisation's figures, and says where a figure is not measured."
        icon={Sparkles}
        aside={
          <button
            id="generate-analytics-btn"
            type="button"
            onClick={onGenerateAnalytics}
            disabled={isAnalyticsLoading}
            className="header-btn disabled:opacity-60"
          >
            {isAnalyticsLoading
              ? <><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> Drafting…</>
              : <><Cpu className="h-4 w-4" aria-hidden="true" /> Draft brief</>}
          </button>
        }
      >
        {analyticsReport ? (
          <div className="rounded-xl p-4 text-[13px] leading-relaxed max-h-[320px] overflow-y-auto"
               style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text-dim)" }}>
            <Markdown>{analyticsReport}</Markdown>
          </div>
        ) : (
          <div className="rounded-xl p-8 text-center" style={{ background: "var(--surface-2)", border: "1px dashed var(--line)" }}>
            <FileText className="h-7 w-7 mx-auto mb-2" style={{ color: "var(--text-mute)" }} aria-hidden="true" />
            <p className="text-xs" style={{ color: "var(--text-mute)" }}>
              Select <strong>Draft brief</strong> for a summary of readiness, gaps and supply.
            </p>
          </div>
        )}
      </SectionCard>

      <ResourceLearningTracker />
    </div>
  );
};
