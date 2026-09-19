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

    section("the v0.6 contract format")
    # Each of these fails on chain with an error that names neither the line
    # nor the reason, so each gets a check here. docs/PROBE.md section 12.
    for rel in ("contracts/TokenScope.py", "contracts/RiskConsumer.py",
                "contracts/_render_probe.py",
                "build/TokenScope.min.py", "build/RiskConsumer.min.py"):
        text = read(rel)
        lines = text.split("\n")
        check(lines[0] == "# v0.3.0", f"{rel}: version line first")
        check(lines[1] == '# { "Depends": "py-genlayer:test" }',
              f"{rel}: runner id on line 2")
        check(not lines[2].lstrip().startswith("#"),
              f"{rel}: nothing else looks like runner config")
        tree_ = ast.parse(text)
        # A bare TreeMap/DynArray/allow is a NameError on chain: the star
        # import does not bind them, only gl.storage.* does.
        bare = sorted({
            n.id for n in ast.walk(tree_)
            if isinstance(n, ast.Name)
            and n.id in ("TreeMap", "DynArray", "Array", "allow_storage")
        })
        check(not bare, f"{rel}: no unqualified storage names {bare or ''}")
        check("gl.vm.run_nondet_unsafe" not in text,
              f"{rel}: no pre-v0.6 run_nondet_unsafe")
        # Structural, not textual: the docstring that explains this rename
        # legitimately contains the old spelling.
        legacy = [
            n for n in ast.walk(tree_)
            if isinstance(n, ast.Attribute)
            and n.attr in ("contract_interface", "Contract", "get_contract_at")
            and isinstance(n.value, ast.Name) and n.value.id == "gl"
        ]
        check(not legacy,
              f"{rel}: no pre-v0.6 gl.contract_interface / gl.Contract")
    # UserError moved its payload to .data; reading .message returns "" and
    # would make every error-class comparison succeed.
    source_text = read("contracts/TokenScope.py")
    check('getattr(e, "message"' not in source_text
          and 'getattr(res, "message"' not in source_text,
          "TokenScope reads error text through _err_text, not .message")
    check("def _err_text(" in source_text, "the _err_text helper exists")

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

    section("nothing still points at a retired network")
    for rel in ("README.md", "deployments.json", "frontend/.env.example",
                "tools/deploy_studio_dev.sh"):
        low = read(rel).lower()
        check("bradbury" not in low, f"{rel}: no Bradbury references")
        check("studionet" not in low, f"{rel}: no Studionet references")
    # .env.example is copied verbatim by developers, so a stale address there
    # is a silent not-found rather than an error.
    env = read("frontend/.env.example")
    manifest = json.loads((ROOT / "deployments.json").read_text())
    live = manifest["deployments"]["studio-dev"]
    check(live["TokenScope"]["address"] in env,
          ".env.example carries the deployed TokenScope address")
    check(live["RiskConsumer"]["address"] in env,
          ".env.example carries the deployed RiskConsumer address")
    fe = read("frontend/src/lib/genlayer.ts")
    check("studioDevnet" in fe, "frontend targets studioDevnet")
    check("61997" in json.dumps(json.loads(
        (ROOT / "deployments.json").read_text())),
        "deployments.json records chain 61997")

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

    section("rejection patterns")
    tree_ts = ast.parse(source)
    cls = next(n for n in tree_ts.body
               if isinstance(n, ast.ClassDef) and n.name == "TokenScope")
    meths = {m.name: m for m in cls.body if isinstance(m, ast.FunctionDef)}

    # 1. every rug flag reads only ordinals that consensus agreed on
    rf = next(n for n in tree_ts.body
              if isinstance(n, ast.FunctionDef) and n.name == "_rug_flags")
    read_keys = {n.slice.value for n in ast.walk(rf)
                 if isinstance(n, ast.Subscript) and isinstance(n.slice, ast.Constant)}
    vector = {k for k, _ in re.findall(
        r'\("([a-z0-9_]+)", (\d+)\)',
        re.search(r"FEATURE_RANGE = \((.*?)\n\)", source, re.S).group(1))}
    check(read_keys <= vector,
          f"every rug flag reads only agreed ordinals ({sorted(read_keys - vector) or 'ok'})")

    # 2. no stored field is copied from the leader's payload
    scan = meths["_scan"]
    leaked = [t.attr for n in ast.walk(scan)
              if isinstance(n, ast.Assign) and len(n.targets) == 1
              and isinstance(t := n.targets[0], ast.Attribute)
              and isinstance(t.value, ast.Name) and t.value.id == "rec"
              and re.search(r"\bout\[", ast.unparse(n.value))]
    check(not leaked, f"no stored field reads leader output {leaked or ''}")

    # 4. every payable entry funnels into the one path that always refunds
    payable = [n for n, m in meths.items()
               if any("payable" in ast.unparse(d) for d in m.decorator_list)]
    check(all("self._scan(" in ast.unparse(meths[n]) for n in payable),
          f"every payable method delegates to _scan {payable}")
    check("self._credit(sender, value - fee)" in ast.unparse(scan),
          "the success path credits any overpayment back")

    # 5. a pause cannot strand a refund, and the owner cannot reach one
    check("self.paused" not in ast.unparse(meths["claim_refund"]),
          "claim_refund ignores `paused`")
    check("int(self.balance) - int(self.refunds_owed)" in ast.unparse(meths["withdraw"]),
          "withdraw reserves refunds_owed")

    # 11. the runner rejects str.replace
    for rel in ("contracts/TokenScope.py", "contracts/RiskConsumer.py",
                "build/TokenScope.min.py", "build/RiskConsumer.min.py"):
        check(".replace(" not in read(rel), f"{rel}: no str.replace()")

    section("custody is declared, and the declaration is checkable")
    check('"custody": False' in source, "TokenScope declares custody: false")
    check('"custody": False' in read("contracts/RiskConsumer.py"),
          "RiskConsumer declares custody: false")
    # Structural, not textual. The docstring that EXPLAINS these properties
    # names every one of them, so a substring search finds its own comment
    # and reports a failure that is not there.
    ctree = ast.parse(read("contracts/RiskConsumer.py"))
    ccls = next(n for n in ctree.body
                if isinstance(n, ast.ClassDef) and n.name == "RiskConsumer")
    cmeths = [m for m in ccls.body if isinstance(m, ast.FunctionDef)]
    check(not [m for m in cmeths
               if any("payable" in ast.unparse(d) for d in m.decorator_list)],
          "RiskConsumer has no payable method")
    reads_value = [n for n in ast.walk(ctree)
                   if isinstance(n, ast.Attribute) and n.attr == "value"
                   and ast.unparse(n).endswith("gl.message.value")]
    check(not reads_value, "RiskConsumer never reads gl.message.value")
    check(not [m for m in cmeths if m.name in ("__receive__",
                                               "__handle_undefined_method__")],
          "RiskConsumer does not override __receive__, so value transfers are refused")
    check(not [n for n in ast.walk(ctree)
               if isinstance(n, ast.Attribute) and n.attr == "emit_transfer"],
          "RiskConsumer has no transfer path at all")

    print("\n" + ("AUDIT CLEAN" if not FAILURES
                  else f"{len(FAILURES)} PROBLEM(S)"))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
