import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { ScanForm } from "@/components/ScanForm";
import { CHAINS } from "@/lib/risk";
import type { ChainName } from "@/types";

type Search = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function resolveChain(value: string | string[] | undefined): ChainName {
  const match = CHAINS.find((chain) => chain.id === one(value));
  return match ? match.id : "ethereum";
}

export const metadata: Metadata = {
  title: "Scan a token",
  description:
    "Submit any ERC-20 address and have GenLayer validators independently score its distribution, activity, verification, maturity and liquidity.",
};

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const query = await searchParams;
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            Scan a token
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
            Paste an ERC-20 contract address. Validators each fetch its public record
            from Blockscout, reduce it to 32 bucketed ordinals, and must agree on the
            vector exactly before any score is written.
          </p>
        </header>

        <ScanForm
          initialChain={resolveChain(query.chain)}
          initialToken={one(query.token)}
        />
      </main>
      <Footer />
    </div>
  );
}
