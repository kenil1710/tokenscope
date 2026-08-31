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
