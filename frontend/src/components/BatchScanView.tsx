"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDownUp,
  ClipboardList,
  Loader2,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { ChainSelector } from "./ChainSelector";
import { RiskBadge } from "./RiskBadge";
import { DeltaChip } from "./RiskDelta";
import { batchScan, ContractReadError } from "@/lib/contract";
import { extractAddress, shortAddress } from "@/lib/format";
import { flagMeta, RUG_META, scoreTone, TONE_CLASSES } from "@/lib/risk";
import type { BatchRow, BatchScan, ChainName } from "@/types";

/**
 * Mirrors `BATCH_MAX` in the contract.
 *
 * Checked here only so the page can say "five" before spending a round trip;
 * the contract enforces it regardless, and `batch_scan` raises rather than
 * silently truncating. If the two ever disagree the contract wins and the
 * error surfaces.
 */
const MAX_ADDRESSES = 5;

const EXAMPLES = [
  "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "0x6982508145454ce325ddbe47a25d4ec3d2311933",
  "0x514910771af9ca656af840dff83e8264ecf986ca",
];

/** Split on anything a person might paste between addresses. */
function parseAddresses(raw: string): string[] {
  const parts = raw
    .split(/[\s,;]+/)
    .map((part) => extractAddress(part.trim()))
    .filter((part): part is string => Boolean(part));
  // De-duplicate case-insensitively, the way the contract does, so the count
  // shown beside the textarea matches the count it will actually scan.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

type SortKey = "risk" | "flags" | "score";

export function BatchScanView() {
  const [chain, setChain] = useState<ChainName>("ethereum");
  const [text, setText] = useState("");
  const [result, setResult] = useState<BatchScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("risk");

  const addresses = useMemo(() => parseAddresses(text), [text]);
  const tooMany = addresses.length > MAX_ADDRESSES;

  async function run() {
    setProblem(null);
    if (addresses.length === 0) {
      setProblem("Paste at least one token address.");
      return;
    }
    if (tooMany) {
      setProblem(
        `The contract scans at most ${MAX_ADDRESSES} addresses per call. Remove ${addresses.length - MAX_ADDRESSES}.`,
      );
      return;
    }
    setBusy(true);
    try {
      setResult(await batchScan(addresses, chain));
    } catch (error) {
      setResult(null);
      setProblem(
        error instanceof ContractReadError
          ? "The contract could not be read. The RPC may be rate-limited — wait a moment and try again."
          : error instanceof Error
            ? error.message
            : "The portfolio could not be scanned.",
      );
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => sortRows(result?.tokens ?? [], sort), [result, sort]);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-card sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label
              htmlFor="batch-addresses"
              className="mb-1.5 block text-sm font-medium text-ink-800"
            >
              Token addresses
            </label>
            <textarea
              id="batch-addresses"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              spellCheck={false}
              placeholder={EXAMPLES.join("\n")}
              className="w-full resize-y rounded-lg border border-hairline bg-white px-3 py-2.5 font-mono text-xs text-ink-900 shadow-inner outline-none transition placeholder:text-ink-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-500/15"
            />
            <p className="mt-1.5 text-xs text-ink-500">
              Up to {MAX_ADDRESSES}, one per line or comma-separated. Explorer
              URLs are fine.{" "}
              <span
                className={tooMany ? "font-semibold text-danger-700" : "text-ink-400"}
              >
                {addresses.length} recognised
              </span>
              .
            </p>
          </div>
          <div className="space-y-3 sm:w-52">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-800">
                Chain
              </label>
              <ChainSelector value={chain} onChange={setChain} />
            </div>
            <button
              type="button"
              onClick={run}
              disabled={busy || addresses.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ClipboardList className="size-4" aria-hidden />
              )}
              {busy ? "Reading…" : "Scan portfolio"}
            </button>
            <button
              type="button"
              onClick={() => setText(EXAMPLES.join("\n"))}
              className="w-full rounded-lg border border-hairline px-4 py-2 text-xs font-medium text-ink-600 transition hover:bg-ink-50"
            >
              Use the example set
            </button>
          </div>
        </div>

        {problem ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-danger-500/25 bg-danger-50 px-3 py-2 text-xs text-danger-700"
          >
            {problem}
          </p>
        ) : null}

        <p className="mt-4 border-t border-hairline pt-4 text-xs leading-relaxed text-ink-500">
          This is a <strong className="font-semibold text-ink-700">read</strong>.
          It costs nothing and scores nothing: it asks the oracle what it already
          agreed about each address and does the arithmetic on-chain. Anything it
          has never seen comes back as unscored, with a link to scan it — one
          consensus round per token, which is the only way a score is ever
          written.
        </p>
      </section>

      {result ? (
        <>
          <Aggregates result={result} />

          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink-900">
                {result.requested} token{result.requested === 1 ? "" : "s"} on{" "}
                {result.chain}
              </h2>
              <label className="flex items-center gap-2 text-xs font-medium text-ink-500">
                <ArrowDownUp className="size-3.5" aria-hidden />
                Sort
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  className="rounded-lg border border-hairline bg-white px-2 py-1.5 text-xs text-ink-800 outline-none focus:border-ink-400"
                >
                  <option value="risk">Riskiest first (contract order)</option>
                  <option value="score">Highest score first</option>
                  <option value="flags">Most flags first</option>
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {rows.map((row, index) => (
                <TokenTile key={row.token_address} row={row} index={index} />
              ))}
            </div>
          </section>

          {result.unscored.length > 0 ? (
            <section className="rounded-2xl border border-warn-500/25 bg-warn-50 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-warn-700">
                <ShieldAlert className="size-4" aria-hidden />
                {result.unscored.length} address
                {result.unscored.length === 1 ? "" : "es"} never scored
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
                The portfolio figures above cover the{" "}
                {result.coverage_pct}% that have been. Each of these needs its
                own consensus round.
              </p>
              <ul className="mt-3 space-y-1.5">
                {result.unscored.map((address) => (
                  <li key={address} className="flex items-center gap-2">
                    <code className="font-mono text-[11px] text-ink-600">
                      {shortAddress(address, 10, 8)}
                    </code>
                    <Link
                      href={`/scan?token=${address}&chain=${result.chain}`}
                      className="text-xs font-semibold text-ink-700 underline underline-offset-2 hover:text-ink-900"
                    >
                      scan it
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * The contract returns rows riskiest-first already, so "risk" preserves its
 * `rank` rather than re-deriving it. The other two orders are the client's own
 * view of the same rows and are labelled as such.
 */
function sortRows(rows: BatchRow[], key: SortKey): BatchRow[] {
  const copy = [...rows];
  if (key === "risk") return copy.sort((a, b) => a.rank - b.rank);
  if (key === "score") {
    return copy.sort(
      (a, b) => Number(b.scored) - Number(a.scored) || b.overall_score - a.overall_score,
    );
  }
  return copy.sort((a, b) => b.flag_count - a.flag_count || a.rank - b.rank);
}

function Aggregates({ result }: { result: BatchScan }) {
  const portfolioTone = result.scored
    ? TONE_CLASSES[scoreTone(result.portfolio_score)]
    : TONE_CLASSES.neutral;
  const worst = RUG_META[result.worst_rug_level as keyof typeof RUG_META];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div
        className={`rounded-xl border p-4 ${portfolioTone.border} ${portfolioTone.bg}`}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
          Portfolio score
        </p>
        <p className={`mt-1 text-3xl font-semibold tabular-nums ${portfolioTone.text}`}>
          {result.scored ? result.portfolio_score : "—"}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
          Weighted by {result.weighting}. Plain mean {result.mean_score}.
        </p>
      </div>

      <Tile
        label="Flagged tokens"
        value={`${result.flagged_tokens} of ${result.scored}`}
        note="at least one rug finding"
        tone={result.flagged_tokens > 0 ? "warn" : "safe"}
      />
      <Tile
        label="Total rug flags"
        value={`${result.total_rug_flags}`}
        note="summed across the portfolio"
        tone={result.total_rug_flags > 0 ? "warn" : "safe"}
      />
      <Tile
        label="Worst finding"
        value={result.worst_rug_level}
        note={
          result.worst_token
            ? `${shortAddress(result.worst_token)} · ${result.high_risk_tokens} at HIGH or above`
            : "nothing scored yet"
        }
        tone={worst?.tone === "safe" ? "safe" : worst?.tone === "danger" ? "danger" : "warn"}
      />
    </section>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "safe" | "warn" | "danger" | "neutral";
}) {
  const classes = TONE_CLASSES[tone];
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${classes.text}`}>
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{note}</p>
    </div>
  );
}

function TokenTile({ row, index }: { row: BatchRow; index: number }) {
  const tone = row.scored
    ? TONE_CLASSES[scoreTone(row.overall_score)]
    : TONE_CLASSES.neutral;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.24), duration: 0.24 }}
      className="rounded-2xl border border-hairline bg-surface p-4 shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <span className="rounded bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-500">
              #{row.rank}
            </span>
            {row.symbol || shortAddress(row.token_address)}
            {row.scored ? (
              <DeltaChip
                delta={row.risk_delta ?? 0}
                hasPrevious={row.has_previous ?? false}
              />
            ) : null}
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-ink-400">
            {row.token_address}
          </p>
        </div>
        <RiskBadge badge={row.badge} size="sm" />
      </div>

      {row.scored ? (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-semibold tabular-nums ${tone.text}`}>
              {row.overall_score}
            </span>
            <span className="text-xs text-ink-500">
              {row.rug_level} · weight {row.weight}
            </span>
          </div>

          {row.rug_flags.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {row.rug_flags.map((flag) => (
                <li
                  key={flag}
                  title={flagMeta(flag).detail}
                  className="inline-flex items-center gap-1 rounded-md bg-warn-50 px-1.5 py-0.5 text-[11px] font-medium text-warn-700"
                >
                  <TriangleAlert className="size-3" aria-hidden />
                  {flagMeta(flag).title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-safe-700">No rug findings.</p>
          )}

          <div className="mt-3 flex gap-3 border-t border-hairline pt-3 text-xs">
            <Link
              href={`/token/${row.token_address}?chain=${row.chain}`}
              className="font-semibold text-ink-700 underline underline-offset-2 hover:text-ink-900"
            >
              Full report
            </Link>
            <Link
              href={`/history/${row.token_address}?chain=${row.chain}`}
              className="font-semibold text-ink-700 underline underline-offset-2 hover:text-ink-900"
            >
              History
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            Never scored. It carries no weight in the figures above, which is
            not the same as being safe.
          </p>
          <Link
            href={`/scan?token=${row.token_address}&chain=${row.chain}`}
            className="mt-3 inline-block text-xs font-semibold text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Scan it →
          </Link>
        </>
      )}
    </motion.article>
  );
}
