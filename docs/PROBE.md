# Blockscout probe findings — Studionet, captured 2026-08-31

Throwaway contract [`contracts/_render_probe.py`](../contracts/_render_probe.py),
deployed to Studionet at `0xae8aDe63EB2400D0dFEC841Ee1A886AE17e4c7f5`. Every
extraction rule in TokenScope is written against the shapes below, not against
assumptions about Blockscout's schema.

The probe ran **before** a line of the contract was written.

---

## 1. The four requested endpoints

USDT, `0xdAC17F958D2ee523a2206206994597C13D831ec7`, on `eth.blockscout.com`:

| Endpoint | Status | Bytes |
|---|---|---|
| `/api/v2/tokens/{a}` | **200** | 423 |
| `/api/v2/tokens/{a}/holders` | **200** | 30,382 |
| `/api/v2/addresses/{a}` | **200** | 1,149 |
| `/api/v2/tokens/{a}/transfers?type=ERC-20` | **422** | 101 |

Three of four answer unauthenticated from validator egress. The fourth is not
blocked — the **query parameter is rejected**:

```json
{"errors":[{"title":"Invalid value","source":{"pointer":"/type"},
            "detail":"Unexpected field: type"}]}
```

Dropping `?type=ERC-20` returns **200 with 100,597 bytes**. The endpoint already
returns only token transfers, so the filter was redundant as well as fatal. Every
transfer row carries `token_type: "ERC-20"` for filtering in Python instead.

---

## 2. The finding that changed the design — one document answers three dimensions

`/api/v2/addresses/{a}` is not just an address record. It **embeds the entire
token document** and the verification and proxy state alongside it:

```
is_contract      bool=True          proxy_type       NoneType=None
is_verified      bool=True          implementations  list[0]
is_scam          bool=False         reputation       str=ok
name             str=TetherToken    creator_address_hash        str=0x369285...
creation_status  str=success        creation_transaction_hash   str=0x2f1c5c...
token            dict{address_hash, circulating_market_cap, circulating_supply,
                      decimals, exchange_rate, holders_count, icon_url, name,
                      reputation, symbol, total_supply, type, volume_24h}
```

So `/addresses/{a}` is the **anchor fetch**: token info, verification status and
proxy status arrive together, in 1.1 KB. `/tokens/{a}` is kept only as a fallback
for a chain whose address record omits the embedded `token`.

It also gives two things nothing else does:

- **`is_scam`** — Blockscout's own scam designation, a first-class signal.
- **`token: null` is the ERC-20 check.** An address that is not a token has no
  embedded token document, so "is this actually an ERC-20?" is answered by the
  anchor fetch rather than guessed at.

There is **no creation timestamp** on this document — only
`creation_transaction_hash`. That is what forced the fourth fetch below.

---

## 3. The ABI is structured JSON — so rug detection is exact, not guessed

`/api/v2/smart-contracts/{a}` → **200, 70,506 bytes**:

```
abi                     list[44]        <- every function name, as JSON
is_verified             bool=True       is_fully_verified     bool=False
is_partially_verified   bool=True       certified             bool=False
verified_at             str=2019-04-18T23:27:13.673983Z
language                str=solidity    license_type          str=none
compiler_version        str=v0.4.18+commit.9cf6e910
proxy_type              NoneType=None   implementations       list[0]
```

**`abi` is a list of 44 function/event objects with exact `name` fields.** This
is the single most consequential finding in the probe. The plan was for the
model to read method names out of a rendered page to find `mint` / `pause` /
`blacklist`. It does not have to: the names arrive as parseable JSON, so every
rug flag is decided by pure Python against an exact function list.

That shrinks the model's job rather than removing it — see §6.

A contract that is **not verified returns 404 here**, which is itself the
signal: no ABI means no way to know what the owner can do, and that is scored as
the red flag it is rather than as a missing document.

---

## 4. Creation date comes from the creation transaction

`/api/v2/transactions/{creation_transaction_hash}` → **200, 27,475 bytes**:

```
timestamp   str=2017-11-28T00:41:21.000000Z
result      str=success       block_number   int=4634748
created_contract  dict{hash, is_contract, is_scam, is_verified, proxy_type, ...}
```

