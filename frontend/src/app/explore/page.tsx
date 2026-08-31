import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { ExploreView } from "@/components/ExploreView";

export const metadata: Metadata = {
  title: "Explore scored tokens",
  description:
    "Browse every ERC-20 TokenScope has assessed, with per-chain leaderboards of the safest and riskiest tokens.",
};

export default function ExplorePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">Explore</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
            Every token the contract has scored. The safest and riskiest lists read off
            one bounded per-chain array from opposite ends — when it overflows, entries
            are dropped from the middle so both tails survive.
          </p>
        </header>
        <ExploreView />
      </main>
      <Footer />
    </div>
  );
}
