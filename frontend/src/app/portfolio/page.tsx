import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { PortfolioView } from "@/components/PortfolioView";

export const metadata: Metadata = {
  title: "Scan a portfolio",
  description:
    "Point TokenScope at any wallet and see every ERC-20 it holds rated against the oracle's on-chain registry — with the value sitting in tokens that carry a rug finding.",
};

export default function PortfolioPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">Portfolio</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
            Every ERC-20 a wallet holds, joined to what the oracle already knows about
            those tokens. Balances are public data and no wallet connection is required
            — you can point this at an address you do not control.
          </p>
        </header>
        <PortfolioView />
      </main>
      <Footer />
    </div>
  );
}
