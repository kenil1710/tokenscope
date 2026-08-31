"use client";

import { motion } from "framer-motion";
import { DIMENSION_META, scoreTone, TONE_CLASSES } from "@/lib/risk";
import type { Dimension } from "@/types";

/**
 * One dimension, as a labelled bar.
 *
 * The weight is shown beside the name because a 100 in maturity and a 100 in
 * distribution are not worth the same, and a reader comparing two bars without
 * that number is being quietly misled.
 */
export function DimensionBar({
  dimension,
  score,
  delay = 0,
  compact = false,
}: {
  dimension: Dimension;
  score: number;
  delay?: number;
  compact?: boolean;
}) {
  const meta = DIMENSION_META[dimension];
  const tone = TONE_CLASSES[scoreTone(score)];

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-ink-800">{meta.label}</span>
          <span className="text-[11px] font-medium text-ink-400">
            {meta.weight}% weight
          </span>
        </div>
        <span className="tabular text-sm font-semibold text-ink-900">{score}</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
        <motion.div
          className={`h-full rounded-full ${tone.fill}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {compact ? null : (
        <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{meta.blurb}</p>
      )}
    </div>
  );
}
