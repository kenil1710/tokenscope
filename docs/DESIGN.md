# TokenScope — design

On-chain, multi-chain ERC-20 risk assessment for GenLayer. Submit a token
address and a chain; validators independently fetch the token's public record
from that chain's Blockscout instance, reduce it to a feature vector of coarse
ordinals, and agree on the vector. Every score is arithmetic over the agreed
vector, recomputed after consensus and re-checkable years later.

Measured source shapes: [PROBE.md](PROBE.md).

---

## 1. The problem with scoring anything by consensus

The obvious design is: each validator reads the token, forms a 0–100 risk
opinion, and the network takes the median. It does not work.

Five nodes reading the same token produce 72, 73, 71, 74, 72. Those are the same
judgement. Quantized to steps of 5 they become 70, 75, 70, 75, 70 — and a
transaction dies over a token everybody read identically. Widen the tolerance and
a dishonest leader gets room to move the number; narrow it and honest nodes
disagree. There is no setting that is both safe and live.

TokenScope never asks validators to agree on a score. It asks them to agree on a
**feature vector**: 32 small integers, each a bucket index. The score is a pure
function of the vector, so agreement on the vector *is* agreement on the score,
exactly and with no tolerance anywhere.

```
Blockscout JSON ──parse──▶ raw numbers ──ladder──▶ ordinals ──arithmetic──▶ score
                                                   └──── consensus here ────┘
```

Everything left of the ordinals is untrusted input. Everything right of it is
deterministic integer arithmetic that every node, and every later reader, can
reproduce.

## 2. Bucket width IS the consensus margin

This is the whole reason the design works, and the probe is what set the widths.

USDT's 50 most recent transfers **span seconds**. Two validators fetching moments
apart share almost no rows. Its holder count moves continuously; its market cap
changes every block. If any of those reached consensus as a number, no two nodes
would ever match.

So every count is ranked onto a decade-scale ladder before it is compared:

| Quantity | Ladder | Why this width |
|---|---|---|
| holders | 10 / 100 / 1k / 10k / 100k / 1M | decades — 17,542,142 and 17,542,150 are the same rung |
| market cap | 1e5 … 1e9 USD | moves every block |
| unique counterparties | 2 / 5 / 15 / 30 / 60 | two disjoint 50-row windows give 87 and 91; both land on the top rung |
| transfer rate | 1 / 20 / 500 per day | a busy token's window spans seconds and a dead one's spans months — the gap is the signal, not the value |
| contract age | 7 / 30 / 90 / 365 / 1095 days | a boundary is crossed once in a token's life |
| top-holder share | 5 / 15 / 30 / 50 / 75 / 90 % | read inverted: rung 0 is the most concentrated |

A ladder is only wrong if two validators can straddle a rung on the same token.
That is why `now` is computed **once**, before the consensus block, and passed
into the task: without it two nodes seconds apart could straddle a day boundary
and disagree about a token neither read differently.

## 3. What is actually bound

The agreed object is `{features, symbol, name, scores, hash}`, and every part of
it is checked:

- **`features`** — the 32 ordinals, compared through `_canon` (sorted keys, plain
  ints) so two nodes that agree produce identical bytes.
- **`symbol` / `name`** — bound so a leader cannot relabel a record it otherwise
  reported honestly, and sanitized before comparison so an unsanitized string
  cannot pass.
- **`scores`** — recomputed by every validator from the vector and compared
  exactly. A leader that reports a vector honestly and a score dishonestly fails
  the coherence gate before any comparison happens.
- **`hash`** — `FNV-1a(chain | address | symbol | canonical vector)`. The chain
  is in there because *the same address on two chains is two different
  contracts*.

Two gates, doing different jobs:

- `_coherent(payload, chain, token)` — **pure**, so it can only reject a leader
  whose output is internally inconsistent, and can never turn an honest
  disagreement into a dead transaction. It rejects out-of-range ordinals, missing
  or invented keys, unsanitized strings, scores that do not match the vector, and
  a payload for a different token than the one requested.
- `_agrees(leader, mine)` — the consensus rule. Exact equality, no tolerance.

Post-consensus, **the leader's numbers never reach storage**. The vector is
re-scored and every stored field is derived from it:

```python
feats  = out["features"]        # what the network agreed
scores = _score(feats)          # recomputed here, not read
chash  = _digest(ch, token, symbol, feats)
rec.evidence   = _canon(feats)
rec.sources_ok = _sources(feats)   # derived, never copied from the leader
```

`_sources` is derived rather than copied for a specific reason: the `src_*` flags
are in the vector and therefore bound, but a leader's own "sources" *string*
would not be. Copying it would put one forgeable field into an otherwise fully
bound record.

## 4. The five dimensions

