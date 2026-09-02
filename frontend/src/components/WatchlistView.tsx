"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  Loader2,
  Minus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { ChainMark } from "./ChainMark";
import { RiskBadge } from "./RiskBadge";
import { useWallet } from "./WalletProvider";
import { ConnectWallet } from "./ConnectWallet";
import { fetchWatchlist, watchlistKey } from "./WatchButton";
import { describeWriteError, removeFromWatchlist, waitForWatchlist } from "@/lib/contract";
import { extractAddress, formatDay, relativeTime, shortAddress } from "@/lib/format";
import { scoreTone, TONE_CLASSES } from "@/lib/risk";
import type { WatchDirection, WatchRow } from "@/types";

const DIRECTION: Record<
  WatchDirection,
  { label: string; tone: keyof typeof TONE_CLASSES; icon: typeof ArrowUpRight }
> = {
  UP: { label: "Improved", tone: "safe", icon: ArrowUpRight },
  DOWN: { label: "Degraded", tone: "danger", icon: ArrowDownRight },
  SAME: { label: "Unchanged", tone: "neutral", icon: Minus },
  NEW: { label: "First score", tone: "neutral", icon: Sparkles },
  UNSCORED: { label: "Never scored", tone: "neutral", icon: Eye },
};

export function WatchlistView() {
  const { account } = useWallet();
  const [typed, setTyped] = useState("");

  // A typed address wins, the same rule the portfolio page uses. `get_watchlist`
  // is a view over any owner, so someone else's list is legitimately readable —
  // only the write buttons need to be yours.
  const target = extractAddress(typed) ?? account ?? null;
  const isOwn = Boolean(account && target && target.toLowerCase() === account.toLowerCase());

  const { data, error, isLoading, mutate } = useSWR(
    watchlistKey(target),
    fetchWatchlist,
    { revalidateOnFocus: false },
  );

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-card">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label
              htmlFor="watchlist-owner"
              className="mb-1.5 block text-sm font-medium text-ink-800"
            >
              Watchlist owner
            </label>
            <input
              id="watchlist-owner"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={account ?? "0x…"}
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-xl border border-hairline bg-canvas px-4 py-3 font-mono text-sm text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-ink-400"
            />
            {typed && !extractAddress(typed) ? (
              <p className="mt-1.5 text-xs text-danger-600">
                Not a 42-character 0x address.
              </p>
            ) : null}
          </div>
          {account ? null : <ConnectWallet />}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-500">
          Watchlists live in the contract under the watcher&rsquo;s own address, so they
          survive a cleared browser and are readable by anyone. Watching is free —
          it is storage and nothing else, with no fetch, no validator work and no
          consensus round to pay for.
        </p>
      </div>

      {!target ? (
        <div className="rounded-2xl border border-hairline bg-surface p-10 text-center shadow-card">
          <Eye className="mx-auto size-8 text-ink-300" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-ink-900">
            Connect a wallet, or paste an address
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-500">
            A watchlist records the score at the moment you added each token, so what
            you see later is movement against what you actually saw — not the
            difference between the last two rounds.
          </p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-danger-500/25 bg-danger-50 p-5 text-sm text-danger-700">
          Could not read the watchlist from the contract. The RPC may be rate-limited.
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface p-8 text-sm text-ink-500 shadow-card">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Reading the watchlist from the contract…
        </div>
      ) : !data || data.count === 0 ? (
        <div className="rounded-2xl border border-hairline bg-surface p-10 text-center shadow-card">
          <Eye className="mx-auto size-8 text-ink-300" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-ink-900">
            {isOwn ? "You are not watching anything yet" : "This address watches nothing"}
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-500">
            Open any token report and press <em>Watch this token</em>. Up to{" "}
            {data?.capacity ?? 20} tokens per address — the cap is a constant for the
            same reason the rate limiter is.
          </p>
          <Link
            href="/explore"
            className="mt-5 inline-block rounded-lg bg-ink-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-700"
          >
            Browse scored tokens
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Watching" value={`${data.count} / ${data.capacity}`} note="tokens" />
            <Stat
              label="Moved since added"
              value={String(data.moved)}
              note={data.moved === 0 ? "all steady" : "have a different score"}
              tone={data.moved > 0 ? "warn" : "safe"}
            />
            <Stat
              label="Still unscored"
              value={String(data.unscored)}
              note={data.unscored === 0 ? "all have a record" : "no consensus round yet"}
            />
          </div>

          <div className="space-y-2.5">
            {data.tokens.map((row, i) => (
              <WatchRowCard
                key={row.key}
                row={row}
                index={i}
                owned={isOwn}
                onRemoved={() => void mutate()}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </p>
      <p className={`tabular mt-1.5 text-2xl font-semibold ${TONE_CLASSES[tone].text}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-500">{note}</p>
    </div>
  );
}

function WatchRowCard({
  row,
  index,
  owned,
  onRemoved,
}: {
  row: WatchRow;
  index: number;
  owned: boolean;
  onRemoved: () => void;
}) {
  const { account } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const direction = DIRECTION[row.direction] ?? DIRECTION.UNSCORED;
  const Icon = direction.icon;
  const tone = TONE_CLASSES[direction.tone];
  const scoreClasses = row.scored
    ? TONE_CLASSES[scoreTone(row.overall_score ?? 0)]
    : TONE_CLASSES.neutral;

  async function remove() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      await removeFromWatchlist(account, row.token_address, row.chain);
      await waitForWatchlist(account, row.key, false);
      onRemoved();
    } catch (cause) {
      setError(describeWriteError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
      className="rounded-xl border border-hairline bg-surface p-4 shadow-card"
    >
      <div className="flex items-center gap-4">
        <ChainMark chain={row.chain} size={28} className="shrink-0" />

        <Link
          href={`/token/${row.token_address}?chain=${row.chain}`}
          className="min-w-0 flex-1 group"
        >
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink-900 group-hover:text-ink-600">
              {row.symbol || "Unscored token"}
            </p>
            <RiskBadge badge={row.badge ?? "UNSCORED"} size="sm" />
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-400">
            {shortAddress(row.token_address, 10, 6)}
            <span className="ml-2 font-sans">· added {formatDay(row.added_at)}</span>
          </p>
        </Link>

        <div
          className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex ${tone.bg} ${tone.text} ${tone.border}`}
        >
          <Icon className="size-3.5" aria-hidden />
          {direction.label}
          {typeof row.delta === "number" && row.delta !== 0 ? (
            <span className="tabular">
              {row.delta > 0 ? "+" : ""}
              {row.delta}
            </span>
          ) : null}
        </div>

        <div className="w-24 shrink-0 text-right">
          {row.scored ? (
            <>
              <p className="tabular text-lg font-semibold text-ink-900">
                {row.overall_score}
              </p>
              <p className="tabular text-[11px] text-ink-400">
                was {row.baseline_overall}
              </p>
            </>
          ) : (
            <p className="text-xs text-ink-400">No score</p>
          )}
        </div>

        {owned ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            aria-label={`Stop watching ${row.symbol || row.token_address}`}
            className="shrink-0 rounded-lg border border-hairline p-2 text-ink-400 transition hover:border-danger-500/40 hover:bg-danger-50 hover:text-danger-600 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
          </button>
        ) : null}
      </div>

      {row.scored ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
            <motion.div
              className={`h-full rounded-full ${scoreClasses.fill}`}
              initial={{ width: 0 }}
              animate={{ width: `${row.overall_score ?? 0}%` }}
              transition={{ duration: 0.6, delay: 0.1 + index * 0.03 }}
            />
          </div>
          <span className="shrink-0 text-[11px] text-ink-400">
            scored {relativeTime(row.age_seconds ?? 0)}
          </span>
        </div>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          Nothing has been written for this token yet. Being told it is still unscored
          is the point of watching one —{" "}
          <Link href="/scan" className="font-medium text-ink-700 underline">
            run a scan
          </Link>{" "}
          and it will show up here.
        </p>
      )}

      {error ? <p className="mt-2 text-xs text-danger-600">{error}</p> : null}
    </motion.div>
  );
}
