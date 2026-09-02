"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { ArrowLeftRight, Loader2, Minus, Trophy } from "lucide-react";
import { ChainSelector } from "./ChainSelector";
import { RiskBadge, RugLevelChip } from "./RiskBadge";
import { RiskMeter } from "./RiskMeter";
import { ChainMark } from "./ChainMark";
import { compareTokens } from "@/lib/contract";
import { extractAddress, shortAddress } from "@/lib/format";
import { DIMENSION_META, RUG_META, TONE_CLASSES } from "@/lib/risk";
import type { ChainName, Comparison, ComparisonMissing, RiskRecord } from "@/types";

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


/**
 * A number that counts up to its value.
 *
 * Writes through a ref rather than through state: sixty renders a second to
 * animate one integer would re-render the whole comparison, and the DOM node is
 * the only thing that actually needs to change. `tabular` on the element keeps
 * the digits from jittering as they roll.
 */
function CountUp({ to, className = "" }: { to: number; className?: string }) {
  const node = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const element = node.current;
    if (!element) return;
    if (reduce) {
      element.textContent = String(to);
      return;
    }
    const controls = animate(0, to, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (value) => {
        element.textContent = String(Math.round(value));
      },
    });
    return () => controls.stop();
  }, [to, reduce]);

  // Server-rendered and pre-animation content is the final value, so the number
  // is correct even if the animation never runs.
  return (
    <span ref={node} className={`tabular ${className}`}>
      {to}
    </span>
  );
}

/**
 * The comparison, read as a contest.
 *
 * Two things the previous layout left the reader to work out for themselves and
 * this one states outright: by how much the winner won, and how the five
 * dimensions actually split. A 3–2 dimension split behind a 1-point overall gap
 * is a very different answer from a 5–0 sweep, and both can produce the same
 * "A is safer".
 */
