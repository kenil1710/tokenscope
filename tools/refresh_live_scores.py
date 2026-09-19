#!/usr/bin/env python3
"""Regenerate the live-score table in README.md and deployments.json FROM CHAIN.

These figures have gone stale twice, both times the same way: a redeploy
happened, the numbers were re-typed by hand from a scan log, and one of them
was from the previous deployment. A score that a reader can check against the
chain is the whole point of this project, so a table that quietly disagrees
with the chain is worse than no table.

    python3 tools/refresh_live_scores.py            # rewrite both files
    python3 tools/refresh_live_scores.py --check    # exit 1 if they disagree

`--check` is the form for CI: it never writes, it just fails when a documented
number no longer matches what `get_risk` returns.

The oracle address is read out of deployments.json, so this cannot be pointed
at a deployment the manifest does not claim.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "deployments.json"
README = ROOT / "README.md"

# The demo set, in the order the table presents them.
TOKENS = [
    ("USDT",  "0xdAC17F958D2ee523a2206206994597C13D831ec7", "ethereum"),
    ("PEPE",  "0x6982508145454ce325ddbe47a25d4ec3d2311933", "ethereum"),
    ("LINK",  "0x514910771af9ca656af840dff83e8264ecf986ca", "ethereum"),
    ("SHIB",  "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", "ethereum"),
    ("USDT0", "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", "arbitrum"),
]

BEGIN = "<!-- live-scores:begin -->"
END = "<!-- live-scores:end -->"


def call(oracle: str, method: str, *args: str) -> str:
    cmd = ["genlayer", "call", oracle, method]
    if args:
        cmd += ["--args", *args]
    for _attempt in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        out = r.stdout
        if "Result:" in out:
            return out[out.index("Result:"):]
        # studio-dev answers "Server busy: all 8 execution slots occupied"
        # under load; that is not a missing record.
        if "Server busy" not in out + r.stderr:
            break
    return ""


def field(text: str, key: str):
    m = re.search(key + r":\s*'([^']*)'", text) or re.search(key + r":\s*(\d+)", text)
    return m.group(1) if m else None


def flags(text: str) -> list[str]:
    m = re.search(r"rug_flags:\s*\[([^\]]*)\]", text, re.S)
    if not m or not m.group(1).strip():
        return []
    return [x.strip().strip("'") for x in m.group(1).split(",") if x.strip()]


def read_chain(oracle: str) -> dict:
    out = {}
    for sym, addr, chain in TOKENS:
        t = call(oracle, "get_risk", addr, chain)
        if not t or field(t, "found") == "false" or "found: true" not in t:
            print(f"  !! {sym}: no record on chain", file=sys.stderr)
            continue
        out[sym] = {
            "chain": chain,
            "address": addr,
            "token_id": int(field(t, "token_id") or 0),
            "overall": int(field(t, "overall_score") or 0),
            "distribution": int(field(t, "distribution_score") or 0),
            "activity": int(field(t, "activity_score") or 0),
            "verification": int(field(t, "verification_score") or 0),
            "maturity": int(field(t, "maturity_score") or 0),
            "liquidity": int(field(t, "liquidity_score") or 0),
            "rug_level": field(t, "rug_level"),
            "badge": field(t, "badge"),
            "confidence": field(t, "confidence"),
            "content_hash": field(t, "content_hash"),
            "sources_ok": field(t, "sources_ok"),
            "rug_flags": flags(t),
        }
    return out


def table(scores: dict) -> str:
    rows = [
        "| Token | Chain | `token_id` | Overall | Verification | Rug level | Content hash | Rug flags |",
        "|---|---|---:|---:|---:|---|---|---|",
    ]
    for sym, _a, _c in TOKENS:
        r = scores.get(sym)
        if not r:
            continue
        short = r["address"][:10] + "…" + r["address"][-5:]
        rows.append(
            f"| {sym} | {r['chain']} | {r['token_id']} | **{r['overall']}** | "
            f"{r['verification']} | {r['rug_level']} | `{r['content_hash']}` | "
            f"{', '.join(r['rug_flags']) or 'none'} |")
    return "\n".join(rows)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="verify without writing; exit 1 on any disagreement")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text())
    oracle = manifest["deployments"]["studio-dev"]["TokenScope"]["address"]
    print(f"reading {len(TOKENS)} tokens from {oracle}")
    scores = read_chain(oracle)
    if len(scores) != len(TOKENS):
        print(f"only {len(scores)}/{len(TOKENS)} records found on chain",
              file=sys.stderr)
        return 1

    readme = README.read_text()
    if BEGIN not in readme or END not in readme:
        print(f"README is missing the {BEGIN} / {END} markers", file=sys.stderr)
        return 1
    head, rest = readme.split(BEGIN, 1)
    _old, tail = rest.split(END, 1)
    fresh = f"{BEGIN}\n{table(scores)}\n{END}"
    new_readme = head + fresh + tail

    recorded = manifest.get("live_scores", {})
    drift = []
    for sym, r in scores.items():
        key = f"{sym} {r['chain']}"
        was = recorded.get(key, {})
        for f in ("overall", "verification", "content_hash", "rug_level"):
            if was.get(f) != r[f]:
                drift.append(f"{key}.{f}: manifest {was.get(f)!r} != chain {r[f]!r}")

    if args.check:
        stale = drift or (new_readme != readme)
        for d in drift:
            print("  DRIFT", d)
        if new_readme != readme:
            print("  DRIFT README table does not match the chain")
        print("live scores are current" if not stale else "live scores are STALE")
        return 1 if stale else 0

    for sym, r in scores.items():
        recorded.setdefault(f"{sym} {r['chain']}", {}).update(r)
    manifest["live_scores"] = recorded
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    README.write_text(new_readme)
    for d in drift:
        print("  updated:", d)
    print("README table and deployments.json refreshed from chain")
    return 0


if __name__ == "__main__":
    sys.exit(main())
