import React, { useEffect, useState } from "react";
import { ArrowRight, ListChecks, Presentation, RotateCcw, Save, Users, X } from "lucide-react";
import { User, UserRole } from "../types";
import { Tag } from "./ui/Page";
import { DEMO_SCRIPT, DemoStep } from "./demoScript";
import { ROLE_LABEL } from "./navigation";

interface DemoPerson {
  userId: string;
  label: string;
  note: string;
  name: string;
  title: string;
  avatar: string;
  role: UserRole;
}

interface DemoStatus {
  people: DemoPerson[];
  startingPointSavedAt: string | null;
}

const LOCAL = ["localhost", "127.0.0.1", "[::1]"];

/** The demo tools, or null where they are not available: off, or not this computer. */
export const useDemoTools = (user: User | null): DemoStatus | null => {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  useEffect(() => {
    // The server refuses them elsewhere, so a hosted page does not even ask.
    if (!user || !LOCAL.includes(window.location.hostname)) { setStatus(null); return; }
    let cancelled = false;
    fetch("/api/demo")
      .then(async res => { if (!cancelled) setStatus(res.ok ? await res.json() : null); })
      .catch(() => { if (!cancelled) setStatus(null); });
    return () => { cancelled = true; };
  }, [user?.id]);
  return status;
};

// The employees of the cast stand in the order of the journey, so the script can name them.
const personFor = (as: DemoStep["as"], people: DemoPerson[]) => {
  if (as === "Leadership" || as === "Manager") return people.find(p => p.label === as);
  const employees = people.filter(p => p.label === "Employee");
  return as === "handed_off" ? employees[0] : as === "training" ? employees[1] : undefined;
};

interface DemoToolsProps {
  isOpen: boolean;
  onClose: () => void;
  status: DemoStatus;
  currentUser: User;
}

