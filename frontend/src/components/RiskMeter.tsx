"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { scoreTone, TONE_HEX } from "@/lib/risk";

/**
 * The headline number, as a gauge that fills on mount.
 *
 * A 270° arc rather than a full ring: the gap gives the number somewhere to sit
 * and makes "empty" legible as empty rather than as a thin ring you might have
 * missed. The sweep and the digits are driven by ONE spring so they can never
 * disagree mid-animation — a counter that finishes before its arc reads as a
 * bug even when both land in the right place.
 */
export function RiskMeter({
  score,
  size = 220,
  label = "Overall",
  sublabel,
  animate = true,
}: {
  score: number;
  size?: number;
  label?: string;
  sublabel?: string;
  animate?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tone = scoreTone(clamped);
  const colour = TONE_HEX[tone];

  const stroke = Math.max(10, Math.round(size * 0.055));
  const radius = (size - stroke) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const sweep = 0.75; // 270 degrees
  const track = circumference * sweep;

  const progress = useMotionValue(animate ? 0 : clamped);
  const spring = useSpring(progress, { stiffness: 60, damping: 18, mass: 0.9 });
  const dashoffset = useTransform(spring, (v) => track - (track * v) / 100);
  const shown = useTransform(spring, (v) => Math.round(v));

  useEffect(() => {
    progress.set(clamped);
  }, [clamped, progress]);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${clamped} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-[225deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e3e9f2"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${track} ${circumference}`}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${track} ${circumference}`}
          style={{ strokeDashoffset: dashoffset }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="tabular font-semibold leading-none text-ink-900"
          style={{ fontSize: size * 0.28 }}
        >
          {shown}
        </motion.span>
        <span
          className="mt-1 font-medium uppercase tracking-widest text-ink-400"
          style={{ fontSize: Math.max(10, size * 0.058) }}
        >
          {label}
        </span>
        {sublabel ? (
          <span
            className="mt-0.5 text-ink-500"
            style={{ fontSize: Math.max(10, size * 0.055) }}
          >
            {sublabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
