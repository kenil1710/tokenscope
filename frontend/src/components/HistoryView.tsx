"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { History, Loader2, ShieldAlert } from "lucide-react";
import { ChainSelector } from "./ChainSelector";
import { RiskBadge } from "./RiskBadge";
import { RiskChart } from "./RiskChart";
import { DeltaChip } from "./RiskDelta";
import { getHistoryByAddress, getRiskHistory } from "@/lib/contract";
import { formatDay, relativeTime, shortAddress } from "@/lib/format";
import { deltaMeta, RUG_META, scoreTone, TONE_CLASSES } from "@/lib/risk";
import type { ChainName, RiskHistory } from "@/types";

/** A bare integer is a token_id; anything else is an address. */
function asTokenId(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function loadHistory([, token, chain]: [string, string, ChainName]) {
  const id = asTokenId(token);
  // A token_id names a token outright, chain included, so the selector is
  // irrelevant in that case and the read ignores it.
  return id === null
    ? getHistoryByAddress(token.toLowerCase(), chain, 12)
    : getRiskHistory(id);
}

export function HistoryView({
  token,
  initialChain,
}: {
  token: string;
  initialChain: ChainName;
}) {
  const [chain, setChain] = useState<ChainName>(initialChain);
  const byId = asTokenId(token) !== null;
  const { data, isLoading, error } = useSWR(
    ["history", token, chain] as [string, string, ChainName],
    loadHistory,
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface p-8 text-sm text-ink-500 shadow-card">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Reading the history from the contract…
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

  const history = data as RiskHistory | undefined;
  const scores = history?.scores ?? [];

  return (
    <div className="space-y-8">
      {!byId ? (
        <div className="sm:w-64">
          <label className="mb-1.5 block text-sm font-medium text-ink-800">Chain</label>
          <ChainSelector value={chain} onChange={setChain} />
        </div>
      ) : null}

      {!history?.found || scores.length === 0 ? (
        <div className="rounded-2xl border border-hairline bg-surface p-8 text-center shadow-card">
          <ShieldAlert className="mx-auto size-8 text-ink-300" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-ink-900">
            No stored scores for this token
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-500">
            {history?.reason ??
              "Nothing has been written for this address yet. That is a normal answer, not an error."}
          </p>
          <Link
            href="/scan"
            className="mt-5 inline-block rounded-lg bg-ink-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-700"
          >
            Scan it now
          </Link>
        </div>
      ) : (
        <>
          <Summary history={history} />

          {scores.length > 1 ? (
            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
                <History className="size-5 text-ink-400" aria-hidden />
                Score over time
              </h2>
              <div className="mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
                <RiskChart scores={scores} capacity={history.capacity} />
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="text-lg font-semibold text-ink-900">
              Every stored round
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-600">
              The delta on each row is the one the contract froze onto that
              record when it was written — not a subtraction done here. Once
              the ring buffer laps, the record it was measured against is gone,
              and a delta computed from the surviving rows would quietly start
              answering a different question.
            </p>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-hairline bg-surface shadow-card">
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs font-semibold uppercase tracking-wider text-ink-400">
                    <th className="px-4 py-3">Round</th>
                    <th className="px-4 py-3">Scored</th>
                    <th className="px-4 py-3 text-right">Overall</th>
                    <th className="px-4 py-3 text-right">Change</th>
                    <th className="px-4 py-3">Rug level</th>
                    <th className="px-4 py-3">Verdict</th>
                    <th className="px-4 py-3">Content hash</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((score) => {
                    const tone = TONE_CLASSES[scoreTone(score.overall_score)];
                    const rug = RUG_META[score.rug_level];
                    return (
                      <tr
                        key={score.score_id}
                        className="border-b border-hairline last:border-0"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-ink-500">
                          #{score.seq}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-600">
                          <span title={`${score.scored_at}`}>
                            {formatDay(score.scored_at)}
                          </span>
                          <span className="ml-1.5 text-ink-400">
                            {relativeTime(score.age_seconds)}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold tabular-nums ${tone.text}`}
                        >
                          {score.overall_score}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DeltaChip
                            delta={score.risk_delta ?? 0}
                            hasPrevious={score.has_previous ?? false}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-semibold ${TONE_CLASSES[rug?.tone ?? "neutral"].text}`}
                          >
                            {score.rug_level}
                          </span>
                          {score.rug_flags?.length ? (
                            <span className="ml-1.5 text-[11px] text-ink-400">
                              {score.rug_flags.length} flag
                              {score.rug_flags.length === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <RiskBadge badge={score.badge} size="sm" />
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-ink-500">
                          {score.content_hash}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <Link
            href={`/token/${history.token_address}?chain=${history.chain}`}
            className="inline-block text-sm font-semibold text-ink-700 underline underline-offset-4 transition hover:text-ink-900"
          >
            ← Back to the full risk report
          </Link>
        </>
      )}
    </div>
  );
}

function Summary({ history }: { history: RiskHistory }) {
  const windowMeta = deltaMeta(history.window_delta ?? 0);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Token"
        value={history.symbol || shortAddress(history.token_address)}
        note={`token_id ${history.token_id} · ${history.chain}`}
      />
      <Stat
        label="Rounds stored"
        value={`${history.returned} of ${history.capacity}`}
        note={`${history.update_count} total since deployment`}
      />
      <Stat
        label="Best / worst"
        value={`${history.best_overall} / ${history.worst_overall}`}
        note="lifetime, not just this window"
      />
      <Stat
        label="Across this window"
        value={`${(history.window_delta ?? 0) > 0 ? "+" : ""}${history.window_delta ?? 0}`}
        note={windowMeta.label}
        tone={windowMeta.tone === "neutral" ? undefined : windowMeta.tone}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "safe" | "warn" | "danger";
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${tone ? TONE_CLASSES[tone].text : "text-ink-900"}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{note}</p>
    </div>
  );
}
