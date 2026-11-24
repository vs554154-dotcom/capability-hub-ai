import React from "react";

interface RadarSkill {
  name: string;
  current: number; // 0-5
  target: number;  // 0-5
}

interface SkillRadarChartProps {
  skills: RadarSkill[];
}

export const SkillRadarChart: React.FC<SkillRadarChartProps> = ({ skills }) => {
  if (!skills || skills.length < 3) {
    return (
      <div className="flex items-center justify-center h-64 text-xs text-[#666] font-mono">
        Insufficient skill vectors for radar plot (min 3 required)
      </div>
    );
  }

  const size = 320;
  const cx = size / 2;
  const cy = 145;
  const radius = 95;
  const maxLevel = 5;
  const numSkills = skills.length;

  // Helper to calculate coordinates
  const getCoordinates = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / numSkills - Math.PI / 2;
    const r = (radius * Math.min(value, maxLevel)) / maxLevel;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return { x, y, angle };
  };

  // Generate radar polygon paths
  const currentPoints = skills.map((s, i) => {
    const { x, y } = getCoordinates(i, s.current);
    return `${x},${y}`;
  }).join(" ");

  const targetPoints = skills.map((s, i) => {
    const { x, y } = getCoordinates(i, s.target);
    return `${x},${y}`;
  }).join(" ");

  // Grid level rings (1 to 5)
  const gridRings = [1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col items-center justify-center py-2 relative">
      <svg width={size} height={280} className="overflow-visible">
        {/* Grid Rings */}
        {gridRings.map((level) => {
          const points = skills.map((_, i) => {
            const { x, y } = getCoordinates(i, level);
            return `${x},${y}`;
          }).join(" ");
          return (
            <polygon
              key={`grid-${level}`}
              points={points}
              fill="none"
              stroke="#1E293B"
              strokeWidth={level === 5 ? "1.5" : "1"}
              strokeDasharray={level < 5 ? "2 2" : "none"}
            />
          );
        })}

        {/* Axis Lines & Labels */}
        {skills.map((s, i) => {
          const { x: outerX, y: outerY, angle } = getCoordinates(i, 5);
          // Label offset
          const labelDist = radius + 18;
          const labelX = cx + labelDist * Math.cos(angle);
          // Neighbouring names at the bottom are side by side: put every second one lower.
          const labelY = cy + labelDist * Math.sin(angle) + (Math.sin(angle) > 0.6 && i % 2 ? 12 : 0);

          // Truncate long names
          const shortName = s.name.length > 18 ? s.name.substring(0, 16) + "..." : s.name;

          return (
            <g key={`axis-${i}`}>
              <line
                x1={cx}
                y1={cy}
                x2={outerX}
                y2={outerY}
                stroke="#1E293B"
                strokeWidth="1"
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="central"
                className="text-[9px] font-mono fill-[#94A3B8] font-medium"
              >
                {shortName}
              </text>
            </g>
          );
        })}

        {/* Target Level Polygon (Electric Blue #4F8EF7) */}
        <polygon
          points={targetPoints}
          fill="rgba(79, 142, 247, 0.15)"
          stroke="#4F8EF7"
          strokeWidth="2"
          strokeDasharray="4 2"
        />

        {/* Current Level Polygon (Emerald #10B981) */}
        <polygon
          points={currentPoints}
          fill="rgba(16, 185, 129, 0.25)"
          stroke="#10B981"
          strokeWidth="2.5"
        />

        {/* Current Points Markers */}
        {skills.map((s, i) => {
          const { x, y } = getCoordinates(i, s.current);
          return (
            <circle
              key={`marker-${i}`}
              cx={x}
              cy={y}
              r="3.5"
              fill="#10B981"
              stroke="#0F1724"
              strokeWidth="1.5"
            />
          );
        })}
      </svg>

      {/* Radar Chart Legend */}
      <div className="flex items-center gap-6 mt-1 text-[11px] font-mono">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#10B981] inline-block shadow-sm shadow-[#10B981]/30" />
          <span className="text-[#F0F4FF] font-semibold">Current Proficiency</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 border-b-2 border-dashed border-[#4F8EF7] inline-block" />
          <span className="text-[#94A3B8]">Target Requirement</span>
        </div>
      </div>
    </div>
  );
};
