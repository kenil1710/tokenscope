/**
 * "Risk changed: +15 points since last scan."
 *
 * The delta is read off the RECORD, not computed here by subtracting two
 * history rows. The contract freezes the score each record replaced at write
 * time, which matters once the ring buffer laps: a delta derived from the two
 * newest surviving rows silently starts answering a different question.
 *
 * `has_previous` is the field that carries the weight. `risk_delta` is 0 both
 * when nothing moved and when there was nothing to move from, and a component
 * that reads the number alone will cheerfully report "unchanged" for a token's
 * very first scan.
 */
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { deltaMeta, TONE_CLASSES } from "@/lib/risk";

const ARROWS = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
} as const;

export function RiskDelta({
  delta,
  hasPrevious,
  previous,
  scans,
  className = "",
}: {
  delta: number;
  hasPrevious: boolean;
  previous: number;
  /** Total scans on record, for the "first scan" copy. */
  scans?: number;
  className?: string;
}) {
  if (!hasPrevious) {
    return (
      <div
        className={`rounded-xl border border-hairline bg-ink-50 px-4 py-3 ${className}`}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
          Change since last scan
        </p>
        <p className="mt-1 text-sm font-medium text-ink-700">
          First scan — nothing to compare against yet
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          Re-scan later and this becomes a real delta. A first score is not
          movement, so it is reported as its own thing rather than as zero.
        </p>
      </div>
    );
  }

  const meta = deltaMeta(delta);
  const tone = TONE_CLASSES[meta.tone];
  const Arrow = ARROWS[meta.arrow];

  return (
    <div className={`rounded-xl border px-4 py-3 ${tone.border} ${tone.bg} ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
        Change since last scan
      </p>
      <p className={`mt-1 flex items-center gap-1.5 text-lg font-semibold ${tone.text}`}>
        <Arrow className="size-5 shrink-0" aria-hidden />
        <span>
          {delta > 0 ? "+" : ""}
          {delta} points
        </span>
        <span className="text-sm font-medium opacity-80">
          {delta > 0 ? "safer" : delta < 0 ? "riskier" : "unchanged"}
        </span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-600">
        Previous score {previous}
        {typeof scans === "number" && scans > 0
          ? `, across ${scans} stored ${scans === 1 ? "scan" : "scans"}`
          : ""}
        . The score measures safety, so a rise is an improvement.
      </p>
    </div>
  );
}

/** The same delta, compact enough for a table cell or a card corner. */
export function DeltaChip({
  delta,
  hasPrevious,
}: {
  delta: number;
  hasPrevious: boolean;
}) {
  if (!hasPrevious) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-ink-50 px-1.5 py-0.5 text-[11px] font-medium text-ink-500">
        new
      </span>
    );
  }
  const meta = deltaMeta(delta);
  const tone = TONE_CLASSES[meta.tone];
  const Arrow = ARROWS[meta.arrow];
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${tone.bg} ${tone.text}`}
      title={meta.label}
    >
      <Arrow className="size-3" aria-hidden />
      {delta > 0 ? "+" : ""}
      {delta}
    </span>
  );
}
