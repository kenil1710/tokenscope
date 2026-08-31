"use client";

import { Wallet } from "lucide-react";
import { NETWORK_LABEL } from "@/lib/genlayer";
import { shortAddress } from "@/lib/format";
import { useWallet } from "./WalletProvider";

export function ConnectWallet({ compact = false }: { compact?: boolean }) {
  const { account, connect, connecting, disconnect, hasWallet, chainOk, switchNetwork } =
    useWallet();

  if (!hasWallet) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:border-ink-300"
      >
        <Wallet className="size-4" aria-hidden />
        Install MetaMask
      </a>
    );
  }

  if (account && !chainOk) {
    return (
      <button
        type="button"
        onClick={switchNetwork}
        className="inline-flex items-center gap-2 rounded-lg border border-warn-500/40 bg-warn-50 px-3.5 py-2 text-sm font-medium text-warn-700 transition hover:bg-warn-100"
      >
        Switch to {NETWORK_LABEL}
      </button>
    );
  }

  if (account) {
    return (
      <button
        type="button"
        onClick={disconnect}
        title="Disconnect (clears it here; revoke access in your wallet)"
        className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3.5 py-2 font-mono text-sm text-ink-700 transition hover:border-ink-300"
      >
        <span className="size-2 rounded-full bg-safe-500" aria-hidden />
        {shortAddress(account)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={connect}
      disabled={connecting}
      className="inline-flex items-center gap-2 rounded-lg bg-ink-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-ink-700 disabled:opacity-60"
    >
      <Wallet className="size-4" aria-hidden />
      {connecting ? "Connecting…" : compact ? "Connect" : "Connect wallet"}
    </button>
  );
}
