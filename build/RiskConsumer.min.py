# v0.3.0
# { "Depends": "py-genlayer:test" }
import genlayer as gl
from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import typing
_0 = 'token_address'
_1 = '0x0000000000000000000000000000000000000000'
_2 = 'rug_level'
_3 = 'overall_score'
_4 = ' refusing the zero address'
_5 = 'chain'
_6 = 'CRITICAL'
_7 = 'trade_cap'
_8 = 'oracle unreadable'
_9 = ' not listed: '
_m = 'badge'
_n = 'symbol'
_o = 'listable'
_p = 'explorer_url'
_q = 'age_seconds'
_r = 'confidence'
_s = 'found'
_t = 'rug_flags'
_u = 'reason'
_v = 'tier'
_f = 50
_d = 2592000
_e = "MEDIUM"
_g = 500
_i = 200
_h = "[EXPECTED]"
_j = {"NONE": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, _6: 4}
_a = (50, 70, 85)
_b = ("rejected", "watchlist", "standard", "blue_chip")
_c = (0, 1000, 100000, 10000000)
def _k(c: int, d: str) -> int:
 if _j.get(str(d), 4) >= 3:
  return 0
 a = 0
 for b in _a:
  if c >= b:
   a = a + 1
 return a
def _l(b: str, a: int = 120) -> str:
 b = str(b)
 return b[:a] if len(b) > a else b
@gl.contract.interface
class ITokenScope:
 class View:
  def get_risk(self, b: str, a: str) -> typing.Any: ...
  def is_safe(self, c: str, a: str,
  b: int) -> bool: ...
  def require_safe(self, e: str, a: str, d: int,
  b: int,
  c: str) -> typing.Any: ...
  def check_rug_pull(self, b: str,
  a: str) -> typing.Any: ...
  def get_badge(self, b: str, a: str) -> typing.Any: ...
  def get_stats(self) -> typing.Any: ...
 class Write:
  pass