An exact ISO-8601 instant, so contract age is a computation and not a guess.
This is a second hop, taken deliberately: `maturity_score` is 15% of the total
and "created yesterday" is the loudest rug signal there is, so it is worth one
extra GET to know the answer exactly.

---

## 5. Row shapes for the two list endpoints

`/tokens/{a}/holders` → `items: list[50]`, `next_page_params`:

```json
{"address": {"hash": "0xF977814e...", "is_contract": false, "is_scam": false,
             "is_verified": false, "name": null, "public_tags": [], ...},
 "value": "17000000000000198", "token_id": null}
```

50 rows in one page, `value` in raw token units as a **string** (USDT's top
holder is 17.0 B units at 6 decimals). Percentages need `total_supply` from the
embedded token document. `address.is_contract` rides along, which matters: a
bridge or an AMM pool holding 30% is not the same risk as one EOA holding 30%.

`/tokens/{a}/transfers` → `items: list[50]`, `next_page_params`:

```json
{"timestamp": "2026-08-31T05:26:23.000000Z", "method": "0xa9059cbb",
 "token_type": "ERC-20", "block_number": 25873160,
 "from": {"hash": "0x0caBD4A3...", "is_contract": false, ...},
 "to":   {"hash": "...", ...},
 "total": {"decimals": "6", "value": "..."},
 "transaction_hash": "0x867f596e..."}
```

Per-row timestamps and both endpoints of every transfer, so recency, unique
counterparties and transfer rate all come from this one document as integers.

---

## 6. All four chains answer — and one of them told us something important

| Chain | Host | Token probed | Result |
|---|---|---|---|
| ethereum | `eth.blockscout.com` | USDT | **200** |
| base | `base.blockscout.com` | USDC | **500**, then **200** on retest |
| arbitrum | `arbitrum.blockscout.com` | USDT | **200**, 420 bytes |
| polygon | `polygon.blockscout.com` | USDT | **200**, 421 bytes |

Identical schema on every host, so one extraction path serves all four.

Base's first answer was **HTTP 500, zero-length body**, and the same URL
returned 200 moments later. That is the probe's second design finding: a 5xx
from Blockscout is a **transient** condition, and reading it as "this token has
no data" would quietly score a healthy token as dead. So 5xx fails the request
as `[TRANSIENT]` and only 4xx is treated as a real absence — the same rule
SocialOracle reached for the same reason.

---

## 7. What this forced in the contract

1. **Five fetches, `/addresses/{a}` first and mandatory.** It carries token,
   verification and proxy state at once, and its `token: null` is the ERC-20
   check. The other four are optional and each one that fails **rescales** its
   dimension instead of scoring it zero.

2. **No `?type=ERC-20`, ever.** It is a 422. Rows are filtered on
   `token_type == "ERC-20"` in Python.

3. **Rug flags are pure Python over the ABI**, not a model reading a page.
   Exact function names make `mintable` / `pausable` / `has_blacklist` decidable,
   and a 404 from `/smart-contracts/` is the unverified flag.

4. **The model keeps one narrow job.** The ABI names that a keyword list does
   *not* recognise are the interesting ones — USDT's own supply control is
   `issue` and `redeem`, and its freeze is `addBlackList` /
   `destroyBlackFunds`. A keyword matcher finds the second and misses the first.
   So unmatched **owner-gated** function names go to the model as a bounded
   question — does this let the owner create supply, freeze transfers, or seize
   balances? — collapsed to one 0–2 ordinal. Everything else is arithmetic.

5. **Coarse ladders, because the transfer window moves.** USDT's 50 most recent
   transfers span **seconds**; two validators fetching moments apart share
   almost no rows. Unique-counterparty counts of 87 and 91 must land on the same
   rung, so every count is ranked onto a decade-scale ladder before it reaches
   consensus. Bucket width IS the consensus margin.

6. **Market cap and exchange rate move continuously** and are bucketed on
   powers of ten for the same reason.

---

## 8. A second visit: not every chain's `/holders` is healthy

