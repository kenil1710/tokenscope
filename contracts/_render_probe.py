# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# Throwaway diagnostic, not part of TokenScope. It answers the questions that
# decide the whole project before a line of extraction is written:
#
#   1. Does validator egress reach Blockscout's /api/v2 at all?
#   2. Which of the four token endpoints answer, and with what shape?
#   3. Do the other three chains (base, arbitrum, polygon) answer identically?
#
# AuditCourt already pulled /api/v2/smart-contracts/{addr} from this egress, so
# the host is expected to resolve; what is NOT established is whether the token
# endpoints (/tokens/{a}, /tokens/{a}/holders, /tokens/{a}/transfers) answer
# unauthenticated, and whether /addresses/{a} carries the verification and
# creation fields the maturity and verification dimensions need.
#
# Every extraction rule in TokenScope is written against the bodies this
# captures, never against assumptions about Blockscout's schema.
#
# Line 1 must stay the runner pin: a comment above it makes the contract
# undeployable and the only error reported is `invalid_contract`.

from genlayer import *

import json


def _status(res) -> int:
    s = getattr(res, "status_code", None)
    if s is None:
        s = getattr(res, "status", None)
    if s is None:
        return 0
    return int(s)


def _body(res) -> str:
    b = getattr(res, "body", None)
    if b is None:
        b = getattr(res, "text", None)
    if b is None:
        return ""
    if isinstance(b, bytes):
        return b.decode("utf-8", errors="ignore")
    return str(b)


def _fetch(url: str) -> tuple:
    """(status, body). Tries web.request first and falls back to web.get:
    AuditCourt used `gl.nondet.web.get`, SocialOracle used
    `gl.nondet.web.request`, and the probe should not die on which one this
    runner build exposes."""
    try:
        res = gl.nondet.web.request(url, method="GET")
    except AttributeError:
        res = gl.nondet.web.get(url)
    return _status(res), _body(res)


class RenderProbe(gl.Contract):
    url: str
    text: str
    text_len: u32
    statuses: str

    def __init__(self):
        self.url = ""
        self.text = ""
        self.text_len = u32(0)
        self.statuses = ""

    @gl.public.write
    def probe_statuses(self, urls: list) -> None:
        """HTTP status + body length for each plain GET, one transaction.

        Distinguishes 'blocked' from 'empty' - a 403 is an egress block, a 200
        with a 40-byte body is an endpoint that exists but says nothing, and
        they call for different pivots."""
        targets = [str(u) for u in urls][:10]

        def leader_fn() -> dict:
            found = {}
            for u in targets:
                try:
                    st, body = _fetch(u)
                    found[u] = {"status": st, "len": len(body),
                                "head": body[:200]}
                except Exception as e:
                    found[u] = {"status": -1, "len": -1, "err": str(e)[:200]}
            return found

        def validator_fn(leader_result: gl.vm.Result) -> bool:
            # Shape only. A validator that re-fetched would disagree on every
            # live holder count and the probe would never commit - which is the
            # whole reason TokenScope itself agrees on buckets, not on bytes.
            return isinstance(leader_result, gl.vm.Return)

        self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

    @gl.public.write
    def probe_get(self, url: str, start: int, count: int) -> None:
        """Raw GET, no browser, and keep a window of the body.

        Windowed rather than whole: a holders or transfers page is tens of KB
        and the interesting parts are found by walking the window forward
        across calls rather than by pushing the page through consensus."""
        begin = int(start)
        span = int(count)
        if span <= 0 or span > 12000:
            span = 12000

        def leader_fn() -> dict:
            st, body = _fetch(url)
            return {"len": len(body), "status": st,
                    "window": body[begin:begin + span]}

        def validator_fn(leader_result: gl.vm.Result) -> bool:
            return isinstance(leader_result, gl.vm.Return)

        out = gl.vm.run_nondet(leader_fn, validator_fn)
        self.url = str(url) + " [status " + str(out["status"]) + "]"
        self.text_len = u32(int(out["len"]))
        self.text = str(out["window"])

    @gl.public.write
    def probe_keys(self, url: str) -> None:
        """The document's SHAPE rather than its bytes: top-level keys with the
        type and a short sample of each, and the same for the first element of
        whichever list the payload carries.

        This is what actually gets written against. A 60 KB holders page shown
        200 characters at a time takes a dozen transactions to understand; its
        key list takes one."""

        def leader_fn() -> dict:
            st, body = _fetch(url)
            try:
                doc = json.loads(body)
            except ValueError:
                return {"status": st, "len": len(body),
                        "err": "unparseable", "head": body[:400]}

            def describe(d) -> dict:
                out = {}
                if not isinstance(d, dict):
                    return {"_type": type(d).__name__}
                for k in sorted(d.keys()):
                    v = d[k]
                    if isinstance(v, dict):
                        out[str(k)] = "dict{" + ",".join(sorted(
                            [str(x) for x in v.keys()])[:14]) + "}"
                    elif isinstance(v, list):
                        out[str(k)] = "list[" + str(len(v)) + "]"
                    else:
                        out[str(k)] = str(type(v).__name__) + "=" + str(v)[:90]
                return out

            info = {"status": st, "len": len(body)}
            if isinstance(doc, dict):
                info["top"] = describe(doc)
                # Blockscout list endpoints wrap rows in "items".
                for lk in ("items", "result"):
                    rows = doc.get(lk)
                    if isinstance(rows, list) and len(rows) > 0:
                        info["list_key"] = lk
                        info["list_len"] = len(rows)
                        info["item0"] = describe(rows[0])
                        break
            elif isinstance(doc, list):
                info["top"] = "list[" + str(len(doc)) + "]"
                if len(doc) > 0:
                    info["item0"] = describe(doc[0])
            return info

        def validator_fn(leader_result: gl.vm.Result) -> bool:
            return isinstance(leader_result, gl.vm.Return)

        self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

    @gl.public.view
    def get_len(self) -> int:
        return int(self.text_len)

    @gl.public.view
    def get_window(self) -> str:
        return str(self.text)

    @gl.public.view
    def get_slice(self, start: int, count: int) -> str:
        s = str(self.text)
        a = int(start)
        n = int(count)
        if a < 0:
            a = 0
        if n <= 0 or n > 4000:
            n = 4000
        return s[a:a + n]

    @gl.public.view
    def get_statuses(self) -> str:
        return str(self.statuses)
