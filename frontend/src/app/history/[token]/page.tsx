import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { HistoryView } from "@/components/HistoryView";
import { shortAddress } from "@/lib/format";
import { CHAINS } from "@/lib/risk";
import type { ChainName } from "@/types";

type Params = Promise<{ token: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { token } = await params;
  return {
    title: `${shortAddress(token)} — score history`,
    description: `Every stored risk score for ${token}, round by round, with the delta the contract froze onto each record at write time.`,
  };
}

function resolveChain(value: string | string[] | undefined): ChainName {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = CHAINS.find((chain) => chain.id === raw);
  return match ? match.id : "ethereum";
}

/**
 * `/history/[token]` — the score over time.
 *
 * The segment accepts either an address or a numeric token_id, because both
 * name the same thing and a user arriving from `rescan_token` has the integer
 * while a user arriving from a link has the address. `HistoryView` sorts out
 * which it was given.
 */
export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { token } = await params;
  const chain = resolveChain((await searchParams).chain);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            Score history
          </p>
          <h1 className="mt-1.5 break-all font-mono text-xl font-semibold text-ink-900 sm:text-2xl">
            {token}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
            Every score the contract still holds for this token, newest first.
            Each row is a separate consensus round over live explorer data, so
            two identical scores mean the token really did not move.
          </p>
        </header>

        <HistoryView token={decodeURIComponent(token)} initialChain={chain} />
      </main>
      <Footer />
    </div>
  );
}
