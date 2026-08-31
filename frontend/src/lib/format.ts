/** Small formatting helpers shared across the app. */

/** `0xdAC1…1ec7` — enough to recognise, short enough to sit in a table. */
export function shortAddress(address: string, lead = 6, tail = 4): string {
  if (!address) return "";
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** "3 minutes ago", and "just now" rather than "0 seconds ago". */
export function relativeTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown";
  if (seconds < 45) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2592000, "month"],
  ];
  let value = seconds;
  let label = "second";
  for (const [size, name] of units) {
    if (seconds >= size) {
      value = Math.floor(seconds / size);
      label = name;
    }
  }
  return `${value} ${label}${value === 1 ? "" : "s"} ago`;
}

/**
 * A unix timestamp as a short absolute date, e.g. "31 Aug 2026".
 *
 * Formatted in UTC deliberately. A server rendering in one timezone and a
 * browser in another would otherwise disagree on the string and React would
 * report a hydration mismatch — and the fix cannot be "render it only on the
 * client", because that is the impure-render problem this replaced.
 */
export function formatDay(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(seconds * 1000));
}

/** A wei amount as GEN, with no trailing-zero noise. */
export function formatGen(wei: number | string | bigint): string {
  const value = typeof wei === "bigint" ? wei : BigInt(String(wei ?? 0));
  if (value === 0n) return "0";
  const whole = value / 10n ** 18n;
  const frac = (value % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac.slice(0, 4)}` : whole.toString();
}

/** Lowercased 0x address, or null when the input is not one. */
export function normaliseAddress(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const bare = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-f]{40}$/.test(bare)) return null;
  if (bare === `0x${"0".repeat(40)}`) return null;
  return bare;
}

/**
 * Pulls an address out of whatever a person pasted — a bare address, or an
 * explorer URL ending in one. Mirrors `_norm_token` in the contract so the UI
 * accepts exactly what the contract accepts.
 */
export function extractAddress(input: string): string | null {
  const cleaned = input.trim().split(/[?#]/)[0].replace(/\/+$/, "");
  const last = cleaned.slice(cleaned.lastIndexOf("/") + 1);
  return normaliseAddress(last);
}
