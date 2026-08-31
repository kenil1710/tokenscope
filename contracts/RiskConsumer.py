# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# RiskConsumer - the block another builder copies.
#
# A DEX listing gate that only admits tokens TokenScope vouches for. It stores
# no scores of its own and has no scoring code: every risk value here arrives
# from a free cross-contract read of the oracle.
#
# THE POINT OF THE EXAMPLE. There are two ways to read a risk oracle and only
# one of them is safe to act on:
#
#   preview_listing() -> get_risk()/check_rug_pull()  - non-reverting. Answers
#       "what do you know?", degrading to a reason string when the answer is
#       missing or stale. Right for a UI, a token browser, a dry run.
#
#   list_token()      -> require_safe()               - REVERTS. Answers "may I
#       act on this?" and refuses to return at all on a missing, stale, low or
#       rug-flagged score. Right for anything that puts capital at risk.
#
# A DEX that lists through the first form eventually lists a token on a score
# that was never written or went stale months ago. So the reverting read is the
# default integration point here, and the non-reverting one is confined to the
# views that only ever describe.
#
# WHY A RUG LEVEL IS NOT JUST A LOW SCORE. The gate checks BOTH, because they
# fail differently. A token with a 40 is merely unproven - thin, young, quiet.
# A token with an 85 and a CRITICAL rug level is worse: it looks excellent on
# every dimension and the owner can still mint unlimited supply into it. The
# score floor catches the first; only max_rug_level catches the second.
#
# WHAT THIS CONTRACT CANNOT DO. It cannot write a score, and it cannot ask the
# oracle to change one. The owner retunes the policy - the floor, the staleness
# limit, the rug ceiling - and nothing else. A tier is a pure function of a
# score the oracle already published.

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone

import typing

# Policy defaults. The owner can retune these; none of them can move a score,
# because this contract has no way to write one.
DEFAULT_MIN_SCORE = 50
DEFAULT_MAX_AGE = 2592000          # 30 days - a risk assessment nobody has
                                   # refreshed in a month is not evidence
                                   # about today
DEFAULT_MAX_RUG = "MEDIUM"
DEFAULT_SLOTS = 500

MAX_LOG = 200
ERR = "[EXPECTED]"

RUG_RANK = {"NONE": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}

# Score band -> listing tier. Deliberately coarse: the oracle quantizes to steps
# of 5, so banding on top of that keeps a one-step wobble at the edge from
# moving a token between tiers.
BAND_FLOORS = (50, 70, 85)
BAND_NAMES = ("rejected", "watchlist", "standard", "blue_chip")
# Maximum single-trade notional the venue allows per tier, in whole units. The
# point is that a tier is worth something concrete downstream, not just a label.
BAND_TRADE_CAP = (0, 1000, 100000, 10000000)


def _band(overall: int, rug: str) -> int:
    """0 = not listable, then one band per floor cleared.

    A HIGH or CRITICAL rug finding caps the tier at 0 no matter how good the
    score is: this is the one place the two signals are combined, and the rug
    level wins."""
    if RUG_RANK.get(str(rug), 4) >= 3:
        return 0
    b = 0
    for floor in BAND_FLOORS:
        if overall >= floor:
            b = b + 1
    return b


def _short(s: str, n: int = 120) -> str:
    s = str(s)
    return s[:n] if len(s) > n else s


@gl.contract_interface
class ITokenScope:
    """The oracle's public surface, as this consumer uses it. Type stubs only -
    at runtime this is the same thing gl.get_contract_at() returns."""

    class View:
        def get_risk(self, token_address: str, chain: str) -> typing.Any: ...

        def is_safe(self, token_address: str, chain: str,
                    min_score: int) -> bool: ...

        def require_safe(self, token_address: str, chain: str, min_score: int,
                         max_age_seconds: int,
                         max_rug_level: str) -> typing.Any: ...

        def check_rug_pull(self, token_address: str,
                           chain: str) -> typing.Any: ...

        def get_badge(self, token_address: str, chain: str) -> typing.Any: ...

        def get_stats(self) -> typing.Any: ...

    class Write:
        pass


@allow_storage
@dataclass
class Listing:
    token: str
    chain: str
    symbol: str
    lister: Address
    overall: u32
    rug_level: str
    badge: str
    band: u32
    trade_cap: u64
    score_id: u32
    listed_at: u64


