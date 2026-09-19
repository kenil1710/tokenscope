/**
 * The meaning layer: how a score, a badge and a rug level are presented.
 *
 * Every colour decision in the app resolves through here. The palette is
 * narrow on purpose — one trust colour and three risk colours — because an
 * interface that paints ornament in the same green it paints VERIFIED_SAFE has
 * spent the meaning of that green.
 */
import type { Badge, ChainName, Confidence, Dimension, RugLevel, Trend } from "@/types";

export type Tone = "safe" | "warn" | "danger" | "neutral";

export const TONE_CLASSES: Record<
  Tone,
  { text: string; bg: string; border: string; fill: string; ring: string }
> = {
  safe: {
    text: "text-safe-700",
    bg: "bg-safe-50",
    border: "border-safe-500/30",
    fill: "bg-safe-500",
    ring: "ring-safe-500/20",
  },
  warn: {
    text: "text-warn-700",
    bg: "bg-warn-50",
    border: "border-warn-500/30",
    fill: "bg-warn-500",
    ring: "ring-warn-500/20",
  },
  danger: {
    text: "text-danger-700",
    bg: "bg-danger-50",
    border: "border-danger-500/30",
    fill: "bg-danger-500",
    ring: "ring-danger-500/20",
  },
  neutral: {
    text: "text-ink-600",
    bg: "bg-ink-50",
    border: "border-ink-200",
    fill: "bg-ink-400",
    ring: "ring-ink-500/15",
  },
};

/** Hex values for anything that cannot take a Tailwind class (SVG strokes). */
export const TONE_HEX: Record<Tone, string> = {
  safe: "#10B981",
  warn: "#F59E0B",
  danger: "#EF4444",
  neutral: "#5b81ad",
};

export const BADGE_META: Record<
  Badge,
  { label: string; tone: Tone; blurb: string }
> = {
  VERIFIED_SAFE: {
    label: "Verified safe",
    tone: "safe",
    blurb: "Scores 75 or above with no meaningful rug findings.",
  },
  MODERATE_RISK: {
    label: "Moderate risk",
    tone: "warn",
    blurb: "Scores 50 or above, or carries findings worth reading first.",
  },
  HIGH_RISK: {
    label: "High risk",
    tone: "danger",
    blurb: "Scores below 50. Thin, young, concentrated or unverified.",
  },
  RUG_WARNING: {
    label: "Rug warning",
    tone: "danger",
    blurb:
      "A HIGH or CRITICAL rug finding. This outranks the score — a token can look excellent and still be one owner call from worthless.",
  },
  UNSCORED: {
    label: "Unscored",
    tone: "neutral",
    blurb: "No consensus round has run for this token yet.",
  },
};

export const RUG_META: Record<RugLevel, { tone: Tone; label: string }> = {
  NONE: { tone: "safe", label: "No findings" },
  LOW: { tone: "safe", label: "Low" },
  MEDIUM: { tone: "warn", label: "Medium" },
  HIGH: { tone: "danger", label: "High" },
  CRITICAL: { tone: "danger", label: "Critical" },
};

/**
 * What each rug flag actually means, in the terms a trader cares about.
 *
 * Three fields, and the third is the one that makes this auditable:
 *
 *  - `title`  — the finding, in four words.
 *  - `detail` — why it matters, written as a CONSEQUENCE rather than a
 *    definition: "the owner can create new supply" is actionable where "mint
 *    function present" is trivia.
 *  - `source` — the document the flag was decided from, and the ordinal it
 *    reads. Every one of these is a deterministic check over explorer JSON,
 *    and saying which one lets a reader go and check it. The single exception
 *    is OWNER_PRIVILEGED_METHODS, which says so.
 *
 * The order of this object is the order `_rug_flags` emits, so a list rendered
 * from it reads the same way the contract wrote it.
 */
export const FLAG_META: Record<
  string,
  { title: string; detail: string; source: string }
> = {
  EXPLORER_SCAM_FLAG: {
    title: "Flagged as a scam by the explorer",
    detail:
      "Blockscout has designated this token a scam. TokenScope treats this as CRITICAL on its own — no other finding is needed and none can offset it.",
    source: "is_scam on /addresses/{token}",
  },
  MINTABLE: {
    title: "Owner can mint",
    detail:
      "The ABI exposes a supply-creating function. Whoever controls it can dilute every holder at will. TokenScope found this by name in the verified ABI, not by guessing.",
    source: "function names in /smart-contracts/{token}",
  },
  PAUSABLE: {
    title: "Transfers can be frozen",
    detail:
      "A pause or freeze function exists. The owner can stop you selling without stopping themselves.",
    source: "function names in /smart-contracts/{token}",
  },
  HAS_BLACKLIST: {
    title: "Addresses can be blocked",
    detail:
      "A blacklist, blocklist or fund-seizing function exists. Individual wallets can be prevented from transferring, or drained.",
    source: "function names in /smart-contracts/{token}",
  },
  UPGRADEABLE_PROXY: {
    title: "Logic can be replaced",
    detail:
      "This is a proxy. The code you audited today can be swapped for different code tomorrow, with no change to the address.",
    source: "proxy_type / implementations on /addresses/{token}",
  },
  HIDDEN_OWNER: {
    title: "Ownership is not renounced",
    detail:
      "owner() answers a live address, so somebody still holds the key. On its own that is centralisation rather than a rug — but it is what turns every finding above into something that can actually be done to you. A renounced contract with a mint function has nobody who can call it.",
    source: "eth_call owner() via the explorer's JSON-RPC",
  },
  UNVERIFIED_SOURCE: {
    title: "Source not verified",
    detail:
      "No verified source on the explorer, so nobody — including this oracle — can see what the contract actually does. Every ABI-derived finding below is unavailable for this token, which is itself the warning.",
    source: "is_verified on /addresses/{token}",
  },
  LOW_HOLDER_COUNT: {
    title: "Fewer than 50 holders",
    detail:
      "Almost nobody holds this token. There is no distribution to sell into, and the handful of wallets that do hold it can move the price to anything they like.",
    source: "holders_count on /addresses/{token}",
  },
  VERY_NEW: {
    title: "Deployed within 7 days",
    detail:
      "Too young to have a track record. Most rug pulls happen in the first week.",
    source: "timestamp of the creation transaction",
  },
  CONCENTRATED_SUPPLY: {
    title: "One wallet holds the majority",
    detail:
      "The largest holder controls more than half the supply. A single sell can move the price to zero, and no vote or governance process can outweigh them.",
    source: "top holder share on /tokens/{token}/holders",
  },
  OWNER_PRIVILEGED_METHODS: {
    title: "Privileged owner functions",
    detail:
      "Functions no keyword table recognised, which a model judged let a privileged account create supply, freeze transfers or seize balances. This is the only model-influenced flag and it cannot raise the level past MEDIUM.",
    source: "the one model judgement — 15 of 100 verification points",
  },
};

