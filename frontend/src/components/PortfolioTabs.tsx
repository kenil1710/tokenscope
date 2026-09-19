"use client";

import { useState } from "react";
import { ClipboardList, Wallet } from "lucide-react";
import { BatchScanView } from "./BatchScanView";
import { PortfolioView } from "./PortfolioView";

/**
 * Two ways to look at a portfolio, because they answer different questions.
 *
 *  - **Paste addresses** goes through `batch_scan` on the contract: five
 *    tokens, aggregates computed on-chain, composable by any other contract.
 *    This is the milestone's portfolio scanner.
 *  - **A wallet's holdings** goes through Blockscout's token-balances endpoint
 *    and joins the result to whatever the oracle knows. It answers "what am I
 *    actually holding", which the contract cannot: balances are not in the
 *    feature vector and have no business being agreed by validators.
 *
 * Paste is the default because it is the one backed by consensus.
 */
const TABS = [
  {
    id: "paste" as const,
    label: "Paste addresses",
    icon: ClipboardList,
    blurb: "Up to five tokens, aggregated on-chain by batch_scan.",
  },
  {
    id: "wallet" as const,
    label: "A wallet's holdings",
    icon: Wallet,
    blurb: "Every ERC-20 an address holds, joined to the oracle's registry.",
  },
];

export function PortfolioTabs() {
  const [tab, setTab] = useState<"paste" | "wallet">("paste");
  const active = TABS.find((entry) => entry.id === tab) ?? TABS[0];

  return (
    <div className="space-y-6">
      <div>
        <div
          role="tablist"
          aria-label="Portfolio source"
          className="inline-flex rounded-xl border border-hairline bg-ink-50 p-1"
        >
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const selected = entry.id === tab;
            return (
              <button
                key={entry.id}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setTab(entry.id)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                  selected
                    ? "bg-surface text-ink-900 shadow-card"
                    : "text-ink-500 hover:text-ink-800"
                }`}
              >
                <Icon className="size-4" aria-hidden />
                {entry.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-500">{active.blurb}</p>
      </div>

      {tab === "paste" ? <BatchScanView /> : <PortfolioView />}
    </div>
  );
}
