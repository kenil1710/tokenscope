"use client";

import { motion } from "framer-motion";
import { RiskMeter } from "./RiskMeter";
import { RiskBadge } from "./RiskBadge";
import { ChainMark } from "./ChainMark";
import { DIMENSIONS } from "@/types";
import { DIMENSION_META, scoreTone, TONE_CLASSES } from "@/lib/risk";

/**
 * The hero's right-hand side: a live-looking report card for USDT.
 *
 * These are the real numbers the deployed contract returned for
 * 0xdAC17F95…31ec7 on Ethereum, not invented ones. A marketing page that shows
 * a fabricated 98 next to a product whose honest answer is 86 teaches people to
 * distrust the product.
 */
const DEMO = {
  symbol: "USDT",
  name: "Tether",
  overall: 86,
  dimensions: { distribution: 70, activity: 100, verification: 75, maturity: 100, liquidity: 95 },
  flags: ["MINTABLE", "PAUSABLE", "HAS_BLACKLIST"],
} as const;

export function HeroVisual() {
  return (
    <div className="relative">
      {/* soft aura, purely decorative */}
      <div
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-br from-ink-100 via-transparent to-safe-100/50 blur-2xl"
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, y: 24, rotateX: 6 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-hairline bg-surface p-6 shadow-lift"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <ChainMark chain="ethereum" size={36} />
            <div>
              <p className="text-base font-semibold text-ink-900">{DEMO.symbol}</p>
              <p className="text-xs text-ink-500">{DEMO.name} · Ethereum</p>
            </div>
          </div>
          <RiskBadge badge="MODERATE_RISK" />
        </div>

        <div className="mt-5 flex items-center gap-6">
          <RiskMeter score={DEMO.overall} size={148} label="Overall" />
          <div className="min-w-0 flex-1 space-y-2.5">
            {DIMENSIONS.map((dimension, i) => {
              const score = DEMO.dimensions[dimension];
              const tone = TONE_CLASSES[scoreTone(score)];
              return (
                <div key={dimension}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[11px] font-medium text-ink-600">
                      {DIMENSION_META[dimension].label}
                    </span>
                    <span className="tabular text-[11px] font-semibold text-ink-800">
                      {score}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <motion.div
                      className={`h-full rounded-full ${tone.fill}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${score}%` }}
                      transition={{
                        duration: 0.8,
                        delay: 0.35 + i * 0.1,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 border-t border-hairline pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Rug findings
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEMO.flags.map((flag, i) => (
              <motion.span
                key={flag}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.9 + i * 0.09 }}
                className="rounded-md border border-danger-500/25 bg-danger-50 px-2 py-1 font-mono text-[10px] font-semibold text-danger-700"
              >
                {flag}
              </motion.span>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
            Found by name in the verified ABI — USDT&rsquo;s supply control really is{" "}
            <code className="font-mono text-ink-700">issue</code>, and its freeze is{" "}
            <code className="font-mono text-ink-700">pause</code> plus{" "}
            <code className="font-mono text-ink-700">addBlackList</code>.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
