# TokenScope

**On-chain, multi-chain ERC-20 risk assessment for GenLayer.**

Submit any ERC-20 address and a chain. Validators independently fetch the
token's public record from that chain's Blockscout instance, reduce it to a
feature vector of coarse ordinals, and agree on **the vector** — never on a
score. Every number is arithmetic over the agreed vector, recomputed after
consensus, and re-checkable by anyone years later.

Any contract can then ask, for free: *is this token safe to list, to price, to
accept as collateral?*

- Design: [`docs/DESIGN.md`](docs/DESIGN.md)
- Measured source shapes: [`docs/PROBE.md`](docs/PROBE.md)
- Deployments and checksums: [`deployments.json`](deployments.json)

---

## Live

| | Studionet | Bradbury |
|---|---|---|
| **TokenScope** | `0x301DC59624F858B33032787873B0E76f248aD6be` | `0xf8CbC28B0Dc68aC123b46d954F6a8f5B6c9396Bc` |
| **RiskConsumer** | `0x8501A6DAECe5C7695527D425b464eBCc0C299645` | `0x2CF70Abc62276F6FCBdd545899d57f699b6c37Ff` |

Both networks run the **same artifact** — `shasum -a 256 build/TokenScope.min.py`
→ `93ea8a1e…`, or `genlayer code <address> | diff - build/TokenScope.min.py`.

Chains scored: **ethereum, base, arbitrum, polygon** — one Blockscout schema,
four hosts.

```bash
genlayer call  <oracle> get_config
genlayer write <oracle> request_risk --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum
genlayer call  <oracle> get_risk     --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum
genlayer call  <oracle> verify_risk  --args 1
```

## Real output — USDT on Ethereum

Verbatim from `get_risk`:

```json
{ "symbol": "USDT", "name": "Tether", "chain": "ethereum",
  "overall_score": 86, "confidence": "HIGH",
  "distribution_score": 70, "activity_score": 100, "verification_score": 75,
  "maturity_score": 100, "liquidity_score": 95,
  "rug_level": "MEDIUM",
  "rug_flags": ["MINTABLE", "PAUSABLE", "HAS_BLACKLIST"],
  "badge": "MODERATE_RISK",
  "content_hash": "422:d4c68f52cadab4c8",
  "sources_ok": "address,contract,creation,holders,transfers" }
```

`PEPE` on the same oracle scores **87** with a single flag, `HAS_BLACKLIST`, and
`distribution_score: 80` — a very different shape from USDT's, from the same
rubric.

Those three USDT rug flags are **correct and found by name**, not guessed: USDT's
supply control really is `issue`, and its freeze really is `pause` plus
`addBlackList` / `destroyBlackFunds`. A token can be mature, liquid, widely held
and *still* be one owner call from worthless — which is why the badge is
`MODERATE_RISK` and not `VERIFIED_SAFE` despite an 86.

The agreed feature vector behind that score (`get_evidence`):

```json
{"age":5,"blacklist":1,"certified":0,"hold_ct":6,"license":0,"mcap":5,
 "methods":2,"mintable":1,"owner_risk":0,"pausable":1,"proxy_v":2,
 "renounced":0,"scam":0,"src_abi":1,"src_addr":1,"src_created":1,
 "src_holders":1,"src_transfers":1,"supply_d":2,"top1":4,"top10":3,
 "top1_ctr":0,"uniq":5,"upgradeable":0,"verified":1,"vol24":5,
 "xfer_ct":5,"xfer_rate":3,"xfer_rec":4}
```

29 small integers. That is the entire consensus surface.

### Cross-network determinism

Scoring USDT on **Bradbury** produced `content_hash 422:d4c68f52cadab4c8` and
`overall 86` — byte-identical to the Studionet record written minutes earlier by
a **different validator set**. The vector, not the network, decides the score.

### Comparison, leaderboards and stats — all live

`compare_tokens(USDT, PEPE, ethereum)` needs no consensus round and costs
nothing; it reads two existing records:

