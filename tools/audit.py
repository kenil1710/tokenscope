#!/usr/bin/env python3
"""Cross-file consistency audit.

`test/test_logic.py` proves the contract behaves. This proves the REPOSITORY
agrees with itself — which is a different failure and one tests never catch,
because nothing imports a README. Every check here is something that has
actually drifted at least once in this project:

  - a method added to the contract and never documented
  - a rug flag renamed in the contract and left stale in the UI's explanation
    table, so the page confidently explains a flag that can no longer fire
  - `get_config` advertising a different flag vocabulary from `_rug_flags`
  - a rebuilt artifact whose checksum in `deployments.json` still describes
    the previous one, which makes "verify with shasum" a lie

Run from the repository root:  python3 tools/audit.py
Exit code 1 on any failure, so it can gate a commit.
"""
from __future__ import annotations

import ast
import hashlib
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FAILURES: list[str] = []


def check(ok: bool, message: str) -> None:
    print(("  ok    " if ok else "  FAIL  ") + message)
    if not ok:
        FAILURES.append(message)


def section(title: str) -> None:
    print("\n— " + title)


def read(relative: str) -> str:
    return io.open(ROOT / relative, encoding="utf8").read()


def class_methods(tree: ast.AST) -> set[str]:
    out: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            out |= {m.name for m in node.body if isinstance(m, ast.FunctionDef)}
    return out


def main() -> int:
    source = read("contracts/TokenScope.py")
    tree = ast.parse(source)

    section("every public method is documented")
    public = {
        m.name
        for node in ast.walk(tree)
        if isinstance(node, ast.ClassDef) and node.name == "TokenScope"
        for m in node.body
        if isinstance(m, ast.FunctionDef) and not m.name.startswith("_")
    }
    readme = read("README.md")
    for name in sorted(public):
        check(name in readme, f"README mentions {name}")

    section("rug-flag vocabulary agrees in three places")
    emitted = re.findall(r'out\.append\("([A-Z_]+)"\)', source)
    advertised = re.findall(
        r'"([A-Z_]+)"', re.search(r'"rug_flag_names": \[(.*?)\]', source, re.S).group(1)
    )
    check(emitted == advertised,
          f"_rug_flags emission order == get_config rug_flag_names ({len(emitted)})")
    risk_ts = read("frontend/src/lib/risk.ts")
    ui = re.findall(
        r"^  ([A-Z_]+): \{",
        re.search(r"export const FLAG_META[^{]*\{(.*?)\n\};", risk_ts, re.S).group(1),
        re.M,
    )
    check(ui == emitted, "frontend FLAG_META explains exactly these flags, in order")

    section("the consensus vector")
    keys = re.findall(
        r'\("([a-z0-9_]+)", (\d+)\)',
        re.search(r"FEATURE_RANGE = \((.*?)\n\)", source, re.S).group(1),
    )
    names = [k for k, _ in keys]
    check(len(names) == 32, f"32 ordinals (got {len(names)})")
    check(names == sorted(names), "FEATURE_RANGE is sorted")
    check(len(set(names)) == len(names), "no duplicate ordinals")

    section("the deployable artifact")
    artifact = (ROOT / "build/TokenScope.min.py").read_bytes()
    check(len(artifact) <= 53_000,
          f"artifact {len(artifact):,} bytes within the 53,000 pubdata budget")
    mapping = json.loads((ROOT / "build/TokenScope.min.names.json").read_text())
    check(len(set(mapping.values())) == len(mapping),
          f"minifier name map is injective ({len(mapping)} renames)")
    check(class_methods(tree) == class_methods(ast.parse(artifact.decode())),
          "every class method survives minification")

    section("deployments.json describes the files that are actually here")
    manifest = json.loads((ROOT / "deployments.json").read_text())
    for path, meta in manifest["artifacts"].items():
        blob = (ROOT / path).read_bytes()
        check(hashlib.sha256(blob).hexdigest() == meta["sha256"],
              f"{path} sha256")
        check(len(blob) == meta["bytes"], f"{path} byte count")
        src_blob = (ROOT / meta["source"]).read_bytes()
        check(hashlib.sha256(src_blob).hexdigest() == meta["source_sha256"],
              f"{meta['source']} sha256")
    check(manifest["rubric_version"] == re.search(
        r'RUBRIC_VERSION = "([^"]+)"', source).group(1),
        "deployments.json rubric_version matches the contract")

    section("the frontend calls what the contract exposes")
    client = read("frontend/src/lib/contract.ts")
    for method in ("get_risk_history", "get_history_by_address", "batch_scan",
                   "rescan_token", "check_rug_pull", "verify_risk"):
        check(f'"{method}"' in client, f"{method} wired in lib/contract.ts")
        check(method in public or method.startswith("_"),
              f"{method} exists on the contract")

    print("\n" + ("AUDIT CLEAN" if not FAILURES
                  else f"{len(FAILURES)} PROBLEM(S)"))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