Re-probed on 2026-08-31 while running end-to-end scoring, because USDC on Base
and USDT on Polygon both failed to score while Ethereum succeeded twice.

| Chain | `/addresses/{a}` | `/tokens/{a}/holders` |
|---|---|---|
| ethereum | 200 | **200** |
| arbitrum | 200 | **200** |
| polygon | 200 | **524** (Cloudflare origin timeout) |
| base | 200 | **500**, **500**, then **524** |

The holders endpoint on Base and Polygon is broken *and slow* — the 524 arrives
only after the origin stalls for roughly 100 seconds. Everything else on those
hosts answers normally, including the anchor, the ABI and the transfers page.

**This exposed a real bug in the contract, not just a bad upstream.** Optional
sources were wrapped in a catch-all that turned *any* failure into "this source
did not resolve", and `src_holders` is part of the consensus vector. A flaky
5xx therefore made one of the agreed ordinals **node-dependent**: a validator
that got 200 and one that got 524 produced different vectors for the same
token, the round could not converge, and the request hung until the client gave
up — at a cost of ~100 seconds per node per attempt.

The fix is to separate the two failure kinds, which are not alike at all:

- **4xx — a deterministic absence.** Every node sees the same 404, so bucketing
  it as a missing source is safe, and the dimension rescales as designed. This
  is the normal path for an unverified contract, whose `/smart-contracts/` is a
  404.
- **5xx or unparseable — a broken server.** Node-dependent by nature. This now
  **propagates** and fails the whole request, so every node fails identically,
  `_handle_leader_error` matches on the error class, and the network settles on
  one clean refusal with a full refund instead of rotating forever.

The consequence is honest and visible: while Blockscout's Base and Polygon
holders endpoints are down, tokens on those chains are **refused with a refund**
rather than scored on partial data. Ethereum and Arbitrum are unaffected.
Refusing to answer is the correct behaviour for an oracle whose entire value is
that two nodes cannot disagree.

---

## 9. Reproducing this

```bash
genlayer deploy --contract contracts/_render_probe.py
P=<address>; U=0xdAC17F958D2ee523a2206206994597C13D831ec7

genlayer write $P probe_statuses --args \
  "[\"https://eth.blockscout.com/api/v2/tokens/$U\",
    \"https://eth.blockscout.com/api/v2/tokens/$U/holders\",
    \"https://eth.blockscout.com/api/v2/addresses/$U\",
    \"https://eth.blockscout.com/api/v2/tokens/$U/transfers?type=ERC-20\"]"
genlayer call $P get_statuses

genlayer write $P probe_keys --args "https://eth.blockscout.com/api/v2/addresses/$U"
genlayer call $P get_statuses
```

`probe_keys` is what made this fast: a 70 KB contract document read 200
characters at a time takes a dozen transactions to understand, and its key list
takes one.

The probe contract is kept in the repository deliberately. It is not part of
TokenScope and is not deployed with it, but it is the evidence for why the
contract reads the sources it reads.

---

## 10. A third visit: the endpoint section 1 said did not exist

*Captured 2026-09-19, for the 1.1.0 milestone.*

Section 6 recorded that `/api/v2/smart-contracts/{a}/methods-read` is a **404**
on every host, and the contract drew a conclusion from it that turned out to be
too broad: that the *current* owner of a contract is unreadable, and so
`renounced` could only ever be the ABI inference "does an owner-shaped function
exist at all".

That conclusion was wrong, and PEPE is what it cost. PEPE has an `owner`
function **and** has renounced ownership; the inference called it owned, which
kept `MINTABLE` counting against a contract nobody can mint from.

What the first probe missed is that Blockscout serves **JSON-RPC** alongside
the REST API, one path segment up from `api/v2/`:

```
POST https://eth.blockscout.com/api/eth-rpc
{"jsonrpc":"2.0","id":1,"method":"eth_call",
 "params":[{"to":"<token>","data":"0x8da5cb5b"},"latest"]}
```

`0x8da5cb5b` is the `owner()` selector. Measured against four tokens and four
chains:

