"use client";

import useSWR from "swr";
import { useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { TokenCard, type TokenCardData } from "./TokenCard";
import { ChainMark } from "./ChainMark";
import { getRisk, getRiskiestTokens, getSafestTokens, listTrackedTokens } from "@/lib/contract";
import { CHAINS } from "@/lib/risk";
import type { ChainName } from "@/types";

type Filter = "all" | "safest" | "riskiest" | "warnings";

const FILTERS: { id: Filter; label: string; icon: typeof ShieldCheck }[] = [
  { id: "all", label: "All tokens", icon: Sparkles },
  { id: "safest", label: "Safest", icon: ShieldCheck },
  { id: "riskiest", label: "Riskiest", icon: ShieldAlert },
  { id: "warnings", label: "Rug warnings", icon: TriangleAlert },
];

/**
 * Every tracked token, with its latest record.
 *
 * The leaderboards are per chain and bounded, so "all" is built from
 * `get_tracked_tokens` instead — that is the only view that enumerates
 * everything the contract knows, across chains.
 */
async function loadAll() {
  const tracked = await listTrackedTokens();
  const records = await Promise.all(
    tracked.map(async ({ chain, address }): Promise<TokenCardData | null> => {
      try {
        const record = await getRisk(address, chain);
        if (!record) return null;
        return {
          chain,
          token_address: record.token_address,
          symbol: record.symbol,
          overall_score: record.overall_score,
          badge: record.badge,
          rug_level: record.rug_level,
          scored_at: record.scored_at,
        };
      } catch {
        return null;
      }
    }),
  );
  return records.filter((row): row is TokenCardData => row !== null);
}

async function loadBoard([, kind, chain]: [string, "safest" | "riskiest", ChainName]) {
  const board = kind === "safest" ? await getSafestTokens(chain, 25) : await getRiskiestTokens(chain, 25);
  return (board.tokens ?? []).map<TokenCardData>((row) => ({
    chain,
    token_address: row.token_address,
    symbol: row.symbol,
    overall_score: row.overall_score,
    badge: row.badge,
    rug_level: row.rug_level,
    scored_at: row.scored_at,
    rank: row.rank,
  }));
}

export function ExploreView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [chain, setChain] = useState<ChainName>("ethereum");

  const boardMode = filter === "safest" || filter === "riskiest";

  const all = useSWR(!boardMode ? ["all"] : null, loadAll, {
    revalidateOnFocus: false,
  });
  const board = useSWR(
    boardMode ? (["board", filter, chain] as [string, "safest" | "riskiest", ChainName]) : null,
    loadBoard,
    { revalidateOnFocus: false },
  );

  const loading = boardMode ? board.isLoading : all.isLoading;
  const rows = boardMode
    ? (board.data ?? [])
    : filter === "warnings"
      ? (all.data ?? []).filter(
          (row) => row.badge === "RUG_WARNING" || row.rug_level === "HIGH" || row.rug_level === "CRITICAL",
        )
      : (all.data ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                active
                  ? "bg-ink-600 text-white"
                  : "border border-hairline bg-surface text-ink-600 hover:border-ink-300"
              }`}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>

      {boardMode ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-500">Chain</span>
          {CHAINS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setChain(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                chain === item.id
                  ? "border border-ink-300 bg-ink-50 text-ink-900"
                  : "border border-hairline bg-surface text-ink-500 hover:border-ink-300"
              }`}
            >
              <ChainMark chain={item.id} size={14} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface p-8 text-sm text-ink-500 shadow-card">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Reading the registry from the contract…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-hairline bg-surface p-10 text-center shadow-card">
          <ShieldAlert className="mx-auto size-8 text-ink-300" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-ink-900">
            {filter === "warnings"
              ? "No tokens are currently flagged"
              : "Nothing scored on this chain yet"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-ink-500">
            {filter === "warnings"
              ? "No tracked token carries a HIGH or CRITICAL rug finding. That is a good sign, not a missing page."
              : "Be the first — scan a token and it appears here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row, i) => (
            <TokenCard key={`${row.chain}:${row.token_address}`} token={row} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
