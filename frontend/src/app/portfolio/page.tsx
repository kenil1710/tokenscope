import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { PortfolioTabs } from "@/components/PortfolioTabs";

export const metadata: Metadata = {
  title: "Scan a portfolio",
  description:
    "Paste up to five token addresses and read the portfolio's aggregate risk straight off the contract, or point TokenScope at any wallet and see every ERC-20 it holds rated against the oracle's registry.",
};

export default function PortfolioPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">Portfolio</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
            Paste up to five token addresses and the contract returns the
            portfolio&rsquo;s weighted risk score, its flagged tokens and every
            rug finding across them — computed on-chain, in one read. Or point
            it at a wallet: balances are public data and no connection is
            required, so you can inspect an address you do not control.
          </p>
        </header>
        <PortfolioTabs />
      </main>
      <Footer />
    </div>
  );
}
