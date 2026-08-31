"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { flagMeta } from "@/lib/risk";

/**
 * One rug finding, as a warning card.
 *
 * The shake is deliberately small and runs once. A warning that jitters
 * repeatedly gets tuned out, which is the opposite of what a warning is for.
 */
export function RugFlagCard({ flag, index = 0 }: { flag: string; index?: number }) {
  const meta = flagMeta(flag);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, x: [0, -4, 4, -2, 2, 0] }}
      transition={{
        opacity: { duration: 0.3, delay: index * 0.07 },
        y: { duration: 0.3, delay: index * 0.07 },
        x: { duration: 0.45, delay: 0.2 + index * 0.07 },
      }}
      className="flex gap-3 rounded-xl border border-danger-500/25 bg-danger-50 p-4"
    >
      <AlertTriangle
        className="mt-0.5 size-5 shrink-0 text-danger-600"
        strokeWidth={2}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-danger-700">{meta.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-danger-700/80">{meta.detail}</p>
        <code className="mt-2 inline-block rounded bg-danger-500/10 px-1.5 py-0.5 font-mono text-[11px] text-danger-700">
          {flag}
        </code>
      </div>
    </motion.div>
  );
}

/** Shown in place of the list when a token has no findings at all. */
export function NoFlagsCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex gap-3 rounded-xl border border-safe-500/25 bg-safe-50 p-4"
    >
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-safe-600" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-safe-700">No rug findings</p>
        <p className="mt-1 text-xs leading-relaxed text-safe-700/80">
          No mint, pause, blacklist or proxy surface was found in the verified ABI, the
          explorer has not flagged it, and the supply is not concentrated.
        </p>
      </div>
    </motion.div>
  );
}
