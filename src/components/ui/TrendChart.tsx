import React, { useEffect, useRef, useState } from "react";

export interface TrendPoint {
  day: string;      // YYYY-MM-DD
  value: number;    // 0-100
  note?: string;    // extra line for the tooltip
}

const HEIGHT = 190;
const PAD = { top: 16, right: 44, bottom: 28, left: 36 };
const TICKS = [0, 25, 50, 75, 100];

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/** A single-series percentage line over real dates. Hover or arrow keys move a
    crosshair to the nearest reading; the same values are in the table view below. */
export const TrendChart: React.FC<{ points: TrendPoint[]; label: string }> = ({ points, label }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const times = points.map(p => Date.parse(`${p.day}T00:00:00Z`));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => PAD.top + (1 - v / 100) * plotH;
  const xy = points.map((p, i) => [x(times[i]), y(p.value)] as const);

  const line = xy.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${y(0)} L${xy[0][0].toFixed(1)},${y(0)} Z`;
  const last = points.length - 1;

  const nearest = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return null;
    const px = clientX - box.left;
    let best = 0;
    xy.forEach(([qx], i) => { if (Math.abs(qx - px) < Math.abs(xy[best][0] - px)) best = i; });
    return best;
  };

  const shown = active ?? null;
  const tip = shown !== null ? points[shown] : null;
  const tipLeft = shown !== null ? Math.min(Math.max(xy[shown][0], 70), width - 70) : 0;

  // Label every reading when there are few; otherwise only the first and last.
  const xLabels = points.length <= 6 ? points.map((_, i) => i) : [0, last];

  return (
    <div>
      <div ref={wrap} className="relative select-none">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${label}: ${points.map(p => `${dayLabel(p.day)} ${p.value}%`).join(", ")}`}
          tabIndex={0}
          className="block outline-none focus-visible:ring-2 rounded-lg"
          style={{ ["--tw-ring-color" as string]: "rgb(var(--accent-rgb) / 45%)" }}
          onPointerMove={e => setActive(nearest(e.clientX))}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(last)}
          onBlur={() => setActive(null)}
          onKeyDown={e => {
            if (e.key === "ArrowLeft") { e.preventDefault(); setActive(i => Math.max(0, (i ?? last) - 1)); }
            if (e.key === "ArrowRight") { e.preventDefault(); setActive(i => Math.min(last, (i ?? last) + 1)); }
          }}
        >
          {TICKS.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)}
                    stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end"
                    fontSize={10} fill="var(--text-mute)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {t}
              </text>
            </g>
          ))}
          {xLabels.map(i => (
            <text key={i} x={xy[i][0]} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="var(--text-mute)">
              {dayLabel(points[i].day)}
            </text>
          ))}

          <path d={area} fill="rgb(var(--accent-rgb) / 10%)" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round" />

          {shown !== null && (
            <line x1={xy[shown][0]} x2={xy[shown][0]} y1={PAD.top} y2={y(0)}
                  stroke="var(--text-mute)" strokeWidth={1} />
          )}
          {xy.map(([px, py], i) => (
            <circle key={i} cx={px} cy={py} r={i === shown || i === last ? 4.5 : 3}
                    fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          ))}
          {/* Direct label on the latest reading only. */}
          <text x={xy[last][0] + 10} y={xy[last][1]} dy="0.32em" fontSize={12} fontWeight={700} fill="var(--text)">
            {points[last].value}%
          </text>
        </svg>

        {tip && shown !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg px-3 py-2 text-xs shadow-lg"
            style={{ left: tipLeft, top: 0, background: "var(--surface)", border: "1px solid var(--line)" }}
          >
            <div className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: "var(--accent)" }} />
              <strong style={{ color: "var(--text)", fontSize: 14 }}>{tip.value}%</strong>
            </div>
            <div style={{ color: "var(--text-mute)" }}>{dayLabel(tip.day)}</div>
            {tip.note && <div style={{ color: "var(--text-mute)" }}>{tip.note}</div>}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowTable(v => !v)}
        className="mt-2 text-[11px] font-mono font-bold uppercase tracking-wider cursor-pointer"
        style={{ color: "var(--accent)" }}
        aria-expanded={showTable}
      >
        {showTable ? "Hide table" : "View as table"}
      </button>
      {showTable && (
        <table className="data-table mt-2">
          <thead><tr><th>Day</th><th className="num">{label}</th><th>Note</th></tr></thead>
          <tbody>
            {points.map(p => (
              <tr key={p.day}><td>{p.day}</td><td className="num">{p.value}%</td><td>{p.note ?? ""}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
