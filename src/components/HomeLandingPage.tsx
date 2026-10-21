import React, { useState, useEffect } from "react";
import { User, UserRole } from "../types";
import {
  Cpu,
  Shield,
  TrendingUp,
  Brain,
  Award,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Users,
  CheckCircle2,
  Lock,
  UserCheck,
  Zap,
  BookOpen,
  BarChart3,
  Video,
  Play,
  Pause
} from "lucide-react";
import { BrandMark } from "./BrandLogo";

interface HomeLandingPageProps {
  /** Headline count only. The directory is not sent to signed-out browsers. */
  profileCount: number;
  currentUser: User | null;
  /** Called only after the server has accepted a credential and opened a session. */
  onAuthenticated: (user: User) => void;
  onNavigateTab: (tab: string) => void;
}

export const HomeLandingPage: React.FC<HomeLandingPageProps> = ({
  profileCount,
  currentUser,
  onAuthenticated,
  onNavigateTab
}) => {
  // Slider State
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // Login Form State
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Slides. Every figure here is either a real count (profileCount, from the server)
  // or a fact about the product. The previews are labelled as examples and use no real
  // person's name. (They used to show invented statistics - "88.4%", "1,240+",
  // "7 Days Avg" - a seeded employee's name on mock data, a "Live Data" badge on a
  // static grid, and body-language scoring the product does not do.)
  const slides = [
    {
      id: "slide-1",
      badge: "AI WORKFORCE CAPABILITY INTELLIGENCE PLATFORM",
      title: "From Business Demand to Workforce Readiness — Intelligently",
      subtitle: "Stop Searching for Talent. Start Discovering Capability. Sahi Talent. Sahi Skills. Sahi Project.",
      accentColor: "#2563EB",
      metrics: [
        { label: "Workforce profiles", value: profileCount > 0 ? String(profileCount) : "–", color: "#059669" },
        { label: "AI copilots", value: "4", color: "#2563EB" },
        { label: "Readiness components", value: "8", color: "#7C3AED" }
      ],
      features: [
        "Demand-centric orchestration: Demand ➔ Match ➔ Hand off ➔ Learn ➔ Validate ➔ Deploy",
        "Explainable 'Why this candidate?' fitment, ranked against the interview date",
        "Client resumes written only from verified records"
      ],
      imageGradient: "from-indigo-50/90 via-blue-50/60 to-white",
      previewComponent: (
        <div className="bg-white/95 border border-indigo-200 rounded-xl p-5 shadow-xl space-y-4 text-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-indigo-600" />
              <span className="text-xs font-bold font-mono text-slate-900">Capability view</span>
            </div>
            <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-semibold">
              Example
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-600 font-medium">Next.js App Architecture</span>
              <span className="text-indigo-600 font-bold">Level 3 of 4</span>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200">
              <div className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full w-[75%]" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-600 font-medium">Gemini API Integration</span>
              <span className="text-purple-600 font-bold">Level 4 of 4</span>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200">
              <div className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full w-[100%]" />
            </div>
          </div>
        </div>
      )
    },
    {
      id: "slide-2",
      badge: "SKILL-VS-WILL MATRIX",
      title: "Evaluate Technical Depth alongside Motivation & Will",
      subtitle: "Place each person by capability (Skill) and drive to grow (Will), both computed from what they actually do: skill levels, manager-approved evidence, learning follow-through and goal progress.",
      accentColor: "#7C3AED",
      metrics: [
        { label: "Skill axis", value: "Levels + evidence", color: "#2563EB" },
        { label: "Will axis", value: "Behaviour", color: "#7C3AED" },
        { label: "Quadrant line", value: "60 / 60", color: "#D97706" }
      ],
      features: [
        "Will from learning, evidence initiative and goal progress - not a survey",
        "Only manager-approved evidence lifts Skill",
        "Four quadrants, each with a suggested next step"
      ],
      imageGradient: "from-purple-50/90 via-pink-50/50 to-white",
      previewComponent: (
        <div className="bg-white/95 border border-purple-200 rounded-xl p-4 shadow-xl space-y-3 text-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-bold font-mono text-slate-900 flex items-center gap-1.5">
              <Award className="h-4 w-4 text-purple-600" />
              Skill-vs-Will quadrants
            </span>
            <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-semibold">
              Example
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-center">
            <div className="bg-emerald-100/90 p-2.5 rounded border border-emerald-300 text-emerald-800 font-bold">Deploy Now<br /><span className="font-normal">High Skill · High Will</span></div>
            <div className="bg-amber-50 p-2.5 rounded border border-amber-200 text-amber-800 font-bold">Retain &amp; Coach<br /><span className="font-normal">High Skill · Low Will</span></div>
            <div className="bg-indigo-100/90 p-2.5 rounded border border-indigo-300 text-indigo-800 font-bold">Accelerate Learning<br /><span className="font-normal">Low Skill · High Will</span></div>
            <div className="bg-rose-50 p-2.5 rounded border border-rose-200 text-rose-800 font-bold">Intervention Required<br /><span className="font-normal">Low Skill · Low Will</span></div>
          </div>
        </div>
      )
    },
    {
      id: "slide-3",
      badge: "4 DEDICATED AI COPILOTS",
      title: "Intelligent Guidance for Employees, Managers & L&D Leaders",
      subtitle: "Four AI copilots, each grounded in the records its user is allowed to see: personalised learning, GROW coaching, JD interview practice and organisation analytics.",
      accentColor: "#059669",
      metrics: [
        { label: "SkillGap-to-Growth Agent", value: "Adaptive", color: "#2563EB" },
        { label: "Learning Concierge", value: "1-on-1 Mentor", color: "#059669" },
        { label: "Manager GROW Coach", value: "Post-Training", color: "#D97706" }
      ],
      features: [
        "1-on-1 AI technical mentor for doubts & concepts",
        "Manager GROW coaching questions & post-training assessment",
        "Interview gaps handed to the Learning Concierge for courses"
      ],
      imageGradient: "from-emerald-50/90 via-teal-50/50 to-white",
      previewComponent: (
        <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
          <div className="bg-white/95 p-3.5 rounded-xl border border-indigo-200 shadow-md">
            <span className="text-indigo-600 font-bold block mb-1">1. SkillGap Agent</span>
            <span className="text-[10px] text-slate-600">JD Interview Practice & Adaptive Roadmaps</span>
          </div>
          <div className="bg-white/95 p-3.5 rounded-xl border border-emerald-200 shadow-md">
            <span className="text-emerald-600 font-bold block mb-1">2. Learning Concierge</span>
            <span className="text-[10px] text-slate-600">1-on-1 AI Mentor, Doubts & Catalogue Courses</span>
          </div>
          <div className="bg-white/95 p-3.5 rounded-xl border border-amber-200 shadow-md">
            <span className="text-amber-600 font-bold block mb-1">3. Manager GROW Coach</span>
            <span className="text-[10px] text-slate-600">Coaching Questions & Readiness Sign-off</span>
          </div>
          <div className="bg-white/95 p-3.5 rounded-xl border border-purple-200 shadow-md">
            <span className="text-purple-600 font-bold block mb-1">4. Capability Analytics</span>
            <span className="text-[10px] text-slate-600">Readiness Index, Risk & Supply vs Demand</span>
          </div>
        </div>
      )
    },
    {
      id: "slide-4",
      badge: "JD INTERVIEW PRACTICE",
      title: "Practise the Interview Before the Client Does",
      subtitle: "Multiple-choice and spoken questions generated from a real job description. Gemini scores each transcribed answer on technical depth, problem solving and communication, and names the gaps to close.",
      accentColor: "#D97706",
      metrics: [
        { label: "Questions", value: "From the JD", color: "#2563EB" },
        { label: "Spoken answers", value: "Transcribed", color: "#7C3AED" },
        { label: "Scoring", value: "Gemini AI", color: "#059669" }
      ],
      features: [
        "Questions generated from the job description",
        "Technical, problem-solving and communication scores for each answer",
        "Gaps handed to the Learning Concierge for courses and exercises"
      ],
      imageGradient: "from-amber-50/90 via-orange-50/50 to-white",
      previewComponent: (
        <div className="bg-white/95 border border-amber-200 rounded-xl p-4 shadow-xl space-y-3 text-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-1.5">
              <Video className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-bold font-mono text-slate-900">Answer evaluation</span>
            </div>
            <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-semibold">
              Example
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono">
            <div className="bg-slate-50 p-2 rounded border border-slate-200">
              <span className="text-slate-500 block">Tech depth</span>
              <span className="text-indigo-600 font-bold">Scored</span>
            </div>
            <div className="bg-slate-50 p-2 rounded border border-slate-200">
              <span className="text-slate-500 block">Problem solving</span>
              <span className="text-purple-600 font-bold">Scored</span>
            </div>
            <div className="bg-slate-50 p-2 rounded border border-slate-200">
              <span className="text-slate-500 block">Communication</span>
              <span className="text-emerald-600 font-bold">Scored</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-mono">Plus the concepts the answer missed, and courses to close them.</p>
        </div>
      )
    }
  ];

  // Auto-play timer effect
  useEffect(() => {
    let interval: any;
    if (isAutoPlaying) {
      interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
      }, 6000);
    }
    return () => clearInterval(interval);
  }, [isAutoPlaying, slides.length]);

  // Handle direct login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginSuccess("");

    if (!loginIdentifier.trim()) {
      setLoginError("Please enter your Resource ID, Email, or Name");
      return;
    }

    // No implicit fallback password. Substituting a default silently set the account's
    // password to a value the user never typed.
    if (!loginPassword.trim()) {
      setLoginError("Please enter your password. On an account's first sign-in this becomes its password.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: loginIdentifier,
          password: loginPassword
        })
      });

      const data = await res.json();

      if (!res.ok || !data.user) {
        setLoginError(data.error || "Authentication failed. Check credentials or use quick demo login.");
        return;
      }

      setLoginSuccess(`Authenticated successfully! Welcome, ${data.user.name}.`);
      setTimeout(() => {
        onAuthenticated(data.user);
      }, 800);
    } catch (err: any) {
      setLoginError("Server error during login: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeSlide = slides[currentSlide];

  return (
    <div className="space-y-10 py-6 animate-fade-in text-[#F0F4FF]">
      
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0F1724] border border-[#2A384C] p-4 rounded-xl shadow-lg animate-fade-in-down hover-glow">
        <div className="flex items-center gap-3">
          <BrandMark size={48} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#F0F4FF] font-mono">Workforce Directory</h2>
              <span className="text-[10px] font-mono font-bold bg-[#10B981]/20 text-[#10B981] px-2 py-0.5 rounded border border-[#10B981]/30 inline-flex items-center gap-1.5">
                <span className="status-dot h-1.5 w-1.5 rounded-full bg-[#10B981] inline-block" />
                Live Data
              </span>
            </div>
            <p className="text-xs text-[#94A3B8]">
              {profileCount} employee and manager profiles loaded.
            </p>
          </div>
        </div>

        {/* Signed-in users get a link back to their own workspace. Nobody gets a
            one-click route into an account they have not authenticated as. */}
        {currentUser && (
          <button
            onClick={() => {
              if (currentUser.role === UserRole.EMPLOYEE) onNavigateTab("dashboard");
              else if (currentUser.role === UserRole.MANAGER) onNavigateTab("manager_dash");
              else if (currentUser.role === UserRole.LD) onNavigateTab("ld_dash");
              else onNavigateTab("leadership_dash");
            }}
            className="px-3.5 py-2 bg-[#4F8EF7] hover:bg-[#3B82F6] text-white text-xs font-mono font-bold rounded-lg transition-all cursor-pointer shadow-md flex items-center gap-1.5 sheen shrink-0"
          >
            <LogIn className="h-4 w-4" />
            <span>Continue as {currentUser.name.split(" ")[0]}</span>
          </button>
        )}
      </div>

      {/* HERO SLIDER — animated network backdrop + palette-aware surface */}
      <div
        className="hero-canvas rounded-2xl border shadow-xl group animate-scale-in"
        style={{ borderColor: "var(--line)", backgroundColor: "var(--surface)", color: "var(--text)" }}
        onMouseEnter={() => setIsAutoPlaying(false)}
        onMouseLeave={() => setIsAutoPlaying(true)}
      >
        {/* Per-slide accent wash, crossfaded on every slide change */}
        <div
          key={`${activeSlide.id}-wash`}
          className="absolute inset-0 z-0 pointer-events-none animate-fade-in"
          style={{
            background:
              `radial-gradient(ellipse 70% 90% at 12% 18%, ${activeSlide.accentColor}38, transparent 62%),` +
              `radial-gradient(ellipse 60% 80% at 92% 82%, ${activeSlide.accentColor}22, transparent 70%)`
          }}
          aria-hidden="true"
        />

        {/* Auto-play progress rail */}
        <div className="absolute top-0 inset-x-0 h-0.5 z-20 overflow-hidden" aria-hidden="true">
          <div
            key={`${activeSlide.id}-rail`}
            className="h-full progress-fill"
            style={{
              background: `linear-gradient(90deg, ${activeSlide.accentColor}, transparent)`,
              animationDuration: "6s",
              animationTimingFunction: "linear",
              animationPlayState: isAutoPlaying ? "running" : "paused"
            }}
          />
        </div>

        <div
          key={activeSlide.id}
          className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 p-6 lg:p-10 items-center min-h-[420px]"
        >

          {/* Left Slide Details (7 cols) */}
          <div className="lg:col-span-7 space-y-5 animate-slide-left">
            <div
              className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full glass text-[11px] font-mono font-bold tracking-wider"
              style={{ color: activeSlide.accentColor }}
            >
              <Zap className="h-3.5 w-3.5 animate-float" />
              <span>{activeSlide.badge}</span>
            </div>

            <h1
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight"
              style={{ color: "var(--text)" }}
            >
              {activeSlide.title}
            </h1>

            <p className="text-sm leading-relaxed max-w-2xl font-sans font-medium" style={{ color: "var(--text-dim)" }}>
              {activeSlide.subtitle}
            </p>

            {/* Key Features Bullet List */}
            <ul className="space-y-2 text-xs font-mono stagger-children" style={{ color: "var(--text-dim)" }}>
              {activeSlide.features.map((feat, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: activeSlide.accentColor }} />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>

            {/* Metric Counters */}
            <div
              className="grid grid-cols-3 gap-3 pt-3 border-t max-w-md stagger-children"
              style={{ borderColor: "var(--line)" }}
            >
              {activeSlide.metrics.map((m, idx) => (
                <div key={idx} className="glass p-2.5 rounded-lg hover-lift">
                  <span className="text-[10px] font-mono block font-semibold" style={{ color: "var(--text-mute)" }}>
                    {m.label}
                  </span>
                  <span className="text-sm font-mono font-extrabold block mt-0.5" style={{ color: m.color }}>
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Preview Interactive Card (5 cols) */}
          <div className="lg:col-span-5 w-full animate-slide-right">
            <div className="animate-float">
              {activeSlide.previewComponent}
            </div>
          </div>

        </div>

        {/* Slider Navigation Controls Bar */}
        <div
          className="relative z-20 border-t px-6 py-3.5 flex items-center justify-between glass"
          style={{ borderColor: "var(--line)" }}
        >

          {/* Slide Indicator Dots */}
          <div className="flex items-center gap-2">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setCurrentSlide(idx)}
                className={`h-2.5 cursor-pointer rounded-full no-lift ${currentSlide === idx ? "w-9" : "w-2.5"}`}
                style={{
                  background: currentSlide === idx
                    ? `linear-gradient(90deg, ${s.accentColor}, var(--accent-2))`
                    : "var(--line-strong)",
                  transition: "width .35s cubic-bezier(.16,1,.3,1), background .35s ease"
                }}
                title={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>

          {/* Controls: Prev / Next / Pause */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAutoPlaying(!isAutoPlaying)}
              className="p-1.5 rounded-md text-xs font-mono cursor-pointer border hover-glow"
              style={{ color: "var(--text-dim)", borderColor: "var(--line)", backgroundColor: "var(--surface-2)" }}
              title={isAutoPlaying ? "Pause Auto-play" : "Resume Auto-play"}
            >
              {isAutoPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)}
              className="p-1.5 rounded-md text-xs font-mono cursor-pointer border hover-glow"
              style={{ color: "var(--text-dim)", borderColor: "var(--line)", backgroundColor: "var(--surface-2)" }}
              title="Previous Slide"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentSlide((prev) => (prev + 1) % slides.length)}
              className="p-1.5 rounded-md text-xs font-mono cursor-pointer border hover-glow"
              style={{ color: "var(--text-dim)", borderColor: "var(--line)", backgroundColor: "var(--surface-2)" }}
              title="Next Slide"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

        </div>

      </div>

      {/* LOGIN & QUICK ACCESS GATEWAY SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Direct Authentication Form (5 cols) */}
        <div className="lg:col-span-5 bg-[#0F1724] border border-[#2A384C] rounded-xl p-6 shadow-xl space-y-5 animate-slide-left hover-glow">
          <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-[#4F8EF7]/20 border border-[#4F8EF7]/40 text-[#4F8EF7] rounded-lg">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#F0F4FF]">Resource Login Gateway</h3>
                <p className="text-xs text-[#94A3B8] font-mono">Secure employee sign-in</p>
              </div>
            </div>
            <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/30">
              Database Active
            </span>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg font-mono animate-scale-in">
              {loginError}
            </div>
          )}

          {loginSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-lg font-mono flex items-center gap-2 animate-scale-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{loginSuccess}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-mono font-semibold text-[#94A3B8] block mb-1">
                Resource ID, Email, or Name
              </label>
              <input
                type="text"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="e.g. E1000, aarav@company.com, or Aarav"
                className="w-full bg-[#141E30] text-[#F0F4FF] border border-[#2A384C] rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
              />
            </div>

            <div>
              <label className="text-xs font-mono font-semibold text-[#94A3B8] block mb-1">
                Password / Access PIN
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#141E30] text-[#F0F4FF] border border-[#2A384C] rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-[#4F8EF7] hover:bg-[#3B82F6] text-white font-mono font-bold text-xs rounded-lg transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2 sheen"
            >
              <LogIn className={`h-4 w-4 ${isSubmitting ? "animate-spin-slow" : ""}`} />
              <span>{isSubmitting ? "Signing in..." : "Log In to Enterprise Portal"}</span>
            </button>
          </form>

          <p className="text-[11px] text-[#64748B] text-center font-mono leading-relaxed">
            Passwords are stored hashed, never in plain text. The first sign-in
            for an account sets its password; every later sign-in must match it.
          </p>
        </div>

        {/* Right Column: What each role can reach once authenticated (7 cols).
            This is a description of the access model, not a set of login shortcuts -
            the persona grid that used to live here let anyone open a manager or
            executive cockpit with a single click. */}
        <div className="lg:col-span-7 bg-[#0F1724] border border-[#2A384C] rounded-xl p-6 shadow-xl space-y-4 animate-slide-right hover-glow">
          <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-[#10B981]" />
              <h3 className="text-sm font-bold text-[#F0F4FF]">Role-Based Access Model</h3>
            </div>
            <span className="text-xs font-mono text-[#94A3B8]">
              {profileCount} Resources Provisioned
            </span>
          </div>

          <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-3 flex items-start gap-2.5">
            <Lock className="h-4 w-4 text-[#4F8EF7] shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#94A3B8] leading-tight">
              <strong className="text-white">Every workspace is credential-gated.</strong> Sign in on the left with your own
              Resource ID and password. Your role determines which cockpit opens — there is no
              persona picker, and no account can be opened from this page without authenticating.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-children">
            {[
              {
                role: "Employee",
                accent: "#4F8EF7",
                icon: <Shield className="h-4 w-4" style={{ color: "#4F8EF7" }} />,
                scope: "Own capability profile",
                items: ["SkillGap interactive intake", "Personal learning roadmap", "Own evidence submissions"]
              },
              {
                role: "Manager",
                accent: "#A855F7",
                icon: <Users className="h-4 w-4" style={{ color: "#A855F7" }} />,
                scope: "Direct reports only",
                items: ["Team capability board", "Evidence review & sign-off", "GROW coaching cockpit"]
              },
              {
                role: "L&D",
                accent: "#10B981",
                icon: <BookOpen className="h-4 w-4" style={{ color: "#10B981" }} />,
                scope: "Enterprise-wide learning",
                items: ["Cohort readiness analytics", "Course catalog strategy", "Capability bottlenecks"]
              },
              {
                role: "Leadership",
                accent: "#F59E0B",
                icon: <TrendingUp className="h-4 w-4" style={{ color: "#F59E0B" }} />,
                scope: "Aggregate metrics",
                items: ["Enterprise Readiness Index", "Workforce risk forecasting", "Board-level reporting"]
              }
            ].map((r) => (
              <div
                key={r.role}
                className="bg-[#141E30] border border-[#2A384C] p-3 rounded-lg flex items-start gap-3 hover-lift"
              >
                <div
                  className="p-2 rounded-lg shrink-0 border"
                  style={{
                    backgroundColor: `${r.accent}1A`,
                    borderColor: `${r.accent}55`
                  }}
                >
                  {r.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs font-bold text-[#F0F4FF]">{r.role}</strong>
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase shrink-0"
                      style={{ color: r.accent, backgroundColor: `${r.accent}1A`, borderColor: `${r.accent}4D` }}
                    >
                      {r.scope}
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {r.items.map((it) => (
                      <li key={it} className="text-[10px] text-[#94A3B8] font-mono flex items-center gap-1.5">
                        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" style={{ color: r.accent }} />
                        <span className="truncate">{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>

      {/* PLATFORM ARCHITECTURE & FEATURE TILES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">

        <div className="bg-[#0F1724] border border-[#2A384C] p-5 rounded-xl space-y-2 hover-lift sheen">
          <div className="p-2 bg-[#4F8EF7]/20 border border-[#4F8EF7]/40 text-[#4F8EF7] rounded-lg w-fit">
            <Brain className="h-5 w-5" />
          </div>
          <h4 className="text-xs font-bold text-[#F0F4FF] font-mono">1. SkillGap-to-Growth</h4>
          <p className="text-xs text-[#94A3B8] font-sans">
            Interactive JD video/audio interview scenario assessments with Gemini AI rubric evaluation.
          </p>
        </div>

        <div className="bg-[#0F1724] border border-[#2A384C] p-5 rounded-xl space-y-2 hover-lift sheen">
          <div className="p-2 bg-[#10B981]/20 border border-[#10B981]/40 text-[#10B981] rounded-lg w-fit">
            <BookOpen className="h-5 w-5" />
          </div>
          <h4 className="text-xs font-bold text-[#F0F4FF] font-mono">2. Learning Concierge</h4>
          <p className="text-xs text-[#94A3B8] font-sans">
            1-on-1 AI Technical Mentor for concept clarification, verified course curation, and assignments.
          </p>
        </div>

        <div className="bg-[#0F1724] border border-[#2A384C] p-5 rounded-xl space-y-2 hover-lift sheen">
          <div className="p-2 bg-[#F59E0B]/20 border border-[#F59E0B]/40 text-[#F59E0B] rounded-lg w-fit">
            <Award className="h-5 w-5" />
          </div>
          <h4 className="text-xs font-bold text-[#F0F4FF] font-mono">3. Manager GROW Coach</h4>
          <p className="text-xs text-[#94A3B8] font-sans">
            Structured GROW coaching scripts, post-training readiness assessments, and observable behavior checks.
          </p>
        </div>

        <div className="bg-[#0F1724] border border-[#2A384C] p-5 rounded-xl space-y-2 hover-lift sheen">
          <div className="p-2 bg-[#A855F7]/20 border border-[#A855F7]/40 text-[#A855F7] rounded-lg w-fit">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h4 className="text-xs font-bold text-[#F0F4FF] font-mono">4. Capability Analytics</h4>
          <p className="text-xs text-[#94A3B8] font-sans">
            The Enterprise Readiness Index, Skill-vs-Will distribution, skill-gap risk, and supply against open demand.
          </p>
        </div>

      </div>

    </div>
  );
};