| token | chain | response | reading |
|---|---|---|---|
| USDT `0xdac1…1ec7` | ethereum | `0x…c6cde7c39eb2f0f0095f41570af89efc2c1ea828` | live owner |
| PEPE `0x6982…1933` | ethereum | `0x000…000` | **renounced, provably** |
| LINK `0x5149…86ca` | ethereum | `error code 3, "execution reverted"` | no `owner()` |
| SHIB `0x95ad…c4ce` | ethereum | `error code 3, "execution reverted"` | no `owner()` |
| USDT0 `0xfd08…cbb9` | arbitrum | `0x…4dff9b5b0143e642a3f63a5bcf2d1c328e600bf8` | live owner |
| USDC `0x2791…4174` | polygon | `error code 3, "execution reverted"` | no `owner()` |

### The failure mode this probe *also* found

Base answered one of these attempts with **HTTP 200** and this body:

```json
{"message":"Too many requests. Increase limits now at https://dev.blockscout.com",
 "result":null,"status":"0"}
```

A 200 with neither `result` nor `error`. Read naively as "no owner", that
throttle would put a **node-dependent bit** straight into the consensus vector:
one validator gets an address, another gets throttled, and the round cannot
converge. It is the same class of hazard as section 8's 500s on `/holders`, and
it gets the same treatment — `[TRANSIENT]`, propagated, the whole request
refused with a full refund.

So `_owner_features` separates three things that a less careful reading would
collapse into one:

| response | class | effect on the vector |
|---|---|---|
| `result` with an address | answer | `src_owner=1`, `hidden_owner` from the address |
| `error … "execution reverted"` | answer | `src_owner=1`, `hidden_owner=0`, ABI rule stands |
| `result: "0x"` (empty return) | answer | same as a revert |
| 404, 400 | missing document | `src_owner=0`, verification rescales |
| 401/403/408/425/429, 5xx, throttle body, unparseable | **transient** | `[TRANSIENT]`, request fails, fee refunded |

### The line between those last two, and getting it wrong once

The first version of `_owner_features` read **every** 4xx as a missing
document. PEPE caught it on the very first demo round: the record came back
`sources_ok: address,contract,creation,holders,transfers` — no `owner` — on a
round where a hand-issued POST to the same URL answered 200 with
`0x000…000` seconds later. Five validators hitting the endpoint at once had
been throttled, and a throttle had been quietly recorded as a property of the
token.

So only a status that means the same thing to **every** node may be read as a
missing document. 404 ("not here") and 400 ("not like that") qualify: every
node POSTs identical bytes to the same URL. A 401, 403, 408, 425 or 429 is
this node being refused right now, and is transient, exactly like a 5xx.

### On `latest`

The block tag is `latest`, which is not pinned across validators. That is
acceptable here and nowhere near as loose as it sounds: the 32-byte word is
collapsed to **one bit**, and that bit only moves when ownership actually
transfers. `is_scam`, `is_verified` and `proxy_type` are all read "as of now"
from the same explorer and are already in the vector on exactly these terms.

---

## 11. The Bradbury deploy ceiling moved — measured 2026-09-19

`deployments.json → size_finding` recorded a **pubdata** ceiling between 53,000
and 53,700 bytes on 2026-09-02, found by walking into it. As of 2026-09-19 that
is no longer the binding constraint on Bradbury, and the new one is much lower.

Bradbury now rejects `eth_sendRawTransaction` with **`gas limit too high`** for
any transaction whose gas limit exceeds **16,777,216 — exactly 2²⁴**. Bisected
against padded probe contracts:

| tx gas limit | result |
|---|---|
| 16,777,216 | deploys |
| 16,777,217 | `gas limit too high` |

The block gas limit is 100,000,000, so this is a **per-transaction** cap, not a
block one. Deploy gas is linear in source size at about **809.5 gas per byte**
plus ~240,000 fixed:

| source bytes | estimated gas | |
|---|---|---|
| 5,000 | 4,905,669 | deploys |
| 15,000 | 12,573,064 | deploys |
| 20,000 | 16,640,019 | deploys |
| 21,000 | 17,406,313 | refused |
| 50,779 (TokenScope 1.1.0, as measured) | 40,479,983 | refused |

