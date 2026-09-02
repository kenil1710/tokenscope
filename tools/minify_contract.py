#!/usr/bin/env python3
"""
Strips a GenLayer contract down to what the chain actually needs to execute.

Bradbury refuses deploys somewhere between 48 KB and 64 KB of source, and
`contracts/proof_work.py` is 156 KB. Just under half of that is comments,
docstrings and blank lines — bytes that cost real deploy payload and buy the
chain nothing. This produces the deployable artifact while the readable source
stays in git, so nothing is lost from the repository.

Deliberately conservative. Every transformation below preserves Python
semantics exactly; none of them rename anything, reorder anything, or touch a
single expression. Identifier mangling would shrink it further and is not done
here, because a contract whose behaviour depends on an LLM reading its own
prompt strings is a bad place to be clever.

    python3 tools/minify_contract.py contracts/proof_work.py -o build/proof_work.min.py

What it removes:
  - comments (except the runner header on line 1, which the VM requires)
  - docstrings, at module, class and function level
  - blank lines
  - trailing whitespace
  - indentation beyond one space per level

What it rewrites:
  - repeated string literals, bound once to a short module-level name. The
    VALUE is never altered — a name is substituted for a literal that evaluates
    to exactly the same string — so this is weaker than the identifier renaming
    below, which is still refused.

What it never touches:
  - line 1, byte for byte
  - the value of any string, prompt templates included
  - annotations, f-string fragments or `match` patterns, where a name and a
    literal do not mean the same thing
  - the order or content of any statement
"""

from __future__ import annotations

import argparse
import ast
import builtins
import io
import sys
import tokenize
from pathlib import Path


def _docstring_spans(source: str) -> set[tuple[int, int]]:
    """(start_line, end_line) of every discardable string statement, 1-based.

    Two kinds, both removable for the same reason — a bare string used as a
    statement is evaluated and thrown away, so it cannot affect behaviour:

    1. **Docstrings** — the first statement of a module, class or function.
    2. **Attribute docstrings** (PEP 258) — a string placed *after* a constant
       to document it. This contract uses that idiom heavily and it accounts
       for ~24 KB, more than the docstrings proper.

    Found via the AST, never by matching triple quotes: this contract is full of
    triple-quoted strings that are *values* (prompt templates above all), and
    deleting one of those would change what the validators are asked.

    A string that is the *only* statement in a body is kept, or the body becomes
    syntactically empty and the file stops parsing.
    """
    spans: set[tuple[int, int]] = set()
    tree = ast.parse(source)

    for node in ast.walk(tree):
        body = getattr(node, "body", None)
        if not isinstance(body, list) or len(body) <= 1:
            continue
        for statement in body:
            if (
                isinstance(statement, ast.Expr)
                and isinstance(statement.value, ast.Constant)
                and isinstance(statement.value.value, str)
            ):
                spans.add((statement.lineno, statement.end_lineno or statement.lineno))
    return spans


def _strip_comments(source: str) -> str:
    """Removes comment tokens, preserving everything else byte for byte.

    Uses `tokenize` rather than a regex because `#` appears inside string
    literals all over this contract — in prompts, in URL fragments, in the
    runner header — and a regex would happily corrupt them.
    """
    out: list[str] = []
    last_row, last_col = 1, 0
    lines = source.splitlines(keepends=True)

    def line(row: int) -> str:
        # ENDMARKER reports a row one past the last real line, so every lookup
        # is bounds-checked rather than assumed valid.
        return lines[row - 1] if 1 <= row <= len(lines) else ""

    for tok in tokenize.generate_tokens(io.StringIO(source).readline):
        srow, scol = tok.start
        erow, ecol = tok.end

        # Re-emit whatever sat between the previous token and this one.
        if (srow, scol) > (last_row, last_col):
            if srow == last_row:
                out.append(line(srow)[last_col:scol])
            else:
                out.append(line(last_row)[last_col:])
                for row in range(last_row + 1, srow):
                    out.append(line(row))
                out.append(line(srow)[:scol])

        if tok.type == tokenize.COMMENT:
            # Drop the comment itself; the newline after it is a separate token
            # and is preserved, so line structure survives.
            pass
        else:
            out.append(tok.string)

        last_row, last_col = erow, ecol

    return "".join(out)


