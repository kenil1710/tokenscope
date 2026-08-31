import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { CompareView } from "@/components/CompareView";

export const metadata: Metadata = {
  title: "Compare two tokens",
  description:
    "Put two ERC-20s side by side across all five risk dimensions and see which the oracle considers safer, and why.",
};

export default function ComparePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">Compare</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
            Two tokens, five dimensions, one verdict. Both must already have a score —
            comparison reads existing records and never runs a consensus round.
          </p>
        </header>
        <CompareView />
      </main>
      <Footer />
    </div>
  );
}
