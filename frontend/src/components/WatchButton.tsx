"use client";

import { useState } from "react";
import useSWR from "swr";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useWallet } from "./WalletProvider";
import {
  addToWatchlist,
  describeWriteError,
  getWatchlist,
  removeFromWatchlist,
  waitForWatchlist,
} from "@/lib/contract";
import type { ChainName } from "@/types";

/** SWR key for the caller's own watchlist. Shared so a write anywhere refreshes
 *  every button on the page. */
export const watchlistKey = (account: string | null) =>
  account ? (["watchlist", account.toLowerCase()] as const) : null;

export function fetchWatchlist([, owner]: readonly [string, string]) {
  return getWatchlist(owner);
}

/**
 * Watch / unwatch a token.
 *
 * The contract stores watchlists under the CALLER's address, so this is a
 * write and needs a signature — but it is not payable. Watching costs storage
 * and nothing else: no fetch, no validator work, no consensus round, so there
 * is nothing to charge for.
 *
 * The button waits for the list to read back changed rather than for the
 * receipt. A write returns a transaction hash and the contract's own
 * `{status: "OK" | "ALREADY_WATCHED"}` lives in the receipt — reading the list
 * is both simpler and the thing the UI actually needs to be true.
 */
export function WatchButton({
  token,
  chain,
  size = "md",
  onChanged,
}: {
  token: string;
  chain: ChainName;
  size?: "sm" | "md";
  onChanged?: () => void;
}) {
  const { account, connect, connecting, hasWallet, chainOk, switchNetwork } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, mutate } = useSWR(watchlistKey(account), fetchWatchlist, {
    revalidateOnFocus: false,
  });

  const key = `${chain}:${token.toLowerCase()}`;
  const watching = Boolean(data?.tokens?.some((row) => row.key === key));
  const full = Boolean(data && !watching && data.count >= data.capacity);

  const padding = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm";
  const base = `inline-flex items-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${padding}`;

  if (!hasWallet) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className={`${base} border border-hairline bg-surface text-ink-700 hover:border-ink-300`}
      >
        <Eye className="size-4" aria-hidden />
        Wallet needed to watch
      </a>
    );
  }

  if (!account) {
    return (
      <button
        type="button"
        onClick={() => void connect()}
        disabled={connecting}
        className={`${base} border border-hairline bg-surface text-ink-700 hover:border-ink-300`}
      >
        {connecting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
        Connect to watch
      </button>
    );
  }

  if (!chainOk) {
    return (
      <button
        type="button"
        onClick={() => void switchNetwork()}
        className={`${base} border border-warn-500/40 bg-warn-50 text-warn-700 hover:bg-warn-100`}
      >
        Switch network to watch
      </button>
    );
  }

  async function toggle() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      if (watching) {
        await removeFromWatchlist(account, token, chain);
      } else {
        await addToWatchlist(account, token, chain);
      }
      const settled = await waitForWatchlist(account, key, !watching);
      if (settled) {
        await mutate(settled, { revalidate: false });
      } else {
        // The write may still land after the poll gave up, so re-read rather
        // than assert either outcome.
        await mutate();
        setError("The transaction has not shown up yet. It may still settle.");
      }
      onChanged?.();
    } catch (cause) {
      setError(describeWriteError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy || (full && !watching)}
        title={
          full && !watching
            ? `Your watchlist is full at ${data?.capacity} tokens. Remove one first.`
            : undefined
        }
        className={
          watching
            ? `${base} border border-ink-300 bg-ink-50 text-ink-700 hover:bg-ink-100`
            : `${base} bg-ink-600 text-white hover:bg-ink-700`
        }
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : watching ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
        {busy ? "Waiting for the chain…" : watching ? "Watching" : "Watch this token"}
      </button>

      {full && !watching ? (
        <p className="text-xs text-warn-700">
          Watchlist full at {data?.capacity}. Remove one first.
        </p>
      ) : null}
      {error ? <p className="max-w-xs text-xs text-danger-600">{error}</p> : null}
    </div>
  );
}
