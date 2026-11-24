import React, { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, CircleDashed, Compass, Cpu, Gauge, Info, LineChart,
  ListChecks, Scale, ShieldAlert, Sparkles, Target, TrendingUp,
} from "lucide-react";
import { Meter, PageHeader, SectionCard, StatTile, Tag, scoreTone } from "./ui/Page";
import { Markdown } from "./ui/Markdown";
import { TrendChart } from "./ui/TrendChart";

interface LeadershipDashboardProps {
  analyticsReport: string;
  isAnalyticsLoading: boolean;
  onGenerateAnalytics: () => void;
}

interface EriFactor {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  measured: boolean;
  basis: string;
}

interface EriReport {
  enterpriseReadinessIndex: number | null;
  coverage: number;
  workforceCount: number;
  deployNowCount: number;
  factors: EriFactor[];
  trend: { day: string; eri: number; coverage: number }[];
}

interface Overview {
  riskRadar: { skillName: string; employeesTargeting: number; belowTarget: number; gapShare: number }[];
  supplyDemand: {
    skillName: string; openDemands: number; resourcesNeeded: number;
    ready: number; developing: number; balance: number; strategy: string;
  }[];
  pipeline: {
    handedOff: number; assessed: number; trackAssigned: number; trained: number; cleared: number; resumeReady: number;
  };
  projection: {
    openGaps: number; employeesWithGaps: number;
    currentEri: number | null; projectedEri: number | null; coverage: number;
  };
  directives: string[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

export const LeadershipDashboard: React.FC<LeadershipDashboardProps> = ({
  analyticsReport,
  isAnalyticsLoading,
  onGenerateAnalytics,
}) => {
  const [eri, setEri] = useState<EriReport | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getJson<EriReport>("/api/analytics/eri"), getJson<Overview>("/api/analytics/leadership")])
      .then(([e, o]) => { setEri(e); setOverview(o); })
      .catch(err => setError(err.message));
  }, []);

  const header = (
    <PageHeader
      eyebrow="Executive console · Capability Analytics AI"
      icon={TrendingUp}
      title="Enterprise capability readiness"
      lede={
        <>
          Bird's-eye intelligence computed live from workforce records: skill levels,
          manager-approved evidence, learning progress and open client demand. A component
          the platform does not record yet is shown as <strong>not measured</strong> and left
          out of the index, never estimated.
        </>
      }
      steps={[
        <><strong>Read the index.</strong> One score built from eight weighted components.</>,
        <><strong>Find the risk.</strong> Skills where most people are still below target.</>,
        <><strong>Check supply.</strong> Ready people against what open client demands need.</>,
        <><strong>Brief the board.</strong> The analytics copilot drafts it from these figures.</>,
      ]}
    />
  );

  if (error) {
    return (
      <div className="space-y-6 py-6">
        {header}
        <SectionCard title="Analytics unavailable" icon={AlertTriangle}>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            The readiness figures could not be loaded ({error}). Refresh the page to try again.
          </p>
        </SectionCard>
      </div>
    );
  }

  if (!eri || !overview) {
    return (
      <div className="space-y-6 py-6" aria-busy="true">
        {header}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="skeleton h-72 lg:col-span-5" />
          <div className="skeleton h-72 lg:col-span-7" />
        </div>
        <div className="skeleton h-64" />
      </div>
    );
  }

  const index = eri.enterpriseReadinessIndex;
  const unmeasuredWeight = 100 - eri.coverage;
  const trend = eri.trend.map(p => ({
    day: p.day, value: p.eri, note: `measured over ${p.coverage}% of the index`,
  }));
  const { projection } = overview;
  const projectionGain =
    projection.currentEri !== null && projection.projectedEri !== null
      ? projection.projectedEri - projection.currentEri : null;

  return (
    <div className="space-y-6 py-6">
      {header}

      {/* 1. The index and its history */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 stagger-children">
        <SectionCard
          className="lg:col-span-5"
          title="Enterprise Readiness Index"
          subtitle="Weighted average of the components measured today."
          icon={Gauge}
          aside={<Tag tone="accent">{eri.coverage}% of weight measured</Tag>}
        >
          {index === null ? (
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              Not measurable yet: no component has data.
            </p>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <span className="hero-figure">{index}%</span>
                <Tag tone={scoreTone(index)}>
                  {scoreTone(index) === "ok" ? "Strong" : scoreTone(index) === "warn" ? "Developing" : "At risk"}
                </Tag>
              </div>
              <div className="mt-4"><Meter value={index} tone={scoreTone(index)} label="Enterprise Readiness Index" /></div>
            </>
          )}
          <div className="grid grid-cols-3 gap-3 mt-5">
            <StatTile label="Workforce" value={eri.workforceCount} hint="employees scored" />
            <StatTile label="Deploy Now" value={eri.deployNowCount} hint="Skill and Will both 60+" />
            <StatTile label="Not measured" value={`${unmeasuredWeight}%`} hint="of the index's weight" />
          </div>
        </SectionCard>

        <SectionCard
          className="lg:col-span-7"
          title="Readiness over time"
          subtitle="One reading per day, taken when this page is opened. Nothing is back-filled."
          icon={LineChart}
        >
          {trend.length >= 2 ? (
            <TrendChart points={trend} label="Enterprise Readiness Index" />
          ) : (
            <div className="rounded-xl p-6 text-center" style={{ background: "var(--surface-2)", border: "1px dashed var(--line)" }}>
              <CircleDashed className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-mute)" }} aria-hidden="true" />
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {trend.length === 1 ? `First reading recorded: ${trend[0].value}% on ${trend[0].day}` : "No readings yet"}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-mute)" }}>
                The line appears from the second day. It is built only from real daily readings.
              </p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* What the demand-to-deployment agents have recorded so far */}
      <SectionCard
        title="Deployment pipeline"
        subtitle="People handed off to client projects, and how far each stage has got. Counted per person and project."
        icon={Target}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatTile label="Handed off" value={overview.pipeline.handedOff} hint="to a project" />
          <StatTile label="Assessed" value={overview.pipeline.assessed} hint="Level-1 taken for it" />
          <StatTile label="Track assigned" value={overview.pipeline.trackAssigned} hint="for the project" />
          <StatTile label="Trained" value={overview.pipeline.trained} hint="every step completed" />
          <StatTile label="Cleared" value={overview.pipeline.cleared} hint="by their manager" />
          <StatTile label="Resume ready" value={overview.pipeline.resumeReady} hint="all checks passed" />
        </div>
      </SectionCard>

      {/* 2. What the index is made of */}
      <SectionCard
        title="How the index is built"
        subtitle="Eight weighted components. Unmeasured ones are excluded and the rest re-weighted, so the index never rests on a guess."
        icon={ListChecks}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          {eri.factors.map(f => (
            <div key={f.key}>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{f.label}</span>
                <span className="flex items-center gap-2">
                  <Tag>weight {f.weight}%</Tag>
                  {f.measured
                    ? <strong className="text-sm" style={{ color: "var(--text)" }}>{f.score}%</strong>
                    : <Tag tone="warn">Not measured</Tag>}
                </span>
              </div>
              {f.measured && f.score !== null
                ? <Meter value={f.score} tone={scoreTone(f.score)} label={f.label} />
                : <div className="meter" style={{ background: "var(--surface-3)" }} />}
              <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "var(--text-mute)" }}>{f.basis}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 3. Where risk sits, and what to do */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Skill-gap risk"
          subtitle="Skills people are working toward, ranked by how many are still below their target level."
          icon={ShieldAlert}
        >
          {overview.riskRadar.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>Every targeted skill is at target.</p>
          ) : (
            <ul className="space-y-4">
              {overview.riskRadar.map(r => {
                const tone = r.gapShare >= 75 ? "risk" : r.gapShare >= 40 ? "warn" : "ok";
                return (
                  <li key={r.skillName}>
                    <div className="flex items-center justify-between gap-3 mb-1.5 text-[13px]">
                      <span className="font-semibold" style={{ color: "var(--text)" }}>{r.skillName}</span>
                      <span style={{ color: "var(--text-dim)" }}>
                        <strong style={{ color: "var(--text)" }}>{r.belowTarget}</strong> of {r.employeesTargeting} below target
                      </span>
                    </div>
                    <Meter value={r.gapShare} tone={tone} label={`${r.skillName}: ${r.gapShare}% below target`} />
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Directives"
          subtitle="Derived from the figures on this page. They change as the data does."
          icon={Compass}
        >
          <ol className="space-y-3">
            {overview.directives.map((d, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
                <span className="flex-none grid place-items-center h-6 w-6 rounded-full text-[11px] font-bold font-mono"
                      style={{ background: "rgb(var(--accent-rgb) / 12%)", color: "var(--accent)" }}>{i + 1}</span>
                <span>{d}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>

      {/* 4. Supply against demand */}
      <SectionCard
        title="Capability supply against open demand"
        subtitle="For each skill the open client demands require: people ready now (level 3+, the level matching treats as verified) and people working toward it."
        icon={Scale}
      >
        <div className="overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>Skill</th>
                <th className="num">Open demands</th>
                <th className="num">People needed</th>
                <th className="num">Ready now</th>
                <th className="num">Developing</th>
                <th className="num">Balance</th>
                <th>Recommended action</th>
              </tr>
            </thead>
            <tbody>
              {overview.supplyDemand.map(r => (
                <tr key={r.skillName}>
                  <td style={{ color: "var(--text)", fontWeight: 600 }}>{r.skillName}</td>
                  <td className="num">{r.openDemands}</td>
                  <td className="num">{r.resourcesNeeded}</td>
                  <td className="num">{r.ready}</td>
                  <td className="num">{r.developing}</td>
                  <td className="num">
                    {r.balance >= 0
                      ? <Tag tone="ok"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />+{r.balance}</Tag>
                      : <Tag tone="risk"><AlertTriangle className="h-3 w-3" aria-hidden="true" />short {-r.balance}</Tag>}
                  </td>
                  <td>{r.strategy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note mt-3">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-none" aria-hidden="true" />
          Counted per skill, so one person can appear as ready for several skills. Shown: the
          eight skills with the largest shortfall.
        </p>
      </SectionCard>

      {/* 5. What closing the gaps would do, and the board briefing */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard
          title="If every open gap closed"
          subtitle="Skill proficiency recomputed with each below-target skill at its target; other components held where they are."
          icon={Target}
        >
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Index today" value={projection.currentEri !== null ? `${projection.currentEri}%` : "–"} />
            <StatTile
              label="Projected"
              value={projection.projectedEri !== null ? `${projection.projectedEri}%` : "–"}
              hint={projectionGain !== null ? `${projectionGain >= 0 ? "+" : ""}${projectionGain} points` : undefined}
              tone="ok"
            />
          </div>
          <p className="note mt-4">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-none" aria-hidden="true" />
            {projection.openGaps} open skill gaps across {projection.employeesWithGaps} employees.
          </p>
        </SectionCard>

        <SectionCard
          className="lg:col-span-2"
          title="Board briefing"
          subtitle="The Capability Analytics AI writes from the figures above, and says so where a component is not measured."
          icon={Sparkles}
          aside={
            <button
              id="exec-generate-analytics-btn"
              onClick={onGenerateAnalytics}
              disabled={isAnalyticsLoading}
              className="flex items-center gap-2 text-xs font-bold py-2 px-3.5 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              {isAnalyticsLoading
                ? <><Compass className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Drafting…</>
                : <><Cpu className="h-3.5 w-3.5" aria-hidden="true" /> Draft briefing</>}
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
              <Sparkles className="h-7 w-7 mx-auto mb-2" style={{ color: "var(--text-mute)" }} aria-hidden="true" />
              <p className="text-xs" style={{ color: "var(--text-mute)" }}>
                Select <strong>Draft briefing</strong> for a board-ready summary of readiness, risk and supply.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};
