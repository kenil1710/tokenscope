import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { CodeBlock } from "@/components/CodeBlock";
import { CONSUMER_ADDRESS, CONTRACT_ADDRESS, NETWORK_LABEL } from "@/lib/genlayer";

export const metadata: Metadata = {
  title: "Developer API",
  description:
    "Every public method on the TokenScope contract, with working examples in genlayer-js, the GenLayer CLI and Python — plus the two rules that decide which read you should be calling.",
};

const SECTIONS = [
  { id: "start", label: "Quickstart" },
  { id: "conventions", label: "Conventions" },
  { id: "reads", label: "Read methods" },
  { id: "writes", label: "Write methods" },
  { id: "shapes", label: "Response shapes" },
  { id: "recipes", label: "Integration recipes" },
  { id: "limits", label: "Limits and errors" },
];

type Method = {
  name: string;
  args: string;
  returns: string;
  blurb: string;
  danger?: boolean;
};

const READS: Method[] = [
  {
    name: "get_risk",
    args: "token_address: str, chain: str",
    returns: "record | {found: false}",
    blurb:
      "The latest stored record. `found: false` is a normal answer — most addresses have never been scored.",
  },
  {
    name: "get_risk_by_id",
    args: "score_id: int",
    returns: "record | {found: false}",
    blurb: "The same record addressed by its global score id rather than by token and chain.",
  },
  {
    name: "get_risk_history",
    args: "token_address: str, chain: str, count: int",
    returns: "{scores: record[], best_overall, worst_overall, capacity, …}",
    blurb: "Up to 12 stored scores, newest first, with the best and worst across the window.",
  },
  {
    name: "get_risk_trend",
    args: "token_address: str, chain: str",
    returns: "{trend, latest_overall, previous_overall, delta, window_delta, samples}",
    blurb: "IMPROVING / STABLE / DEGRADING / NEW, computed from the stored history.",
  },
  {
    name: "get_badge",
    args: "token_address: str, chain: str",
    returns: "{badge, overall_score, rug_level, rug_flags, confidence}",
    blurb: "The verdict alone. The cheapest read when all you need is a label.",
  },
  {
    name: "is_safe",
    args: "token_address: str, chain: str, min_score: int",
    returns: "bool",
    blurb:
      "The composability primitive. False for an unscored token rather than a raise, so any address can be asked about. HIGH or CRITICAL rug level is false regardless of score.",
  },
  {
    name: "require_safe",
    args: "token_address, chain, min_score, max_age_seconds, max_rug_level",
    returns: "record — or REVERTS",
    danger: true,
    blurb:
      "The integration point for anything that moves value. Missing, stale, low and rug-flagged are four separate refusals and all four raise, so a caller cannot forget to check.",
  },
  {
    name: "check_rug_pull",
    args: "token_address: str, chain: str",
    returns: "{rug_level, rug_flags, checks, mitigations, abi_available}",
    blurb:
      "Owner capabilities read from the verified ABI by exact function name, plus the mitigations that argue the other way.",
  },
  {
    name: "compare_tokens",
    args: "token_a: str, token_b: str, chain: str",
    returns: "{safer, reason, a, b, dimensions[], overall_delta}",
    blurb: "Two records side by side across all five dimensions, with the verdict and why.",
  },
  {
    name: "get_safest_tokens",
    args: "chain: str, count: int",
    returns: "{tokens: row[], tracked, board_size}",
    blurb: "One bounded per-chain leaderboard, read from the safe end.",
  },
  {
    name: "get_riskiest_tokens",
    args: "chain: str, count: int",
    returns: "{tokens: row[], tracked, board_size}",
    blurb: "The same array read from the other end — when it overflows, the middle is dropped so both tails survive.",
  },
  {
    name: "verify_risk",
    args: "score_id: int",
    returns: "{valid, failed[], recomputed, content_hash}",
    blurb:
      "Recomputes all five dimensions, the rug level, the badge and the hash from the stored evidence alone. This is what makes the oracle checkable rather than trusted.",
  },
  {
    name: "get_evidence",
    args: "score_id: int",
    returns: "{evidence: {…29 ordinals}, ranges, content_hash, sources_ok}",
    blurb: "The feature vector validators actually agreed on. Every score is arithmetic over this.",
  },
  {
    name: "get_watchlist",
    args: "owner_address: str",
    returns: "{tokens: row[], count, capacity, moved, unscored}",
    blurb:
      "Any address's watchlist, each entry carrying the score as it stood when it was added and how far it has moved since.",
  },
  {
    name: "get_stats",
    args: "—",
    returns: "{tokens_tracked, chains[], total_scored, avg_*, rug_levels}",
    blurb: "Registry-wide totals and per-dimension averages.",
  },
  {
    name: "get_config",
    args: "—",
    returns: "{fee_wei, weights, chains[], feature_ranges[], rate_limit_seconds, …}",
    blurb:
      "The whole rubric as data — weights, ladders, caps and feature ranges. Read this rather than hardcoding any of it.",
  },
  {
    name: "get_tracked_tokens",
    args: "—",
    returns: "{count, keys: ['chain:0x…']}",
    blurb: "Every key the contract holds. The only view that enumerates across chains.",
  },
  {
    name: "get_refund",
    args: "who: str",
    returns: "int (wei)",
    blurb: "Fee credited back to an address by a rejected request, waiting to be claimed.",
  },
  {
    name: "get_governance_log",
    args: "count: int",
    returns: "{total, entries[]}",
    blurb: "Every owner action, appended on chain — fee changes, pauses, ownership transfers.",
  },
];