export const DemoTools: React.FC<DemoToolsProps> = ({ isOpen, onClose, status, currentUser }) => {
  // Kept for this browser tab, so the script is still open after a switch reloads the page.
  const [tab, setTab] = useState<"people" | "script">(() => {
    try { return sessionStorage.getItem("demo-tab") === "script" ? "script" : "people"; } catch { return "people"; }
  });
  useEffect(() => {
    try { sessionStorage.setItem("demo-tab", tab); } catch { /* a private window: start at People each time */ }
  }, [tab]);
  const [busy, setBusy] = useState("");
  const [asking, setAsking] = useState<"reset" | "save" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(status.startingPointSavedAt);

  useEffect(() => {
    if (!isOpen) return;
    setAsking(null); setMessage(""); setError("");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const post = async (path: string, body: object) => {
    const res = await fetch(path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
    return data;
  };

  const run = async (name: string, work: () => Promise<void>) => {
    setBusy(name); setError(""); setMessage("");
    try { await work(); } catch (err: any) { setError(err?.message || "That did not work."); } finally { setBusy(""); }
  };

  // A full load, so nothing of the previous person stays on screen.
  const switchTo = (userId: string) => run(userId, async () => {
    await post("/api/demo/switch", { userId });
    window.location.assign("/");
  });
  const reset = () => run("reset", async () => {
    await post("/api/demo/reset", { confirm: true });
    window.location.assign("/");
  });
  const save = () => run("save", async () => {
    await post("/api/demo/starting-point", { confirm: true });
    setSavedAt(new Date().toISOString());
    setAsking(null);
    setMessage("Saved. Reset demo now goes back to the demo as it is at this moment.");
  });

  const mayManage = currentUser.role !== UserRole.EMPLOYEE;
  const muted = { color: "var(--text-mute)" };
  const dim = { color: "var(--text-dim)" };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Demo tools"
        onClick={e => e.stopPropagation()}
        className="modal-panel rounded-2xl w-full max-w-3xl p-5 sm:p-6 shadow-2xl space-y-4 my-4"
        style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold flex items-center gap-2">
              <Presentation className="h-5 w-5" style={{ color: "var(--accent)" }} aria-hidden="true" /> Demo tools
            </h2>
            <p className="text-[12.5px] mt-0.5" style={dim}>
              For the presenter, on this computer only. Switch between people, follow the script, and start over.
            </p>
          </div>
          <button type="button" onClick={onClose} className="header-btn" aria-label="Close demo tools">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex gap-2" role="tablist">
          {([["people", "People", Users], ["script", "Script", ListChecks]] as const).map(([id, label, Icon]) => (
            <button
              key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`header-btn ${tab === id ? "header-btn-primary" : ""}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        {tab === "people" && (
          <ul className="space-y-2" id="demo-people">
            {status.people.map(p => {
              const here = p.userId === currentUser.id;
              return (
                <li key={p.userId} className="stat-tile flex items-center gap-3" style={{ padding: "10px 12px" }}>
                  <img src={p.avatar} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-semibold flex flex-wrap items-center gap-x-2">
                      {p.name} <Tag tone={here ? "ok" : undefined}>{here ? "You are here" : ROLE_LABEL[p.role]}</Tag>
                    </span>
                    <span className="block text-[12px]" style={dim}>{p.note}</span>
                  </div>
                  <button
                    type="button" id={`demo-switch-${p.userId}`} disabled={here || !!busy}
                    onClick={() => switchTo(p.userId)} className="header-btn shrink-0 disabled:opacity-40"
                  >
                    {busy === p.userId ? "Switching…" : "Switch"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {tab === "script" && (
          <ol className="space-y-3 max-h-[52vh] overflow-y-auto pr-1" id="demo-script">
            {DEMO_SCRIPT.map((step, n) => {
              const who = personFor(step.as, status.people);
              return (
                <li key={n} className="stat-tile" style={{ padding: "12px 14px" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13.5px] font-bold">{n + 1}. {step.title}</span>
                    <span className="flex items-center gap-2">
                      <Tag>about {step.minutes} min</Tag>
                      {who && who.userId !== currentUser.id && (
                        <button type="button" disabled={!!busy} onClick={() => switchTo(who.userId)} className="header-btn disabled:opacity-40">
                          Switch to {who.name} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  </div>
                  <ul className="list-disc pl-5 mt-2 space-y-1 text-[12.5px]" style={dim}>
                    {step.clicks.map(c => <li key={c}>{c}</li>)}
                  </ul>
                  <p className="text-[12.5px] mt-2 italic" style={muted}>Say: “{step.say}”</p>
                </li>
              );
            })}
          </ol>
        )}

        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          <p className="text-[12.5px]" style={dim}>
            <strong style={{ color: "var(--text)" }}>Reset demo</strong> goes back to the starting point
            {savedAt ? ` saved on ${new Date(savedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : " the sample data gives"}.
            {" "}A backup is made first; passwords are kept.
          </p>
          {!mayManage ? (
            <p className="text-[12px]" style={muted}>Switch to the manager or a leader to reset.</p>
          ) : asking ? (
            <div role="alertdialog" aria-label="Confirm" className="space-y-2">
              <p className="text-[12.5px]" style={{ color: "var(--warn)" }}>
                {asking === "reset"
                  ? "Everything entered since the starting point will be removed: new demands, answers, proof and sign-offs."
                  : "The demo as it is now becomes the new starting point, in place of the earlier one."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button" id="demo-confirm" disabled={!!busy}
                  onClick={asking === "reset" ? reset : save} className="header-btn header-btn-primary disabled:opacity-50"
                >
                  {busy === "reset" ? "Resetting…" : busy === "save" ? "Saving…" : asking === "reset" ? "Yes, reset the demo" : "Yes, save it"}
                </button>
                <button type="button" disabled={!!busy} onClick={() => setAsking(null)} className="header-btn">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" id="demo-reset" onClick={() => { setAsking("reset"); setMessage(""); }} className="header-btn">
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset demo
              </button>
              <button type="button" id="demo-save" onClick={() => { setAsking("save"); setMessage(""); }} className="header-btn">
                <Save className="h-4 w-4" aria-hidden="true" /> Save as the starting point
              </button>
            </div>
          )}
          {message && <p role="status"><Tag tone="ok">{message}</Tag></p>}
          {error && <p role="alert"><Tag tone="risk">{error}</Tag></p>}
        </div>
      </div>
    </div>
  );
};
