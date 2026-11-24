import React, { useState } from "react";
import { User } from "../types";
import {
  ShieldCheck,
  UserCheck,
  Lock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Server,
  Zap
} from "lucide-react";
import { BrandLockup } from "./BrandLogo";

interface ResourceLoginPageProps {
  /** Called only after the server has accepted a credential and opened a session. */
  onAuthenticated: (user: User) => void;
  onBack?: () => void;
  isLoading: boolean;
}

export const ResourceLoginPage: React.FC<ResourceLoginPageProps> = ({
  onAuthenticated,
  onBack,
  isLoading,
}) => {
  // Credentials Form State
  const [emailInput, setEmailInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!emailInput.trim()) {
      setFormError("Please enter your corporate email or Resource ID.");
      return;
    }

    if (!pinInput.trim()) {
      setFormError("Please enter your security PIN or password.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput.trim(),
          pin: pinInput.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.user) {
        setFormError(data.error || "Authentication failed. Check your credentials.");
      } else {
        // The session cookie is already set; hand the server's user object up.
        onAuthenticated(data.user);
      }
    } catch (err: any) {
      setFormError("Network communication error: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="app-shell min-h-screen bg-[#0B111D] text-[#F0F4FF] flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8 selection:bg-[#4F8EF7] selection:text-[#0F1724]">

      <div className="app-aurora" aria-hidden="true">
        <span className="aurora-blob blob-1" />
        <span className="aurora-blob blob-2" />
        <span className="aurora-blob blob-3" />
        <span className="aurora-relief" />
        <span className="aurora-grid" />
        <span className="aurora-noise" />
      </div>

      {/* Top Header */}
      <div className="app-content max-w-6xl mx-auto w-full space-y-8 animate-fade-in-up">

        {/* Logo and Welcome Title */}
        <div className="text-center space-y-3 pt-4">
          <div className="flex justify-center mb-4">
            <BrandLockup width={300} />
          </div>
          <div className="inline-flex items-center gap-3 bg-[#141E30] border border-[#2A384C] px-4 py-2 rounded-full shadow-inner mb-2 hover-glow">
            <Sparkles className="h-4 w-4 text-[#4F8EF7] animate-float" />
            <span className="text-xs font-mono font-bold tracking-[0.2em] text-[#4F8EF7] uppercase">
              ENTERPRISE PORTAL
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight gradient-text">
            Resource Login & Identity Gateway
          </h1>
          <p className="text-sm text-[#94A3B8] max-w-2xl mx-auto leading-relaxed">
            Authenticate with your own corporate ID to reach your SkillGap agents, coaching boards
            and capability analytics. Your role decides which workspace opens — accounts cannot be
            browsed or entered from this screen.
          </p>
        </div>

        {/* CREDENTIAL AUTHENTICATION - the only way into the application */}
        <div className="max-w-md mx-auto bg-[#141E30] border border-[#2A384C] rounded-2xl p-8 shadow-2xl space-y-6 animate-scale-in relative overflow-hidden">

            <div className="absolute top-0 left-0 right-0 h-1 bg-[#4F8EF7]" />

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#F0F4FF]">Sign in to your workspace</h2>
              <p className="text-xs text-[#94A3B8]">Sign in with your corporate resource account email or employee ID.</p>
            </div>

            {formError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-lg flex items-start gap-2.5 font-mono">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCredentialSubmit} className="space-y-4">
              
              <div>
                <label htmlFor="sso-email-input" className="block text-xs font-mono uppercase font-bold text-[#94A3B8] mb-1.5">
                  Corporate Email or Resource ID *
                </label>
                <div className="relative">
                  <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                  <input
                    id="sso-email-input"
                    type="text"
                    required
                    placeholder="e.g. elena.vance@company.com or user_1"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs pl-9 pr-4 py-2.5 rounded-lg border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7] placeholder:text-[#94A3B8]/60 font-mono"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="sso-pin-input" className="block text-xs font-mono uppercase font-bold text-[#94A3B8] mb-1.5">
                  Security PIN / Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                  <input
                    id="sso-pin-input"
                    type="password"
                    placeholder="••••••••"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs pl-9 pr-4 py-2.5 rounded-lg border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7] placeholder:text-[#94A3B8]/60 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-[#94A3B8]">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-[#2A384C] bg-[#0F1724] text-[#4F8EF7] focus:ring-0"
                  />
                  <span>Remember Session</span>
                </label>
                <a href="#demo-accounts" className="text-[#4F8EF7] hover:underline">
                  Quick Demo Accounts
                </a>
              </div>

              <button
                id="sso-submit-btn"
                type="submit"
                disabled={submitting || isLoading}
                className="w-full flex items-center justify-center gap-2 bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-mono uppercase font-bold text-xs py-3 px-4 rounded-lg transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {submitting || isLoading ? (
                  <>
                    <Zap className="h-4 w-4 animate-spin text-[#0F1724]" />
                    Authenticating Resource...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Authenticate & Launch Workspace
                  </>
                )}
              </button>

            </form>

            <div className="pt-4 border-t border-[#2A384C] space-y-3">
              <p className="text-[11px] text-[#94A3B8] font-mono leading-relaxed flex items-start gap-2">
                <Lock className="h-3.5 w-3.5 text-[#4F8EF7] shrink-0 mt-0.5" />
                <span>
                  Sign-in is per-account. An account's first sign-in sets its password
                  (minimum 4 characters); every later sign-in must match it.
                </span>
              </p>

              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="w-full py-2 text-[11px] font-mono text-[#94A3B8] hover:text-[#F0F4FF] border border-[#2A384C] hover:border-[#4F8EF7] rounded-lg cursor-pointer"
                >
                  Back to Home
                </button>
              )}
            </div>

          </div>

      </div>

      {/* How sign-in works - facts only, no status claims nothing checks. */}
      <div className="app-content max-w-6xl mx-auto w-full pt-12">
        <div className="bg-[#141E30]/80 border border-[#2A384C] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#94A3B8]">
          <div className="flex items-center gap-3">
            <Server className="h-4 w-4 text-[#4F8EF7]" />
            <span>CyBridge sign-in</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-[#4F8EF7]" />
              Password per account
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-[#4F8EF7]" />
              Signing out ends the session on the server
            </span>
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-[#4F8EF7]" />
              Your role decides your workspace
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};