const WRITES: Method[] = [
  {
    name: "request_risk",
    args: "token_address: str, chain: str — payable",
    returns: "{status: 'OK' | 'REJECTED', …}",
    blurb:
      "Runs a consensus round. Never raises once value is attached: a refusal returns REJECTED with the fee credited, because a payable call that reverts keeps the deposit with no record to refund it from.",
  },
  {
    name: "add_to_watchlist",
    args: "token_address: str, chain: str",
    returns: "{status: 'OK' | 'ALREADY_WATCHED', count, capacity}",
    blurb:
      "Free — watching is storage and nothing else, with no fetch, no validator work and no consensus round to pay for. Stores the current score as the baseline. A full list raises.",
  },
  {
    name: "remove_from_watchlist",
    args: "token_address: str, chain: str",
    returns: "{status: 'OK', count, capacity}",
    blurb: "Compacts the entry out in place. Removing something you do not watch raises.",
  },
  {
    name: "claim_refund",
    args: "—",
    returns: "int (wei paid)",
    blurb: "Withdraws whatever rejected requests credited back to the caller.",
  },
  {
    name: "clear_stale_pending",
    args: "token_address: str, chain: str",
    returns: "None",
    blurb:
      "Clears a per-token lock left behind by a round that never settled. Callable by anyone once the TTL has passed — a stuck token is everyone's problem.",
  },
];

const JS_READ = `import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const client = createClient({ chain: studionet });

// Views return parsed objects, not JSON strings.
const record = await client.readContract({
  address: "${CONTRACT_ADDRESS}",
  functionName: "get_risk",
  args: ["0xdAC17F958D2ee523a2206206994597C13D831ec7", "ethereum"],
});

if (!record.found) {
  console.log("never scored — offer a scan, do not treat as a failure");
} else {
  console.log(record.symbol, record.overall_score, record.rug_flags);
}`;

const JS_WRITE = `import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const client = createClient({
  chain: studionet,
  provider: window.ethereum,
  account,
});

const { fee_wei } = await client.readContract({
  address: "${CONTRACT_ADDRESS}",
  functionName: "get_config",
  args: [],
});

// Payable. The fee comes from get_config — never hardcode it.
const hash = await client.writeContract({
  address: "${CONTRACT_ADDRESS}",
  functionName: "request_risk",
  args: ["0x6982508145454ce325ddbe47a25d4ec3d2311933", "ethereum"],
  value: BigInt(fee_wei),
});

// The round settles asynchronously. Poll get_risk for a record newer than
// whatever existed before the request, rather than watching the receipt: a
// refusal settles just as successfully as a scan.`;