@gl.storage.allow
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
class RiskConsumer(gl.contract.Contract):
 owner: Address
 oracle: Address
 min_score: u32
 max_age_seconds: u64
 max_rug_level: str
 slots: u32
 listings: gl.storage.DynArray[Listing]
 listed: gl.storage.TreeMap[str, bool]
 listing_count: u32
 log: gl.storage.DynArray[str]
 def __init__(self, a: str):
  self.owner = gl.message.sender_address
  self.oracle = Address(str(a))
  self.min_score = u32(_f)
  self.max_age_seconds = u64(_d)
  self.max_rug_level = _e
  self.slots = u32(_g)
  self.listing_count = u32(0)
 def _now(self) -> int:
  return int(datetime.now(timezone.utc).timestamp())
 def _only_owner(self) -> None:
  if gl.message.sender_address != self.owner:
   raise gl.vm.UserError(_h + " owner only")
 def _oracle(self) -> typing.Any:
  return ITokenScope(self.oracle)
 def _key(self, b: str, a: str) -> str:
  return str(a).strip().lower() + ":" + str(b).strip().lower()
 def _note(self, a: str, b: str) -> None:
  if len(self.log) >= _i:
   return
  self.log.append(str(self._now()) + " " + a + " " + _l(b))
 def _row(self, a: Listing) -> dict:
  return {
  _0: str(a.token),
  _5: str(a.chain),
  _n: str(a.symbol),
  "overall": int(a.overall),
  _2: str(a.rug_level),
  _m: str(a.badge),
  _v: _b[int(a.band)],
  _7: int(a.trade_cap),
  "score_id": int(a.score_id),
  "listed_at": int(a.listed_at),
  "lister": a.lister.as_hex,
  }
 @gl.public.view
 def preview_listing(self, token_address: str, chain: str) -> typing.Any:
  try:
   f = self._oracle().view().get_risk(token_address, chain)
  except Exception:
   return {_o: False,
   _u: "oracle unreadable or malformed address",
   _0: str(token_address), _5: str(chain)}
  if not f.get(_s):
   return {_o: False, _u: "never scored",
   "hint": "call request_risk on the oracle first",
   _0: str(token_address), _5: str(chain),
   _m: "UNSCORED"}
  d = int(f.get(_3, 0))
  g = str(f.get(_2, _6))
  a = int(f.get(_q, 0))
  b = _k(d, g)
  e = []
  if d < int(self.min_score):
   e.append("overall " + str(d) + " below floor "
   + str(int(self.min_score)))
  if _j.get(g, 4) > _j.get(str(self.max_rug_level), 2):
   e.append("rug level " + g + " above ceiling "
   + str(self.max_rug_level))
  c = int(self.max_age_seconds)
  if c > 0 and a > c:
   e.append("score is " + str(a) + "s old, limit "
   + str(c) + "s")
  if self._key(str(f.get(_0, "")),
  str(f.get(_5, ""))) in self.listed:
   e.append("already listed")
  if int(self.listing_count) >= int(self.slots):
   e.append("no slots left")
  return {
  _o: len(e) == 0,
  "reasons": e,
  _0: str(f.get(_0, token_address)),
  _5: str(f.get(_5, chain)),
  _n: str(f.get(_n, "")),
  "overall": d,
  _2: g,
  _t: f.get(_t, []),
  _m: str(f.get(_m, "")),
  _r: str(f.get(_r, "LOW")),
  _q: a,
  _v: _b[b],
  _7: _c[b],
  _p: str(f.get(_p, "")),
  }
 @gl.public.view
 def check_rug_pull(self, token_address: str, chain: str) -> typing.Any:
  try:
   a = self._oracle().view().check_rug_pull(token_address, chain)
  except Exception:
   return {_s: False, _u: _8,
   _0: str(token_address), _5: str(chain)}
  if isinstance(a, dict) and a.get(_s):
   b = str(a.get(_2, _6))
   a["blocked_here"] = (
   _j.get(b, 4)
   > _j.get(str(self.max_rug_level), 2))
   a["venue_max_rug_level"] = str(self.max_rug_level)
  return a
 @gl.public.view
 def is_listable(self, token_address: str, chain: str) -> bool:
  try:
   return bool(self._oracle().view().is_safe(
   token_address, chain, int(self.min_score)))
  except Exception:
   return False
 @gl.public.view
 def get_listing(self, token_address: str, chain: str) -> typing.Any:
  c = self._key(token_address, chain)
  for a in range(len(self.listings)):
   b = self.listings[a]
   if self._key(str(b.token), str(b.chain)) == c:
    return self._row(b)
  return {_s: False, _0: str(token_address),
  _5: str(chain)}
 @gl.public.view
 def get_listings(self, count: int) -> typing.Any:
  b = int(count)
  d = len(self.listings)
  if b <= 0 or b > d:
   b = d
  c = []
  for a in range(d - b, d):
   c.append(self._row(self.listings[a]))
  return {"listed": int(self.listing_count), "returned": len(c),
  "slots": int(self.slots), "listings": c}
 @gl.public.view
 def get_policy(self) -> typing.Any:
  return {
  "oracle": self.oracle.as_hex,
  "owner": self.owner.as_hex,
  "custody": False,
  "min_score": int(self.min_score),
  "max_age_seconds": int(self.max_age_seconds),
  "max_rug_level": str(self.max_rug_level),
  "slots": int(self.slots),
  "listed": int(self.listing_count),
  "tiers": [{_v: _b[a + 1], "floor": _a[a],
  _7: _c[a + 1]}
  for a in range(len(_a))],
  "note": "a HIGH or CRITICAL rug level caps the tier at rejected "
                    "regardless of the overall score",
  }
 @gl.public.view
 def get_oracle_stats(self) -> typing.Any:
  try:
   return self._oracle().view().get_stats()
  except Exception:
   return {"error": _8, "oracle": self.oracle.as_hex}
 @gl.public.view
 def get_log(self, count: int) -> typing.Any:
  b = len(self.log)
  a = int(count)
  if a <= 0 or a > b:
   a = b
  return {"total": b,
  "entries": [str(self.log[c]) for c in range(b - a, b)]}
 @gl.public.write
 def list_token(self, token_address: str, chain: str) -> typing.Any:
  if int(self.listing_count) >= int(self.slots):
   raise gl.vm.UserError(_h + " no listing slots left")
  f = self._oracle().view().require_safe(
  token_address, chain, int(self.min_score),
  int(self.max_age_seconds), str(self.max_rug_level))
  h = str(f.get(_0, ""))
  b = str(f.get(_5, ""))
  d = self._key(h, b)
  if d in self.listed:
   raise gl.vm.UserError(_h + " already listed: " + d)
  e = int(f.get(_3, 0))
  g = str(f.get(_2, _6))
  a = _k(e, g)
  if a <= 0:
   raise gl.vm.UserError(_h + " tier is rejected for " + d)
  c = self.listings.append_new_get()
  c.token = h
  c.chain = b
  c.symbol = str(f.get(_n, ""))
  c.lister = gl.message.sender_address
  c.overall = u32(e)
  c.rug_level = g
  c.badge = str(f.get(_m, ""))
  c.band = u32(a)
  c.trade_cap = u64(_c[a])
  c.score_id = u32(int(f.get("score_id", 0)))
  c.listed_at = u64(self._now())
  self.listed[d] = True
  self.listing_count = u32(int(self.listing_count) + 1)
  self._note("list", d + " " + str(e) + " " + g)
  return self._row(c)
 @gl.public.write
 def guard_trade(self, token_address: str, chain: str,
 amount: int) -> typing.Any:
  e = self._key(token_address, chain)
  if e not in self.listed:
   raise gl.vm.UserError(_h + _9 + e)
  c = self._oracle().view().require_safe(
  token_address, chain, int(self.min_score),
  int(self.max_age_seconds), str(self.max_rug_level))
  a = _k(int(c.get(_3, 0)),
  str(c.get(_2, _6)))
  b = _c[a]
  d = int(amount)
  if d <= 0:
   raise gl.vm.UserError(_h + " amount must be positive")
  if d > b:
   raise gl.vm.UserError(_h + " trade of " + str(d)
   + " exceeds the " + _b[a]
   + " cap of " + str(b))
  return {"allowed": True, _0: e, "amount": d,
  _v: _b[a], _7: b,
  "current_overall": int(c.get(_3, 0)),
  "current_rug_level": str(c.get(_2, ""))}
 @gl.public.write
 def delist(self, token_address: str, chain: str) -> None:
  self._only_owner()
  d = self._key(token_address, chain)
  if d not in self.listed:
   raise gl.vm.UserError(_h + _9 + d)
  c = []
  for a in range(len(self.listings)):
   b = self.listings[a]
   if self._key(str(b.token), str(b.chain)) != d:
    c.append((str(b.token), str(b.chain),
    str(b.symbol), b.lister, int(b.overall),
    str(b.rug_level), str(b.badge),
    int(b.band), int(b.trade_cap),
    int(b.score_id), int(b.listed_at)))
  while len(self.listings) > len(c):
   self.listings.pop()
  for a in range(len(c)):
   b = self.listings[a]
   b.token = c[a][0]
   b.chain = c[a][1]
   b.symbol = c[a][2]
   b.lister = c[a][3]
   b.overall = u32(c[a][4])
   b.rug_level = c[a][5]
   b.badge = c[a][6]
   b.band = u32(c[a][7])
   b.trade_cap = u64(c[a][8])
   b.score_id = u32(c[a][9])
   b.listed_at = u64(c[a][10])
  del self.listed[d]
  self.listing_count = u32(len(c))
  self._note("delist", d)
 @gl.public.write
 def set_policy(self, min_score: int, max_age_seconds: int,
 max_rug_level: str) -> None:
  self._only_owner()
  b = int(min_score)
  if b < 0 or b > 100:
   raise gl.vm.UserError(_h + " min_score must be 0..100")
  a = int(max_age_seconds)
  if a < 0:
   raise gl.vm.UserError(_h + " max_age_seconds must not be negative")
  c = str(max_rug_level).upper()
  if c not in _j:
   raise gl.vm.UserError(_h + " max_rug_level must be one of "
   + ",".join(sorted(_j.keys())))
  self.min_score = u32(b)
  self.max_age_seconds = u64(a)
  self.max_rug_level = c
  self._note("set_policy", str(b) + " " + str(a) + " " + c)
 @gl.public.write
 def set_oracle(self, new_oracle: str) -> None:
  self._only_owner()
  a = Address(str(new_oracle))
  if a == Address(_1):
   raise gl.vm.UserError(_h + _4)
  self.oracle = a
  self._note("set_oracle", a.as_hex)
 @gl.public.write
 def transfer_ownership(self, new_owner: str) -> None:
  self._only_owner()
  a = Address(str(new_owner))
  if a == Address(_1):
   raise gl.vm.UserError(_h + _4)
  self.owner = a
  self._note("transfer_ownership", a.as_hex)