```json
{ "safer": "b", "reason": "overall 86 vs 87", "overall_delta": -1,
  "dimensions": [
    {"dimension":"distribution",  "a":70,  "b":80,  "delta":-10, "winner":"b"},
    {"dimension":"activity",      "a":100, "b":95,  "delta":5,   "winner":"a"},
    {"dimension":"verification",  "a":75,  "b":75,  "delta":0,   "winner":"tie"},
    {"dimension":"maturity",      "a":100, "b":100, "delta":0,   "winner":"tie"},
    {"dimension":"liquidity",     "a":95,  "b":90,  "delta":5,   "winner":"a"}]}
```

Both tokens sit at `MEDIUM`, so the verdict falls through to the point total. Had
either carried a `HIGH` or `CRITICAL` finding, the rug level would have decided
it regardless of the score.

`get_safest_tokens(ethereum, 5)` ranks PEPE 1, USDT 2;
`get_riskiest_tokens(ethereum, 5)` returns the same two in the opposite order —
one bounded array, read from both ends.

`get_stats()`:

```json
{ "tokens_tracked": 2, "total_scored": 2, "avg_overall": 86,
  "avg_distribution": 75, "avg_activity": 97, "avg_verification": 75,
  "avg_maturity": 100, "avg_liquidity": 92,
  "rug_levels": {"NONE":0, "LOW":0, "MEDIUM":2, "HIGH":0, "CRITICAL":0},
  "chains": [{"chain":"ethereum","tokens_tracked":2,"board_size":2}, ...] }
```

## Why a feature vector

Five validators each forming a 0–100 opinion of the same token produce 72, 73,
71, 74, 72. That is one judgement — but quantized it becomes 70/75/70/75/70, and
the transaction dies over a token everybody read identically. Widen the tolerance
and a dishonest leader gets room to move the number; narrow it and honest nodes
disagree.

So validators never compare scores. They compare 29 bucket indices, exactly, with
no tolerance anywhere:

```
Blockscout JSON ──parse──▶ raw numbers ──ladder──▶ ordinals ──arithmetic──▶ score
                                                   └──── consensus here ────┘
```

**Bucket width IS the consensus margin.** USDT's 50 most recent transfers span
*seconds*; two validators share almost no rows. Unique-counterparty counts of 87
and 91 must land on the same rung, so every count is ranked onto a decade-scale
ladder before it is compared. `now` is computed once, before the consensus block,
so two nodes cannot straddle a day boundary on a token neither read differently.

## The probe came first

Before a line of the contract was written, a throwaway contract
([`contracts/_render_probe.py`](contracts/_render_probe.py)) was deployed to
Studionet to ask what Blockscout actually returns. It changed the design four
times — full findings in [`docs/PROBE.md`](docs/PROBE.md):

1. **`?type=ERC-20` is a 422**, not a filter. `{"detail":"Unexpected field:
   type"}`. Dropping it returns 200 with 100 KB. Rows are filtered on
   `token_type` in Python instead.
2. **`/addresses/{a}` embeds the entire token document** plus `is_verified`,
   `is_scam`, `proxy_type` and `implementations` — in 1.1 KB. So it is the anchor
   fetch, and its `token: null` *is* the ERC-20 check.
3. **`/smart-contracts/{a}` returns the ABI as structured JSON.** The plan was
   for a model to read method names off a page. It does not have to: 44 function
   objects with exact `name` fields arrive as parseable JSON, so every rug flag
   is decided by pure Python.
4. **Base answered HTTP 500 for a URL that returned 200 moments later.** So a
   5xx is `[TRANSIENT]` and fails the request; only a 4xx is read as a real
   absence. Letting a blip score a healthy token as dead is exactly the silent
   corruption this contract exists to prevent.

