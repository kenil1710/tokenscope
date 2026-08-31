"use client";

import useSWR from "swr";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Braces,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { ScoreCard } from "./ScoreCard";
import { NoFlagsCard, RugFlagCard } from "./RugFlagCard";
import { ScoreHistory } from "./ScoreHistory";
import { ChainSelector } from "./ChainSelector";
import {
  checkRugPull,
  getEvidence,
  getRisk,
  getRiskHistory,
  getRiskTrend,
  verifyRisk,
} from "@/lib/contract";
import { BADGE_META, TONE_CLASSES, TREND_META } from "@/lib/risk";
import type { ChainName, Verification } from "@/types";

/** Everything the detail page needs, in one round of reads. */
async function loadToken([, token, chain]: [string, string, ChainName]) {
  const record = await getRisk(token, chain);
  if (!record) return { record: null } as const;
  const [rug, history, trend, evidence] = await Promise.all([
    checkRugPull(token, chain).catch(() => null),
    getRiskHistory(token, chain, 12).catch(() => null),
    getRiskTrend(token, chain).catch(() => null),
    getEvidence(record.score_id).catch(() => null),
  ]);
  return { record, rug, history, trend, evidence } as const;
}

export function TokenDetail({
  address,
  initialChain,
}: {
  address: string;
  initialChain: ChainName;
}) {
  const [chain, setChain] = useState<ChainName>(initialChain);
  const { data, isLoading, error } = useSWR(
    ["token", address, chain] as [string, string, ChainName],
    loadToken,
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface p-8 text-sm text-ink-500 shadow-card">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Reading the record from the contract…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger-500/25 bg-danger-50 p-6">
        <p className="text-sm font-semibold text-danger-700">
          Could not reach the contract
        </p>
        <p className="mt-1 text-xs text-danger-700/80">
          The RPC may be rate-limited. Wait a moment and reload.
        </p>
      </div>
    );
  }

  if (!data?.record) {
    return (
      <div className="space-y-6">
        <div className="sm:w-64">
          <label className="mb-1.5 block text-sm font-medium text-ink-800">Chain</label>
          <ChainSelector value={chain} onChange={setChain} />
        </div>
        <div className="rounded-2xl border border-hairline bg-surface p-8 text-center shadow-card">
          <ShieldAlert className="mx-auto size-8 text-ink-300" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-ink-900">
            No score for this token on {chain}
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-500">
            Nothing has been written for this address yet. That is a normal answer, not
            an error — most addresses have never been through a consensus round.
          </p>
          <a
            href={`/scan`}
            className="mt-5 inline-block rounded-lg bg-ink-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-700"
          >
            Scan it now
          </a>
        </div>
      </div>
    );
  }

  const { record, rug, history, trend, evidence } = data;
  const flags = record.rug_flags ?? [];
  const badgeMeta = BADGE_META[record.badge] ?? BADGE_META.UNSCORED;
  const trendMeta = trend?.trend ? TREND_META[trend.trend] : null;

  return (
    <div className="space-y-8">
      <div className="sm:w-64">
        <label className="mb-1.5 block text-sm font-medium text-ink-800">Chain</label>
        <ChainSelector value={chain} onChange={setChain} />
      </div>

      <ScoreCard record={record} showLink={false} />

      {/* verdict + trend */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div
          className={`rounded-2xl border p-5 ${TONE_CLASSES[badgeMeta.tone].border} ${TONE_CLASSES[badgeMeta.tone].bg}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            Verdict
          </p>
          <p
            className={`mt-1.5 text-xl font-semibold ${TONE_CLASSES[badgeMeta.tone].text}`}
          >
            {badgeMeta.label}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-600">{badgeMeta.blurb}</p>
        </div>

        <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            Trend
          </p>
          {trendMeta ? (
            <>
              <p
                className={`mt-1.5 text-xl font-semibold ${TONE_CLASSES[trendMeta.tone].text}`}
              >
                <span aria-hidden>{trendMeta.arrow}</span> {trendMeta.label}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-600">
                {trend?.trend === "NEW"
                  ? "Only one scan so far. Re-scan later to build a history — the contract keeps the last 12."
                  : `Latest ${trend?.latest_overall} against ${trend?.previous_overall} on the previous scan, across ${trend?.samples} stored scores.`}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-ink-500">Unavailable.</p>
          )}
        </div>
      </div>

      {/* rug findings */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
          <TriangleAlert className="size-5 text-ink-400" aria-hidden />
          Rug-pull findings
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-600">
          Read from the verified ABI by exact function name, not inferred. A finding
          here outranks the score: a token can be mature, liquid and widely held and
          still be one owner call from worthless.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {flags.length > 0 ? (
            flags.map((flag, i) => <RugFlagCard key={flag} flag={flag} index={i} />)
          ) : (
            <NoFlagsCard />
          )}
        </div>

        {rug?.checks ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <CheckList
              title="Owner capabilities"
              items={[
                ["Can mint new supply", rug.checks.is_mintable, true],
                ["Can freeze transfers", rug.checks.is_pausable, true],
                ["Can blacklist or seize", rug.checks.has_blacklist, true],
                ["Logic is upgradeable", rug.checks.is_proxy, true],
                ["Flagged as a scam", rug.checks.explorer_scam_flag, true],
              ]}
            />
            <CheckList
              title="Mitigations"
              items={[
                ["Source verified", rug.checks.is_verified, false],
                ["No owner surface in the ABI", rug.mitigations?.no_owner_surface ?? false, false],
                ["Top holder is a contract", rug.mitigations?.top_holder_is_contract ?? false, false],
                ["ABI available to read", rug.abi_available ?? false, false],
              ]}
            />
          </div>
        ) : null}
      </section>

      {/* history */}
      {history && history.scores?.length > 1 ? (
        <section>
          <h2 className="text-lg font-semibold text-ink-900">Score history</h2>
          <p className="mt-1.5 text-sm text-ink-600">
            The last {history.scores.length} of up to {history.capacity} stored scores.
            Best {history.best_overall}, worst {history.worst_overall}.
          </p>
          <div className="mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <ScoreHistory scores={history.scores} />
          </div>
        </section>
      ) : null}

      {/* evidence + verify */}
      <EvidencePanel
        scoreId={record.score_id}
        evidence={evidence?.evidence ?? null}
        ranges={evidence?.ranges ?? null}
        sourcesOk={record.sources_ok}
      />
    </div>
  );
}

function CheckList({
  title,
  items,
}: {
  title: string;
  /** [label, value, trueIsBad] */
  items: [string, boolean, boolean][];
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map(([label, value, trueIsBad]) => {
          const bad = trueIsBad ? value : !value;
          return (
            <li key={label} className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-700">{label}</span>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${
                  bad ? "bg-danger-50 text-danger-700" : "bg-safe-50 text-safe-700"
                }`}
              >
                {value ? "Yes" : "No"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EvidencePanel({
  scoreId,
  evidence,
  ranges,
  sourcesOk,
}: {
  scoreId: number;
  evidence: Record<string, number> | null;
  ranges: Record<string, number> | null;
  sourcesOk: string;
}) {
  const [result, setResult] = useState<Verification | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    try {
      setResult(await verifyRisk(scoreId));
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
        <Braces className="size-5 text-ink-400" aria-hidden />
        The evidence validators agreed on
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-600">
        This vector <em>is</em> the consensus object. Every score above is arithmetic
        over these numbers, recomputed after consensus rather than taken from any one
        node. Sources that resolved:{" "}
        <span className="font-mono text-xs text-ink-800">{sourcesOk}</span>
      </p>

      <div className="mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
        {evidence ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(evidence)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => {
                const max = ranges?.[key] ?? 1;
                return (
                  <div key={key} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-[11px] text-ink-500">
                        {key}
                      </span>
                      <span className="tabular text-[11px] font-semibold text-ink-800">
                        {value}
                        <span className="text-ink-300">/{max}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-ink-400"
                        style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <p className="text-sm text-ink-500">Evidence is unavailable for this record.</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={verify}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-canvas px-3.5 py-2 text-sm font-semibold text-ink-700 transition hover:border-ink-300 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <BadgeCheck className="size-4" aria-hidden />
            )}
            Re-verify on-chain
          </button>
          <p className="text-xs text-ink-500">
            Recomputes all five dimensions, the rug level, the badge and the hash from
            the stored evidence alone.
          </p>
        </div>

        {result ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 flex gap-2.5 rounded-xl border p-4 ${
              result.valid
                ? "border-safe-500/25 bg-safe-50"
                : "border-danger-500/25 bg-danger-50"
            }`}
          >
            {result.valid ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-safe-600" aria-hidden />
            ) : (
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger-600" aria-hidden />
            )}
            <div>
              <p
                className={`text-sm font-semibold ${result.valid ? "text-safe-700" : "text-danger-700"}`}
              >
                {result.valid
                  ? "Verified — the record reproduces itself exactly"
                  : "Mismatch between the stored record and its evidence"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                {result.valid
                  ? `All checks passed against content hash ${result.content_hash}.`
                  : `Fields that disagree: ${(result.failed ?? []).join(", ") || "unknown"}.`}
              </p>
            </div>
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}
