import React, { useEffect, useState } from "react";
import { Skill, LearningCourse, TargetRole } from "../types";
import { Grid, FileText, Sparkles, TrendingUp, Cpu, RefreshCw, CheckCircle2 } from "lucide-react";
import { ResourceLearningTracker } from "./ResourceLearningTracker";

interface LDDashboardProps {
  skills: Skill[];
  courses: LearningCourse[];
  roles?: TargetRole[];
  analyticsReport: string;
  isAnalyticsLoading: boolean;
  onGenerateAnalytics: () => void;
}

export const LDDashboard: React.FC<LDDashboardProps> = ({
  skills,
  courses,
  roles = [],
  analyticsReport,
  isAnalyticsLoading,
  onGenerateAnalytics,
}) => {
  const [selectedCampaign, setSelectedCampaign] = useState("selenium-java");
  const [campaignSuccess, setCampaignSuccess] = useState("");

  // Real organisation metrics for the tiles below. These were previously hard-coded
  // literals; they are now computed server-side from actual employee records.
  const [metrics, setMetrics] = useState<{
    employeeCount: number;
    readinessIndex: number;
    activeLearners: number;
    verifiedEvidence: number;
    topSkillGap: { skillName: string; employeesBelowTarget: number } | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analytics/workforce");
        if (!cancelled && res.ok) setMetrics(await res.json());
      } catch (err) {
        console.error("Workforce metrics unavailable:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Render a dash until the real number arrives, rather than a placeholder that could be
  // mistaken for data.
  const stat = (value: number | undefined | null, suffix = "") =>
    metrics && value !== undefined && value !== null ? `${value}${suffix}` : "—";

  const HEATMAP_DEPARTMENTS = ["QA & Testing", "Cloud Infra", "Backend Eng", "Data Engineering"];
  
  const skillReadinessMap: { [skillId: string]: number[] } = {
    sk_1: [30, 85, 70, 40], // Selenium WebDriver
    sk_2: [40, 90, 85, 60], // Java & OOP
    sk_3: [25, 75, 80, 50], // API Automation (REST Assured)
    sk_4: [60, 95, 90, 80], // Git & GitHub Flow
    sk_5: [35, 90, 75, 55], // CI/CD Test Pipelines
    sk_6: [20, 80, 70, 30], // TestNG & JUnit Frameworks
  };

  const getHeatmapColor = (score: number) => {
    if (score >= 80) return "bg-[#10B981]/20 border border-[#10B981]/40 text-[#10B981]";
    if (score >= 50) return "bg-[#4F8EF7]/20 border border-[#4F8EF7]/40 text-[#4F8EF7]";
    if (score >= 30) return "bg-[#F59E0B]/20 border border-[#F59E0B]/40 text-[#F59E0B]";
    return "bg-rose-500/20 border border-rose-500/40 text-rose-400";
  };

  const handleLaunchCampaign = () => {
    const focusLabel = selectedCampaign === "selenium-java" ? "Selenium & Java Automation Cohort" : "API Automation Cohort";
    setCampaignSuccess(`Strategic upskilling campaign [${focusLabel}] launched! Auto-enrollment dispatches and training notifications sent to QA Division.`);
    setTimeout(() => {
      setCampaignSuccess("");
    }, 6000);
  };

  return (
    <div className="space-y-8 animate-fade-in py-6">
      
      {/* Toast alert */}
      {campaignSuccess && (
        <div className="p-4 bg-[#10B981]/10 border border-[#10B981]/40 text-[#10B981] font-mono text-xs rounded-md flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0" />
          <span>{campaignSuccess}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 stagger-children">
        <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-5 shadow-lg hover-lift sheen">
          <span className="text-[10px] font-mono text-[#94A3B8] font-bold tracking-wider uppercase block mb-1">Workforce Readiness Index</span>
          <span className="text-3xl font-bold text-[#F0F4FF] block">{stat(metrics?.readinessIndex, "%")}</span>
          <span className="text-xs text-[#10B981] font-mono mt-1 block">Average across {stat(metrics?.employeeCount)} employees</span>
        </div>
        <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-5 shadow-lg">
          <span className="text-[10px] font-mono text-[#94A3B8] font-bold tracking-wider uppercase block mb-1">Verified Evidence</span>
          <span className="text-3xl font-bold text-[#10B981] block">{stat(metrics?.verifiedEvidence)}</span>
          <span className="text-xs text-[#94A3B8] font-mono mt-1 block">Manager-approved submissions</span>
        </div>
        <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-5 shadow-lg">
          <span className="text-[10px] font-mono text-[#94A3B8] font-bold tracking-wider uppercase block mb-1">Highest Skill Deficit</span>
          <span className="text-2xl font-bold text-[#F59E0B] block truncate">{metrics?.topSkillGap ? metrics.topSkillGap.skillName : "—"}</span>
          <span className="text-xs text-[#94A3B8] font-mono mt-1 block">
            {metrics?.topSkillGap ? `${metrics.topSkillGap.employeesBelowTarget} employees below target` : "No gaps recorded"}
          </span>
        </div>
        <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-5 shadow-lg">
          <span className="text-[10px] font-mono text-[#94A3B8] font-bold tracking-wider uppercase block mb-1">Active Learners</span>
          <span className="text-3xl font-bold text-[#4F8EF7] block">{stat(metrics?.activeLearners)}</span>
          <span className="text-xs text-[#94A3B8] font-mono mt-1 block">With a learning plan under way</span>
        </div>
      </div>

      {/* Grid: Heatmap + Cohort Campaign */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Heatmap Grid (Left 2 columns) */}
        <div className="lg:col-span-2 bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg">
          <div className="flex items-center justify-between mb-6 border-b border-[#2A384C] pb-4">
            <div>
              <h3 className="text-base font-bold text-[#F0F4FF]">Enterprise Skill Capability Heatmap</h3>
              <p className="text-xs text-[#94A3B8] mt-0.5">Heat levels display average capability levels across organizational divisions.</p>
            </div>
            <Grid className="h-5 w-5 text-[#4F8EF7]" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#2A384C] bg-[#0F1724]">
                  <th className="py-3 px-4 font-mono text-[10px] uppercase text-[#94A3B8] min-w-[200px]">Strategic Competency</th>
                  {HEATMAP_DEPARTMENTS.map(d => (
                    <th key={d} className="py-3 px-4 font-mono text-[10px] uppercase text-[#94A3B8] text-center">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A384C]">
                {skills.map((sk) => {
                  const scores = skillReadinessMap[sk.id] || [40, 70, 60, 50];
                  return (
                    <tr key={sk.id} className="hover:bg-[#0F1724]/60">
                      <td className="py-3 px-4">
                        <span className="font-bold text-[#F0F4FF] block">{sk.name}</span>
                        <span className="text-[9px] font-mono uppercase text-[#94A3B8] mt-0.5 block">{sk.category}</span>
                      </td>
                      {scores.map((score, idx) => (
                        <td key={idx} className="py-2.5 px-2">
                          <div className={`p-2 rounded text-center text-[11px] font-mono font-bold ${getHeatmapColor(score)}`}>
                            {score}%
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Campaign cohort setup & trends (Right 1 column) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg">
            <h3 className="text-xs font-mono font-bold text-[#4F8EF7] uppercase tracking-wider mb-4">Launch Strategic Upskilling Campaign</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="campaign-focus-select" className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase block mb-1">Target Skill Gap Cohort *</label>
                <select
                  id="campaign-focus-select"
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                  className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs font-semibold p-2.5 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                >
                  <option value="selenium-java">Selenium & Java Automation Cohort (+35% Target Delta)</option>
                  <option value="rest-assured">API Automation & TestNG Cohort (+25% Target Delta)</option>
                </select>
              </div>

              <div className="p-4 bg-[#0F1724] rounded-md border border-[#2A384C] text-xs text-[#94A3B8] leading-relaxed space-y-2 font-sans">
                <span className="font-mono text-[9px] uppercase font-bold text-[#4F8EF7] block">Forecasted Outcomes</span>
                <p className="text-[11px] leading-relaxed text-[#F0F4FF]">Auto-enroll manual QAs into mapped Automation Tester learning plans:</p>
                <ul className="list-disc pl-4 space-y-1 text-[#94A3B8] text-[11px] font-mono">
                  <li>Enrolls 12 Manual QA Engineers.</li>
                  <li>Assigns Udemy & LinkedIn Learning courses.</li>
                  <li>Prepares candidates for Q3 automation targets.</li>
                </ul>
              </div>

              <button
                id="launch-cohort-campaign-btn"
                onClick={handleLaunchCampaign}
                className="w-full flex items-center justify-center gap-1.5 bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-bold text-xs uppercase tracking-wider py-2.5 px-4 rounded-md transition-all cursor-pointer"
              >
                <Cpu className="h-4 w-4" />
                Launch Upskilling Campaign
              </button>
            </div>
          </div>

          <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg">
            <h3 className="text-xs font-mono font-bold text-[#4F8EF7] uppercase tracking-wider mb-2">Mapped Course Catalog</h3>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2">
              {courses.map(c => (
                <div key={c.id} className="p-3 bg-[#0F1724] rounded-md border border-[#2A384C] text-[11px] hover:border-[#4F8EF7] transition-colors">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-[#F0F4FF] truncate">{c.title}</span>
                    <span className="text-[8px] font-mono font-bold text-[#4F8EF7] bg-[#4F8EF7]/10 border border-[#4F8EF7]/30 px-1 rounded uppercase shrink-0">{c.type}</span>
                  </div>
                  <span className="text-[9px] text-[#94A3B8] font-mono block mt-1">Provider: {c.provider}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* AI Strategic Capability Analytics Section */}
      <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4 border-b border-[#2A384C] pb-3">
          <div>
            <h3 className="text-base font-bold text-[#F0F4FF]">AI Strategic Capability Analytics</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">Consult the Capability Analytics Agent to run workforce readiness forecasts.</p>
          </div>
          <Sparkles className="h-5 w-5 text-[#4F8EF7]" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col justify-between space-y-4">
            <p className="text-xs text-[#94A3B8] leading-relaxed font-sans">
              Evaluate organization upskilling indicators, compile heatmap trends, and predict potential timeline bottlenecks across engineering divisions.
            </p>
            <button
              id="generate-analytics-btn"
              onClick={onGenerateAnalytics}
              disabled={isAnalyticsLoading}
              className="flex items-center justify-center gap-2 bg-[#0F1724] border border-[#2A384C] hover:border-[#4F8EF7] text-[#F0F4FF] font-mono uppercase font-bold text-xs py-2.5 px-4 rounded-md transition-all disabled:opacity-50 cursor-pointer"
            >
              {isAnalyticsLoading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#4F8EF7]" />
                  Analyzing Gaps...
                </>
              ) : (
                <>
                  <TrendingUp className="h-3.5 w-3.5 text-[#4F8EF7]" />
                  Synthesize Workforce Analytics
                </>
              )}
            </button>
          </div>

          <div className="lg:col-span-2">
            {analyticsReport ? (
              <div className="p-4 bg-[#0F1724] rounded-md border border-[#2A384C] text-xs text-[#F0F4FF] leading-relaxed max-h-[300px] overflow-y-auto font-sans whitespace-pre-wrap">
                {analyticsReport}
              </div>
            ) : (
              <div className="border border-dashed border-[#2A384C] rounded-lg p-10 text-center text-[#94A3B8]">
                <FileText className="h-10 w-10 mx-auto stroke-1 mb-2 text-[#2A384C]" />
                <p className="text-[11px] font-mono uppercase tracking-wider">Click the button to synthesize the workforce analytics report</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resource & Employee Progress Tracker */}
      <ResourceLearningTracker roles={roles} />

    </div>
  );
};
