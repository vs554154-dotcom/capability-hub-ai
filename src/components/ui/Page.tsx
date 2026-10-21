import React from "react";
import type { LucideIcon } from "lucide-react";

/* Shared page structure. Every workspace opens with a PageHeader that says what the
   page is for and how to use it, then lays its content out in SectionCards. The look
   comes from section 8 of index.css, which is built on the theme tokens. */

export type Tone = "ok" | "warn" | "risk" | "accent";

interface PageHeaderProps {
  eyebrow: string;
  icon?: LucideIcon;
  title: string;
  lede: React.ReactNode;
  /** Short "how to use this page" steps, shown numbered. */
  steps?: React.ReactNode[];
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, icon: Icon, title, lede, steps, actions }) => (
  <header className="page-head animate-fade-in-up">
    <div className="page-head-row">
      <div className="min-w-0">
        <span className="page-eyebrow">
          {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
          {eyebrow}
        </span>
        <h2 className="page-title">{title}</h2>
        <p className="page-lede">{lede}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {steps && steps.length > 0 && (
      <ol className="page-steps" aria-label="How to use this page">
        {steps.map((step, i) => (
          <li key={i} className="page-step">
            <span>{step}</span>
          </li>
        ))}
      </ol>
    )}
  </header>
);

interface SectionCardProps {
  title: string;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ title, subtitle, icon: Icon, aside, className = "", children }) => (
  <section className={`section-card ${className}`}>
    <div className="section-head">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <span className="section-icon">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="section-title">{title}</h3>
          {subtitle && <p className="section-sub">{subtitle}</p>}
        </div>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
    {children}
  </section>
);

export const StatTile: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }> = ({
  label, value, hint, tone,
}) => (
  <div className="stat-tile">
    <div className="stat-label">{label}</div>
    <div className={`stat-value ${tone && tone !== "accent" ? `tone-text-${tone}` : ""}`}>{value}</div>
    {hint && <div className="stat-hint">{hint}</div>}
  </div>
);

export const Meter: React.FC<{ value: number; tone?: Tone; label?: string }> = ({ value, tone, label }) => (
  <div
    className={`meter ${tone && tone !== "accent" ? `tone-${tone}` : ""}`}
    role="meter"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value)}
    aria-label={label}
  >
    <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

export const Tag: React.FC<{ tone?: Tone; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => (
  <span className={`tag ${tone ? `tone-${tone}` : ""}`} title={title}>{children}</span>
);

/** Green from 70, amber from 45, red below: the same bands for every score on a page. */
export const scoreTone = (score: number): Tone => (score >= 70 ? "ok" : score >= 45 ? "warn" : "risk");