**The ceiling is therefore ≈20,170 bytes of contract source.** TokenScope 1.0.0
— the 52,070-byte artifact currently live on Bradbury at
`0xbAAF6f0151D728984445fc42edAC84e13241d4E6` — could not be deployed today
either; this was confirmed by attempting exactly that artifact, byte for byte,
from git. The blocker is the network, not the milestone.

There is no compression route out of it: GenVM's ZIP runner layout permits
**`stored` only**, no deflate (SDK spec, *Runners → Runner Layout → ZIP
Archive*), so an archive is larger than the source, not smaller.

### A second, unrelated Bradbury finding

`genlayer` CLI **0.40.0-rc.3** (published 2026-09-03) cannot talk to
old-format contracts on Bradbury at all. Both reads and deploys fail:

```
ValueError: call to private method `Contract.__handle_undefined_method__`
warn: runner comment does not start with version, using default v0.1.0
```

That is the v0.6 calldata migration reaching the CLI ahead of the chain.
**0.39.2** is the last release that speaks the format Bradbury's deployed
contracts were built with, and every Bradbury figure above was measured with
it. Reads against the live 1.0.0 deployment work perfectly under 0.39.2 and
fail under 0.40.0-rc.3 — so a pinned CLI, not a redeploy, is what the existing
Bradbury contract needs.

### How hard the endpoint throttles, measured

Ten concurrent POSTs from one IP, three times over:

```
burst 1: 429 429 200 429 429 429 429 429 429 429
burst 2: 429 429 429 429 429 429 429 429 429 429
burst 3: 429 429 429 429 429 429 429 429 429 429
```

Eight *sequential* requests from the same IP all answered 200. So the limiter
is a burst limiter, and a consensus round is a burst by construction: five
validators fire the same request at the same instant.

On Studionet that shows up as all-or-nothing. USDT's round got `owner` in
`sources_ok`; PEPE's, minutes later, got none — and every validator got none,
which is why the round agreed rather than failing. Validators behind a shared
egress IP would produce exactly that pattern.

Under the corrected classification a throttled round now **refuses and
refunds** instead of agreeing on a wrong bit, and a retry a minute later
works. That is the same trade the contract already makes for Base and
Polygon's `/holders` 5xx, and it is the right way round: a refusal is
recoverable, a silently wrong ordinal is not.

### So the probe reads two hosts, in a fixed order

A second host is safe here in a way it would not be for a scored quantity:
both hosts read the **same chain**, the answer is collapsed to **one bit**, and
a node that settles on the first and a node that settles on the second produce
identical vectors. The order is fixed, so every node tries the same host first
and a round cannot split on *which* host answered.

Finding one with full coverage took some looking. Measured, unauthenticated,
`eth_call owner()`:

| host | result |
|---|---|
| `eth.llamarpc.com` | 525 |
| `cloudflare-eth.com` | 200 but `-32603 Internal error` on `eth_call` |
| `rpc.ankr.com/eth` | `-32000 Unauthorized` — needs a key |
| `polygon-rpc.com` | 401, "API key disabled" |
| `mainnet.base.org` | 200, correct owner |
| `arb1.arbitrum.io/rpc` | 200, correct owner |
| **`*.publicnode.com`** | **200 on all four chains, correct owners** |

Two chains out of four was the bar this had to clear, and the per-chain
endpoints did not clear it — a fallback that works on Base and Arbitrum but
not Ethereum and Polygon is not a fallback, it is a second thing to explain.
publicnode does clear it: `ethereum-rpc`, `base-rpc`, `arbitrum-one-rpc` and
`polygon-bor-rpc`, one provider, the same answers Blockscout gives.

And critically, **it does not throttle on a burst**. The same ten-concurrent
test that drew nine 429s from Blockscout drew ten 200s:

```
publicnode: 200 200 200 200 200 200 200 200 200 200
```

So publicnode leads and Blockscout's `/api/eth-rpc` backs it up. If the first
host refuses, the second is tried; if the first has no such endpoint, the
second is tried; if the first settles, the second is never called. A refusal
outranks a clean 404 — another node may have got an answer from the host that
refused us, so the round fails rather than recording a missing source it
cannot vouch for.
