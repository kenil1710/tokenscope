"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import { RiskMeter } from "./RiskMeter";
import { RiskBadge, RugLevelChip } from "./RiskBadge";
import { DimensionBar } from "./DimensionBar";
import { ChainMark } from "./ChainMark";
import { relativeTime, shortAddress } from "@/lib/format";
import { CONFIDENCE_META } from "@/lib/risk";
import { DIMENSIONS, type RiskRecord } from "@/types";

/** The full report, used by /scan after a scan and by /token as the summary. */
export function ScoreCard({
  record,
  showLink = true,
}: {
  record: RiskRecord;
  showLink?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline p-6">
        <div className="flex items-center gap-3">
          <ChainMark chain={record.chain} size={40} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink-900">
                {record.symbol || "Unknown token"}
              </h2>
              <RiskBadge badge={record.badge} />
            </div>
            <p className="mt-0.5 text-sm text-ink-500">
              {record.name} · {record.chain}
            </p>
            <a
              href={record.explorer_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-ink-400 hover:text-ink-700"
            >
              {shortAddress(record.token_address, 12, 8)}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </div>
        <RugLevelChip level={record.rug_level} />
      </header>

      <div className="grid gap-8 p-6 md:grid-cols-[auto_1fr] md:gap-10">
        <div className="flex flex-col items-center justify-center">
          <RiskMeter score={record.overall_score} size={196} />
          <p className="mt-3 max-w-[190px] text-center text-xs leading-relaxed text-ink-500">
            {CONFIDENCE_META[record.confidence]}
          </p>
        </div>

        <div className="space-y-5">
          {DIMENSIONS.map((dimension, i) => (
            <DimensionBar
              key={dimension}
              dimension={dimension}
              score={record[`${dimension}_score`]}
              delay={0.15 + i * 0.09}
              compact
            />
          ))}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline bg-canvas px-6 py-4">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-500">
          <div className="flex gap-1.5">
            <dt>Scan</dt>
            <dd className="tabular font-medium text-ink-700">#{record.seq}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Scored</dt>
            <dd className="font-medium text-ink-700">
              {relativeTime(record.age_seconds)}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Evidence hash</dt>
            <dd className="font-mono font-medium text-ink-700">
              {record.content_hash}
            </dd>
          </div>
        </dl>

        {showLink ? (
          <Link
            href={`/token/${record.token_address}?chain=${record.chain}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-ink-700"
          >
            Full breakdown
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </footer>
    </motion.section>
  );
}