| Dimension | Weight | Reads | Ordinals |
|---|---|---|---|
| distribution | 25% | `/tokens/{a}/holders` | top-1 share, top-10 share, holder count, top holder is a contract |
| activity | 20% | `/tokens/{a}/transfers` | transfer count, unique counterparties, recency, rate |
| verification | 20% | `/addresses/{a}` + `/smart-contracts/{a}` | verified depth, proxy state, ABI size, licence, certification, residual owner risk |
| maturity | 15% | `/transactions/{creation_tx}` | contract age |
| liquidity | 20% | `/addresses/{a}` | holder count, market cap, 24h volume, supply outside the top 50 |

Each dimension returns `(points, points_available)`. **A source that did not
resolve drops its terms from both**, so a missing document *rescales* the
dimension instead of silently scoring it zero. A token is never marked risky
because an explorer had a bad minute — and the probe proved that happens: Base
answered HTTP 500 for a URL that returned 200 moments later.

`confidence` reports how much of the rubric actually applied: HIGH when all five
dimensions were fully sourced, MEDIUM at three or four, LOW below that.

Verification is the one dimension that rescales rather than vanishing, because
`is_verified` arrives on the *anchor* document. An unverified contract 404s on
`/smart-contracts/` — but it is still known to be unverified, and is scored as
such.

## 5. Rug detection is arithmetic, not opinion

The probe found that `/smart-contracts/{a}` returns the **ABI as structured
JSON** — 44 function objects with exact `name` fields for USDT. So the flags that
matter are keyword matches over an exact function list, not a model reading a
rendered page:

```
mintable   ← mint | issue | createtoken | generatetoken | inflate
pausable   ← pause | unpause | freeze | halt | enabletrading | ...
blacklist  ← blacklist | blocklist | denylist | setbots | seize | wipe | ...
proxy      ← proxy_type or implementations on the anchor
scam       ← Blockscout's own is_scam designation
```

Live on USDT this returns `MINTABLE, PAUSABLE, HAS_BLACKLIST` — correct, and
found by name: USDT's supply control really is `issue`, and its freeze really is
`pause` plus `addBlackList`.

The rug ladder is evaluated in a fixed order so the result is a pure function of
the vector:

```
scam flag                                          → CRITICAL
mintable + unverified + <7 days + concentrated     → CRITICAL
(mintable+concentrated) | (unverified+young) | (mintable+unverified) → HIGH
pausable | proxy | blacklist | owner_risk≥2        → MEDIUM
any flag at all                                    → LOW
none                                               → NONE
```

Two details worth stating:

- **Minting only counts against a token whose owner still exists.** A mint
  function on a contract with no ownership surface cannot be called by anybody,
  which is what renouncing is *for*.
- **`ownership_renounced` is a reading, not an inference — since 1.1.0.** The
  original probe found `/smart-contracts/{a}/methods-read` returns 404 and
  concluded the current owner was unreadable, so 1.0.0 reported only the weaker
  checkable fact: whether the ABI has an owner-shaped function at all. That was
  honest and it was also wrong in the direction that matters — PEPE *has* an
  `owner` function and *has* renounced, and the inference called it owned.
  1.1.0 reads `owner()` over the explorer's own JSON-RPC (`docs/PROBE.md`
  section 10) and reports `ownership_renounced` only when a burn address came
  back. `owner_probe` says which of the two a reader is looking at.

## 6. Where the model is used — and the bound on it

Almost nowhere, and the bound is checked by a test rather than asserted in prose.

Every count, timestamp, balance and flag is parsed by pure Python. The model gets
one job, and it is the job a keyword table genuinely cannot do: **the residue**.
After the tables have claimed every name they recognise, what is left are the
state-changing, non-standard functions nobody classified — and that is where the
danger actually hides. USDT's supply control is `issue`; a keyword list written
without USDT in front of it would have missed that.

So the residual names go to the model as three yes/no questions, each requiring a
function name copied **verbatim** from the list. A name the model invents is
dropped. The three flags collapse to a 0–2 ordinal with buckets `{0}, {1}, {2,3}`
— the top bucket is two flags wide because a narrow top bucket is where a
wavering model turns a token everybody read the same way into a dead transaction.

That ordinal is worth 15 of verification's 100 points, and verification is 20% of
overall: **the model can move at most 3 points out of 100**, and it can raise the
rug level no higher than MEDIUM. Both bounds are asserted in the test suite
(`test_the_model_moves_at_most_three_points_of_overall`,
`test_the_model_can_only_reach_medium`). It is also the entire
consensus-disagreement surface — everything else is arithmetic.

## 7. Storage