class RiskConsumer(gl.Contract):
    owner: Address
    oracle: Address

    min_score: u32
    max_age_seconds: u64
    max_rug_level: str
    slots: u32

    listings: DynArray[Listing]
    listed: TreeMap[str, bool]
    listing_count: u32
    log: DynArray[str]

    def __init__(self, oracle_address: str):
        self.owner = gl.message.sender_address
        self.oracle = Address(str(oracle_address))
        self.min_score = u32(DEFAULT_MIN_SCORE)
        self.max_age_seconds = u64(DEFAULT_MAX_AGE)
        self.max_rug_level = DEFAULT_MAX_RUG
        self.slots = u32(DEFAULT_SLOTS)
        self.listing_count = u32(0)

    # --- internals

    def _now(self) -> int:
        return int(datetime.now(timezone.utc).timestamp())

    def _only_owner(self) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(ERR + " owner only")

    def _oracle(self) -> typing.Any:
        return ITokenScope(self.oracle)

    def _key(self, token: str, chain: str) -> str:
        return str(chain).strip().lower() + ":" + str(token).strip().lower()

    def _note(self, action: str, detail: str) -> None:
        if len(self.log) >= MAX_LOG:
            return
        self.log.append(str(self._now()) + " " + action + " " + _short(detail))

    def _row(self, item: Listing) -> dict:
        return {
            "token_address": str(item.token),
            "chain": str(item.chain),
            "symbol": str(item.symbol),
            "overall": int(item.overall),
            "rug_level": str(item.rug_level),
            "badge": str(item.badge),
            "tier": BAND_NAMES[int(item.band)],
            "trade_cap": int(item.trade_cap),
            "score_id": int(item.score_id),
            "listed_at": int(item.listed_at),
            "lister": item.lister.as_hex,
        }

    # --- reads: non-reverting, for describing. Never act on these.

    @gl.public.view
    def preview_listing(self, token_address: str, chain: str) -> typing.Any:
        """What the oracle knows, as a plain answer with a reason.

        Degrades rather than raising: an unscored token, an unreachable oracle
        and a stale score are all legitimate answers to "should this show up as
        listable in a browser?". They are NOT legitimate answers to "should this
        token be tradeable?", which is why list_token does not use this."""
        try:
            rec = self._oracle().view().get_risk(token_address, chain)
        except Exception:
            return {"listable": False,
                    "reason": "oracle unreadable or malformed address",
                    "token_address": str(token_address), "chain": str(chain)}
        if not rec.get("found"):
            return {"listable": False, "reason": "never scored",
                    "hint": "call request_risk on the oracle first",
                    "token_address": str(token_address), "chain": str(chain),
                    "badge": "UNSCORED"}

        overall = int(rec.get("overall_score", 0))
        rug = str(rec.get("rug_level", "CRITICAL"))
        age = int(rec.get("age_seconds", 0))
        band = _band(overall, rug)

        reasons = []
        if overall < int(self.min_score):
            reasons.append("overall " + str(overall) + " below floor "
                           + str(int(self.min_score)))
        if RUG_RANK.get(rug, 4) > RUG_RANK.get(str(self.max_rug_level), 2):
            reasons.append("rug level " + rug + " above ceiling "
                           + str(self.max_rug_level))
        cap = int(self.max_age_seconds)
        if cap > 0 and age > cap:
            reasons.append("score is " + str(age) + "s old, limit "
                           + str(cap) + "s")
        if self._key(str(rec.get("token_address", "")),
                     str(rec.get("chain", ""))) in self.listed:
            reasons.append("already listed")
        if int(self.listing_count) >= int(self.slots):
            reasons.append("no slots left")

        return {
            "listable": len(reasons) == 0,
            "reasons": reasons,
            "token_address": str(rec.get("token_address", token_address)),
            "chain": str(rec.get("chain", chain)),
            "symbol": str(rec.get("symbol", "")),
            "overall": overall,
            "rug_level": rug,
            "rug_flags": rec.get("rug_flags", []),
            "badge": str(rec.get("badge", "")),
            "confidence": str(rec.get("confidence", "LOW")),
            "age_seconds": age,
            "tier": BAND_NAMES[band],
            "trade_cap": BAND_TRADE_CAP[band],
            "explorer_url": str(rec.get("explorer_url", "")),
        }

    @gl.public.view
    def check_rug_pull(self, token_address: str, chain: str) -> typing.Any:
        """A straight pass-through of the oracle's rug findings.

        Kept deliberately thin: a consumer that reinterprets an oracle's flags
        is a second, undocumented rubric that nobody tested. The one thing added
        is this venue's own verdict on those flags, under `blocked_here`."""
        try:
            out = self._oracle().view().check_rug_pull(token_address, chain)
        except Exception:
            return {"found": False, "reason": "oracle unreadable",
                    "token_address": str(token_address), "chain": str(chain)}
        if isinstance(out, dict) and out.get("found"):
            rug = str(out.get("rug_level", "CRITICAL"))
            out["blocked_here"] = (
                RUG_RANK.get(rug, 4)
                > RUG_RANK.get(str(self.max_rug_level), 2))
            out["venue_max_rug_level"] = str(self.max_rug_level)
        return out

    @gl.public.view
    def is_listable(self, token_address: str, chain: str) -> bool:
        """The cheapest possible question, answered by the oracle's own
        composability primitive rather than by re-deriving anything here."""
        try:
            return bool(self._oracle().view().is_safe(
                token_address, chain, int(self.min_score)))
        except Exception:
            return False

    @gl.public.view
    def get_listing(self, token_address: str, chain: str) -> typing.Any:
        want = self._key(token_address, chain)
        for i in range(len(self.listings)):
            item = self.listings[i]
            if self._key(str(item.token), str(item.chain)) == want:
                return self._row(item)
        return {"found": False, "token_address": str(token_address),
                "chain": str(chain)}

    @gl.public.view
    def get_listings(self, count: int) -> typing.Any:
        n = int(count)
        total = len(self.listings)
        if n <= 0 or n > total:
            n = total
        out = []
        for i in range(total - n, total):
            out.append(self._row(self.listings[i]))
        return {"listed": int(self.listing_count), "returned": len(out),
                "slots": int(self.slots), "listings": out}

    @gl.public.view
    def get_policy(self) -> typing.Any:
        return {
            "oracle": self.oracle.as_hex,
            "owner": self.owner.as_hex,
            "min_score": int(self.min_score),
            "max_age_seconds": int(self.max_age_seconds),
            "max_rug_level": str(self.max_rug_level),
            "slots": int(self.slots),
            "listed": int(self.listing_count),
            "tiers": [{"tier": BAND_NAMES[i + 1], "floor": BAND_FLOORS[i],
                       "trade_cap": BAND_TRADE_CAP[i + 1]}
                      for i in range(len(BAND_FLOORS))],
            "note": "a HIGH or CRITICAL rug level caps the tier at rejected "
                    "regardless of the overall score",
        }

    @gl.public.view
    def get_oracle_stats(self) -> typing.Any:
        """Proof the cross-contract read works at all, with no local state
        involved: whatever the oracle reports, verbatim."""
        try:
            return self._oracle().view().get_stats()
        except Exception:
            return {"error": "oracle unreadable", "oracle": self.oracle.as_hex}

    @gl.public.view
    def get_log(self, count: int) -> typing.Any:
        total = len(self.log)
        n = int(count)
        if n <= 0 or n > total:
            n = total
        return {"total": total,
                "entries": [str(self.log[i]) for i in range(total - n, total)]}

    # --- the write that matters

    @gl.public.write
    def list_token(self, token_address: str, chain: str) -> typing.Any:
        """List a token for trading. REVERTS unless the oracle vouches for it.

        The whole example is this one line: `require_safe` is called and its
        result is used, rather than `get_risk` being called and its result being
        checked. A missing score, a stale score, a low score and a rug finding
        all raise inside the oracle, so there is no branch here that can forget
        to handle one of them."""
        if int(self.listing_count) >= int(self.slots):
            raise gl.vm.UserError(ERR + " no listing slots left")

        # Reverting read. Nothing below this line runs for a token the oracle
        # will not vouch for.
        rec = self._oracle().view().require_safe(
            token_address, chain, int(self.min_score),
            int(self.max_age_seconds), str(self.max_rug_level))

        token = str(rec.get("token_address", ""))
        ch = str(rec.get("chain", ""))
        key = self._key(token, ch)
        if key in self.listed:
            raise gl.vm.UserError(ERR + " already listed: " + key)

        overall = int(rec.get("overall_score", 0))
        rug = str(rec.get("rug_level", "CRITICAL"))
        band = _band(overall, rug)
        if band <= 0:
            # Unreachable while the policy ceiling is MEDIUM or lower, but the
            # owner can raise the ceiling, and a tier of 0 must never be listed.
            raise gl.vm.UserError(ERR + " tier is rejected for " + key)

        item = self.listings.append_new_get()
        item.token = token
        item.chain = ch
        item.symbol = str(rec.get("symbol", ""))
        item.lister = gl.message.sender_address
        item.overall = u32(overall)
        item.rug_level = rug
        item.badge = str(rec.get("badge", ""))
        item.band = u32(band)
        item.trade_cap = u64(BAND_TRADE_CAP[band])
        item.score_id = u32(int(rec.get("score_id", 0)))
        item.listed_at = u64(self._now())

        self.listed[key] = True
        self.listing_count = u32(int(self.listing_count) + 1)
        self._note("list", key + " " + str(overall) + " " + rug)
        return self._row(item)

    @gl.public.write
    def guard_trade(self, token_address: str, chain: str,
                    amount: int) -> typing.Any:
        """What a venue actually calls on every trade: is this token still
        listed, and is this trade inside the cap its tier earned?

        Deliberately re-reads the oracle rather than trusting the tier frozen at
        listing time. A token listed as blue_chip a month ago may have been
        re-scored since - the whole reason the oracle keeps history - and a
        venue that only checked at listing time would never notice."""
        want = self._key(token_address, chain)
        if want not in self.listed:
            raise gl.vm.UserError(ERR + " not listed: " + want)

        rec = self._oracle().view().require_safe(
            token_address, chain, int(self.min_score),
            int(self.max_age_seconds), str(self.max_rug_level))
        band = _band(int(rec.get("overall_score", 0)),
                     str(rec.get("rug_level", "CRITICAL")))
        cap = BAND_TRADE_CAP[band]
        size = int(amount)
        if size <= 0:
            raise gl.vm.UserError(ERR + " amount must be positive")
        if size > cap:
            raise gl.vm.UserError(ERR + " trade of " + str(size)
                                  + " exceeds the " + BAND_NAMES[band]
                                  + " cap of " + str(cap))
        return {"allowed": True, "token_address": want, "amount": size,
                "tier": BAND_NAMES[band], "trade_cap": cap,
                "current_overall": int(rec.get("overall_score", 0)),
                "current_rug_level": str(rec.get("rug_level", ""))}

    # --- governance. None of these can move a score.

    @gl.public.write
    def delist(self, token_address: str, chain: str) -> None:
        self._only_owner()
        want = self._key(token_address, chain)
        if want not in self.listed:
            raise gl.vm.UserError(ERR + " not listed: " + want)
        # Compact in place by copying raw field values, never by rebuilding a
        # row from its own rendered form: `_row` turns a band into a tier NAME
        # and an Address into a hex string, and reversing either of those to
        # write it back is a round-trip that only has to be wrong once.
        keep = []
        for i in range(len(self.listings)):
            item = self.listings[i]
            if self._key(str(item.token), str(item.chain)) != want:
                keep.append((str(item.token), str(item.chain),
                             str(item.symbol), item.lister, int(item.overall),
                             str(item.rug_level), str(item.badge),
                             int(item.band), int(item.trade_cap),
                             int(item.score_id), int(item.listed_at)))
        while len(self.listings) > len(keep):
            self.listings.pop()
        for i in range(len(keep)):
            item = self.listings[i]
            item.token = keep[i][0]
            item.chain = keep[i][1]
            item.symbol = keep[i][2]
            item.lister = keep[i][3]
            item.overall = u32(keep[i][4])
            item.rug_level = keep[i][5]
            item.badge = keep[i][6]
            item.band = u32(keep[i][7])
            item.trade_cap = u64(keep[i][8])
            item.score_id = u32(keep[i][9])
            item.listed_at = u64(keep[i][10])
        del self.listed[want]
        self.listing_count = u32(len(keep))
        self._note("delist", want)

    @gl.public.write
    def set_policy(self, min_score: int, max_age_seconds: int,
                   max_rug_level: str) -> None:
        """Retunes the gate, never a score. The rug ceiling must be a level the
        oracle actually publishes, or the gate would silently admit everything."""
        self._only_owner()
        floor = int(min_score)
        if floor < 0 or floor > 100:
            raise gl.vm.UserError(ERR + " min_score must be 0..100")
        age = int(max_age_seconds)
        if age < 0:
            raise gl.vm.UserError(ERR + " max_age_seconds must not be negative")
        want = str(max_rug_level).upper()
        if want not in RUG_RANK:
            raise gl.vm.UserError(ERR + " max_rug_level must be one of "
                                  + ",".join(sorted(RUG_RANK.keys())))
        self.min_score = u32(floor)
        self.max_age_seconds = u64(age)
        self.max_rug_level = want
        self._note("set_policy", str(floor) + " " + str(age) + " " + want)

    @gl.public.write
    def set_oracle(self, new_oracle: str) -> None:
        """Repointing the oracle is the most dangerous thing the owner can do -
        it swaps the source of every future decision - so it is logged like
        everything else and refuses the zero address."""
        self._only_owner()
        nxt = Address(str(new_oracle))
        if nxt == Address("0x0000000000000000000000000000000000000000"):
            raise gl.vm.UserError(ERR + " refusing the zero address")
        self.oracle = nxt
        self._note("set_oracle", nxt.as_hex)

    @gl.public.write
    def transfer_ownership(self, new_owner: str) -> None:
        self._only_owner()
        nxt = Address(str(new_owner))
        if nxt == Address("0x0000000000000000000000000000000000000000"):
            raise gl.vm.UserError(ERR + " refusing the zero address")
        self.owner = nxt
        self._note("transfer_ownership", nxt.as_hex)