def _reindent(source: str, spaces_per_level: int) -> str:
    """Rewrites leading indentation to `spaces_per_level` per level.

    Python only cares that indentation is *consistent*, not how wide it is, so
    this is semantics-preserving — but only for lines the tokenizer agrees are
    real indentation. Continuation lines inside brackets and every line of a
    multi-line string are left exactly as they are.
    """
    lines = source.split("\n")
    protected: set[int] = set()

    for tok in tokenize.generate_tokens(io.StringIO(source).readline):
        if tok.type == tokenize.STRING and tok.end[0] > tok.start[0]:
            # Every line of a multi-line string after the first is content.
            protected.update(range(tok.start[0] + 1, tok.end[0] + 1))

    depth_of: dict[int, int] = {}
    depth = 0
    for tok in tokenize.generate_tokens(io.StringIO(source).readline):
        if tok.type == tokenize.INDENT:
            depth += 1
        elif tok.type == tokenize.DEDENT:
            depth = max(0, depth - 1)
        elif tok.type not in (tokenize.NL, tokenize.NEWLINE, tokenize.COMMENT):
            depth_of.setdefault(tok.start[0], depth)

    out: list[str] = []
    for number, line in enumerate(lines, start=1):
        if number in protected or not line.strip():
            out.append(line)
            continue
        depth = depth_of.get(number)
        if depth is None:
            out.append(line)
            continue
        out.append(" " * (spaces_per_level * depth) + line.lstrip())
    return "\n".join(out)


# --------------------------------------------------------------------------
# string pooling
# --------------------------------------------------------------------------


