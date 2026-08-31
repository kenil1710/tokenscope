"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ChainMark } from "./ChainMark";
import { RiskBadge } from "./RiskBadge";
import { formatDay, shortAddress } from "@/lib/format";
import { scoreTone, TONE_CLASSES } from "@/lib/risk";
import type { Badge, ChainName, RugLevel } from "@/types";

export type TokenCardData = {
  chain: ChainName;
  token_address: string;
  symbol?: string;
  overall_score: number;
  badge: Badge;
  rug_level: RugLevel;
  scored_at?: number;
  rank?: number;
};

/** Compact token row used by the explore page and both leaderboards. */
export function TokenCard({ token, index = 0 }: { token: TokenCardData; index?: number }) {
  const tone = TONE_CLASSES[scoreTone(token.overall_score)];
  // An absolute date, not a relative one. `Date.now()` is impure and reading it
  // during render breaks memoization (and would differ between the server and
  // the browser). Records that carry the contract's own `age_seconds` — the
  // score card, the detail page — still show relative time, because that number
  // was computed on-chain and is a pure prop here.
  const day = token.scored_at ? formatDay(token.scored_at) : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.3) }}
    >
      <Link
        href={`/token/${token.token_address}?chain=${token.chain}`}
        className="group flex items-center gap-4 rounded-xl border border-hairline bg-surface p-4 shadow-card transition hover:border-ink-300 hover:shadow-lift"
      >
        {token.rank ? (
          <span className="tabular w-6 shrink-0 text-sm font-semibold text-ink-300">
            {token.rank}
          </span>
        ) : null}

        <ChainMark chain={token.chain} size={28} className="shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink-900">
              {token.symbol || "Unknown"}
            </p>
            <RiskBadge badge={token.badge} size="sm" />
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-400">
            {shortAddress(token.token_address, 10, 6)}
            {day ? <span className="ml-2 font-sans">· {day}</span> : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden w-24 sm:block">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className={`h-full rounded-full ${tone.fill}`}
                style={{ width: `${token.overall_score}%` }}
              />
            </div>
          </div>
          <span className="tabular w-8 text-right text-lg font-semibold text-ink-900">
            {token.overall_score}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