function ComparisonResult({ comparison }: { comparison: Comparison }) {
  const winner = comparison.safer;
  const margin = Math.abs(comparison.overall_delta);

  const tally = comparison.dimensions.reduce(
    (acc, row) => {
      acc[row.winner] += 1;
      return acc;
    },
    { a: 0, b: 0, tie: 0 },
  );

  const rugDiffers = comparison.a.rug_level !== comparison.b.rug_level;
  const winnerRecord =
    winner === "a" ? comparison.a : winner === "b" ? comparison.b : null;

  return (
    <div className="space-y-6">
      {/* verdict */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="overflow-hidden rounded-2xl border border-ink-200 bg-ink-50"
      >
        <div className="p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
            <Trophy className="size-3.5" aria-hidden />
            Verdict
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-ink-900">
            {winner === "tie"
              ? "Too close to call"
              : `${winnerRecord?.symbol || `Token ${winner.toUpperCase()}`} is safer`}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
            {comparison.reason}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Chip
              label={
                margin === 0
                  ? "Identical overall score"
                  : `${margin} point${margin === 1 ? "" : "s"} of overall margin`
              }
              tone={margin === 0 ? "neutral" : margin >= 10 ? "safe" : "warn"}
            />
            <Chip
              label={
                tally.a === tally.b
                  ? `Dimensions split ${tally.a}–${tally.b}${tally.tie ? ` with ${tally.tie} tied` : ""}`
                  : `Dimensions ${Math.max(tally.a, tally.b)}–${Math.min(tally.a, tally.b)} to ${tally.a > tally.b ? "A" : "B"}${tally.tie ? ` (${tally.tie} tied)` : ""}`
              }
              tone="neutral"
            />
            <Chip
              label={
                rugDiffers
                  ? `Rug levels differ: ${RUG_META[comparison.a.rug_level].label} vs ${RUG_META[comparison.b.rug_level].label}`
                  : `Both ${RUG_META[comparison.a.rug_level].label.toLowerCase()} on rug risk`
              }
              tone={rugDiffers ? "danger" : "neutral"}
            />
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            A rug finding outranks a point total: where the two differ on rug level, that
            decides it regardless of the scores. So a token can win every dimension and
            still lose the comparison.
          </p>
        </div>

        {/* The margin, as one bar. Reads left-to-right as A-favours to B-favours. */}
        <div className="border-t border-ink-200 bg-surface px-5 py-4">
          <div className="flex items-center justify-between text-[11px] font-medium text-ink-500">
            <span>{comparison.a.symbol || "A"}</span>
            <span>Overall margin</span>
            <span>{comparison.b.symbol || "B"}</span>
          </div>
          <div className="relative mt-2 h-2 rounded-full bg-ink-100">
            <div className="absolute left-1/2 top-1/2 h-3.5 w-px -translate-x-1/2 -translate-y-1/2 bg-ink-300" />
            <motion.div
              className={`absolute top-0 h-2 ${
                winner === "tie" ? "bg-ink-300" : "bg-ink-600"
              } ${comparison.overall_delta >= 0 ? "rounded-l-full" : "rounded-r-full"}`}
              style={comparison.overall_delta >= 0 ? { right: "50%" } : { left: "50%" }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(50, margin * 2.5)}%` }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
      </motion.div>

      {/* the two tokens */}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["a", "b"] as const).map((key, i) => (
          <SideCard
            key={key}
            record={key === "a" ? comparison.a : comparison.b}
            side={key}
            won={winner === key}
            delay={i * 0.1}
          />
        ))}
      </div>

      {/* dimension by dimension */}
      <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-card">
        <p className="text-sm font-semibold text-ink-900">Dimension by dimension</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          Each bar grows outward from the centre, so the longer arm is the higher score
          and the gap between them is the lead. Weight is on the label because a
          10-point lead in distribution is worth more than a 10-point lead in maturity.
        </p>

        <div className="mt-5 space-y-5">
          {comparison.dimensions.map((row, i) => {
            const meta = DIMENSION_META[row.dimension];
            return (
              <div key={row.dimension}>
                <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
                  <span
                    className={`tabular text-sm font-semibold ${
                      row.winner === "a" ? "text-ink-900" : "text-ink-400"
                    }`}
                  >
                    {row.a}
                  </span>
                  <span className="flex items-center gap-1.5 font-medium text-ink-600">
                    {meta.label}
                    <span className="text-ink-400">{meta.weight}%</span>
                  </span>
                  <span
                    className={`tabular text-sm font-semibold ${
                      row.winner === "b" ? "text-ink-900" : "text-ink-400"
                    }`}
                  >
                    {row.b}
                  </span>
                </div>

                {/* Two half-tracks meeting at a 2px surface gap: adjacent fills
                    never touch, so neither arm reads as part of the other. */}
                <div className="flex items-center gap-0.5">
                  <div className="relative flex h-2.5 flex-1 justify-end overflow-hidden rounded-l-full bg-ink-100">
                    <motion.div
                      className={`h-full rounded-l-full ${
                        row.winner === "a" ? TONE_CLASSES.safe.fill : "bg-ink-300"
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${row.a}%` }}
                      transition={{ duration: 0.65, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <div className="relative flex h-2.5 flex-1 overflow-hidden rounded-r-full bg-ink-100">
                    <motion.div
                      className={`h-full rounded-r-full ${
                        row.winner === "b" ? TONE_CLASSES.safe.fill : "bg-ink-300"
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${row.b}%` }}
                      transition={{ duration: 0.65, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>

                <p className="mt-1.5 text-center text-[11px] text-ink-500">
                  {row.delta === 0 ? (
                    <span className="inline-flex items-center gap-1 text-ink-400">
                      <Minus className="size-3" aria-hidden />
                      Tied
                    </span>
                  ) : (
                    <>
                      {row.winner === "a" ? comparison.a.symbol || "A" : comparison.b.symbol || "B"}{" "}
                      leads by {Math.abs(row.delta)} point
                      {Math.abs(row.delta) === 1 ? "" : "s"} ·{" "}
                      {Math.round((Math.abs(row.delta) * meta.weight) / 100)} of the
                      overall
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof TONE_CLASSES;
}) {
  const classes = TONE_CLASSES[tone];
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${classes.bg} ${classes.text} ${classes.border}`}
    >
      {label}
    </span>
  );
}

function SideCard({
  record,
  side,
  won,
  delay,
}: {
  record: RiskRecord;
  side: "a" | "b";
  won: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`rounded-2xl border bg-surface p-5 shadow-card ${
        won ? "border-safe-500/40 ring-2 ring-safe-500/15" : "border-hairline"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ChainMark chain={record.chain} size={22} />
            <p className="truncate text-base font-semibold text-ink-900">
              {record.symbol || "Unknown"}
            </p>
            <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              {side}
            </span>
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

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <RugLevelChip level={record.rug_level} />
        <span className="rounded-full border border-hairline bg-canvas px-2.5 py-1 text-xs text-ink-500">
          <CountUp to={record.overall_score} className="font-semibold text-ink-900" />
          <span className="ml-1">of 100</span>
        </span>
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
      ) : (
        <p className="mt-3 text-center text-xs text-safe-700">No rug findings</p>
      )}
    </motion.div>
  );
}