/** Emission order, so a legend lists flags the way the contract reports them. */
export const FLAG_ORDER = Object.keys(FLAG_META);

export function flagMeta(flag: string) {
  return (
    FLAG_META[flag] ?? {
      title: flag.replaceAll("_", " ").toLowerCase(),
      detail: "A risk finding reported by the contract.",
      source: "the contract",
    }
  );
}

/**
 * How to draw a risk delta.
 *
 * The sign convention is the thing to get right: the score measures SAFETY, so
 * a positive delta is an improvement and gets the safe tone. Labelling a rise
 * in a safety score as a rise in risk is the mistake this function exists to
 * make impossible.
 */
export function deltaMeta(delta: number): {
  tone: Tone;
  arrow: "up" | "down" | "flat";
  label: string;
} {
  if (delta > 0) {
    return { tone: "safe", arrow: "up", label: `+${delta} points safer` };
  }
  if (delta < 0) {
    return { tone: "danger", arrow: "down", label: `${delta} points riskier` };
  }
  return { tone: "neutral", arrow: "flat", label: "unchanged" };
}

/** Score → tone. The thresholds match `_badge` in the contract. */
export function scoreTone(score: number): Tone {
  if (score >= 75) return "safe";
  if (score >= 50) return "warn";
  return "danger";
}

export const DIMENSION_META: Record<
  Dimension,
  { label: string; weight: number; blurb: string }
> = {
  distribution: {
    label: "Distribution",
    weight: 25,
    blurb: "How concentrated the supply is across holders.",
  },
  activity: {
    label: "Activity",
    weight: 20,
    blurb: "Recent transfers, unique counterparties and how fresh they are.",
  },
  verification: {
    label: "Verification",
    weight: 20,
    blurb: "Verified source, proxy state, ABI surface and owner privilege.",
  },
  maturity: {
    label: "Maturity",
    weight: 15,
    blurb: "Contract age, from the creation transaction's own timestamp.",
  },
  liquidity: {
    label: "Liquidity",
    weight: 20,
    blurb: "Holder count, market cap, 24h volume and the long tail of supply.",
  },
};

export const CONFIDENCE_META: Record<Confidence, string> = {
  HIGH: "All five dimensions fully sourced",
  MEDIUM: "Three or four dimensions fully sourced",
  LOW: "Two or fewer dimensions fully sourced",
};

export const TREND_META: Record<Trend, { label: string; tone: Tone; arrow: string }> = {
  IMPROVING: { label: "Improving", tone: "safe", arrow: "↑" },
  STABLE: { label: "Stable", tone: "neutral", arrow: "→" },
  DEGRADING: { label: "Degrading", tone: "danger", arrow: "↓" },
  NEW: { label: "First scan", tone: "neutral", arrow: "•" },
};

export type ChainMeta = {
  id: ChainName;
  label: string;
  accent: string;
  explorer: string;
  /** Whether Blockscout's holders endpoint is currently answering for this host. */
  healthy: boolean;
  note?: string;
};

/**
 * The four chains, and an honest note about the two that cannot be scored.
 *
 * Blockscout's `/holders` endpoint on Base and Polygon returns 500 / Cloudflare
 * 524. `src_holders` is part of the consensus vector, so a flaky answer there
 * makes an agreed ordinal node-dependent — the contract refuses rather than
 * scoring on partial data. Surfacing that here means the UI never invites
 * someone into a scan that cannot settle.
 */
export const CHAINS: ChainMeta[] = [
  {
    id: "ethereum",
    label: "Ethereum",
    accent: "#627EEA",
    explorer: "https://eth.blockscout.com",
    healthy: true,
  },
  {
    id: "arbitrum",
    label: "Arbitrum",
    accent: "#2D9CDB",
    explorer: "https://arbitrum.blockscout.com",
    healthy: true,
  },
  {
    id: "base",
    label: "Base",
    accent: "#0052FF",
    explorer: "https://base.blockscout.com",
    healthy: false,
    note: "Blockscout's holders endpoint is returning 500 on this host, so scans are refused rather than scored on partial data.",
  },
  {
    id: "polygon",
    label: "Polygon",
    accent: "#8247E5",
    explorer: "https://polygon.blockscout.com",
    healthy: false,
    note: "Blockscout's holders endpoint stalls and returns 524 on this host, so scans cannot settle.",
  },
];

export function chainMeta(id: string): ChainMeta {
  return CHAINS.find((c) => c.id === id) ?? CHAINS[0];
}
