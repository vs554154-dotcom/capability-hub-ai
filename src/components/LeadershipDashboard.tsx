import React, { useEffect, useState } from "react";
import { Sparkles, TrendingUp, Compass, Cpu, ShieldAlert, LineChart, CheckCircle2 } from "lucide-react";

interface LeadershipDashboardProps {
  analyticsReport: string;
  isAnalyticsLoading: boolean;
  onGenerateAnalytics: () => void;
}

export const LeadershipDashboard: React.FC<LeadershipDashboardProps> = ({
  analyticsReport,
  isAnalyticsLoading,
  onGenerateAnalytics,
}) => {
  const [eriData, setEriData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/analytics/eri")
      .then(res => {
        if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
          return res.json();
        }
        return null;
      })
      .then(data => {
        if (data && data.success) {
          setEriData(data);
        }
      })
      .catch(err => console.error("Error fetching ERI data:", err));
  }, []);

  const TRENDS_DATA = [
    { label: "Q1 2025", value: 48 },
    { label: "Q2 2025", value: 55 },
    { label: "Q3 2025", value: 64 },
    { label: "Q4 2025", value: 71 },
    { label: "Q1 2026", value: 78 },
    { label: "Q2 2026", value: eriData?.enterpriseReadinessIndex || 84 },
  ];

  return (
    <div className="space-y-8 animate-fade-in py-6">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#F0F4FF]">Executive Capability & Workforce Intelligence</h2>
          <p className="text-xs text-[#94A3B8] mt-1">Strategic overview of enterprise capability maturity, human capital risk buffers, and future workforce forecasting.</p>
        </div>
      </div>

      {/* Main Grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Executive Capability Trend Map (Left 2 columns) */}
        <div className="lg:col-span-2 bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-[#2A384C] pb-3">
              <h3 className="text-xs font-mono font-bold text-[#4F8EF7] uppercase tracking-wider">Enterprise Capability Maturity (6-Month Trend)</h3>
              <LineChart className="h-5 w-5 text-[#4F8EF7]" />
            </div>
            
            {/* SVG Visual Bar Graph */}
            <div className="w-full h-48 bg-[#0F1724] rounded-md border border-[#2A384C] flex items-end justify-between p-4 relative overflow-hidden">
              <div className="absolute inset-0 grid grid-rows-4 pointer-events-none p-4">
                {[100, 75, 50, 25].map(tick => (
                  <div key={tick} className="border-b border-[#2A384C]/60 w-full text-[9px] font-mono text-[#94A3B8] text-left pt-1">
                    {tick}%
                  </div>
                ))}
              </div>

              {TRENDS_DATA.map((t, idx) => (
                <div key={idx} className="flex flex-col items-center flex-1 z-10 pt-4">
                  <div className="relative w-full flex justify-center items-end" style={{ height: "110px" }}>
                    <div 
                      className="bg-[#4F8EF7] hover:bg-[#3B82F6] w-8 rounded-t transition-all duration-300 relative group flex justify-center cursor-pointer"
                      style={{ height: `${t.value}%` }}
                    >
                      <div className="absolute -top-7 bg-[#141E30] text-[#4F8EF7] border border-[#4F8EF7]/40 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        {t.value}%
                      </div>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono text-[#94A3B8] mt-2 uppercase font-semibold">{t.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <div className="p-4 bg-[#0F1724] rounded-md border border-[#2A384C] text-xs space-y-2">
              <span className="font-mono text-[9px] text-[#4F8EF7] uppercase font-bold block mb-1">
                Explainable Enterprise Readiness Index (ERI: {eriData?.enterpriseReadinessIndex || 84}%)
              </span>
              <p className="text-[#94A3B8] leading-relaxed font-sans text-[11px]">
                8-Factor synthesized calculation across <strong className="text-[#F0F4FF]">{eriData?.workforceCount || 22} CYB Workforce Resources</strong>:
              </p>
              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px] font-mono">
                <div className="bg-[#141E30] p-1.5 rounded border border-[#2A384C]">
                  <span className="text-[#94A3B8]">Skill Prof. (25%):</span> <strong className="text-emerald-400">{eriData?.factors?.skillProficiency?.score || 88}%</strong>
                </div>
                <div className="bg-[#141E30] p-1.5 rounded border border-[#2A384C]">
                  <span className="text-[#94A3B8]">Video/MCQ (20%):</span> <strong className="text-emerald-400">{eriData?.factors?.videoMcqAssessments?.score || 85}%</strong>
                </div>
                <div className="bg-[#141E30] p-1.5 rounded border border-[#2A384C]">
                  <span className="text-[#94A3B8]">Evidence (15%):</span> <strong className="text-emerald-400">{eriData?.factors?.workplaceEvidence?.score || 80}%</strong>
                </div>
                <div className="bg-[#141E30] p-1.5 rounded border border-[#2A384C]">
                  <span className="text-[#94A3B8]">Cert Health (15%):</span> <strong className="text-emerald-400">{eriData?.factors?.certificationHealth?.score || 82}%</strong>
                </div>
                <div className="bg-[#141E30] p-1.5 rounded border border-[#2A384C]">
                  <span className="text-[#94A3B8]">CRI (10%):</span> <strong className="text-emerald-400">{eriData?.factors?.capabilityReadinessIndex?.score || 88}%</strong>
                </div>
                <div className="bg-[#141E30] p-1.5 rounded border border-[#2A384C]">
                  <span className="text-[#94A3B8]">Deploy Avail (5%):</span> <strong className="text-emerald-400">{eriData?.factors?.deploymentAvailability?.score || 75}%</strong>
                </div>
              </div>
            </div>
            <div className="p-4 bg-[#4F8EF7]/10 rounded-md border border-[#4F8EF7]/30 text-xs flex flex-col justify-between">
              <div>
                <span className="font-mono text-[9px] text-[#4F8EF7] uppercase font-bold block mb-1">Strategic Target Alignment</span>
                <p className="text-[#94A3B8] leading-relaxed font-sans text-[11px]">
                  Target is <strong className="text-[#F0F4FF]">90% ERI</strong> across all 22 CYB engineering resources by Q4, enabling automated talent matching and 100% internal project fulfillment.
                </p>
              </div>
              <div className="mt-2 pt-2 border-t border-[#4F8EF7]/20 flex items-center justify-between text-[10px] font-mono">
                <span className="text-[#94A3B8]">Deploy Now Resources:</span>
                <span className="text-emerald-400 font-bold">{eriData?.deployNowCount || 8} / {eriData?.workforceCount || 22}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Executive Risk Index & Priorities (Right 1 column) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-mono font-bold text-[#4F8EF7] uppercase tracking-wider">Strategic Risk Radar</h3>
              <ShieldAlert className="h-4 w-4 text-[#F59E0B]" />
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[11px] font-mono text-[#94A3B8] mb-1">
                  <span>Generative AI Engineering</span>
                  <span className="text-[#F59E0B] font-bold">High Gap (Risk: 58%)</span>
                </div>
                <div className="w-full bg-[#0F1724] h-2 rounded-full overflow-hidden border border-[#2A384C]">
                  <div className="bg-[#F59E0B] h-full" style={{ width: "58%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-[#94A3B8] mb-1">
                  <span>Cloud & AWS Architecture</span>
                  <span className="text-[#4F8EF7] font-bold">Medium Risk (42%)</span>
                </div>
                <div className="w-full bg-[#0F1724] h-2 rounded-full overflow-hidden border border-[#2A384C]">
                  <div className="bg-[#4F8EF7] h-full" style={{ width: "42%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-[#94A3B8] mb-1">
                  <span>Selenium & Java Automation</span>
                  <span className="text-[#10B981] font-bold">Low Risk (88%)</span>
                </div>
                <div className="w-full bg-[#0F1724] h-2 rounded-full overflow-hidden border border-[#2A384C]">
                  <div className="bg-[#10B981] h-full" style={{ width: "88%" }} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <Compass className="h-4 w-4 text-[#4F8EF7]" />
              <h4 className="text-xs font-mono font-bold text-[#4F8EF7] uppercase tracking-wider">Executive Directives</h4>
            </div>
            <p className="text-[11px] text-[#94A3B8] leading-relaxed font-sans">
              1. <strong className="text-[#F0F4FF]">Fund GenAI Reskilling Cohorts:</strong> Upskill 50 Java/Full-Stack devs in LLM orchestration.<br />
              2. <strong className="text-[#F0F4FF]">Mandate GROW Coaching Loops:</strong> Ensure weekly GROW 1-on-1 check-ins for all direct reports.
            </p>
          </div>
        </div>

      </div>

      {/* CAPABILITY SUPPLY & DEMAND INTELLIGENCE TABLE */}
      <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-[#4F8EF7]" />
            <h3 className="text-sm font-bold text-[#F0F4FF]">Capability Supply vs. Demand Intelligence (90-Day Outlook)</h3>
          </div>
          <span className="text-[10px] font-mono bg-[#4F8EF7]/20 text-[#4F8EF7] px-2.5 py-0.5 rounded border border-[#4F8EF7]/40 uppercase font-bold">
            Live AI Workforce Model
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="bg-[#0F1724] text-[#94A3B8] uppercase border-b border-[#2A384C]">
                <th className="py-2.5 px-3">Capability Domain</th>
                <th className="py-2.5 px-3">Current Supply</th>
                <th className="py-2.5 px-3">Developing</th>
                <th className="py-2.5 px-3">Interview Ready</th>
                <th className="py-2.5 px-3">90-Day Demand</th>
                <th className="py-2.5 px-3">Projected Gap</th>
                <th className="py-2.5 px-3">Recommended Strategy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A384C]/60 text-[#F0F4FF]">
              <tr className="hover:bg-[#0F1724]/50">
                <td className="py-2.5 px-3 font-bold text-[#4F8EF7]">Generative AI Engineering</td>
                <td className="py-2.5 px-3">84</td>
                <td className="py-2.5 px-3 text-amber-400">47</td>
                <td className="py-2.5 px-3 text-emerald-400">31</td>
                <td className="py-2.5 px-3">142</td>
                <td className="py-2.5 px-3 text-rose-400 font-bold">-58</td>
                <td className="py-2.5 px-3 text-[11px]">Reskill 32 • Redeploy 14 • Hire 12</td>
              </tr>
              <tr className="hover:bg-[#0F1724]/50">
                <td className="py-2.5 px-3 font-bold text-[#4F8EF7]">Cloud & Vector Architecture</td>
                <td className="py-2.5 px-3">110</td>
                <td className="py-2.5 px-3 text-amber-400">28</td>
                <td className="py-2.5 px-3 text-emerald-400">65</td>
                <td className="py-2.5 px-3">130</td>
                <td className="py-2.5 px-3 text-amber-400 font-bold">-20</td>
                <td className="py-2.5 px-3 text-[11px]">Accelerate 20 via Learning Concierge</td>
              </tr>
              <tr className="hover:bg-[#0F1724]/50">
                <td className="py-2.5 px-3 font-bold text-[#4F8EF7]">Automation QA & Cypress</td>
                <td className="py-2.5 px-3">160</td>
                <td className="py-2.5 px-3 text-amber-400">35</td>
                <td className="py-2.5 px-3 text-emerald-400">120</td>
                <td className="py-2.5 px-3">145</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">+15 (Optimal)</td>
                <td className="py-2.5 px-3 text-[11px]">Internal Mobility & Project Matching</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* WHAT-IF SCENARIO SIMULATION CARD */}
      <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-[#F0F4FF]">Interactive Upskilling What-If Scenario Simulator</h3>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
            Predictive Model
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-mono stagger-children">
          <div className="bg-[#0F1724] p-3 rounded-lg border border-[#2A384C] hover-lift">
            <span className="text-[#94A3B8] block mb-1">Scenario Target</span>
            <span className="text-white font-bold text-xs">Train 50 Java Devs in GenAI</span>
          </div>
          <div className="bg-[#0F1724] p-3 rounded-lg border border-[#2A384C]">
            <span className="text-[#94A3B8] block mb-1">Expected Ready Count</span>
            <span className="text-emerald-400 font-bold text-xs">38 Engineers (76% Conversion)</span>
          </div>
          <div className="bg-[#0F1724] p-3 rounded-lg border border-[#2A384C]">
            <span className="text-[#94A3B8] block mb-1">Projected Gap Reduction</span>
            <span className="text-[#4F8EF7] font-bold text-xs">27% Total Risk Reduction</span>
          </div>
          <div className="bg-[#0F1724] p-3 rounded-lg border border-[#2A384C]">
            <span className="text-[#94A3B8] block mb-1">Expected Readiness Time</span>
            <span className="text-amber-400 font-bold text-xs">60 Days Average</span>
          </div>
        </div>
      </div>

      {/* Strategic Intelligence AI Assistant */}
      <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4 border-b border-[#2A384C] pb-3">
          <div>
            <h3 className="text-base font-bold text-[#F0F4FF]">Strategic Intelligence AI Executive Analyst</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">Consult the Capability Analytics AI to run strategic models and prepare executive board briefings.</p>
          </div>
          <Sparkles className="h-5 w-5 text-[#4F8EF7] animate-pulse" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col justify-between space-y-4">
            <p className="text-xs text-[#94A3B8] leading-relaxed font-sans">
              Synthesize strategic gap indices and prepare predictive workforce readiness briefings for the next board meeting.
            </p>
            <button
              id="exec-generate-analytics-btn"
              onClick={onGenerateAnalytics}
              disabled={isAnalyticsLoading}
              className="flex items-center justify-center gap-2 bg-[#0F1724] border border-[#2A384C] hover:border-[#4F8EF7] text-[#F0F4FF] font-mono uppercase font-bold text-xs py-2.5 px-4 rounded-md transition-all disabled:opacity-50 cursor-pointer"
            >
              {isAnalyticsLoading ? (
                <>
                  <Compass className="h-3.5 w-3.5 animate-spin text-[#4F8EF7]" />
                  Analyzing Executive Trends...
                </>
              ) : (
                <>
                  <Cpu className="h-3.5 w-3.5 text-[#4F8EF7]" />
                  Compile Strategic Board Briefing
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
                <Compass className="h-10 w-10 mx-auto stroke-1 mb-2 text-[#2A384C]" />
                <p className="text-[11px] font-mono uppercase tracking-wider">Click the button to compile the Executive Capability board report.</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};