A second visit during end-to-end testing found the sharper version of that
lesson, and a genuine bug — see [below](#a-flaky-endpoint-is-not-a-missing-one).

## Features

**Five dimensions**, weighted, each rescaling rather than zeroing when a source
does not resolve:

| Dimension | Weight | What it measures |
|---|---|---|
| distribution | 25% | top-1 / top-10 share, holder count, whether the top holder is a contract |
| activity | 20% | transfer count, unique counterparties, recency, rate |
| verification | 20% | verified depth, proxy state, ABI size, licence, residual owner risk |
| maturity | 15% | contract age from the creation transaction's own timestamp |
| liquidity | 20% | holder count, market cap, 24h volume, supply outside the top 50 |

**Rug detection** — `mintable`, `pausable`, `has_blacklist`, `is_proxy`,
`no_owner_surface`, plus Blockscout's own `is_scam`, laddered to
`NONE / LOW / MEDIUM / HIGH / CRITICAL`.

**Risk history** — a fixed-capacity 12-slot ring buffer per token, with
`get_risk_trend` → `IMPROVING / STABLE / DEGRADING / NEW`.

**Leaderboards** — `get_safest_tokens` and `get_riskiest_tokens`, per chain. Both
read off one bounded array, and when it overflows entries are dropped **from the
middle, not the tail** — a plain top-K would make the riskiest list go quiet
exactly as more risky tokens arrived.

**Badge** — `VERIFIED_SAFE / MODERATE_RISK / HIGH_RISK / RUG_WARNING / UNSCORED`,
a pure function of the latest score and its rug level.

**Comparison** — `compare_tokens(a, b, chain)` gives a side-by-side on all five
dimensions with a winner per dimension. A rug finding outranks a point total.

**Composability** — [`contracts/RiskConsumer.py`](contracts/RiskConsumer.py), a
DEX listing gate. See below.

## Honest limits

- **`ownership_renounced` is not what it sounds like, and the contract says so.**
  Blockscout exposes no way to read a contract's *current* owner — its
  read-methods endpoint is a 404. So TokenScope does not claim to know that
  ownership was renounced. It reports the checkable fact: whether the ABI has an
  owner, admin, governance or authority function at all, surfaced as
  `no_owner_surface`. That is weaker than reading `owner() == 0x0`, and it is
  labelled as the weaker thing.
- **Keyword tables can miss a creatively-named function.** That is precisely why
  the residue goes to the model (below) rather than being assumed safe.
- **A very large verified contract can exceed the 800 KB fetch cap.** Its ABI
  terms then drop and verification *rescales* — but `is_verified` still arrives
  on the anchor, so an unverified contract is never mistaken for a verified one.
- **Leaderboards past 40 tokens per chain hold the two tails**, not the middle.
- **Base and Polygon cannot be scored right now, and the contract says so
  rather than guessing.** Blockscout's `/holders` endpoint on those two hosts is
  returning 500 and Cloudflare 524 (see below). Ethereum and Arbitrum are
  unaffected. Requests for tokens on the broken chains are **refused with a
  refund**, not scored on partial data.

### A flaky endpoint is not a missing one

USDC on Base and USDT on Polygon both failed to score while Ethereum succeeded
twice. Re-probing found the cause upstream:

| Chain | `/addresses/{a}` | `/tokens/{a}/holders` |
|---|---|---|
| ethereum | 200 | **200** |
| arbitrum | 200 | **200** |
| polygon | 200 | **524** (Cloudflare origin timeout, after ~100 s) |
| base | 200 | **500**, **500**, then **524** |

But the *hang* was a bug in this contract. Optional sources were wrapped in a
catch-all that turned any failure into "this source did not resolve" — and
`src_holders` is part of the consensus vector. A flaky 5xx therefore made one of
the agreed ordinals **node-dependent**: a validator that got 200 and one that
got 524 produced different vectors for the same token, the round could not
converge, and the request hung until the client gave up.

The two failure kinds are not alike and are now separated:

- **4xx — a deterministic absence.** Every node sees the same 404, so bucketing
  it as a missing source is safe and the dimension rescales as designed. This is
  the normal path for an unverified contract, whose `/smart-contracts/` is a 404.
- **5xx or unparseable — a broken server.** Node-dependent by nature, so it
  **propagates** and fails the whole request. Every node fails identically,
  `_handle_leader_error` matches on the error class, and the network settles on
  one clean refusal in a single round.

Live, on Base, after the fix — **37 seconds**, down from a 10-minute hang:

```json
{ "status": "REJECTED", "reason": "[TRANSIENT] http 500", "refund_wei": 0 }
```

Refusing to answer is the correct behaviour for an oracle whose entire value is
that two nodes cannot disagree.

## Where the model is used

Almost nowhere, by design — and the bound is asserted by tests, not by prose.

Every count, timestamp, balance and flag is parsed by pure Python. The ABI gives
exact function names, so `mintable` / `pausable` / `has_blacklist` are keyword
matches. The model gets the one job a keyword table cannot do: **the residue** —
the state-changing, non-standard functions no table recognised. That is where
danger actually hides; USDT's supply control is `issue`, and a keyword list
written without USDT in front of it would have missed it.

Three yes/no questions, each requiring a function name copied **verbatim** from
the list (an invented name is dropped), collapsed to a 0–2 ordinal with buckets
`{0}, {1}, {2,3}`.

> It is worth **15 of verification's 100 points**, and verification is 20% of
> overall: **the model can move at most 3 points out of 100**, and can raise the
> rug level no higher than `MEDIUM`.

Both bounds are checked in the suite
(`test_the_model_moves_at_most_three_points_of_overall`,
`test_the_model_can_only_reach_medium`). It is also the *entire*
consensus-disagreement surface.

## Composability — RiskConsumer

A DEX listing gate that stores no scores and has no scoring code. The whole
example is one distinction:

```python
# describing — non-reverting, degrades to a reason. For a UI.
preview_listing(token, chain)   ->  get_risk() / check_rug_pull()

# acting — REVERTS on missing, stale, low or rug-flagged. For capital.
list_token(token, chain)        ->  require_safe()
```

A venue that lists through the first form eventually lists a token on a score
that was never written or went stale months ago. `guard_trade` goes further and
**re-reads the oracle on every trade** rather than trusting the tier frozen at
listing time — a token listed as blue-chip a month ago may have been re-scored
since, which is the whole reason the oracle keeps history.

The gate checks score **and** rug level, because they fail differently: a 40 is
merely unproven; an 85 with a `CRITICAL` rug level looks excellent on every
dimension while the owner can still mint unlimited supply into it.

Live, on Bradbury — `list_token(USDT, ethereum)` through `require_safe`:

```json
{ "symbol": "USDT", "overall": 86, "rug_level": "MEDIUM",
  "tier": "blue_chip", "trade_cap": 10000000, "score_id": 1 }
```

And the two paths on a token the oracle has never scored, which is the whole
point of the distinction:

```
list_token(...)      ->  reverts: [EXPECTED] no score for ethereum:0x5149…86ca
preview_listing(...) ->  {"listable": false, "reason": "never scored",
                          "badge": "UNSCORED",
                          "hint": "call request_risk on the oracle first"}
```

## Verifiability

`verify_risk(score_id)` recomputes all five dimensions, the overall, the rug
level, the flags, the badge, the confidence, the content hash and the derived
source list **from stored evidence alone**, and reports which fields — if any —
disagree with storage. Nothing in that path trusts anything written beside the
evidence.

Live, on the PEPE record above:

```json
{ "valid": true, "failed": [], "content_hash": "422:28e4f85588019150",
  "recomputed": { "distribution": 80, "activity": 95, "verification": 75,
                  "maturity": 100, "liquidity": 90, "overall": 87,
                  "rug_level": "MEDIUM", "rug_flags": ["HAS_BLACKLIST"],
                  "badge": "MODERATE_RISK", "confidence": "HIGH" } }
```

All thirteen checks pass: the record reproduces itself from its own 29 integers.

Governance cannot move a score. Weights, ladders and point tables are module
constants, not storage. The owner sets the fee (0…0.1 GEN), pauses new scoring
(reads, history and refunds keep working), transfers ownership, and withdraws
fees minus `refunds_owed`. Every call is logged.

## Anti-abuse

300 s per-wallet cooldown · 900 s per-token cooldown · 600 s in-flight TTL,
clearable by anyone once expired · 0.01 GEN fee, 0.1 GEN ceiling · 2,000 tokens
tracked · addresses validated to 42 hex chars · chains from a constant allowlist.
A malformed request is rejected **before** the rate limiter is stamped, so it
costs nothing and cannot lock a caller out.

Refunds are **credit, never revert**: a payable call that raises keeps the
deposit with no record to refund it from, so no path in `request_risk` raises
once value is attached.

## Tests

```bash
python3 test/test_logic.py
# 107 tests, 310 assert statements, 3,372 assertions executed
# stdlib only - no chain, no network, no model, no genlayer install
```

The count is higher than the statements because several tests sweep the whole
ordinal lattice: every feature key, over its entire declared range, asserting
that no combination can produce an out-of-range dimension, a non-multiple of 5,
or an unknown rug level.

The suite checks three separate things:

1. **The pure logic** — ladders, rubric, rug ladder, badges, the consensus rule,
   address handling, and every extraction function run against the bodies the
   probe actually captured.
2. **A static undefined-name check over the whole file, class bodies included.**
   The pure region can be exec'd, but a name error inside a `@gl.public.view`
   only fires when that view is called on-chain — which is exactly how a
   dangling `ok` in `verify_risk` reached Studionet during development. A parser
   catches it in a millisecond; a deploy catches it in ten minutes.
3. **Artifact parity** — the whole battery is re-run through
   `build/TokenScope.min.py` and asserted identical. The minified file is what
   actually deploys, so "the source is correct" is only half a claim.

### A bug the tests did not catch, and now do

Scoring PEPE on Studionet returned a clean-looking **69** whose `sources_ok` read
`address,contract,creation,transfers` — no `holders`. PEPE's total supply is
4.2 × 10³² **raw units** (supply × 10¹⁸), which overflowed a `10**30` ceiling in
the number parser. It read as `0`, which zeroed the supply, dropped the holders
page, and silently cost the token the entire 25% distribution dimension — with a
plausible score and no error anywhere.

After a separate `MAX_RAW` ceiling for raw token units, the same token on the
same block scores **87**, `sources_ok: address,contract,creation,holders,
transfers`, `distribution_score: 80`, confidence `HIGH`.

Found by running it, not by reading it — the offline suite was green through the
whole thing, because every fixture it had used a supply small enough to fit.
Pinned now by `test_a_high_supply_token_still_gets_a_distribution_score`.

## Build

```bash
python3 tools/minify_contract.py contracts/TokenScope.py  -o build/TokenScope.min.py
python3 tools/minify_contract.py contracts/RiskConsumer.py -o build/RiskConsumer.min.py
bash tools/deploy_bradbury.sh
```

The minifier strips comments, docstrings and blank lines and narrows
indentation — never renaming, reordering or touching a non-docstring string —
then asserts the public surface is unchanged. Readable source stays in git; the
artifact is what deploys.

## Method surface

**Write** — `request_risk(token, chain)` payable · `claim_refund()` ·
`clear_stale_pending(token, chain)` · owner-only: `set_fee`, `set_paused`,
`transfer_ownership`, `withdraw`

**Read** — `get_risk` · `get_risk_by_id` · `get_risk_history` · `get_risk_trend`
· `get_badge` · `is_safe` · `require_safe` · `check_rug_pull` · `compare_tokens`
· `get_safest_tokens` · `get_riskiest_tokens` · `verify_risk` · `get_evidence` ·
`get_stats` · `get_config` · `get_refund` · `get_tracked_tokens` ·
`get_governance_log`
