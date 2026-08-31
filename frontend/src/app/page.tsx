import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  FileSearch,
  Fingerprint,
  FileCode,
  ScanLine,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { HeroVisual } from "@/components/HeroVisual";
import { Reveal } from "@/components/Reveal";
import { ChainMark } from "@/components/ChainMark";
import { getStats } from "@/lib/contract";
import { CHAINS } from "@/lib/risk";
import type { Stats } from "@/types";

/**
 * Marketing page. No wallet, by design — nothing here needs one, and a landing
 * page that pops MetaMask on arrival is hostile.
 *
 * Stats are read on the server and revalidated, so a visitor gets real numbers
 * without paying a client-side round trip on a page they may bounce from. The
 * read is wrapped because a marketing page must render even when the RPC is
 * rate-limited — the copy below never depends on a number being present.
 */
export const revalidate = 60;

async function safeStats(): Promise<Stats | null> {
  try {
    return await getStats();
  } catch {
    return null;
  }
}

const STEPS = [
  {
    icon: ScanLine,
    title: "Submit an address",
    body: "Paste any ERC-20 contract address and pick its chain. No account, no signup.",
  },
  {
    icon: Users,
    title: "Validators fetch independently",
    body: "Each node pulls the token's public record from that chain's Blockscout instance — holders, transfers, the verified ABI, the creation transaction.",
  },
  {
    icon: Fingerprint,
    title: "They agree on a feature vector",
    body: "Not on a score. 29 bucketed ordinals, compared exactly with no tolerance. Bucket width is the consensus margin.",
  },
  {
    icon: FileSearch,
    title: "The score is arithmetic",
    body: "Five weighted dimensions plus rug detection, recomputed from the agreed vector and stored on-chain. Anyone can re-check it years later.",
  },
];

export default async function LandingPage() {
  const stats = await safeStats();
  const rugsFound = stats
    ? (stats.rug_levels?.MEDIUM ?? 0) +
      (stats.rug_levels?.HIGH ?? 0) +
      (stats.rug_levels?.CRITICAL ?? 0)
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader showWallet={false} />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-hairline bg-surface">
          <div className="grid-field grid-field-fade pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-canvas px-3 py-1 text-xs font-medium text-ink-600">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  On-chain risk oracle · 4 chains
                </span>

                <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.4rem]">
                  Is that token safe?
                  <span className="block text-ink-500">Check before you trade.</span>
                </h1>

                <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
                  TokenScope scores any ERC-20 on five dimensions and reads rug-pull
                  risk straight out of the verified ABI — mint, pause, blacklist,
                  upgradeable proxy. Every score is agreed by independent validators
                  and stored on-chain, so you can re-check the arithmetic yourself.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/scan"
                    className="inline-flex items-center gap-2 rounded-xl bg-ink-600 px-5 py-3 text-sm font-semibold text-white shadow-card transition hover:bg-ink-700"
                  >
                    Scan a token
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <Link
                    href="/explore"
                    className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface px-5 py-3 text-sm font-semibold text-ink-700 transition hover:border-ink-300"
                  >
                    Browse scored tokens
                  </Link>
                </div>

                <p className="mt-5 text-xs text-ink-400">
                  Free to read. Scanning a new token costs a small fee and takes about
                  a minute while validators reach consensus.
                </p>
              </div>

              <HeroVisual />
            </div>
          </div>
        </section>

        {/* ── Stats ────────────────────────────────────────────────────── */}
        <section className="border-b border-hairline bg-canvas">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              {[
                { label: "Tokens scored", value: stats ? String(stats.tokens_tracked) : "—" },
                { label: "Consensus rounds", value: stats ? String(stats.total_scored) : "—" },
                { label: "Average score", value: stats ? String(stats.avg_overall) : "—" },
                { label: "With rug findings", value: rugsFound !== null ? String(rugsFound) : "—" },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-xs font-medium uppercase tracking-wider text-ink-400">
                    {stat.label}
                  </dt>
                  <dd className="tabular mt-1.5 text-3xl font-semibold text-ink-900">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-ink-400">
              {stats
                ? "Live from the deployed contract."
                : "Live figures are momentarily unavailable — the contract is still readable from the scan page."}
            </p>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section className="border-b border-hairline bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                How it works
              </p>
              <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
                Validators never agree on a score. They agree on the evidence.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">
                Five nodes each forming their own 0–100 opinion would produce 72, 73,
                71, 74, 72 — one judgement that fails to agree. So they compare bucket
                indices instead, exactly, and the score is arithmetic over what they
                agreed.
              </p>
            </Reveal>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <Reveal key={step.title} delay={i * 0.08}>
                  <div className="h-full rounded-xl border border-hairline bg-canvas p-5">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-ink-600 text-white">
                      <step.icon className="size-5" aria-hidden />
                    </div>
                    <p className="mt-4 text-xs font-semibold text-ink-400">
                      Step {i + 1}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-ink-900">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-600">
                      {step.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Chains ───────────────────────────────────────────────────── */}
        <section className="border-b border-hairline bg-canvas">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Multi-chain
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
                One rubric, four chains
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">
                Blockscout serves the same schema on every host, so a single extraction
                path covers all four. Where a chain&rsquo;s data source is degraded,
                TokenScope says so and refuses rather than scoring on partial evidence.
              </p>
            </Reveal>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CHAINS.map((chain, i) => (
                <Reveal key={chain.id} delay={i * 0.06}>
                  <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5 shadow-card">
                    <div className="flex items-center gap-3">
                      <ChainMark chain={chain.id} size={32} />
                      <span className="text-base font-semibold text-ink-900">
                        {chain.label}
                      </span>
                    </div>
                    <span
                      className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        chain.healthy
                          ? "bg-safe-50 text-safe-700"
                          : "bg-warn-50 text-warn-700"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${chain.healthy ? "bg-safe-500" : "bg-warn-500"}`}
                        aria-hidden
                      />
                      {chain.healthy ? "Scoring" : "Source degraded"}
                    </span>
                    {chain.note ? (
                      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-500">
                        {chain.note}
                      </p>
                    ) : null}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <section className="bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <Reveal>
              <div className="relative overflow-hidden rounded-2xl bg-ink-600 px-6 py-12 text-center sm:px-12">
                <div className="grid-field pointer-events-none absolute inset-0 opacity-25" aria-hidden />
                <div className="relative">
                  <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    Check a token before it checks you.
                  </h2>
                  <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-100">
                    Paste an address, pick a chain, and read the evidence the network
                    agreed on.
                  </p>
                  <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                    <Link
                      href="/scan"
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
                    >
                      Scan a token
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                    <a
                      href="https://github.com/kenil1710/tokenscope"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      <FileCode className="size-4" aria-hidden />
                      Read the contract
                    </a>
                  </div>
                  <p className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-200">
                    <Boxes className="size-3.5" aria-hidden />
                    Deployed on GenLayer Studionet and Bradbury from the same artifact
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