def _pool_strings(source: str) -> str:
    """Binds repeated string literals to short module-level names.

    This contract names things well, and it pays for that in bytes: the same
    twenty-odd field names appear in every view method, so `"token_address"`
    alone costs 225 bytes across fifteen occurrences. Bradbury refuses a deploy
    whose calldata crosses a pubdata ceiling measured (2026-09-02) between
    53,000 and 53,700 bytes, and those field names are pure repetition.

    Semantics-preserving, and the reason is worth stating precisely: this pass
    never alters a string's VALUE. It binds the value to a name and substitutes
    the name, so `d["token_address"]` and `d[_a]` index the same key with the
    same object. That is a strictly weaker transformation than the identifier
    renaming this file still refuses to do.

    Four exclusions, each of which would otherwise be a silent behaviour change:

    - **Annotations.** GenVM reads the annotation source to build the ABI and
      the storage layout, so `-> typing.Any` and `x: str` must survive as
      written.
    - **f-string pieces.** A `Constant` inside a `JoinedStr` is a fragment of a
      larger expression, not a literal of its own.
    - **`match` case patterns.** A bare name in a pattern CAPTURES rather than
      compares, which would turn every case into a wildcard. This contract has
      no `match`, but a future one might.
    - **Docstrings**, which are already gone by the time this runs.

    Names are two characters and are checked against every identifier in the
    module; a collision with a function-local would shadow the pool binding and
    raise `UnboundLocalError` at the worst possible moment.
    """
    tree = ast.parse(source)

    # Every identifier that exists anywhere, so a pool name can never shadow
    # or be shadowed by one.
    taken: set[str] = set(dir(builtins))
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            taken.add(node.id)
        elif isinstance(node, ast.arg):
            taken.add(node.arg)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            taken.add(node.name)
        elif isinstance(node, ast.Attribute):
            taken.add(node.attr)
        elif isinstance(node, ast.alias):
            taken.add(node.asname or node.name.split(".")[0])
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            taken.update(node.names)

    excluded: set[int] = set()

    def exclude(node: ast.AST | None) -> None:
        if node is None:
            return
        for child in ast.walk(node):
            excluded.add(id(child))

    for node in ast.walk(tree):
        if isinstance(node, ast.AnnAssign):
            exclude(node.annotation)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            exclude(node.returns)
            arguments = node.args
            for argument in (
                list(arguments.posonlyargs)
                + list(arguments.args)
                + list(arguments.kwonlyargs)
                + [arguments.vararg, arguments.kwarg]
            ):
                if argument is not None:
                    exclude(argument.annotation)
        elif isinstance(node, ast.JoinedStr):
            exclude(node)
        elif isinstance(node, ast.MatchValue):
            exclude(node)

    # Candidate occurrences, by value.
    sites: dict[str, list[ast.Constant]] = {}
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and id(node) not in excluded
            and node.end_lineno is not None
        ):
            sites.setdefault(node.value, []).append(node)

    alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    names = [f"_{a}" for a in alphabet]
    names += [f"_{a}{b}" for a in alphabet for b in alphabet]
    names = [name for name in names if name not in taken]

    # Longest, most repeated first, so the shortest names go where they pay
    # most. A literal only joins the pool if it actually saves bytes: the
    # binding itself costs `name = <literal>\n`.
    def gain(value: str, count: int, width: int) -> int:
        quoted = len(repr(value))
        return count * quoted - count * width - (width + 3 + quoted + 1)

    ordered = sorted(
        ((value, nodes) for value, nodes in sites.items() if len(nodes) > 1),
        key=lambda item: -(len(item[0]) * len(item[1])),
    )

    pool: list[tuple[str, str]] = []
    replacements: list[tuple[ast.Constant, str]] = []
    for value, nodes in ordered:
        if not names:
            break
        width = len(names[0])
        if gain(value, len(nodes), width) <= 0:
            continue
        name = names.pop(0)
        pool.append((name, value))
        replacements.extend((node, name) for node in nodes)

    if not pool:
        return source

    lines = source.split("\n")

    # Rewrite spans back to front so earlier positions stay valid. A literal
    # spanning several lines collapses to one; the blank remainder is dropped
    # by the blank-line pass downstream.
    def span_key(item: tuple[ast.Constant, str]) -> tuple[int, int]:
        node = item[0]
        return (node.end_lineno or node.lineno, node.end_col_offset or 0)

    for node, name in sorted(replacements, key=span_key, reverse=True):
        start_row, start_col = node.lineno - 1, node.col_offset
        end_row, end_col = (node.end_lineno or node.lineno) - 1, node.end_col_offset or 0
        head = lines[start_row][:start_col]
        tail = lines[end_row][end_col:]
        lines[start_row : end_row + 1] = [head + name + tail]

    # The bindings go after the last top-level import: class bodies run at
    # import time, so a default argument or a field default must find its pool
    # name already bound.
    rebuilt = "\n".join(lines)
    anchor = 0
    for statement in ast.parse(rebuilt).body:
        if isinstance(statement, (ast.Import, ast.ImportFrom)):
            anchor = statement.end_lineno or statement.lineno
        else:
            break

    bindings = [f"{name} = {value!r}" for name, value in pool]
    out = rebuilt.split("\n")
    return "\n".join(out[:anchor] + bindings + out[anchor:])

