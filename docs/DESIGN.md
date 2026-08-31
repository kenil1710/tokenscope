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
**feature vector**: 29 small integers, each a bucket index. The score is a pure
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

- **`features`** — the 29 ordinals, compared through `_canon` (sorted keys, plain
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
- **`ownership_renounced` is reported honestly.** Blockscout exposes no way to
  read a contract's current owner — its read-methods endpoint is a 404 — so the
  contract does not claim to know that ownership was renounced. It reports the
  checkable fact: whether the ABI has an owner, admin, governance or authority
  function at all. The field is surfaced as `no_owner_surface`.

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
