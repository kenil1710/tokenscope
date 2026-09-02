"use client";

import { useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import {
  Briefcase,
  Loader2,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { ChainSelector } from "./ChainSelector";
import { ChainMark } from "./ChainMark";
import { RiskBadge } from "./RiskBadge";
import { useWallet } from "./WalletProvider";
import { getRisk, listTrackedTokens } from "@/lib/contract";
import { extractAddress, shortAddress } from "@/lib/format";
import { BADGE_META, scoreTone, TONE_CLASSES, TONE_HEX } from "@/lib/risk";
import type { Badge, ChainName, Holding, RiskRecord } from "@/types";

/** A holding joined to whatever the contract knows about that token. */
type Position = Holding & { record: RiskRecord | null };

type PortfolioResponse = {
  chain: ChainName;
  address: string;
  total: number;
  returned: number;
  usd_total: number;
  priced: number;
  holdings: Holding[];
};

/**
 * Reads the contract for at most this many holdings.
 *
 * Studio meters RPC per IP, and a wallet holding forty tokens would otherwise
 * fire forty `gen_call`s the moment the page mounts. The registry read below
 * means only tokens the contract has ACTUALLY scored are looked up, which in
 * practice is a handful — this cap is the backstop, not the usual path.
 */
const MAX_LOOKUPS = 16;
const LOOKUP_CONCURRENCY = 4;

/** Runs `task` over `items` a few at a time, preserving input order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Balances from Blockscout, joined to TokenScope's registry.
 *
 * The join goes through `get_tracked_tokens` — one view that enumerates every
 * key the contract holds — rather than asking the contract about each holding
 * in turn. That turns "is this scored?" into a set membership test done
 * locally, and reserves the expensive per-token reads for the tokens that
 * actually have a record to fetch.
 */
async function loadPortfolio([, address, chain]: [string, string, ChainName]) {
  const response = await fetch(
    `/api/portfolio?address=${address}&chain=${chain}`,
    { cache: "no-store" },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const { error, hint } = (payload ?? {}) as { error?: string; hint?: string };
    throw new Error(`${error ?? "Could not read balances."} ${hint ?? ""}`.trim());
  }
  const portfolio = payload as PortfolioResponse;

  let scoredKeys = new Set<string>();
  try {
    const tracked = await listTrackedTokens();
    scoredKeys = new Set(tracked.map((row) => `${row.chain}:${row.address}`));
  } catch {
    // The registry read failing means every holding reads as uncovered, which
    // is honest: without it we do not know that any of them were scored.
  }

  const lookups = portfolio.holdings
    .filter((row) => scoredKeys.has(`${chain}:${row.token_address}`))
    .slice(0, MAX_LOOKUPS);

  const records = await mapLimit(lookups, LOOKUP_CONCURRENCY, async (row) => {
    try {
      return await getRisk(row.token_address, chain);
    } catch {
      return null;
    }
  });

  const byAddress = new Map<string, RiskRecord>();
  records.forEach((record, i) => {
    if (record) byAddress.set(lookups[i].token_address, record);
  });

  const positions: Position[] = portfolio.holdings.map((row) => ({
    ...row,
    record: byAddress.get(row.token_address) ?? null,
  }));

  return { portfolio, positions };
}

export function PortfolioView() {
  const { account } = useWallet();
  const [typed, setTyped] = useState("");
  const [chain, setChain] = useState<ChainName>("ethereum");

  // A typed address wins over the connected one — someone checking a wallet
  // they do not control is a first-class use of this page, not a fallback.
  const target = extractAddress(typed) ?? account ?? null;

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    target ? (["portfolio", target, chain] as [string, string, ChainName]) : null,
    loadPortfolio,
    { revalidateOnFocus: false, keepPreviousData: false },
  );

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-card">
        <div className="grid gap-4 sm:grid-cols-[1fr_13rem]">
          <div>
            <label
              htmlFor="portfolio-address"
              className="mb-1.5 block text-sm font-medium text-ink-800"
            >
              Wallet address
            </label>
            <input
              id="portfolio-address"
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
            ) : account && !typed ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
                <Wallet className="size-3.5" aria-hidden />
                Using your connected wallet. Type any address to scan it instead.
              </p>
            ) : null}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-800">Chain</label>
            <ChainSelector value={chain} onChange={setChain} id="portfolio-chain" />
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-500">
          Balances come from Blockscout&rsquo;s public address record — no signature, no
          connection required. Risk comes from TokenScope&rsquo;s own registry, so a
          holding is only rated if some scan has already put it on chain.
        </p>
      </div>

      {!target ? (
        <EmptyState
          icon={Briefcase}
          title="Enter a wallet, or connect one"
          body="Every ERC-20 the address holds is listed, then matched against the tokens TokenScope has scored. Nothing is written on chain and no fee is charged — this is a read."
        />
      ) : error ? (
        <div className="rounded-2xl border border-danger-500/25 bg-danger-50 p-5">
          <p className="text-sm font-semibold text-danger-700">
            Could not load this portfolio
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-danger-700/80">
            {(error as Error).message}
          </p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-danger-500/30 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition hover:bg-danger-50"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface p-8 text-sm text-ink-500 shadow-card">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Reading balances from Blockscout, then the registry from the contract…
        </div>
      ) : data && data.positions.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={`No ERC-20 balances on ${chain}`}
          body={`${shortAddress(target, 10, 6)} holds no fungible tokens on this chain. Try another chain — a wallet's holdings rarely live on just one.`}
        />
      ) : data ? (
        <PortfolioReport
          address={target}
          chain={chain}
          portfolio={data.portfolio}
          positions={data.positions}
          refreshing={isValidating}
        />
      ) : null}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Briefcase;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-10 text-center shadow-card">
      <Icon className="mx-auto size-8 text-ink-300" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-ink-900">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-500">{body}</p>
    </div>
  );
}

