import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { TokenDetail } from "@/components/TokenDetail";
import { shortAddress } from "@/lib/format";
import { CHAINS } from "@/lib/risk";
import type { ChainName } from "@/types";

type Params = Promise<{ address: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { address } = await params;
  return {
    title: `${shortAddress(address)} — risk report`,
    description: `On-chain risk assessment for ${address}: distribution, activity, verification, maturity and liquidity, with rug-pull findings read from the verified ABI.`,
  };
}

function resolveChain(value: string | string[] | undefined): ChainName {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = CHAINS.find((chain) => chain.id === raw);
  return match ? match.id : "ethereum";
}

export default async function TokenPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { address } = await params;
  const chain = resolveChain((await searchParams).chain);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            Risk report
          </p>
          <h1 className="mt-1.5 break-all font-mono text-xl font-semibold text-ink-900 sm:text-2xl">
            {address}
          </h1>
        </header>

        <TokenDetail address={address.toLowerCase()} initialChain={chain} />
      </main>
      <Footer />
    </div>
  );
}
