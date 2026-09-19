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
- **Milestone 1.1.0 changes: [below](#milestone-110)**

---

## Live

**Web app: [tokenscope-two.vercel.app](https://tokenscope-two.vercel.app)** — scan a
token, rate a pasted portfolio or a whole wallet, read a token's scoring
history round by round, keep an on-chain watchlist, browse the registry,
compare two tokens, and re-verify any score on-chain.

**Everything is on one network: GenLayer Studio Devnet, chain 61997.**
Contract, consumer, every score, and the app.

| | address |
|---|---|
| **TokenScope** 1.1.0 | `0xf68f3743f9783185C0D8C45aff20f9d712949d02` |
| **RiskConsumer** | `0x65B86007A22B06C6cdeCDF72BdA55dA8B4A92Eb1` |

```bash
genlayer network set studio-dev
genlayer call 0xf68f3743f9783185C0D8C45aff20f9d712949d02 get_config
```

Verify the deployed source against the artifact in this repository:

```bash
genlayer code 0xf68f3743f9783185C0D8C45aff20f9d712949d02 | diff - build/TokenScope.min.py
```

> **Studio Devnet runs the v0.6 contract format**, which is a different
> dialect from the one earlier deployments used: a two-line runner header,
> `import genlayer as gl`, `gl.contract.Contract`, `gl.storage.TreeMap`, and a
> fee estimate attached to every write. The port and how each difference was
> established are in [`docs/PROBE.md` §12](docs/PROBE.md).

Chains supported: **ethereum, base, arbitrum, polygon** — one Blockscout schema,
four hosts. **Ethereum and Arbitrum are scoring today**; Base and Polygon are
blocked on a broken upstream endpoint and refuse rather than guess
([details](#a-flaky-endpoint-is-not-a-missing-one)).

Scored live on Studio Devnet:

| Token | Chain | Address | Overall | Content hash | Rug flags |
|---|---|---|---:|---|---|
| USDT | ethereum | `0xdAC17F95…31ec7` | **85** | `465:96149d87575442e3` | MINTABLE, PAUSABLE, HAS_BLACKLIST, HIDDEN_OWNER |
| PEPE | ethereum | `0x69825081…11933` | **88** | `465:dc9cf40900e26bdf` | HAS_BLACKLIST |
| LINK | ethereum | `0x51491077…f986ca` | **90** | `465:3f90b2e299927c0e` | none |
| SHIB | ethereum | `0x95ad61b0…64c4ce` | **83** | `465:e96d339961dcdd26` | none |
| USDT0 | arbitrum | `0xFd086bC7…FCbb9` | **87** | `466:67bb9d6bd8cc4175` | UPGRADEABLE_PROXY, HIDDEN_OWNER |

All five with `sources_ok: address,contract,creation,holders,owner,transfers` —
every source resolved, the `owner()` probe included. Same rubric, five
different risk shapes.

That USDT hash is worth a second look. `465:96149d87575442e3` is what the
**pre-port** artifact produced, and it is what the **v0.6 port** produced here
on a different chain, under a different SDK, with a different validator set.
Moving a contract between VM dialects moved none of the 32 agreed ordinals —
which is the only claim a hash like that can make, and the one worth making.

**Arbitrum needed retries, and that is worth saying out loud.** Its `/holders`
answers 200 but takes ~7.5s for 25 KB, and five sequential fetches at that
latency can outrun the leader's budget — several rounds came back
`LEADER_TIMEOUT` before one settled. A timeout writes nothing, so the failure
mode is "ask again", not "a wrong score". That is the same rule Base and Polygon
hit harder ([details](#a-flaky-endpoint-is-not-a-missing-one)).

USDT0 also moved: **88 on the previous deployment, 89 on this one**, hash
`422:…` → `423:…`. One ordinal crossed a rung between the two scans — the sum in
the hash prefix went from 422 to 423 — which is exactly what a token's real
distribution doing something is supposed to look like.

```bash
genlayer call  <oracle> get_config
genlayer write <oracle> request_risk --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum
genlayer call  <oracle> get_risk     --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum
genlayer call  <oracle> verify_risk  --args 1
```

## One network, and the v0.6 port that took

Contract, consumer, every score and the app all sit on **Studio Devnet, chain
61997**. Previously the project was split — 1.1.0 on one Studio network, 1.0.0
on two networks at once — which meant the app read one deployment while the
docs described another. One network removes that.

Getting there meant porting to the **v0.6 contract dialect**. Every difference
below was established by deploying a probe and reading the failure, because
each of these reports an error that names neither the line nor the reason.
Full log in [`docs/PROBE.md` §12](docs/PROBE.md).

| pre-v0.6 | v0.6 |
|---|---|
| `# { "Depends": … }` | `# v0.3.0` **then** `# { "Depends": "py-genlayer:test" }` |
| `from genlayer import *` | `import genlayer as gl` + `from genlayer import *` |
| `gl.Contract` | `gl.contract.Contract` |
| `@allow_storage` | `@gl.storage.allow` |
| `TreeMap[…]`, `DynArray[…]` | `gl.storage.TreeMap[…]`, `gl.storage.DynArray[…]` |
| `gl.vm.run_nondet_unsafe` | `gl.vm.run_nondet` |
| `gl.contract_interface` | `gl.contract.interface` |
| `UserError(msg)` → `.message` | `UserError(data)` → **`.data`** |

Three of those are traps rather than renames.

**The storage names are not where the docs say.** `genlayer.__all__` lists
`TreeMap` and `DynArray`, but `from genlayer import *` does not actually bind
them — only `gl.storage.*` has them. A bare `TreeMap[...]` passes every
offline check and then fails on chain with `NameError`. A probe contract
deployed solely to enumerate the real namespace settled it, and the test
stub is now shaped to withhold exactly what the chain withholds.

**`UserError` moved its payload and reading the old attribute does not
crash** — `getattr(e, "message", "")` simply returns `""`. An empty message
would make every error-class comparison in `_handle_leader_error` succeed,
turning a leader that failed for one reason into a leader every validator
agreed with for another. There is now one `_err_text` helper instead of eight
scattered `getattr` calls, and the stub carries `.data` only so a regression
cannot pass by reading whichever attribute happens to exist.

**Every write needs a fee**, and `--fee-value` alone is not enough — the
distribution object has to go with it or the transaction reverts with
`FeeValueMustBeNonZero(1)`. `tools/deploy_studio_dev.sh` reads both out of
`genlayer estimate-fees --json`.

The runner id is the symbolic **`py-genlayer:test`**. Two pinned content
hashes were tried first and both were refused with `invalid_contract runner
malformed`; the node resolves the symbolic id and does not serve those hashes.

### What the port did not change

USDT scored through the ported contract returns `content_hash
465:96149d87575442e3` — the same fingerprint the pre-port artifact produced,
on a different chain, under a different SDK, with a different validator set.
Every storage declaration and every error type was rewritten in between and
not one of the 32 agreed ordinals moved. That is the check worth making, and
it is why the hash carries the vector's canonical length as a prefix rather
than being an opaque digest.

---

## Milestone 1.1.0

Three features on top of the accepted 1.0.0 project. Every one of them obeys
the rules 1.0.0 set: consensus binds every stored value, the leader cannot
forge one, validators compare the feature vector, no counter moves before a
revert, and a refusal refunds.

### 1 · Deeper rug detection — and a hole 1.0.0 documented but could not close

Four new flags, all deterministic checks over explorer JSON. None of them asks
the model anything.

| flag | decided from | new ordinal |
|---|---|---|
| `HIDDEN_OWNER` | `eth_call owner()` via `/api/eth-rpc` | `hidden_owner`, `src_owner` |
| `UNVERIFIED_SOURCE` | `is_verified` on the anchor | — (1.0.0's `UNVERIFIED`) |
| `LOW_HOLDER_COUNT` | `holders_count`, line at 50 | `hold_lo` |
| `CONCENTRATED_SUPPLY` | top holder share, line at 50% | — (1.0.0's `CONCENTRATED`, moved from 75%) |

`HIDDEN_OWNER` is the one that matters. 1.0.0's *Honest limits* section said
Blockscout exposes no way to read a contract's current owner, because
`/smart-contracts/{a}/methods-read` is a 404 — so `renounced` was an inference
from the ABI: *does an owner-shaped function exist at all*. **PEPE is what that
inference cost.** PEPE has an `owner` function and has renounced ownership; the
inference called it owned, which kept `MINTABLE` counting against a contract
nobody can mint from.

The original probe missed that the same explorer serves JSON-RPC one path
segment up. One `POST` answers it exactly:

```
POST https://eth.blockscout.com/api/eth-rpc
{"method":"eth_call","params":[{"to":"<token>","data":"0x8da5cb5b"},"latest"]}

USDT  → 0x…c6cde7c39eb2f0f0095f41570af89efc2c1ea828   live owner
PEPE  → 0x0000…0000                                    renounced, provably
LINK  → error 3 "execution reverted"                   no owner()
```

Three response classes, kept apart on purpose — this is the part that could
have broken consensus if done carelessly:

| response | class | effect |
|---|---|---|
| an address, or a burn address | **answer** | sets the ordinal |
| `execution reverted`, or `0x` | **answer** — the contract has no `owner()` | ABI rule stands |
| 404 — host has no `/api/eth-rpc` | **missing document** | `src_owner=0`, verification rescales |
| 5xx, or a throttle body, or unparseable | **transient** | the round fails, the fee is refunded |

That last row is not defensive coding. Blockscout answers a rate limit with
**HTTP 200** and a body carrying neither `result` nor `error`. Read as "no
owner", it would put a node-dependent bit straight into the consensus vector —
one validator gets an address, another gets throttled, and the round cannot
converge.

**Renaming rather than duplicating.** `UNVERIFIED_SOURCE` and
`CONCENTRATED_SUPPLY` are 1.0.0's flags under the milestone's names. Adding a
second flag that fires on exactly the condition `UNVERIFIED` already fired on
would double-count in every aggregate that counts flags —
`batch_scan.total_rug_flags` included. `CONCENTRATED_SUPPLY` also moved its
line from 75% to the 50% its name claims; the rug **ladder** still keys its
severe rungs off 75%, so loosening the flag did not loosen the verdict.

**A live owner escalates in proportion to how unestablished the token is.**
USDT's owner really can mint and really can freeze — but USDT is verified,
eight years old, held by millions and not concentrated, so the live key stays a
MEDIUM centralisation finding. On a two-day-old token with forty holders and
80% in one wallet, the same key is the rug. A ladder that read "live owner +
mint → HIGH" with no qualifier would paint `RUG_WARNING` on USDT and teach
every user to ignore the badge.

The flag also **costs points** — 10 of verification's total, available only
when the probe resolved. Verification's availability is now 62, 72, 100 or 110
instead of 62 or 100, rescaled the same way a missing ABI already was.

**All three response classes, live, five tokens, two chains:**

| token | chain | `owner()` answers | flags | `verification` | overall |
|---|---|---|---|---|---|
| USDT | ethereum | `0xc6cd…a828` — a live key | MINTABLE, PAUSABLE, HAS_BLACKLIST, **HIDDEN_OWNER** | 70 *(was 75)* | 85 *(86)* |
| USDT0 | arbitrum | `0x4dff…0bf8` — a live key | UPGRADEABLE_PROXY, **HIDDEN_OWNER** | 60 *(65)* | 87 *(89)* |
| PEPE | ethereum | `0x000…000` — renounced | HAS_BLACKLIST | **80** *(75)* | 88 *(87)* |
| LINK | ethereum | reverts — no `owner()` | none | 75 | 90 |
| SHIB | ethereum | reverts — no `owner()` | none | 75 | 83 |

Every one of those five has `owner` in its `sources_ok`, including the two
that reverted — because a clean `execution reverted` is an **answer**, not a
failure. They land on five different verification scores because of *what*
the answer was.

PEPE is the row the milestone exists for: `check_rug_pull` now returns
`ownership_renounced: true` with `owner_probe: true`, where 1.0.0 inferred
the opposite from the mere presence of an `owner` function. USDT0 is the row
that shows it is not an Ethereum-only arrangement — a second chain, a second
publicnode host, the same answer.

And notice what did **not** happen. The three with a 1.0.0 record — USDT,
USDT0 and PEPE — all kept the rug level they had; only the score and the flag
list moved. The other two carry no flags at all. The new flag is new
information, not new alarm, and that restraint is what the `weak` qualifier in
the ladder is for.

### 2 · Rescan and risk history

`rescan_token(token_id)` — same round, same fee, same cooldown as
`request_risk`. Both funnel into one private `_scan`, and a test asserts
`run_nondet_unsafe` appears exactly once in the source, so a re-scan cannot
drift from a first scan.

The `token_id` is the 1-based position in the append-only token list, issued on
first sight and never reused. Naming a re-scan by an integer the contract
issued matters here specifically: a mistyped address does not *fail*, it
silently starts a **second feed**, and the refresh lands somewhere the user
will never look.

**The previous score travels on the record** — `prev_overall` and `prev_seq`,
frozen at write time. History is a 12-slot ring buffer; once it laps, the
record a delta was measured against is gone, and a delta recomputed from the
surviving rows would quietly start answering a different question and would
never look wrong. `prev_seq == 0` separates *no previous score* from *a delta
of zero*, which are different claims and must not render as the same sentence.

Reads: `get_risk_history(token_id)` for every stored round with its own frozen
delta, `get_history_by_address(token, chain, count)` for callers holding only
an address. New page: **`/history/[token]`**.

Live, `rescan_token(1)` on USDT 28 minutes after its first scan:

```json
{ "score_id": 6, "seq": 2, "overall_score": 85,
  "previous_overall": 85, "risk_delta": 0, "has_previous": true,
  "content_hash": "465:96149d87575442e3" }
```

Two things in that one record. **`risk_delta: 0` with `has_previous: true` is
"unchanged"** — the first scan read `risk_delta: 0` with `has_previous:
false`, which is "nothing to compare against". Same number, different claim,
and a UI reading only the number would have told you USDT was unchanged on a
token it had never seen before.

And the re-scan reproduced **the same content hash**, 28 minutes and a second
consensus round later, on a token whose holder count and transfer window both
moved underneath it. That is the quantization absorbing real drift — a design
comparing raw percentages would have reported a change where nothing material
happened.

### 3 · Portfolio scanner

`batch_scan(addresses, chain)` — up to five tokens on one chain, riskiest
first, with `portfolio_score` (weighted), `flagged_tokens`, `total_rug_flags`,
`high_risk_tokens`, `worst_rug_level` and `coverage_pct`. New tab on
**`/portfolio`**.

#### `batch_scan` is a read, and that is the design

It does **not** run five consensus rounds. Scoring one token is five HTTP
documents, one or two JSON-RPC calls and one model call inside a single leader
execution, repeated by every validator. Five tokens is thirty fetches in one
round — and the **single**-token round for USDT0 on Arbitrum already came back
`LEADER_TIMEOUT` several times before it settled, because that chain's
`/holders` page takes ~7.5 s on its own. A five-token round would not be a
bolder feature; it would be a round that never settles, and a round that never
settles writes nothing. The portfolio would come back empty after five fees.

So: `request_risk` and `rescan_token` buy consensus, one token per transaction;
`batch_scan` reads what consensus already agreed and does the arithmetic across
it, free and composable. `unscored` names the addresses still needing a round,
which is what makes the portfolio page a loop rather than a guess.

Live, on the shipped oracle — four addresses, one of them never scanned:

```json
{ "requested": 4, "scored": 3, "coverage_pct": 75,
  "portfolio_score": 87, "mean_score": 87,
  "flagged_tokens": 2, "total_rug_flags": 5, "high_risk_tokens": 0,
  "tokens": [ {"rank": 1, "scored": false, "badge": "UNSCORED", "weight": 0},
              {"rank": 2, "symbol": "USDT", "overall_score": 85, "flag_count": 4},
              {"rank": 3, "symbol": "PEPE", "overall_score": 88, "flag_count": 1},
              {"rank": 4, "symbol": "LINK", "overall_score": 90, "flag_count": 0} ] }
```

The unscored row sorts **first**, not last. An address nobody has checked is
the one to look at first, and it carries weight 0 so it moves no aggregate —
where a zero score would have placed it beside the worst real result and said
something the oracle does not know.

**Weighted by market-cap bucket**, because a pasted list of addresses carries
no balances. Equal weighting would let a dust-sized token drag a portfolio's
headline down as hard as its largest holding. `mcap` is already an agreed
ordinal, so weighting by it costs nothing and cannot be forged — and
`mean_score` sits beside it so the weighting is never the only number offered.

### What changed for existing records

The vector went from **29 ordinals to 32**. `_digest` prefixes the hash with
the canonical length, so no 1.1.0 hash can collide with a 1.0.0 one — USDT's
prefix moved `422 → 465`, which is the record saying out loud that it is a
different kind of record. `rubric_version` is `1.1.0`.

---

## Real output — USDT on Ethereum

Verbatim from `get_risk`, rubric 1.1.0:

```json
{ "symbol": "USDT", "name": "Tether", "chain": "ethereum",
  "overall_score": 85, "confidence": "HIGH",
  "distribution_score": 70, "activity_score": 100, "verification_score": 70,
  "maturity_score": 100, "liquidity_score": 95,
  "rug_level": "MEDIUM",
  "rug_flags": ["MINTABLE", "PAUSABLE", "HAS_BLACKLIST", "HIDDEN_OWNER"],
  "badge": "MODERATE_RISK",
  "content_hash": "465:96149d87575442e3",
  "sources_ok": "address,contract,creation,holders,owner,transfers",
  "token_id": 1, "has_previous": false, "risk_delta": 0 }
```

Those four rug flags are **correct and found by name**, not guessed: USDT's
supply control really is `issue`, its freeze really is `pause` plus
`addBlackList` / `destroyBlackFunds`, and `owner()` really does answer
`0xc6cd…a828` rather than a burn address.

**What 1.1.0 changed here**, against the 1.0.0 record on the same token:

| | 1.0.0 | 1.1.0 |
|---|---|---|
| `verification_score` | 75 | **70** — a live owner costs 10 of the dimension's points |
| `overall_score` | 86 | **85** |
| `rug_flags` | 3 | **4** — `HIDDEN_OWNER` |
| `sources_ok` | 5 documents | **6** — `owner` |
| `content_hash` | `422:41a76eee24bba743` | `465:96149d87575442e3` |

The hash prefix is the canonical vector length, so it moving `422 → 465` is
the record saying out loud that it is a different kind of record. The
rug level did **not** move: USDT is verified, eight years old, widely held and
not concentrated, so the live owner key is a MEDIUM centralisation finding
rather than a rug warning. That restraint is deliberate and is covered by a
test.

By contrast, **LINK** on the same oracle: `owner()` reverts — it has no owner
function at all — so `sources_ok` still includes `owner`, `HIDDEN_OWNER` does
not fire, and it scores **91** with `rug_level: NONE` and badge
`VERIFIED_SAFE`.

The agreed feature vector behind the USDT score (`get_evidence`):

```json
{"age":5,"blacklist":1,"certified":0,"hidden_owner":1,"hold_ct":6,
 "hold_lo":0,"license":0,"mcap":5,"methods":2,"mintable":1,"owner_risk":0,
 "pausable":1,"proxy_v":2,"renounced":0,"scam":0,"src_abi":1,"src_addr":1,
 "src_created":1,"src_holders":1,"src_owner":1,"src_transfers":1,
 "supply_d":2,"top1":4,"top10":3,"top1_ctr":0,"uniq":5,"upgradeable":0,
 "verified":1,"vol24":5,"xfer_ct":5,"xfer_rate":3,"xfer_rec":4}
```

32 small integers. That is the entire consensus surface.

### Cross-network determinism — and what it does and does not claim

**1.1.0, across three independent deployments.** USDT scored through the
1.1.0 artifact returned `content_hash 465:96149d87575442e3` and `overall 85`
on Studionet deployment `0xcEC1EC8A…`, then again on `0x8F45d757…`, then again
on `0x19063FE1…` — the build this repository ships. Three deployments, three
validator sets, one fingerprint over 32 ordinals.

Worth being precise about what that does and does not prove: those three
builds differ from each other (the owner probe moved before the model call,
`batch_scan`'s cap moved after de-duplication, the 4xx classification was
corrected, and a second RPC host was added in front). **None of those changes
touched an ordinal on a round that resolved**, and the identical hash is how
that is checked rather than asserted.

**Across a VM dialect, which is the strongest version of this claim.** The
same USDT record came back `465:96149d87575442e3` from the pre-port artifact
and from the v0.6 port running here on Studio Devnet — a different chain, a
different SDK, a different validator set, and a contract whose every storage
declaration and error type was rewritten in between. Not one of the 32 agreed
ordinals moved.

**Across time, a token really does drift.** Re-scoring one an hour later can
produce a **different** hash and the **same** `overall`. In one such pair
exactly one ordinal had moved:

```
supply_d: 2  ->  3      # supply held outside the top 50 crossed the 40% rung
```

That is the design working, not failing, and it is worth being precise about
what determinism means here:

- **Within a consensus round**, every validator must produce the identical
  vector. That is enforced with no tolerance, and it is what makes a score
  agreeable at all.
- **Across time**, a token's real distribution moves, and a ladder rung
  eventually gets crossed. The record is a function of the token's state at
  `now`, not a constant.

The quantization is what kept `overall` at 86 through that drift — `supply_d` is
worth 4 of liquidity's 100 points, which the step of 5 absorbed. A design that
compared raw percentages would have reported a "change" here. This one reports
that nothing material happened, which is the truth.

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

**Rug detection — eleven flags, every one a deterministic check over explorer
JSON**, laddered to `NONE / LOW / MEDIUM / HIGH / CRITICAL`:

| flag | decided from |
|---|---|
| `EXPLORER_SCAM_FLAG` | Blockscout's own `is_scam` |
| `MINTABLE` | function names in the verified ABI |
| `PAUSABLE` | function names in the verified ABI |
| `HAS_BLACKLIST` | function names in the verified ABI |
| `UPGRADEABLE_PROXY` | `proxy_type` / `implementations` on the anchor |
| `HIDDEN_OWNER` | **`eth_call owner()`** via the explorer's JSON-RPC |
| `UNVERIFIED_SOURCE` | `is_verified` on the anchor |
| `LOW_HOLDER_COUNT` | `holders_count` on the anchor, line at 50 |
| `VERY_NEW` | the creation transaction's own timestamp |
| `CONCENTRATED_SUPPLY` | top holder share, line at 50% |
| `OWNER_PRIVILEGED_METHODS` | the one model judgement — capped at MEDIUM |

The UI explains each one: what it means, why it matters, and **which document
it was read from**, so a reader can go and check it.

**Risk history** — a fixed-capacity 12-slot ring buffer per token, with
`get_risk_trend` → `IMPROVING / STABLE / DEGRADING / NEW`,
`get_risk_history(token_id)` for every stored round, and a `risk_delta` frozen
onto each record at write time.

**Rescan** — `rescan_token(token_id)` re-scores a known token by the integer
the contract issued, rather than by an address a human retyped.

**Portfolio scanner** — `batch_scan(addresses, chain)`: up to five tokens,
sorted riskiest first, with the weighted portfolio score, flagged-token count
and total rug flags computed on-chain. It is a **read** — see
[below](#batch_scan-is-a-read-and-that-is-the-design).

**Leaderboards** — `get_safest_tokens` and `get_riskiest_tokens`, per chain. Both
read off one bounded array, and when it overflows entries are dropped **from the
middle, not the tail** — a plain top-K would make the riskiest list go quiet
exactly as more risky tokens arrived.

**Badge** — `VERIFIED_SAFE / MODERATE_RISK / HIGH_RISK / RUG_WARNING / UNSCORED`,
a pure function of the latest score and its rug level.

**Comparison** — `compare_tokens(a, b, chain)` gives a side-by-side on all five
dimensions with a winner per dimension. A rug finding outranks a point total.

**Watchlist** — `add_to_watchlist` / `remove_from_watchlist` / `get_watchlist`,
up to 20 tokens per address, stored in the contract rather than in a browser.
Free, and deliberately: watching is storage and nothing else — no fetch, no
validator work, no consensus round — so there is nothing to charge for.

Each entry keeps the overall score **as it stood when the token was added**, so
`get_watchlist` reports movement against what the watcher actually saw.
Comparing the two newest history slots instead would answer a different question
— *did the last two rounds differ* — and answer it wrong for anyone who started
watching between them. An unscored token stays in the list as `UNSCORED` rather
than being dropped; being told it is still unscored is the point of watching one.

**Composability** — [`contracts/RiskConsumer.py`](contracts/RiskConsumer.py), a
DEX listing gate. See below.

## Honest limits

- **~~`ownership_renounced` is not what it sounds like~~ — fixed in 1.1.0.**
  1.0.0 said this, and it was true: Blockscout's read-methods endpoint is a
  404, so the contract reported only whether the ABI had an owner-shaped
  function at all. PEPE is what that cost — it *has* an `owner` function and
  *has* renounced, and the inference called it owned. 1.1.0 reads `owner()`
  over the explorer's own JSON-RPC at `/api/eth-rpc` and reports
  `ownership_renounced` only when a burn address actually came back. When the
  probe does not resolve, `owner_probe` is false and the old caveat is reported
  **per record** instead of standing permanently.
- **`owner()` is read at `latest`, which is not pinned across validators.** It
  is collapsed to one bit that only moves when ownership actually transfers,
  and `is_scam`, `is_verified` and `proxy_type` are already in the vector on
  exactly these terms. A Blockscout *throttle* — HTTP 200 with neither `result`
  nor `error` — is treated as transient and fails the round rather than
  entering the vector as "no owner".
- **`LOW_HOLDER_COUNT` needs the explorer to report a count.** A chain that
  omits `holders_count` parses as 0, and "nobody holds it" and "nobody said"
  are different claims, so an absent count leaves the flag off.
- **The owner probe reads two hosts, and can still refuse.** Blockscout's
  `/api/eth-rpc` is burst-limited and a consensus round is a burst: ten
  concurrent requests drew nine 429s. So the probe leads with publicnode
  (which took the same burst with ten 200s and covers all four chains) and
  falls back to Blockscout. A second host is safe here because both read the
  same chain and the answer is one bit — it changes the odds of getting an
  answer, never the answer. If **both** refuse, the round refuses cleanly and
  the fee is refunded; it does **not** quietly record "no owner", which is the
  version of this that shipped first and that PEPE caught
  (`docs/PROBE.md` §10).
- **Keyword tables can miss a creatively-named function.** That is precisely why
  the residue goes to the model (below) rather than being assumed safe.
- **A very large verified contract can exceed the 800 KB fetch cap.** Its ABI
  terms then drop and verification *rescales* — but `is_verified` still arrives
  on the anchor, so an unverified contract is never mistaken for a verified one.
- **Leaderboards past 40 tokens per chain hold the two tails**, not the middle.
- **Base and Polygon cannot be scored right now**, because Blockscout's
  `/holders` endpoint on those two hosts is returning 500 / Cloudflare 524 (see
  below). Base refuses cleanly in ~37 s; Polygon's round outlives the CLI
  timeout because its 524 arrives only after a ~100 s stall. **Neither ever
  writes a score** — the tokens stay `UNSCORED` and `get_stats` shows zero
  tracked on both chains. Ethereum and Arbitrum are unaffected and fully
  working.

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

**Polygon behaves differently, and the difference is upstream, not here.** Base
fails *fast* (an immediate 500), so the round refuses in seconds. Polygon
*stalls* — Cloudflare holds the connection ~100 s before returning 524 — so each
node waits out that stall and the round does not settle within the CLI's
patience. The contract cannot shorten someone else's timeout.

What matters is that **neither case ever writes a wrong score.** After every
attempt above, `get_stats` reports `polygon: 0 tokens_tracked`, `base: 0`, and
the tokens read back `UNSCORED`. The failure mode is a slow or unsettled
request, never a corrupted record.

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

Live, on Studio Devnet — `list_token(USDT, ethereum)` through `require_safe`:

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

Live, on the 1.0.0 PEPE record:

```json
{ "valid": true, "failed": [], "content_hash": "422:28e4f85588019150",
  "recomputed": { "distribution": 80, "activity": 95, "verification": 75,
                  "maturity": 100, "liquidity": 90, "overall": 87,
                  "rug_level": "MEDIUM", "rug_flags": ["HAS_BLACKLIST"],
                  "badge": "MODERATE_RISK", "confidence": "HIGH" } }
```

All thirteen checks pass: the record reproduces itself from its own integers —
29 of them for a 1.0.0 record, 32 for a 1.1.0 one, and `verify_risk` reads the
count off the evidence rather than assuming it.

### PEPE is where 1.1.0 shows up in the arithmetic

The same token on the 1.1.0 oracle scores **88**, and `verification` moves
**75 → 80**. Nothing about PEPE changed; what changed is that the contract can
now *read* that its ownership really was renounced — `owner()` answers
`0x000…000` — instead of inferring from the ABI that an `owner` function
existing meant an owner existed. `sources_ok` gains `owner`, and no
`HIDDEN_OWNER` flag is raised:

```json
{ "symbol": "PEPE", "overall_score": 88, "verification_score": 80,
  "rug_flags": ["HAS_BLACKLIST"], "rug_level": "MEDIUM",
  "content_hash": "465:dc9cf40900e26bdf",
  "sources_ok": "address,contract,creation,holders,owner,transfers" }
```

Set against USDT on the same oracle — `HIDDEN_OWNER`, `verification 70` — that
is the whole feature in two rows: the same check, opposite answers, both
proved rather than guessed.

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
# 303 tests, 653 assert statements, 7,088 assertions executed
# stdlib only - no chain, no network, no model, no genlayer install
```

The count is higher than the statements because several tests sweep the whole
ordinal lattice: every feature key, over its entire declared range, asserting
that no combination can produce an out-of-range dimension, a non-multiple of 5,
or an unknown rug level.

**163 of those tests are new in 1.1.0** — the four new flags and the owner
probe's five response classes, `token_id` and the frozen delta, `rescan_token`,
both history reads, `batch_scan`'s parsing, aggregates and ordering, and the
minifier's renaming pass.

The stub the suite runs the contract against is shaped to match the **v0.6**
SDK as measured, not as documented: it offers `gl.storage.TreeMap` and
deliberately **withholds** the bare `TreeMap`, because the real star-import
withholds it too. A stub that were more generous than the chain would let an
unqualified name pass here and fail there. Same reasoning for `UserError`,
which carries `.data` only.

The suite checks five separate things:

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
   actually deploys, so "the source is correct" is only half a claim. Since the
   minifier started pooling string literals, that parity check is doing real
   work: `test_scoring_is_identical_across_the_lattice` sweeps every feature key
   over its entire declared range through *both* files.
4. **The watchlist, the portfolio and the history, run rather than reasoned
   about.** They live in class methods over `TreeMap[str, Watchlist]` and
   `DynArray[WatchEntry]`, which no static check can prove right, so the suite
   execs the whole contract against Python stand-ins for the storage
   primitives and drives the real methods — add, re-add, remove from the
   middle, fill to capacity, rescan an unknown id, batch-scan a duplicate.
5. **The minifier's renaming pass**, which is a rewrite of the deployable file
   and so gets its own tests rather than riding on the behavioural suite: the
   name map is injective, no public method or parameter or class or storage
   field or attribute was touched, no string value changed, and two builds of
   the same source are byte-identical.

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

## Frontend

`frontend/` is a Next.js 16 + Tailwind 4 app — a security console rather than a
trading dashboard.

| Route | What it does |
|---|---|
| `/` | Marketing. No wallet. Stats server-rendered from the live contract. |
| `/scan` | Submit an address and chain, watch the consensus round, read the result. |
| `/token/[address]` | Full breakdown: five dimension bars, rug findings with plain-English consequences, an interactive score-history chart, the agreed 29-ordinal evidence vector, and a **Re-verify on-chain** button that calls `verify_risk`. |
| `/portfolio` | Every ERC-20 a wallet holds, joined to the oracle's registry: value by verdict, a value-weighted risk score, and the holdings carrying a rug finding. Needs no wallet connection — balances are public. |
| `/watchlist` | The on-chain watchlist, with each token's movement against the score it had when it was added. |
| `/explore` | Every scored token, with per-chain safest/riskiest leaderboards and a rug-warning filter. |
| `/compare` | Two tokens side by side across all five dimensions, with the verdict, the margin and the dimension tally. |
| `/docs` | What each dimension measures, how rug detection reads the ABI, and the `require_safe` integration. |
| `/docs/api` | Full developer reference: every public method, working examples in genlayer-js, the CLI, Python and raw JSON-RPC, response shapes, and the limits. |

Three details worth knowing:

- **Reads need no wallet.** Only a *new* scan and a watchlist write do — and the
  landing page and `/portfolio` never touch one. `/portfolio` will happily rate an
  address you do not control, because balances are public data.
- **`/api/rpc` is a same-origin relay for Studio.** Studio serves CORS headers
  on success but drops them on its 429s, so an exhausted rate limit reaches the
  browser as a phantom CORS error instead of the rate-limit error it is.
  Relaying through our own origin means the real reason survives.
- **The score-history chart pins its y-axis to 0–100**, never to the data. An
  auto-fitted axis turns a three-point wobble into a cliff, which is exactly the
  misreading the contract's quantization exists to prevent. The five-dimension
  view ships a legend *and* a table view, because three of its five series
  colours fall below 3:1 contrast on the page's surface.
- **Data-source status lives on `/docs#chains`, not the landing page.** The
  marketing page shows all four chains equally; the per-host status — and why a
  degraded `/holders` endpoint means a refusal rather than a partial score — is
  on the docs page, where someone is actually looking for it. The chain picker on
  `/scan` still warns before a transaction is spent.

```bash
cd frontend
cp .env.example .env.local     # defaults to Studionet
npm install
npm run dev                    # http://localhost:3000

npm run typecheck && npm run lint && npm run build
```

## Build

```bash
python3 tools/minify_contract.py contracts/TokenScope.py  -o build/TokenScope.min.py
python3 tools/minify_contract.py contracts/RiskConsumer.py -o build/RiskConsumer.min.py
python3 tools/audit.py          # cross-file consistency, incl. the v0.6 invariants
python3 test/test_logic.py      # 303 tests, stdlib only
bash tools/deploy_studio_dev.sh
```

The minifier carries the **whole** runner comment block, not just line 1. That
is not a detail: the v0.6 header is two lines, and the previous version kept
line 1 and then deleted a comment on line 2 — which against this header
silently removes the `Depends` line and produces an artifact that deploys and
then dies at runtime with `invalid_contract runner malformed`. It now also
checks that the header's JSON parses, so a mangled one fails the build rather
than the chain.

The minifier strips comments, docstrings and blank lines, narrows indentation,
pools repeated string literals into short module-level names, and — new in
1.1.0 — **renames identifiers**. It never reorders a statement and never alters
the *value* of any string, prompt templates included, then asserts the public
surface is unchanged. Readable source stays in git; the artifact is what
deploys.

The renaming pass is scope-resolved rather than textual: it builds Python's own
scope tree, works out which scope owns each name, and rewrites only `ast.Name`,
`ast.arg`, `except … as` bindings and the `def` identifiers it is already
renaming. **Untouched:** every public method, every parameter of a
`@gl.public.*` method (those are the ABI), every class, every storage field,
every attribute, every dict key and every string. A nested function shares its
parent's name pool, so a closure reading a free variable reads the same short
name its parent wrote.

That file used to say identifier renaming was refused. That was the right call
while it would have been a regex over the text; it is the wrong call once the
pass resolves names the way Python does. It shipped two bugs on the first
attempt and the existing suite caught both before anything was deployed:
`except X as e` binds a name that is not a `Name` node, and a nested `def`
binds its own identifier in the enclosing scope. `59,532 → 51,390 bytes`, and
`build/TokenScope.min.names.json` travels with the artifact so the tests can
still reach `_score` under whatever it is now called.

**The build is reproducible**, which is what makes "verify with `shasum`"
mean anything. Every name is allocated from a sorted list, so nothing depends
on dict iteration order:

```bash
PYTHONHASHSEED=1   python3 tools/minify_contract.py contracts/TokenScope.py -o /tmp/a.py
PYTHONHASHSEED=999 python3 tools/minify_contract.py contracts/TokenScope.py -o /tmp/b.py
shasum -a 256 /tmp/a.py /tmp/b.py build/TokenScope.min.py   # three identical hashes
```

### Artifact size, and the budget that guards it

The 48 KB figure in circulation for the GenVM runner is stale. There *is* a
ceiling though, and this project found it by walking into it: adding the
watchlist took the artifact to 54,325 bytes and the deploy was refused with

```
invalid transaction: BlockPubdataLimitReached
```

Padded probe contracts then bracketed it — **52,000 and 53,000 bytes deployed,
53,700 was refused** — so the limit sits between the two. It is a *block*
pubdata limit rather than a per-transaction one, which means the exact figure
depends on what else is in the block and the margin is not ours to control.
`test/test_logic.py` therefore budgets **53,000** and fails the build above it.

The fix was never to cut a feature. Two minifier passes bought the room, and
both are checked rather than trusted: string pooling took 54,325 → 52,070, and
identifier renaming took 59,532 → 51,427 once the milestone's three features
landed. The proof in each case is the same — USDT's content hash before and
after is identical, so thousands of bytes of deployed source moved and not one
agreed ordinal did.

Studio Devnet prices deploys at a flat fee rather than per byte, so the
pubdata ceiling is not what binds there. The budget stays anyway: it is the
tightest constraint this contract has ever had to satisfy, and a size test
that only passes because the current network happens to be generous is not a
test.

## Method surface

**Write** — `request_risk(token, chain)` payable · **`rescan_token(token_id)`
payable** · `add_to_watchlist(token, chain)` · `remove_from_watchlist(token,
chain)` · `claim_refund()` · `clear_stale_pending(token, chain)` · owner-only:
`set_fee`, `set_paused`, `transfer_ownership`, `withdraw`

**Read** — `get_risk` · `get_risk_by_id` · **`get_risk_history(token_id)`** ·
**`get_history_by_address`** · **`batch_scan`** · `get_risk_trend` ·
`get_badge` · `is_safe` · `require_safe` · `check_rug_pull` · `compare_tokens`
· `get_safest_tokens` · `get_riskiest_tokens` · `verify_risk` · `get_evidence` ·
`get_stats` · `get_config` · `get_refund` · `get_tracked_tokens` ·
`get_governance_log` · `get_watchlist`

Bold entries are new in 1.1.0. `get_risk_history` **changed signature** — it
now takes the `token_id` that `rescan_token` takes, and the old
address-addressed form is `get_history_by_address(token, chain, count)`.
