import React, { useEffect, useState } from "react";
import { Inbox as InboxIcon } from "lucide-react";
import { AgentReminder } from "../types";
import { SectionCard, Tag, Tone } from "./ui/Page";

// Reminders were written by managers, L&D campaigns and project handoffs, but nothing
// showed them to the employee they were for. This is where they arrive.

const KIND: Record<AgentReminder["type"], { label: string; tone?: Tone }> = {
  escalation: { label: "Project handoff", tone: "warn" },
  campaign: { label: "L&D campaign", tone: "accent" },
  ld_escalation: { label: "Escalated to L&D", tone: "warn" },
  weekly_reminder: { label: "Reminder" },
  checkpoint: { label: "Check-in" },
  manager_notice: { label: "From your manager" },
};

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export const Inbox: React.FC<{ limit?: number }> = ({ limit = 5 }) => {
  const [items, setItems] = useState<AgentReminder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reminders")
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(data => !cancelled && setItems(data))
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, []);

  const shown = items ? (showAll ? items : items.slice(0, limit)) : [];

  return (
    <SectionCard
      title="Inbox"
      subtitle="Reminders, check-ins and campaign notices from your manager and L&D, newest first."
      icon={InboxIcon}
      aside={items && items.length > 0 ? <Tag>{items.length}</Tag> : undefined}
    >
      {failed ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>Your messages could not be loaded. Refresh to try again.</p>
      ) : items === null ? (
        <div className="skeleton h-16" />
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          No messages yet. When your manager sends a reminder or L&D starts a campaign that includes you, it appears here.
        </p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {shown.map(item => {
              const kind = KIND[item.type] ?? { label: item.type };
              return (
                <li key={item.id} className="stat-tile" style={{ padding: "12px 14px" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-[13px]" style={{ color: "var(--text)" }}>{item.title}</strong>
                    <span className="flex items-center gap-2">
                      <Tag tone={kind.tone}>{kind.label}</Tag>
                      <span className="text-[11px]" style={{ color: "var(--text-mute)" }}>{when(item.createdAt)}</span>
                    </span>
                  </div>
                  <p className="text-[12.5px] leading-relaxed mt-1" style={{ color: "var(--text-dim)" }}>{item.message}</p>
                </li>
              );
            })}
          </ul>
          {items.length > limit && (
            <button type="button" onClick={() => setShowAll(v => !v)} className="mt-3 text-[12.5px] font-semibold cursor-pointer" style={{ color: "var(--accent)" }}>
              {showAll ? "Show fewer" : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </SectionCard>
  );
};
