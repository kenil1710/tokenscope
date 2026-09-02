import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { WatchlistView } from "@/components/WatchlistView";

export const metadata: Metadata = {
  title: "Watchlist",
  description:
    "Track tokens on chain. TokenScope records the score at the moment you added each one, so what you see later is movement against what you actually saw.",
};

export default function WatchlistPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">Watchlist</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
            Kept in the contract, not in your browser. Each entry stores the score as it
            stood when you added it — comparing the two newest rounds instead would
            answer a different question, and answer it wrong for anyone who started
            watching between them.
          </p>
        </header>
        <WatchlistView />
      </main>
      <Footer />
    </div>
  );
}