- `feeds: TreeMap[chain:address → TokenFeed]`, each with a **fixed-capacity ring
  buffer** of 12 scores. Capacity is assigned once, when the feed is created, and
  is the only assignment to that field anywhere in the contract — a lesson from
  ConsensusPrice, where a mutable capacity made the buffer's own indexing
  ambiguous.
- `boards: TreeMap[chain → ChainBoard]` — one bounded array per chain, sorted
  ascending by score. **When it overflows, entries are dropped from the middle,
  not the tail.** Both leaderboards read off the same array from opposite ends,
  so a plain top-K would make `get_riskiest_tokens` go quiet exactly as more
  risky tokens arrived.
- `id_index`, `pending`, `refund_wei`, running sums, `gov_log`.

## 8. Money and governance

Refunds are **credit, never revert**: a payable call that raises keeps the
deposit with no record to refund it from, so no path in `request_risk` raises
once value is attached. Every refusal credits the full amount back, claimable by
the sender on their own transaction (`claim_refund`). Overpayment is never
revenue. `withdraw` subtracts `refunds_owed` — other people's money — from the
withdrawable balance before anything leaves.

**No setter can move a score.** Weights, ladders and point tables are module
constants, not storage. The owner sets the fee within 0…0.1 GEN, pauses new
scoring (reads, history, verification and refunds keep working), transfers
ownership, and withdraws fees. Every call is logged to `gov_log`.

## 9. Anti-abuse

| Guard | Value |
|---|---|
| per-wallet cooldown | 300 s |
| per-token cooldown | 900 s |
| in-flight marker | 600 s TTL, clearable by anyone once expired |
| fee | 0.01 GEN default, 0.1 GEN owner ceiling |
| tokens tracked | 2,000 (tracked tokens can still be re-scored) |
| address | exactly 42 chars, `0x`, hex, not the zero address |
| chain | constant allowlist — a chain nobody probed is a schema nobody checked |

A rejection is checked **before** the rate limiter is stamped, so a malformed
request costs nothing and cannot lock a caller out.

## 10. What a reader can check

`verify_risk(score_id)` recomputes all five dimensions, the overall, the rug
level, the flags, the badge, the confidence, the content hash and the derived
source list **from `evidence` alone**, and reports which fields — if any —
disagree with storage. `get_evidence(score_id)` returns the raw vector with each
ordinal's declared ceiling, so a reader can inspect what the validators bound
without trusting the scores stored beside it.

Nothing in either path trusts anything written next to the evidence.

---

## 11. Milestone 1.1.0

Three additions. Every one of them is subject to everything above — nothing
here is exempt from the consensus rule, and nothing here asks the model
anything it was not already asked.

### 11.1 Four more rug flags, and one closed hole

The vector went from **29 ordinals to 32**: `hidden_owner`, `hold_lo` and
`src_owner`. Because `_digest` prefixes the hash with the canonical length, no
1.1.0 hash can collide with a 1.0.0 one — the prefix moved from `422` to `465`
on USDT, which is the record saying out loud that it is a different kind of
record.

| flag | decided from | ordinal |
|---|---|---|
| `HIDDEN_OWNER` | `eth_call owner()` via `/api/eth-rpc` | `hidden_owner` |
| `UNVERIFIED_SOURCE` | `is_verified` on the anchor | `verified == 0` |
| `LOW_HOLDER_COUNT` | `holders_count` on the anchor, line at 50 | `hold_lo` |
| `CONCENTRATED_SUPPLY` | top holder share, line at 50% | `top1 <= 2` |

Two of those are 1.0.0 flags under the milestone's names, and the rename was
the right call rather than a cosmetic one: adding a second flag that fires on
exactly the condition `UNVERIFIED` already fired on would double-count in every
aggregate that counts flags — including `batch_scan`'s `total_rug_flags`.
`CONCENTRATED_SUPPLY` also moved its line from the 75% rung to the 50% rung, so
it now means what its name says. The rug **ladder** still keys its severe rungs
off 75%, so loosening the flag did not loosen the verdict.

**A live owner escalates in proportion to how unestablished the token is.**
This is the part worth arguing with. USDT's owner really can mint and really
can freeze — but USDT is verified, eight years old, held by millions and not
concentrated, so `weak` is false and the live key stays a MEDIUM
centralisation finding. On a two-day-old token with forty holders and 80% in
one wallet, the same key is the rug. A ladder that read "live owner + mint →
HIGH" with no qualifier would paint `RUG_WARNING` on USDT and teach every user
to ignore the badge.

**Three response classes, and the line between two of them.** An address (or a
burn address) is an answer; so is `execution reverted`, which is how a contract
says it has no `owner()`. A **404 or 400** is a missing document — every node
POSTs identical bytes to the same URL, so both mean the same thing to all of
them, and verification rescales exactly as it does for a missing ABI.
Everything else — 401, 403, 408, 425, 429, any 5xx, and a 200 whose body
carries neither `result` nor `error` — is **transient**: this node being
refused right now, propagated so the whole round refuses and the fee comes
back.