def minify(source: str, spaces_per_level: int = 1) -> str:
    header, _, rest = source.partition("\n")
    if not header.startswith("#"):
        raise SystemExit(
            "line 1 is not the GenVM runner header; refusing to minify blind"
        )

    doc_lines: set[int] = set()
    for start, end in _docstring_spans(source):
        doc_lines.update(range(start, end + 1))

    # Docstrings go first, by line, while line numbers still match the AST.
    kept = [
        line
        for number, line in enumerate(source.split("\n"), start=1)
        if number not in doc_lines
    ]
    stage = "\n".join(kept)

    stage = _strip_comments(stage)

    # Pooling runs here: after docstrings and comments are gone, so neither can
    # be pooled, and before the layout passes, whose line bookkeeping this
    # would otherwise invalidate.
    stage = _pool_strings(stage)

    # Lines lying INSIDE a multi-line string are content, not layout.
    #
    # This is not a nicety. Stripping blank lines indiscriminately collapsed the
    # paragraph breaks in the scoring prompt — six occurrences of "\n\n" became
    # "\n" — which again would have deployed cleanly and quietly changed what
    # every validator reads. `rstrip()` is just as dangerous for the same reason,
    # so both are skipped on these lines.
    # Derived from the AST, not from tokens. Python 3.12 (PEP 701) splits
    # f-strings into FSTRING_START/MIDDLE/END rather than emitting one STRING
    # token, so a token-based scan silently misses every f-string — and the
    # scoring prompt is exactly that. The AST reports one node with true start
    # and end lines regardless of quoting or Python version.
    interior: set[int] = set()
    for node in ast.walk(ast.parse(stage)):
        if isinstance(node, (ast.Constant, ast.JoinedStr)) and isinstance(
            getattr(node, "value", ""), (str, type(None))
        ):
            if isinstance(node, ast.Constant) and not isinstance(node.value, str):
                continue
            end = node.end_lineno or node.lineno
            if end > node.lineno:
                interior.update(range(node.lineno + 1, end + 1))

    # Indentation depth per line, from the tokenizer's own INDENT/DEDENT run.
    # Python only requires indentation to be *consistent*, not any particular
    # width, so narrowing it is semantics-preserving — but only for lines that
    # are layout. Anything in `interior` is string content and is emitted
    # untouched, which is what makes this safe now and unsafe before.
    depth_of: dict[int, int] = {}
    depth = 0
    for tok in tokenize.generate_tokens(io.StringIO(stage).readline):
        if tok.type == tokenize.INDENT:
            depth += 1
        elif tok.type == tokenize.DEDENT:
            depth = max(0, depth - 1)
        elif tok.type not in (tokenize.NL, tokenize.NEWLINE, tokenize.COMMENT):
            depth_of.setdefault(tok.start[0], depth)

    body: list[str] = []
    for number, line in enumerate(stage.split("\n"), start=1):
        if number in interior:
            body.append(line)
            continue
        if not line.strip():
            continue
        stripped = line.lstrip()
        level = depth_of.get(number)
        if level is None or spaces_per_level < 0:
            # A bracket continuation line, which the tokenizer reports no depth
            # for. Its leading whitespace is cosmetic, so collapse it to one
            # space rather than guessing at a nesting level.
            body.append(" " + stripped.rstrip() if line[:1].isspace() else stripped.rstrip())
        else:
            body.append(" " * (spaces_per_level * level) + stripped.rstrip())

    # The header must be line 1 and nothing else may be a comment on line 2 —
    # a second comment there makes the contract silently undeployable.
    if body and body[0].lstrip().startswith("#"):
        body = body[1:]
    return header + "\n" + "\n".join(body) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("-o", "--out", type=Path, required=True)
    parser.add_argument("--indent", type=int, default=1)
    args = parser.parse_args()

    source = args.source.read_text(encoding="utf8")
    result = minify(source, args.indent)

    # Non-negotiable: the output must parse, and it must expose exactly the same
    # public surface. A minifier that quietly drops a method is worse than one
    # that fails.
    before = ast.parse(source)
    after = ast.parse(result)

    def surface(tree: ast.AST) -> list[str]:
        names = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                names.append(node.name)
        return sorted(names)

    if surface(before) != surface(after):
        missing = set(surface(before)) - set(surface(after))
        extra = set(surface(after)) - set(surface(before))
        raise SystemExit(f"public surface changed! missing={missing} extra={extra}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(result, encoding="utf8")

    src_bytes = len(source.encode("utf8"))
    out_bytes = len(result.encode("utf8"))
    print(f"{args.source}  {src_bytes:,} bytes")
    print(f"{args.out}  {out_bytes:,} bytes")
    print(f"saved {src_bytes - out_bytes:,} ({100 * (1 - out_bytes / src_bytes):.1f}%)")
    print(f"definitions preserved: {len(surface(after))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