/** The five buckets a holding can fall into, in severity order. */
const BUCKETS = [
  { id: "VERIFIED_SAFE", label: "Verified safe", hex: TONE_HEX.safe },
  { id: "MODERATE_RISK", label: "Moderate risk", hex: TONE_HEX.warn },
  { id: "HIGH_RISK", label: "High risk", hex: TONE_HEX.danger },
  { id: "RUG_WARNING", label: "Rug warning", hex: "#b91c1c" },
  { id: "UNSCORED", label: "Unscored", hex: "#c6d6e8" },
] as const;

function usd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function amount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value.toPrecision(3);
}

function PortfolioReport({
  address,
  chain,
  portfolio,
  positions,
  refreshing,
}: {
  address: string;
  chain: ChainName;
  portfolio: PortfolioResponse;
  positions: Position[];
  refreshing: boolean;
}) {
  const covered = positions.filter((row) => row.record !== null);
  const flagged = covered.filter(
    (row) =>
      row.record!.badge === "RUG_WARNING" ||
      row.record!.rug_level === "HIGH" ||
      row.record!.rug_level === "CRITICAL",
  );

  /**
   * Value by verdict.
   *
   * Only priced holdings can contribute — an unpriced token has no dollar
   * figure to place anywhere, and inventing one would be the whole point of
   * this chart, misstated. The caption below says how much of the wallet the
   * bar therefore covers.
   */
  const byBucket = BUCKETS.map((bucket) => {
    const rows = positions.filter(
      (row) => (row.record?.badge ?? "UNSCORED") === (bucket.id as Badge),
    );
    return {
      ...bucket,
      count: rows.length,
      value: rows.reduce((sum, row) => sum + (row.usd ?? 0), 0),
    };
  }).filter((bucket) => bucket.count > 0);

  const chartTotal = byBucket.reduce((sum, bucket) => sum + bucket.value, 0);

  // Value-weighted where prices exist, plain mean where they do not. Weighting
  // matters: a 20-point token you hold $4 of is not the same exposure as a
  // 20-point token that is half the wallet.
  const weight = covered.reduce((sum, row) => sum + (row.usd ?? 0), 0);
  const weighted =
    weight > 0
      ? Math.round(
          covered.reduce((sum, row) => sum + row.record!.overall_score * (row.usd ?? 0), 0) /
            weight,
        )
      : covered.length > 0
        ? Math.round(
            covered.reduce((sum, row) => sum + row.record!.overall_score, 0) / covered.length,
          )
        : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Holdings"
          value={String(portfolio.returned)}
          note={
            portfolio.total > portfolio.returned
              ? `of ${portfolio.total}, largest first`
              : "ERC-20 balances"
          }
        />
        <Stat
          label="Portfolio value"
          value={portfolio.usd_total > 0 ? usd(portfolio.usd_total) : "—"}
          note={
            portfolio.priced < portfolio.returned
              ? `${portfolio.returned - portfolio.priced} unpriced`
              : "all holdings priced"
          }
        />
        <Stat
          label="Rated by TokenScope"
          value={`${covered.length} / ${positions.length}`}
          note={covered.length === 0 ? "nothing scanned yet" : "have an on-chain record"}
          tone={covered.length === 0 ? "neutral" : "safe"}
        />
        <Stat
          label="Weighted risk score"
          value={weighted === null ? "—" : String(weighted)}
          note={
            weighted === null
              ? "needs at least one rated holding"
              : weight > 0
                ? "value-weighted across rated holdings"
                : "unweighted — no prices available"
          }
          tone={weighted === null ? "neutral" : scoreTone(weighted)}
        />
      </div>

      {flagged.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-danger-500/25 bg-danger-50 p-5"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-danger-700">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {flagged.length} holding{flagged.length === 1 ? "" : "s"} carr
            {flagged.length === 1 ? "ies" : "y"} a serious rug finding
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {flagged.map((row) => (
              <Link
                key={row.token_address}
                href={`/token/${row.token_address}?chain=${chain}`}
                className="rounded-lg border border-danger-500/30 bg-surface px-2.5 py-1.5 text-xs font-semibold text-danger-700 transition hover:bg-danger-100"
              >
                {row.symbol}
                {row.usd !== null ? (
                  <span className="ml-1.5 font-normal text-danger-700/70">
                    {usd(row.usd)}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-danger-700/80">
            A rug finding outranks the score. Open the report to see which owner
            capability was found in the verified ABI.
          </p>
        </motion.div>
      ) : null}

      {chartTotal > 0 ? (
        <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-card">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-ink-900">Value by verdict</p>
            <p className="tabular text-xs text-ink-500">{usd(chartTotal)} priced</p>
          </div>

          <div
            className="mt-4 flex h-4 w-full gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={byBucket
              .map((b) => `${b.label}: ${usd(b.value)}`)
              .join("; ")}
          >
            {byBucket
              .filter((bucket) => bucket.value > 0)
              .map((bucket, i) => (
                <motion.div
                  key={bucket.id}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ background: bucket.hex }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(bucket.value / chartTotal) * 100}%` }}
                  transition={{ duration: 0.7, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                />
              ))}
          </div>

          <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {byBucket.map((bucket) => (
              <li key={bucket.id} className="flex items-center gap-2 text-xs">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ background: bucket.hex }}
                  aria-hidden
                />
                <span className="text-ink-700">{bucket.label}</span>
                <span className="ml-auto tabular text-ink-500">
                  {bucket.count} · {bucket.value > 0 ? usd(bucket.value) : "unpriced"}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs leading-relaxed text-ink-500">
            Only priced holdings can be placed on this bar. Unpriced tokens are counted
            in the legend but contribute no width, because inventing a dollar figure for
            them is exactly the error the bar exists to avoid.
          </p>
        </div>
      ) : null}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink-900">Holdings</h2>
          {refreshing ? (
            <span className="flex items-center gap-1.5 text-xs text-ink-500">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Refreshing
            </span>
          ) : (
            <span className="font-mono text-xs text-ink-400">
              {shortAddress(address, 8, 6)}
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          {positions.map((row, i) => (
            <PositionRow key={row.token_address} position={row} index={i} />
          ))}
        </div>
      </div>

      {covered.length < positions.length ? (
        <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-card">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <ShieldAlert className="size-4 text-ink-400" aria-hidden />
            {positions.length - covered.length} holding
            {positions.length - covered.length === 1 ? " has" : "s have"} never been
            scored
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
            That is an absence of evidence, not a clean bill of health. Each scan is a
            consensus round over live data, so nothing is rated until someone asks for
            it.
          </p>
          <Link
            href="/scan"
            className="mt-3 inline-block rounded-lg bg-ink-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-700"
          >
            Scan one now
          </Link>
        </div>
      ) : null}
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

function PositionRow({ position, index }: { position: Position; index: number }) {
  const record = position.record;
  const badge: Badge = record?.badge ?? "UNSCORED";
  const tone = TONE_CLASSES[record ? scoreTone(record.overall_score) : "neutral"];

  const body = (
    <>
      <ChainMark chain={position.chain} size={28} className="shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink-900">{position.symbol}</p>
          <RiskBadge badge={badge} size="sm" />
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-400">
          <span className="tabular">{amount(position.amount)}</span>{" "}
          <span className="font-mono">{shortAddress(position.token_address, 8, 4)}</span>
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="tabular text-sm font-semibold text-ink-900">
          {position.usd !== null ? usd(position.usd) : "—"}
        </p>
        <p className="text-[11px] text-ink-400">
          {position.usd !== null ? "value" : "no price"}
        </p>
      </div>

      {record ? (
        <div className="hidden w-28 shrink-0 items-center gap-2 sm:flex">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
            <div
              className={`h-full rounded-full ${tone.fill}`}
              style={{ width: `${record.overall_score}%` }}
            />
          </div>
          <span className="tabular w-7 text-right text-sm font-semibold text-ink-900">
            {record.overall_score}
          </span>
        </div>
      ) : (
        <span className="hidden w-28 shrink-0 text-right text-xs text-ink-400 sm:block">
          {BADGE_META.UNSCORED.label}
        </span>
      )}
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
    >
      {record ? (
        <Link
          href={`/token/${position.token_address}?chain=${position.chain}`}
          className="flex items-center gap-4 rounded-xl border border-hairline bg-surface p-4 shadow-card transition hover:border-ink-300 hover:shadow-lift"
        >
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-4 rounded-xl border border-hairline bg-surface p-4 shadow-card">
          {body}
        </div>
      )}
    </motion.div>
  );
}