**Two hosts, fixed order.** Blockscout's own JSON-RPC is burst-limited and a
consensus round is a burst by construction, so the probe leads with publicnode
and falls back to Blockscout. That is safe here and would not be for a scored
quantity: both read the same chain, the answer is one bit, and the order is
fixed so a round cannot split on which host answered. A refusal from the first
host is tried against the second; a refusal from both fails the round.

That line between transient and missing was in the wrong place in the first
build, which read *every* 4xx as a missing document. PEPE caught it on the first demo round: `src_owner 0`,
no `owner` in `sources_ok`, on a round where the same URL answered 200 by hand
seconds later. Five validators had been throttled together and the throttle
was being recorded as a property of the token — the precise failure the
`_try_json` docstring already warned about for `/holders`, reintroduced in a
new place.

`hidden_owner` also costs points: **10 of verification's total**, available only
when the probe resolved. Verification's availability is now 62, 72, 100 or 110
rather than 62 or 100, and `_score` rescales against whichever applies — the
same mechanism the dimension already used for a missing ABI. USDT's
verification went 75 → 70 and its overall 86 → 85 on exactly this.

### 11.2 Rescan, and a delta that stays true

`rescan_token(token_id)` is the same round as `request_risk` — same fee, same
cooldown, same consensus — and both funnel into one private `_scan`, so a
re-scan cannot drift from a first scan. A test asserts that `run_nondet_unsafe`
appears exactly once in the source.

The `token_id` is the 1-based position in the append-only `tokens` array,
issued on first sight and never reused. Naming a re-scan by an integer the
contract issued rather than by an address a human retyped matters here
specifically: a near-miss address does not fail, it silently starts a *second
feed*, and the refresh the user asked for lands somewhere they will never look.

**The previous score travels on the record.** `prev_overall` and `prev_seq` are
frozen at write time rather than looked up. The history is a 12-slot ring
buffer, and once it laps, the record a delta was measured against is gone — a
delta recomputed from the two newest *surviving* rows would quietly start
answering a different question and would never look wrong. `prev_seq == 0`
distinguishes "no previous score" from "a delta of zero", which are not the
same claim and must not render as the same sentence.

### 11.3 `batch_scan` is a read, and that is the design

Up to five addresses on one chain, sorted riskiest first, with the aggregates
computed on-chain: weighted portfolio score, flagged tokens, total rug flags,
worst finding, coverage.

It does **not** run five consensus rounds. Scoring one token is five HTTP
documents, one or two JSON-RPC calls and one model call inside a single leader
execution, repeated by every validator. Five tokens is thirty fetches in one
round — and the *single*-token round for USDT0 on Arbitrum already came back
`LEADER_TIMEOUT` several times before it settled, because that chain's
`/holders` page takes ~7.5s on its own (`deployments.json → live_scores`). A
five-token round would not be a bolder feature; it would be a round that never
settles, and a round that never settles writes nothing. The portfolio would
come back empty after five fees.

So the split is: `request_risk` and `rescan_token` buy consensus, one token per
transaction; `batch_scan` reads what consensus already agreed and does the
arithmetic across it. `unscored` names the addresses still needing a round,
which is what makes the portfolio page a loop rather than a guess.

**Weighting is by market-cap bucket**, because a pasted list of addresses
carries no balances. Equal weighting would let a dust-sized token drag a
portfolio's headline down as hard as its largest holding. `mcap` is already an
agreed ordinal, so weighting by it costs nothing and cannot be forged, and
`mean_score` is reported beside it so the weighting is never the only number on
offer.

### 11.4 What the deployable artifact cost

The three features added ~8.7 KB to the minified artifact, which would have put
it at 59,532 bytes against a 53,000-byte budget. `tools/minify_contract.py`
gained an **identifier-renaming pass** — scope-resolved, not textual — that
renames module-level privates and function locals while leaving every public
method, every public parameter, every class, every storage field, every
attribute and every string value untouched. 59,532 → 51,390.

The file used to say identifier renaming was refused. That was the right call
while it would have been a regex over the text; it is the wrong call once the
pass resolves names the way Python does. Two bugs it shipped on the first
attempt, both caught by the existing suite before any deploy: `except X as e`
binds a name that is not a `Name` node, and a nested `def` binds its own
identifier in the enclosing scope. `TestDeployableArtifact` re-runs the entire
battery through the renamed module and asserts identical output, and the
minifier writes a name map beside the artifact so the tests can still reach
`_score` under whatever it is now called.
