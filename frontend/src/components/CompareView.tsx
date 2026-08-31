"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, Loader2, Trophy } from "lucide-react";
import { ChainSelector } from "./ChainSelector";
import { RiskBadge, RugLevelChip } from "./RiskBadge";
import { RiskMeter } from "./RiskMeter";
import { ChainMark } from "./ChainMark";
import { compareTokens } from "@/lib/contract";
import { extractAddress, shortAddress } from "@/lib/format";
import { DIMENSION_META, TONE_CLASSES } from "@/lib/risk";
import type { ChainName, Comparison, ComparisonMissing } from "@/types";

export function CompareView() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [chain, setChain] = useState<ChainName>("ethereum");
  const [result, setResult] = useState<Comparison | ComparisonMissing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addressA = extractAddress(a);
  const addressB = extractAddress(b);
  const ready = Boolean(addressA && addressB && addressA !== addressB);

  async function run() {
    if (!addressA || !addressB) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await compareTokens(addressA, addressB, chain));
    } catch {
      setError("Could not reach the contract. The RPC may be rate-limited.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Token A" value={a} onChange={setA} valid={Boolean(!a || addressA)} />
          <Field label="Token B" value={b} onChange={setB} valid={Boolean(!b || addressB)} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="sm:max-w-52">
            <label className="mb-1.5 block text-sm font-medium text-ink-800">Chain</label>
            <ChainSelector value={chain} onChange={setChain} />
          </div>
          <button
            type="button"
            onClick={run}
            disabled={!ready || busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ArrowLeftRight className="size-4" aria-hidden />
            )}
            Compare
          </button>
        </div>

        {addressA && addressB && addressA === addressB ? (
          <p className="mt-2.5 text-xs text-warn-700">
            Those are the same address — pick two different tokens.
          </p>
        ) : null}

        <p className="mt-4 text-xs leading-relaxed text-ink-500">
          Comparison is a free read of two existing records. No consensus round runs and
          no fee is charged — both tokens must already have been scanned.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger-500/25 bg-danger-50 p-5 text-sm text-danger-700">
          {error}
        </div>
      ) : null}

      {result && !result.found ? (
        <div className="rounded-2xl border border-warn-500/25 bg-warn-50 p-5">
          <p className="text-sm font-semibold text-warn-700">
            One of these tokens has not been scored yet
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-warn-700/80">
            Unscored: {(result as ComparisonMissing).unscored.map((x) => shortAddress(x)).join(", ")}.{" "}
            {(result as ComparisonMissing).hint}
          </p>
        </div>
      ) : null}

      {result?.found ? <ComparisonResult comparison={result} /> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  valid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink-800">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0x…"
        spellCheck={false}
        autoComplete="off"
        className="w-full rounded-xl border border-hairline bg-canvas px-4 py-3 font-mono text-sm text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-ink-400"
      />
      {!valid ? (
        <p className="mt-1.5 text-xs text-danger-600">Not a 42-character 0x address.</p>
      ) : null}
    </div>
  );
}

function ComparisonResult({ comparison }: { comparison: Comparison }) {
  const winner = comparison.safer;
  const sides = [
    { key: "a" as const, record: comparison.a },
    { key: "b" as const, record: comparison.b },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-ink-200 bg-ink-50 p-5"
      >
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
          <Trophy className="size-3.5" aria-hidden />
          Verdict
        </p>
        <p className="mt-1.5 text-xl font-semibold text-ink-900">
          {winner === "tie"
            ? "Too close to call"
            : `${(winner === "a" ? comparison.a : comparison.b).symbol || "Token " + winner.toUpperCase()} is safer`}
        </p>
        <p className="mt-1.5 text-sm text-ink-600">{comparison.reason}</p>
        <p className="mt-2 text-xs leading-relaxed text-ink-500">
          A rug finding outranks a point total: if the two differ on rug level, that
          decides it regardless of the scores.
        </p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sides.map(({ key, record }) => (
          <div
            key={key}
            className={`rounded-2xl border bg-surface p-5 shadow-card ${
              winner === key ? "border-safe-500/40 ring-2 ring-safe-500/15" : "border-hairline"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ChainMark chain={record.chain} size={22} />
                  <p className="truncate text-base font-semibold text-ink-900">
                    {record.symbol || "Unknown"}
                  </p>
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-ink-400">
                  {shortAddress(record.token_address, 10, 6)}
                </p>
              </div>
              <RiskBadge badge={record.badge} size="sm" />
            </div>

            <div className="mt-4 flex justify-center">
              <RiskMeter score={record.overall_score} size={132} label="Overall" />
            </div>

            <div className="mt-4 flex justify-center">
              <RugLevelChip level={record.rug_level} />
            </div>

            {record.rug_flags?.length ? (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {record.rug_flags.map((flag) => (
                  <span
                    key={flag}
                    className="rounded border border-danger-500/25 bg-danger-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-danger-700"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-card">
        <p className="text-sm font-semibold text-ink-900">Dimension by dimension</p>
        <div className="mt-4 space-y-4">
          {comparison.dimensions.map((row, i) => {
            const meta = DIMENSION_META[row.dimension];
            const total = Math.max(row.a + row.b, 1);
            return (
              <div key={row.dimension}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                  <span className="tabular font-semibold text-ink-900">{row.a}</span>
                  <span className="font-medium text-ink-600">
                    {meta.label}
                    <span className="ml-1.5 text-ink-400">{meta.weight}%</span>
                  </span>
                  <span className="tabular font-semibold text-ink-900">{row.b}</span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-ink-100">
                  <motion.div
                    className={`h-full ${row.winner === "a" ? TONE_CLASSES.safe.fill : "bg-ink-300"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${(row.a / total) * 100}%` }}
                    transition={{ duration: 0.6, delay: i * 0.08 }}
                  />
                  <div className="h-full w-px shrink-0 bg-surface" />
                  <motion.div
                    className={`h-full ${row.winner === "b" ? TONE_CLASSES.safe.fill : "bg-ink-300"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${(row.b / total) * 100}%` }}
                    transition={{ duration: 0.6, delay: i * 0.08 }}
                  />
                </div>
                {row.delta !== 0 ? (
                  <p className="mt-1 text-[11px] text-ink-500">
                    {row.winner === "a" ? "A" : "B"} leads by {Math.abs(row.delta)} points
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-ink-400">Tied</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