const CLI = `# Point the CLI at a network first — this setting is global, so it
# also moves any other job you have running.
genlayer network set studionet

genlayer call ${CONTRACT_ADDRESS} get_config
genlayer call ${CONTRACT_ADDRESS} get_risk \\
  --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum
genlayer call ${CONTRACT_ADDRESS} verify_risk --args 1
genlayer call ${CONTRACT_ADDRESS} get_watchlist --args 0xYourAddress

genlayer write ${CONTRACT_ADDRESS} add_to_watchlist \\
  --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum

# Confirm the deployed source is the artifact in this repository.
genlayer code ${CONTRACT_ADDRESS} | diff - build/TokenScope.min.py`;

const PY_CONSUMER = `# Calling TokenScope from another Intelligent Contract.
@gl.contract_interface
class ITokenScope:
    class View:
        def is_safe(self, token: str, chain: str, min_score: int) -> bool: ...
        def require_safe(self, token: str, chain: str, min_score: int,
                         max_age_seconds: int, max_rug_level: str
                         ) -> typing.Any: ...
    class Write:
        pass


class Listing(gl.Contract):
    oracle: str

    @gl.public.write
    def list_token(self, token: str, chain: str) -> typing.Any:
        # REVERTS on missing, stale, low or rug-flagged. There is no branch
        # here that can forget to handle a bad answer, which is the whole
        # reason to prefer require_safe over is_safe when capital moves.
        rec = ITokenScope(gl.Address(self.oracle)).view().require_safe(
            token, chain,
            min_score=70,
            max_age_seconds=86400,
            max_rug_level="MEDIUM",
        )
        return {"listed": True, "overall": rec["overall_score"]}

    @gl.public.view
    def preview_listing(self, token: str, chain: str) -> typing.Any:
        # The describing form: degrades instead of raising, so a UI can show
        # "not listable, never scored" rather than an error page.
        ok = ITokenScope(gl.Address(self.oracle)).view().is_safe(
            token, chain, 70)
        return {"listable": ok}`;

const CURL = `# Views are ordinary JSON-RPC. No key, no account, no signature.
curl -s https://studio.genlayer.com/api \\
  -H 'content-type: application/json' \\
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "gen_call",
    "params": [{
      "to": "${CONTRACT_ADDRESS}",
      "data": { "method": "get_badge",
                "args": ["0xdAC17F958D2ee523a2206206994597C13D831ec7",
                         "ethereum"] }
    }]
  }'`;

const SHAPE_RISK = `{
  "found": true,
  "score_id": 1,
  "chain": "ethereum",
  "token_address": "0xdac17f958d2ee523a2206206994597c13d831ec7",
  "symbol": "USDT",
  "name": "Tether USD",
  "explorer_url": "https://eth.blockscout.com/token/0xdAC1…",

  "distribution_score": 72,
  "activity_score": 95,
  "verification_score": 75,
  "maturity_score": 100,
  "liquidity_score": 90,
  "overall_score": 86,

  "rug_level": "MEDIUM",
  "rug_flags": ["MINTABLE", "PAUSABLE", "HAS_BLACKLIST"],
  "badge": "MODERATE_RISK",
  "confidence": "HIGH",

  "content_hash": "422:d4c68f52cadab4c8",
  "sources_ok": "anchor,abi,holders,transfers,creation",
  "scored_at": 1756612800,
  "age_seconds": 3600,
  "scorer": "0x…",
  "seq": 1,
  "rubric_version": "1.0.0"
}`;

const SHAPE_WATCH = `{
  "owner": "0x1111…1111",
  "count": 2,
  "capacity": 20,
  "moved": 1,
  "unscored": 1,
  "tokens": [
    {
      "key": "ethereum:0xdac1…1ec7",
      "chain": "ethereum",
      "token_address": "0xdac1…1ec7",
      "added_at": 1756612800,
      "baseline_overall": 70,
      "baseline_seq": 1,
      "scored": true,
      "direction": "UP",
      "delta": 16,
      "overall_score": 86,
      "badge": "MODERATE_RISK",
      "rug_level": "MEDIUM"
    },
    {
      "key": "ethereum:0xabcd…0000",
      "scored": false,
      "direction": "UNSCORED",
      "baseline_overall": 0
    }
  ]
}`;

