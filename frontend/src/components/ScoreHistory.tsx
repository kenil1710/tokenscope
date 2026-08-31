"use client";

import { motion } from "framer-motion";
import { scoreTone, TONE_HEX } from "@/lib/risk";
import type { RiskRecord } from "@/types";

/**
 * Past scores as a sparkline.
 *
 * Hand-drawn SVG rather than a charting library: this is one series of at most
 * twelve points, and a chart dependency would be larger than the whole page.
 * The y-axis is pinned to 0–100 rather than fitted to the data — an auto-fitted
 * axis turns a 5-point wobble into a dramatic cliff, which is exactly the
 * misreading the contract's quantization exists to prevent.
 */
export function ScoreHistory({ scores }: { scores: RiskRecord[] }) {
  const series = [...scores].reverse(); // oldest first
  if (series.length < 2) return null;

  const width = 640;
  const height = 180;
  const padX = 8;
  const padY = 16;
  const step = (width - padX * 2) / (series.length - 1);
  const y = (score: number) => padY + ((100 - score) / 100) * (height - padY * 2);

  const points = series.map((record, i) => ({
    x: padX + i * step,
    y: y(record.overall_score),
    record,
  }));

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1].x},${height - padY} L${points[0].x},${height - padY} Z`;
  const latest = series[series.length - 1].overall_score;
  const colour = TONE_HEX[scoreTone(latest)];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full min-w-[420px]"
        role="img"
        aria-label={`Overall score across ${series.length} scans, most recent ${latest}`}
      >
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={padX}
              x2={width - padX}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e3e9f2"
              strokeWidth="1"
              strokeDasharray={tick === 0 || tick === 100 ? undefined : "3 4"}
            />
            <text x={0} y={y(tick) - 3} fontSize="9" fill="#94b0cf">
              {tick}
            </text>
          </g>
        ))}

        <motion.path
          d={area}
          fill={colour}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.08 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke={colour}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />

        {points.map((p, i) => (
          <motion.circle
            key={p.record.score_id}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#fff"
            stroke={colour}
            strokeWidth="2.5"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, delay: 0.5 + i * 0.05 }}
          >
            <title>{`Scan #${p.record.seq}: ${p.record.overall_score}`}</title>
          </motion.circle>
        ))}
      </svg>
    </div>
  );
}
