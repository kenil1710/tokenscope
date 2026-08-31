import { BADGE_META, RUG_META, TONE_CLASSES } from "@/lib/risk";
import type { Badge, RugLevel } from "@/types";

/** The verdict, as a pill. The single most-repeated element in the app. */
export function RiskBadge({
  badge,
  size = "md",
  className = "",
}: {
  badge: Badge;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const meta = BADGE_META[badge] ?? BADGE_META.UNSCORED;
  const tone = TONE_CLASSES[meta.tone];
  const sizing =
    size === "lg"
      ? "text-sm px-3.5 py-1.5 gap-2"
      : size === "sm"
        ? "text-[11px] px-2 py-0.5 gap-1.5"
        : "text-xs px-2.5 py-1 gap-1.5";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold tracking-tight ${tone.bg} ${tone.text} ${tone.border} ${sizing} ${className}`}
    >
      <span
        className={`inline-block rounded-full ${tone.fill} ${size === "sm" ? "size-1.5" : "size-2"}`}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

/** The rug level, which is a different axis from the badge and reads separately. */
export function RugLevelChip({ level }: { level: RugLevel | "UNKNOWN" }) {
  if (level === "UNKNOWN") {
    return (
      <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-semibold text-ink-500">
        Unknown
      </span>
    );
  }
  const meta = RUG_META[level];
  const tone = TONE_CLASSES[meta.tone];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.bg} ${tone.text} ${tone.border}`}
    >
      Rug risk: {meta.label}
    </span>
  );
}