const RECIPE_PORTFOLIO = `// Rate every ERC-20 a wallet holds.
//
// The join goes through get_tracked_tokens — ONE view that enumerates every
// key the contract holds — rather than asking about each holding in turn.
// Forty holdings become one read plus a handful, instead of forty.
const balances = await fetch(
  \`https://eth.blockscout.com/api/v2/addresses/\${wallet}/token-balances\`,
).then((r) => r.json());

const { keys } = await client.readContract({
  address: "${CONTRACT_ADDRESS}",
  functionName: "get_tracked_tokens",
  args: [],
});
const scored = new Set(keys);

const rated = balances
  .filter((b) => b.token?.type === "ERC-20")
  .filter((b) => scored.has(\`ethereum:\${b.token.address_hash.toLowerCase()}\`));`;

const RECIPE_GATE = `// A listing gate, in three lines.
//
// Do NOT cache the answer at listing time. Scores move: re-read on every
// action that moves value, which is what makes the oracle worth reading.
await client.readContract({
  address: "${CONTRACT_ADDRESS}",
  functionName: "require_safe",
  args: [token, "ethereum", 70, 86400, "MEDIUM"],
}); // throws — [EXPECTED] … — unless every condition holds`;

export default function ApiDocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <header className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            Developer reference
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-ink-900">
            The TokenScope API
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
            Every read is free, unauthenticated and callable from a browser, a script or
            another Intelligent Contract. There is no API key to obtain and no rate-limit
            tier to buy — the contract is the API, and its answers are on chain where you
            can re-derive them yourself.
          </p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-hairline bg-surface p-4 shadow-card">
              <dt className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Contract ({NETWORK_LABEL})
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-ink-800">
                {CONTRACT_ADDRESS}
              </dd>
            </div>
            <div className="rounded-xl border border-hairline bg-surface p-4 shadow-card">
              <dt className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                RiskConsumer — worked example
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-ink-800">
                {CONSUMER_ADDRESS ?? "not deployed on this network"}
              </dd>
            </div>
          </dl>
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
                    <a
                      href={`#${section.id}`}
                      className="block text-sm text-ink-500 transition hover:text-ink-900"
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ul>
              <Link
                href="/docs"
                className="mt-5 block text-sm font-medium text-ink-600 hover:text-ink-900"
              >
                ← How it works
              </Link>
            </div>
          </nav>

          <div className="min-w-0 space-y-14">
            {/* ── quickstart ── */}
            <section id="start" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">Quickstart</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Four ways in, in rough order of how often they get used. All of them talk
                to the same contract.
              </p>

              <h3 className="mt-6 text-sm font-semibold text-ink-900">
                Read a score with genlayer-js
              </h3>
              <CodeBlock
                code={JS_READ}
                language="typescript"
                caption="Views return parsed objects rather than JSON strings, so nothing here needs JSON.parse. `found: false` is an answer — the token has never been through a consensus round — and should route to an offer to scan, not to an error state."
              />

              <h3 className="mt-8 text-sm font-semibold text-ink-900">
                Request a scan (payable)
              </h3>
              <CodeBlock
                code={JS_WRITE}
                language="typescript"
                caption="The fee comes from get_config every time. Hardcoding it means the next set_fee silently breaks your integration, and the contract's ceiling on that value exists precisely so the number can change."
              />

              <h3 className="mt-8 text-sm font-semibold text-ink-900">
                From the GenLayer CLI
              </h3>
              <CodeBlock
                code={CLI}
                language="bash"
                caption="`genlayer network set` is global state on your machine, not per-invocation — switching networks mid-session will move any other job you have running."
              />

              <h3 className="mt-8 text-sm font-semibold text-ink-900">
                From another Intelligent Contract
              </h3>
              <CodeBlock
                code={PY_CONSUMER}
                language="python"
                caption="This is RiskConsumer in miniature. The full contract is in the repository and is deployed alongside the oracle on both networks."
              />

              <h3 className="mt-8 text-sm font-semibold text-ink-900">Raw JSON-RPC</h3>
              <CodeBlock
                code={CURL}
                language="bash"
                caption="Studio serves CORS headers on success but drops them on its 429s, so an exhausted rate limit reaches a browser as a phantom CORS error. From a server there is no such problem; from a browser, relay through your own origin — this app does exactly that at /api/rpc."
              />
            </section>

            {/* ── conventions ── */}
            <section id="conventions" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">Conventions</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Five rules explain nearly every response you will get back.
              </p>

              <ol className="mt-4 space-y-3">
                {[
                  {
                    t: "An address is anything that ends in one",
                    d: "A bare 0x address, or an explorer URL ending in one. Both are normalised to lowercase before anything else happens, so casing never produces two records for one token.",
                  },
                  {
                    t: "Absence is an answer, not an error",
                    d: "Describing reads degrade to found: false for a token that was never scored. Only require_safe treats absence as a refusal — because it is the only one whose caller is about to move value.",
                  },
                  {
                    t: "A payable refusal returns; it does not revert",
                    d: "request_risk answers {status: 'REJECTED', reason, refund_wei} with the fee credited. A payable call that raises keeps the deposit with no record to refund it from, so reverting there would be a way to lose money politely.",
                  },
                  {
                    t: "Every user-facing raise is prefixed",
                    d: "[EXPECTED] means a rule refused you and the message says which. [TRANSIENT] means a data source failed and the same call may well work on a retry — a Blockscout 5xx is transient, and treating it as an absence would score a healthy token as dead.",
                  },
                  {
                    t: "The rubric is data, not documentation",
                    d: "Weights, ladders, caps, chain hosts and the 29 feature ranges all come out of get_config. Read them rather than copying the numbers on this page — that is what makes a score you compute agree with the one the chain computed.",
                  },
                ].map((rule, i) => (
                  <li
                    key={rule.t}
                    className="flex gap-3 rounded-xl border border-hairline bg-surface p-4 shadow-card"
                  >
                    <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-50 text-xs font-semibold text-ink-500">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{rule.t}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-600">{rule.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* ── reads ── */}
            <section id="reads" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">Read methods</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                All <code className="rounded bg-ink-50 px-1 font-mono text-xs">@gl.public.view</code>
                : free, no signature, no account, callable from anywhere.
              </p>
              <MethodTable methods={READS} />
            </section>

            {/* ── writes ── */}
            <section id="writes" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">Write methods</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                These need a signature. Only the first is payable — and only it does any
                validator work.
              </p>
              <MethodTable methods={WRITES} />
              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                Owner-only governance —{" "}
                <code className="font-mono">set_fee</code>,{" "}
                <code className="font-mono">set_paused</code>,{" "}
                <code className="font-mono">transfer_ownership</code>,{" "}
                <code className="font-mono">withdraw</code> — is deliberately left out of
                this table. Every one of them appends to{" "}
                <code className="font-mono">get_governance_log</code>, which is the read
                that matters to an integrator: it is how you check what the owner has done
                without trusting them to tell you.
              </p>
            </section>

            {/* ── shapes ── */}
            <section id="shapes" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">Response shapes</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Real responses, trimmed only for width.
              </p>

              <h3 className="mt-6 text-sm font-semibold text-ink-900">
                get_risk — one record
              </h3>
              <CodeBlock
                code={SHAPE_RISK}
                language="json"
                caption="content_hash is the fingerprint of the agreed feature vector: 422 is the sum of the 29 ordinals and the hex is their digest. Two nodes producing the same hash produced the same evidence, which is what verify_risk re-checks."
              />

              <h3 className="mt-8 text-sm font-semibold text-ink-900">
                get_watchlist — movement against a baseline
              </h3>
              <CodeBlock
                code={SHAPE_WATCH}
                language="json"
                caption="delta is measured against the score stored when the token was added, not against the previous round. Those are different questions, and the second one answers wrong for anyone who started watching between two rounds."
              />
            </section>

            {/* ── recipes ── */}
            <section id="recipes" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">Integration recipes</h2>

              <h3 className="mt-6 text-sm font-semibold text-ink-900">
                Rate a whole wallet
              </h3>
              <CodeBlock
                code={RECIPE_PORTFOLIO}
                language="typescript"
                caption="The portfolio page in this app is this recipe. Blockscout's token-balances endpoint is unpaginated and a busy wallet answers with thousands of entries, so trim server-side before any of it reaches a browser."
              />

              <h3 className="mt-8 text-sm font-semibold text-ink-900">Gate a listing</h3>
              <CodeBlock
                code={RECIPE_GATE}
                language="typescript"
                caption="Re-read on every action that moves value. A tier frozen at listing time is a score that cannot degrade, which defeats the point of an oracle that keeps looking."
              />
            </section>

            {/* ── limits ── */}
            <section id="limits" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink-900">Limits and errors</h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    t: "Per-wallet rate limit",
                    d: "One scan request per wallet per 300s. Reads are unlimited.",
                  },
                  {
                    t: "Per-token cooldown",
                    d: "900s per token per chain, whoever asks. A second request inside the window is REJECTED with the fee credited back.",
                  },
                  {
                    t: "Watchlist capacity",
                    d: "20 tokens per address. A constant for the same reason the rate limiter is: anything an owner can raise, an owner can use to turn per-address storage into unbounded storage.",
                  },
                  {
                    t: "History depth",
                    d: "The last 12 scores per token, in a ring. Older ones are overwritten, and get_risk_history tells you the capacity so you never have to assume it.",
                  },
                  {
                    t: "Registry ceiling",
                    d: "2,000 tokens. Leaderboards are bounded at 40 per chain and drop from the middle on overflow, so both tails survive.",
                  },
                  {
                    t: "RPC rate limits",
                    d: "Studio meters per IP and answers 429 without CORS headers, which a browser reports as a CORS failure. Relay through your own origin so the real error survives.",
                  },
                ].map((limit) => (
                  <div
                    key={limit.t}
                    className="rounded-xl border border-hairline bg-surface p-4 shadow-card"
                  >
                    <p className="text-sm font-semibold text-ink-900">{limit.t}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-600">{limit.d}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-hairline bg-surface p-4 shadow-card">
                <p className="text-sm font-semibold text-ink-900">Error prefixes</p>
                <dl className="mt-3 space-y-2.5 text-xs">
                  <div>
                    <dt className="font-mono font-semibold text-ink-800">[EXPECTED] …</dt>
                    <dd className="mt-0.5 leading-relaxed text-ink-600">
                      A rule refused you — an unsupported chain, an address that is not an
                      ERC-20, a full watchlist, a score too old for{" "}
                      <code className="font-mono">require_safe</code>. Retrying the same
                      call unchanged will refuse the same way.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono font-semibold text-ink-800">[TRANSIENT] …</dt>
                    <dd className="mt-0.5 leading-relaxed text-ink-600">
                      A data source failed. Blockscout 5xx responses are transient — the
                      probe caught the same URL answering 500 and then 200 seconds apart —
                      so this is worth retrying, and is deliberately NOT scored as though
                      the token had no data.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono font-semibold text-ink-800">
                      status: &ldquo;REJECTED&rdquo;
                    </dt>
                    <dd className="mt-0.5 leading-relaxed text-ink-600">
                      Not an error at all — a successful transaction carrying a refusal,
                      with <code className="font-mono">refund_wei</code> credited. Read{" "}
                      <code className="font-mono">status</code>; do not catch.
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

            <div className="rounded-2xl border border-ink-200 bg-ink-50 p-5">
              <p className="text-sm font-semibold text-ink-900">
                Verify anything on this page
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
                The deployed bytecode is the source in the repository, and{" "}
                <code className="font-mono">genlayer code &lt;address&gt;</code> will diff
                it for you. Nothing here asks you to take the contract&rsquo;s word for
                anything —{" "}
                <code className="font-mono">verify_risk</code> re-derives every score from
                its own stored evidence.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  href="https://github.com/kenil1710/tokenscope"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-ink-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-700"
                >
                  Source on GitHub
                </a>
                <Link
                  href="/docs#consensus"
                  className="rounded-lg border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-ink-300"
                >
                  Why a feature vector
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function MethodTable({ methods }: { methods: Method[] }) {
  return (
    <div className="mt-4 space-y-2.5">
      {methods.map((method) => (
        <div
          key={method.name}
          className={`rounded-xl border bg-surface p-4 shadow-card ${
            method.danger ? "border-ink-300 ring-2 ring-ink-500/10" : "border-hairline"
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <code className="font-mono text-sm font-semibold text-ink-900">
              {method.name}
            </code>
            <code className="font-mono text-xs text-ink-400">({method.args})</code>
            <code
              className={`ml-auto font-mono text-xs ${
                method.danger ? "font-semibold text-danger-600" : "text-ink-500"
              }`}
            >
              → {method.returns}
            </code>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{method.blurb}</p>
        </div>
      ))}
    </div>
  );
}
