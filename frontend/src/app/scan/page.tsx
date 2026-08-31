import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { ScanForm } from "@/components/ScanForm";

export const metadata: Metadata = {
  title: "Scan a token",
  description:
    "Submit any ERC-20 address and have GenLayer validators independently score its distribution, activity, verification, maturity and liquidity.",
};

export default function ScanPage() {
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
            from Blockscout, reduce it to 29 bucketed ordinals, and must agree on the
            vector exactly before any score is written.
          </p>
        </header>

        <ScanForm />
      </main>
      <Footer />
    </div>
  );
}
