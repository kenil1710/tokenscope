import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { ChainMark } from "@/components/ChainMark";
import { CHAINS, DIMENSION_META, FLAG_META } from "@/lib/risk";
import { CONSUMER_ADDRESS, CONTRACT_ADDRESS, NETWORK_LABEL } from "@/lib/genlayer";
import { DIMENSIONS } from "@/types";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "What each risk dimension measures, how rug detection reads the verified ABI, and how to consume TokenScope from your own contract.",
};

const SECTIONS: { id: string; label: string; href?: string }[] = [
  { id: "consensus", label: "Why a feature vector" },
  { id: "dimensions", label: "The five dimensions" },
  { id: "rug", label: "Rug detection" },
  { id: "chains", label: "Multi-chain" },
  { id: "developers", label: "For developers" },
  { id: "api", label: "API reference", href: "/docs/api" },
  { id: "faq", label: "FAQ" },
];

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            How TokenScope works
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
            An oracle is only worth reading if you can check it. This page describes
            exactly what is measured, what is agreed, and what the model does and does
            not touch.
          </p>
        </header>

        <div className="grid gap-10 lg:grid-cols-[200px_1fr]">
          <nav className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                On this page
              </p>
              <ul className="mt-3 space-y-1.5">
                {SECTIONS.map((section) => (
                  <li key={section.id}>
                    {/* A section with its own href is a page, not an anchor —
                        the API reference outgrew a section on this one. */}
                    {section.href ? (
                      <Link
                        href={section.href}
                        className="block text-sm font-medium text-ink-600 transition hover:text-ink-900"
                      >
                        {section.label} →
                      </Link>
                    ) : (
                      <a
                        href={`#${section.id}`}
                        className="block text-sm text-ink-500 transition hover:text-ink-900"
                      >
                        {section.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="min-w-0 space-y-14">
            {/* ── consensus ── */}
            <section id="consensus" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">
                Validators agree on evidence, not on a score
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-600">
                <p>
                  Five nodes each forming their own 0–100 opinion of the same token
                  produce 72, 73, 71, 74, 72. That is one judgement — but quantized it
                  becomes 70/75/70/75/70, and the transaction dies over a token
                  everybody read identically. Widen the tolerance and a dishonest leader
                  gets room to move the number; narrow it and honest nodes disagree.
                </p>
                <p>
                  So TokenScope never asks validators to agree on a score. It asks them
                  to agree on a <strong className="text-ink-900">feature vector</strong>:
                  29 small integers, each a bucket index. The score is a pure function of
                  that vector, so agreement on the vector <em>is</em> agreement on the
                  score — exactly, with no tolerance anywhere.
                </p>
                <div className="rounded-xl border border-hairline bg-surface p-4 font-mono text-xs text-ink-700 shadow-card">
                  Blockscout JSON → parse → raw numbers → ladder → ordinals → arithmetic
                  → score
                  <br />
                  <span className="text-ink-400">
                    {"                                          └──── consensus here ────┘"}
                  </span>
                </div>
                <p>
                  <strong className="text-ink-900">Bucket width is the consensus
                  margin.</strong>{" "}
                  USDT&rsquo;s 50 most recent transfers span <em>seconds</em>; two
                  validators fetching moments apart share almost no rows. Unique
                  counterparty counts of 87 and 91 must land on the same rung, so every
                  count is ranked onto a decade-scale ladder before it is compared.
                </p>
              </div>
            </section>

            {/* ── dimensions ── */}
            <section id="dimensions" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">The five dimensions</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Each returns points out of an available total. A source that does not
                resolve drops its terms from <em>both</em>, so a missing document
                rescales the dimension instead of silently scoring it zero — a token is
                never marked risky because an explorer had a bad minute.
              </p>
              <div className="mt-5 space-y-3">
                {DIMENSIONS.map((dimension) => {
                  const meta = DIMENSION_META[dimension];
                  return (
                    <div
                      key={dimension}
                      className="rounded-xl border border-hairline bg-surface p-4 shadow-card"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-sm font-semibold text-ink-900">
                          {meta.label}
                        </h3>
                        <span className="tabular shrink-0 rounded bg-ink-50 px-2 py-0.5 text-xs font-semibold text-ink-600">
                          {meta.weight}% of overall
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-ink-600">{meta.blurb}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink-600">
                <strong className="text-ink-900">Confidence</strong> reports how much of
                the rubric actually applied: HIGH when all five dimensions were fully
                sourced, MEDIUM at three or four, LOW below that.
              </p>
            </section>

            {/* ── rug ── */}
            <section id="rug" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">
                Rug detection is arithmetic, not opinion
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-600">
                <p>
                  Blockscout returns a verified contract&rsquo;s ABI as{" "}
                  <strong className="text-ink-900">structured JSON</strong> — 44 function
                  objects with exact names, for USDT. So the flags that matter are
                  keyword matches over a real function list, not a model reading a
                  rendered page.
                </p>
                <p>
                  Live on USDT this returns MINTABLE, PAUSABLE and HAS_BLACKLIST, and
                  each is correct: its supply control really is{" "}
                  <code className="rounded bg-ink-50 px-1 font-mono text-xs">issue</code>,
                  and its freeze is{" "}
                  <code className="rounded bg-ink-50 px-1 font-mono text-xs">pause</code>{" "}
                  plus{" "}
                  <code className="rounded bg-ink-50 px-1 font-mono text-xs">
                    addBlackList
                  </code>
                  .
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {Object.entries(FLAG_META).map(([flag, meta]) => (
                  <div
                    key={flag}
                    className="rounded-xl border border-hairline bg-surface p-4 shadow-card"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="text-sm font-semibold text-ink-900">{meta.title}</h3>
                      <code className="rounded bg-danger-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-danger-700">
                        {flag}
                      </code>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                      {meta.detail}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-xl border border-ink-200 bg-ink-50 p-5">
                <h3 className="text-sm font-semibold text-ink-900">
                  Where the model is used — and the bound on it
                </h3>
                <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-ink-600">
                  <p>
                    Almost nowhere. Every count, timestamp, balance and flag is parsed by
                    pure Python. The model gets the one job a keyword table cannot do:
                    the <strong className="text-ink-900">residue</strong> — the
                    state-changing, non-standard functions no table recognised. That is
                    where danger actually hides; a keyword list written without USDT in
                    front of it would have missed{" "}
                    <code className="rounded bg-surface px-1 font-mono text-xs">issue</code>.
                  </p>
                  <p>
                    Three yes/no questions, each requiring a function name copied
                    verbatim from the list — an invented name is dropped — collapsed to a
                    0–2 ordinal.
                  </p>
                  <p className="rounded-lg border border-ink-200 bg-surface p-3">
                    It is worth <strong className="text-ink-900">15 of
                    verification&rsquo;s 100 points</strong>, and verification is 20% of
                    overall: <strong className="text-ink-900">the model can move at
                    most 3 points out of 100</strong>, and can raise the rug level no
                    higher than MEDIUM. Both bounds are asserted by tests in the
                    repository.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-warn-500/25 bg-warn-50 p-5">
                <h3 className="text-sm font-semibold text-warn-700">
                  One honest limit: &ldquo;ownership renounced&rdquo;
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-warn-700/90">
                  Blockscout exposes no way to read a contract&rsquo;s <em>current</em>{" "}
                  owner — its read-methods endpoint is a 404. So TokenScope does not
                  claim to know that ownership was renounced. It reports the checkable
                  fact instead: whether the ABI has an owner, admin, governance or
                  authority function at all, surfaced as{" "}
                  <code className="rounded bg-surface px-1 font-mono text-xs">
                    no_owner_surface
                  </code>
                  . That is weaker than reading{" "}
                  <code className="rounded bg-surface px-1 font-mono text-xs">
                    owner() == 0x0
                  </code>
                  , and it is labelled as the weaker thing.
                </p>
              </div>
            </section>

            {/* ── chains ── */}
            <section id="chains" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">Multi-chain support</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Blockscout serves an identical schema on every host, so one extraction
                path covers all four chains. Where a host&rsquo;s data is degraded,
                TokenScope refuses rather than scoring on partial evidence.
              </p>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-ink-400">
                Current data-source status
              </h3>
              <div className="mt-3 space-y-3">
                {CHAINS.map((chain) => (
                  <div
                    key={chain.id}
                    className="flex items-start gap-3 rounded-xl border border-hairline bg-surface p-4 shadow-card"
                  >
                    <ChainMark chain={chain.id} size={28} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink-900">
                          {chain.label}
                        </h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            chain.healthy
                              ? "bg-safe-50 text-safe-700"
                              : "bg-warn-50 text-warn-700"
                          }`}
                        >
                          {chain.healthy ? "Scoring" : "Source degraded"}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-ink-400">
                        {chain.explorer}
                      </p>
                      {chain.note ? (
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                          {chain.note}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-hairline bg-surface p-4 text-sm leading-relaxed text-ink-600 shadow-card">
                <p>
                  Why a degraded source means a refusal rather than a partial score:{" "}
                  <code className="rounded bg-ink-50 px-1 font-mono text-xs">
                    src_holders
                  </code>{" "}
                  is part of the consensus vector. If one validator gets a 200 and
                  another a 524, they produce different vectors for the same token and
                  the round can never converge. A 4xx is a deterministic absence and is
                  safe to bucket; a 5xx is a broken server, so it fails the whole request
                  and every node fails the same way.
                </p>
              </div>
            </section>

            {/* ── developers ── */}
            <section id="developers" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">For developers</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Reads are free and callable from any contract. There are two ways to
                consume the oracle and only one of them is safe to act on.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-hairline bg-surface p-4 shadow-card">
                  <h3 className="text-sm font-semibold text-ink-900">
                    Describing — non-reverting
                  </h3>
                  <pre className="mt-2.5 overflow-x-auto rounded-lg bg-ink-900 p-3 font-mono text-[11px] leading-relaxed text-ink-100">
{`get_risk(token, chain)
is_safe(token, chain, min_score)
check_rug_pull(token, chain)`}
                  </pre>
                  <p className="mt-2.5 text-xs leading-relaxed text-ink-600">
                    Answers &ldquo;what do you know?&rdquo;. Degrades to{" "}
                    <code className="font-mono">found: false</code> for a token that was
                    never scored. Right for a UI or a listing.
                  </p>
                </div>

                <div className="rounded-xl border border-ink-300 bg-surface p-4 shadow-card ring-2 ring-ink-500/10">
                  <h3 className="text-sm font-semibold text-ink-900">
                    Acting — <span className="text-danger-600">reverts</span>
                  </h3>
                  <pre className="mt-2.5 overflow-x-auto rounded-lg bg-ink-900 p-3 font-mono text-[11px] leading-relaxed text-ink-100">
{`require_safe(
  token, chain,
  min_score,
  max_age_seconds,
  max_rug_level
)`}
                  </pre>
                  <p className="mt-2.5 text-xs leading-relaxed text-ink-600">
                    Answers &ldquo;may I act on this?&rdquo; and refuses to return at all
                    on a missing, stale, low or rug-flagged score. Right for anything
                    that moves capital.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-hairline bg-surface p-4 shadow-card">
                <h3 className="text-sm font-semibold text-ink-900">
                  RiskConsumer — a worked example
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                  A DEX listing gate that stores no scores and has no scoring code.{" "}
                  <code className="rounded bg-ink-50 px-1 font-mono text-xs">
                    list_token
                  </code>{" "}
                  goes through{" "}
                  <code className="rounded bg-ink-50 px-1 font-mono text-xs">
                    require_safe
                  </code>
                  , so there is no branch that can forget to handle a missing score.{" "}
                  <code className="rounded bg-ink-50 px-1 font-mono text-xs">
                    guard_trade
                  </code>{" "}
                  re-reads the oracle on <em>every trade</em> rather than trusting the
                  tier frozen at listing time.
                </p>
                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex flex-wrap gap-2">
                    <dt className="text-ink-400">Oracle ({NETWORK_LABEL})</dt>
                    <dd className="break-all font-mono text-ink-700">{CONTRACT_ADDRESS}</dd>
                  </div>
                  {CONSUMER_ADDRESS ? (
                    <div className="flex flex-wrap gap-2">
                      <dt className="text-ink-400">RiskConsumer</dt>
                      <dd className="break-all font-mono text-ink-700">
                        {CONSUMER_ADDRESS}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href="/docs/api"
                    className="rounded-lg bg-ink-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-700"
                  >
                    Full API reference
                  </Link>
                  <a
                    href="https://github.com/kenil1710/tokenscope/blob/main/contracts/RiskConsumer.py"
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-ink-300"
                  >
                    Read RiskConsumer.py
                  </a>
                </div>
              </div>
            </section>

            {/* ── faq ── */}
            <section id="faq" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">FAQ</h2>
              <div className="mt-4 space-y-3">
                {[
                  {
                    q: "Does a high score mean a token is safe to buy?",
                    a: "No. It means the public on-chain data looks healthy on five specific axes. TokenScope cannot see off-chain risk, team intent, or a liquidity pool that gets pulled tomorrow. Read the rug findings, not just the number.",
                  },
                  {
                    q: "Why does USDT only score 86?",
                    a: "Because it is genuinely mintable, pausable and blacklist-capable — all three are real functions in its verified source. The badge is MODERATE_RISK rather than VERIFIED_SAFE for exactly that reason. A rubric that gave the largest stablecoin a 100 would be measuring popularity, not risk.",
                  },
                  {
                    q: "Why does my scan take a minute?",
                    a: "Every validator independently fetches the token's record from Blockscout — up to five documents — buckets it, and must match every other validator's vector exactly. That is the cost of an answer no single node can forge.",
                  },
                  {
                    q: "What happens if a scan fails?",
                    a: "The contract answers a refusal as a return value rather than a revert, and credits your fee back as a claimable refund. A payable call that raises would keep the deposit with no record to refund it from, so no path in request_risk raises once value is attached.",
                  },
                  {
                    q: "Can the owner change a score?",
                    a: "No. Weights, ladders and point tables are module constants, not storage — no setter touches them. The owner can set the fee within 0–0.1 GEN, pause new scoring, transfer ownership and withdraw fees. Every one of those is logged on-chain.",
                  },
                  {
                    q: "How do I check the oracle isn't lying?",
                    a: "Call verify_risk(score_id), or press Re-verify on any token page. It recomputes all five dimensions, the rug level, the badge and the content hash from the stored evidence alone and reports any field that disagrees with storage.",
                  },
                ].map((item) => (
                  <details
                    key={item.q}
                    className="group rounded-xl border border-hairline bg-surface p-4 shadow-card"
                  >
                    <summary className="cursor-pointer list-none text-sm font-semibold text-ink-900 marker:hidden">
                      <span className="flex items-center justify-between gap-3">
                        {item.q}
                        <span className="shrink-0 text-ink-300 transition group-open:rotate-45">
                          +
                        </span>
                      </span>
                    </summary>
                    <p className="mt-2.5 text-sm leading-relaxed text-ink-600">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>

            <div className="rounded-2xl border border-hairline bg-surface p-6 text-center shadow-card">
              <p className="text-sm font-semibold text-ink-900">Ready to check a token?</p>
              <Link
                href="/scan"
                className="mt-3 inline-block rounded-xl bg-ink-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-700"
              >
                Scan a token
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
