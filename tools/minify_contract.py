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
import json
import keyword
import re
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
# identifier renaming
# --------------------------------------------------------------------------


class _Scope:
    """One Python name-resolution scope.

    `kind` matters for lookup, not for bookkeeping: a CLASS scope is skipped
    when a nested function resolves a free variable, which is the one rule
    that separates Python's scoping from the obvious recursive one.
    """

    __slots__ = ("node", "kind", "parent", "bound", "globals", "nonlocals",
                 "children", "renames")

    def __init__(self, node, kind: str, parent: "_Scope | None"):
        self.node = node
        self.kind = kind
        self.parent = parent
        self.bound: set[str] = set()
        self.globals: set[str] = set()
        self.nonlocals: set[str] = set()
        self.children: list[_Scope] = []
        self.renames: dict[str, str] = {}
        if parent is not None:
            parent.children.append(self)


_SCOPE_NODES = (
    ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef,
    ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp,
)


def _build_scopes(tree: ast.Module) -> tuple[_Scope, dict]:
    """The scope tree, plus a map from every Name/arg node to its scope.

    Bindings are collected exactly as Python does it: a name assigned anywhere
    in a function body is local to that function for the WHOLE body, including
    the lines above the assignment.
    """
    module = _Scope(tree, "module", None)
    owner: dict[int, _Scope] = {}

    def bind(scope: _Scope, name: str) -> None:
        if name not in scope.globals and name not in scope.nonlocals:
            scope.bound.add(name)

    def walk(node, scope: _Scope) -> None:
        for child in ast.iter_child_nodes(node):
            visit(child, scope)

    def visit(node, scope: _Scope) -> None:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            bind(scope, node.name)
            # Decorators, defaults and annotations are evaluated in the
            # ENCLOSING scope, so they are visited there, not inside.
            for deco in node.decorator_list:
                visit(deco, scope)
            for default in node.args.defaults + [
                d for d in node.args.kw_defaults if d is not None
            ]:
                visit(default, scope)
            inner = _Scope(node, "function", scope)
            arguments = node.args
            every = (list(arguments.posonlyargs) + list(arguments.args)
                     + list(arguments.kwonlyargs))
            if arguments.vararg is not None:
                every.append(arguments.vararg)
            if arguments.kwarg is not None:
                every.append(arguments.kwarg)
            for argument in every:
                inner.bound.add(argument.arg)
                owner[id(argument)] = inner
                if argument.annotation is not None:
                    visit(argument.annotation, scope)
            if node.returns is not None:
                visit(node.returns, scope)
            for statement in node.body:
                visit(statement, inner)
            return
        if isinstance(node, ast.Lambda):
            for default in node.args.defaults + [
                d for d in node.args.kw_defaults if d is not None
            ]:
                visit(default, scope)
            inner = _Scope(node, "function", scope)
            every = (list(node.args.posonlyargs) + list(node.args.args)
                     + list(node.args.kwonlyargs))
            if node.args.vararg is not None:
                every.append(node.args.vararg)
            if node.args.kwarg is not None:
                every.append(node.args.kwarg)
            for argument in every:
                inner.bound.add(argument.arg)
                owner[id(argument)] = inner
            visit(node.body, inner)
            return
        if isinstance(node, ast.ClassDef):
            bind(scope, node.name)
            for deco in node.decorator_list:
                visit(deco, scope)
            for base in node.bases:
                visit(base, scope)
            for keyword in node.keywords:
                visit(keyword.value, scope)
            inner = _Scope(node, "class", scope)
            for statement in node.body:
                visit(statement, inner)
            return
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp,
                             ast.GeneratorExp)):
            inner = _Scope(node, "function", scope)
            for index, generator in enumerate(node.generators):
                # The OUTERMOST iterable is evaluated in the enclosing scope.
                visit(generator.iter, scope if index == 0 else inner)
                visit(generator.target, inner)
                for condition in generator.ifs:
                    visit(condition, inner)
            if isinstance(node, ast.DictComp):
                visit(node.key, inner)
                visit(node.value, inner)
            else:
                visit(node.elt, inner)
            return
        if isinstance(node, ast.Global):
            scope.globals.update(node.names)
            scope.bound.difference_update(node.names)
            return
        if isinstance(node, ast.Nonlocal):
            scope.nonlocals.update(node.names)
            scope.bound.difference_update(node.names)
            return
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                bind(scope, (alias.asname or alias.name).split(".")[0])
            return
        if isinstance(node, ast.Name):
            owner[id(node)] = scope
            if isinstance(node.ctx, (ast.Store, ast.Del)):
                bind(scope, node.id)
            return
        if isinstance(node, ast.ExceptHandler):
            if node.name:
                bind(scope, node.name)
                owner[id(node)] = scope
            walk(node, scope)
            return
        walk(node, scope)

    for statement in tree.body:
        visit(statement, module)
    return module, owner


def _resolve(scope: _Scope, name: str) -> _Scope | None:
    """The scope that owns `name` as seen from `scope`, or None for a builtin.

    Class scopes are skipped for anything but a direct hit, which is why a
    method body cannot see its own class's attributes as bare names.
    """
    current: _Scope | None = scope
    first = True
    while current is not None:
        if not first and current.kind == "class":
            current = current.parent
            continue
        if name in current.bound:
            return current
        if name in current.globals:
            root = current
            while root.parent is not None:
                root = root.parent
            return root if name in root.bound else None
        first = False
        current = current.parent
    return None


def _public(node) -> bool:
    """True for a method GenVM exposes, whose parameter NAMES are its ABI."""
    for deco in getattr(node, "decorator_list", []):
        parts = []
        cursor = deco
        while isinstance(cursor, ast.Attribute):
            parts.append(cursor.attr)
            cursor = cursor.value
        if isinstance(cursor, ast.Name):
            parts.append(cursor.id)
        if "gl" in parts and "public" in parts:
            return True
    return False


_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _rename_identifiers(source: str) -> tuple[str, dict, dict]:
    """Shortens every identifier that is nobody else's business.

    The header of this file used to say identifier renaming was refused. That
    was the right call while it would have been a regex over the text; it is
    the wrong call once the pass resolves names the way Python does. What
    changed is not the appetite for risk, it is that the pass now knows which
    scope owns each name — and `test_logic.py` re-runs the entire battery
    against the renamed artifact and asserts identical output, so a rename
    that changed behaviour would fail before it could be deployed.

    TWO tiers, and the distinction is what keeps the contract callable:

    - **Module-level private names** — `_score`, `FEATURE_RANGE`, the ladders.
      Renamed everywhere they resolve. Class names are never touched, nor is
      anything imported, nor any public name.
    - **Function locals** — every binding inside a function body, including
      its parameters, EXCEPT the parameters of a `@gl.public.*` method, which
      are the contract's ABI, and `self`.

    A nested function shares its parent's name pool, so a closure reading a
    free variable reads the same short name the parent wrote. Nothing is ever
    renamed into a name that is already visible where it is used.

    Storage fields, dataclass fields, every attribute and every dict key are
    untouched: this pass only ever rewrites `ast.Name`, `ast.arg` and the
    identifier of a `def` it is already renaming, so `rec.overall_score` and
    `f["top1"]` come out exactly as they went in.

    Returns the rewritten source, the module-level old -> new map (written
    beside the artifact so the tests can reach the renamed internals), and
    every `def` rename including the nested ones, which the caller needs to
    tell a legitimate rename apart from a definition that went missing.
    """
    tree = ast.parse(source)
    module, owner = _build_scopes(tree)

    reserved = set(dir(builtins))
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            reserved.add(node.attr)
        elif isinstance(node, ast.alias):
            reserved.add((node.asname or node.name.split(".")[0]))
        elif isinstance(node, ast.ClassDef):
            reserved.add(node.name)
    reserved.update(module.globals)

    # --- tier 1: module-level privates.
    keep: set[str] = set(module.bound)
    renameable: set[str] = set()
    for statement in tree.body:
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if statement.name.startswith("_") and not _public(statement):
                renameable.add(statement.name)
        elif isinstance(statement, (ast.Assign, ast.AnnAssign)):
            targets = (statement.targets if isinstance(statement, ast.Assign)
                       else [statement.target])
            for target in targets:
                if isinstance(target, ast.Name) and _is_constant(target.id):
                    renameable.add(target.id)
    renameable -= reserved
    # A module name that some function also binds locally is left alone: the
    # local would shadow it, and proving that shadow harmless is not worth the
    # bytes it saves.
    shadowed: set[str] = set()

    def collect_shadows(scope: _Scope) -> None:
        if scope is not module:
            shadowed.update(scope.bound)
        for child in scope.children:
            collect_shadows(child)

    collect_shadows(module)
    renameable -= shadowed

    pool = _name_pool("_", reserved | keep)
    for name in sorted(renameable):
        module.renames[name] = next(pool)

    module_names = set(module.renames.values())

    # --- tier 2: function locals.
    #
    # One pool per OUTERMOST function, shared with everything nested inside
    # it. That is the rule that makes closures safe: `leader_fn` reading the
    # `task` its enclosing method bound must read the same short name the
    # method wrote, and it will, because neither pool ever hands out a name
    # the other used. A class body is not a function, so each method starts a
    # pool of its own and they all get the one-character names.
    def assign_locals(scope: _Scope, taken: set[str], pool_iter) -> None:
        if scope.kind == "class":
            for child in scope.children:
                fresh = set(reserved | module_names | keep)
                assign_locals(child, fresh, _name_pool("", fresh))
            return
        if scope.kind == "function":
            node = scope.node
            protected = {"self"}
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and _public(node):
                arguments = node.args
                for argument in (list(arguments.posonlyargs)
                                 + list(arguments.args)
                                 + list(arguments.kwonlyargs)):
                    protected.add(argument.arg)
                if arguments.vararg is not None:
                    protected.add(arguments.vararg.arg)
                if arguments.kwarg is not None:
                    protected.add(arguments.kwarg.arg)
            for name in sorted(scope.bound):
                if name in protected or name in scope.globals:
                    continue
                if name in scope.nonlocals:
                    continue
                short = next(pool_iter)
                scope.renames[name] = short
                taken.add(short)
        for child in scope.children:
            assign_locals(child, taken, pool_iter)

    for child in module.children:
        base = reserved | module_names | keep
        assign_locals(child, set(base), _name_pool("", base))

    # --- rewrite, back to front so earlier offsets stay valid.
    edits: list[tuple[int, int, int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            scope = owner.get(id(node))
            if scope is None:
                continue
            home = _resolve(scope, node.id)
            if home is None:
                continue
            new = home.renames.get(node.id)
            if new is not None:
                edits.append((node.lineno, node.col_offset,
                              node.col_offset + len(node.id), new))
        elif isinstance(node, ast.arg):
            scope = owner.get(id(node))
            if scope is None:
                continue
            new = scope.renames.get(node.arg)
            if new is not None:
                edits.append((node.lineno, node.col_offset,
                              node.col_offset + len(node.arg), new))

    lines = source.split("\n")

    # The `def` itself. A FunctionDef carries no Name node for its own
    # identifier, so without this the body would call `_aB` while the
    # definition still said `_score`. Located by searching forward from the
    # node's own column rather than by assuming `len("def ")`, which is wrong
    # for `async def` and for anything a future Python puts in between.
    #
    # EVERY def, not only the module-level ones: `_scan` binds `leader_fn` and
    # `validator_fn` as ordinary locals, so they are renamed like any other
    # local and their definitions have to follow. Missing this shipped a
    # `run_nondet_unsafe(n, H)` whose `n` and `H` were never defined - caught
    # by the undefined-name check in test_logic.py, which is exactly the class
    # of bug it was written for.
    def_renames: dict[str, str] = {}

    def rename_defs(scope: _Scope) -> None:
        for child in scope.children:
            node = child.node
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                new = scope.renames.get(node.name)
                if new is not None:
                    line = lines[node.lineno - 1]
                    at = line.find(node.name, node.col_offset)
                    if at < 0:
                        raise SystemExit(
                            f"cannot locate `def {node.name}` to rename it")
                    edits.append((node.lineno, at, at + len(node.name), new))
                    def_renames[node.name] = new
            rename_defs(child)

    rename_defs(module)

    # `except X as name:` binds `name`, and the binding is a plain string on
    # the handler rather than a Name node - so the body's uses were being
    # renamed while the binding was not.
    for node in ast.walk(tree):
        if not isinstance(node, ast.ExceptHandler) or not node.name:
            continue
        scope = owner.get(id(node))
        if scope is None:
            continue
        new = scope.renames.get(node.name)
        if new is None:
            continue
        line = lines[node.lineno - 1]
        match = re.search(r"\bas\s+" + re.escape(node.name) + r"\s*:", line)
        if match is None:
            raise SystemExit(f"cannot locate `except ... as {node.name}`")
        at = line.index(node.name, match.start())
        edits.append((node.lineno, at, at + len(node.name), new))

    for lineno, start, end, new in sorted(edits, reverse=True):
        line = lines[lineno - 1]
        lines[lineno - 1] = line[:start] + new + line[end:]

    mapping = dict(module.renames)
    return "\n".join(lines), mapping, def_renames


def _is_constant(name: str) -> bool:
    """A module-level CONSTANT_NAME, and nothing that merely shouts."""
    return (name.isupper() and not name.startswith("__")
            and any(ch.isalpha() for ch in name))


def _name_pool(prefix: str, taken: set[str]):
    """Short names, shortest first, skipping anything already spoken for."""
    widths = 1
    while True:
        import itertools
        for combo in itertools.product(_ALPHABET, repeat=widths):
            candidate = prefix + "".join(combo)
            if candidate in taken or candidate in _KEYWORDS:
                continue
            taken.add(candidate)
            yield candidate
        widths += 1


_KEYWORDS = frozenset(keyword.kwlist) | frozenset(keyword.softkwlist)


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

def _split_runner_header(source: str) -> tuple[list[str], list[str]]:
    """The runner comment block, and everything after it.

    GenVM reads the runner configuration off the LEADING RUN of comment lines,
    not off line 1 alone (SDK spec, Runners -> Runner Layout -> Text-based).
    The v0.6 header is two lines:

        # v0.3.0
        # { "Depends": "py-genlayer:test" }

    and the old one was a single `# { "Depends": ... }`. Both are just "the
    comments before the first non-comment line", so one rule covers them.

    This mattered more than it looks. The previous version kept line 1 and
    then actively DELETED a comment sitting on line 2 - which, against a v0.6
    header, silently removed the `Depends` line and produced an artifact that
    deploys and then fails at runtime with `invalid_contract runner
    malformed`. A blank line ends the block, which is what keeps the file's
    prose header (separated by one) from being swept in.
    """
    lines = source.split("\n")
    header: list[str] = []
    for line in lines:
        if line.lstrip().startswith("#"):
            header.append(line)
            continue
        break
    if not header:
        raise SystemExit(
            "line 1 is not the GenVM runner header; refusing to minify blind")
    # A version line is optional, but if one is there it must come first, and
    # every line after it has to be part of the JSON - so a stray non-JSON
    # comment inside the block is a mistake worth failing on rather than
    # shipping.
    body = [line.lstrip()[1:].strip() for line in header]
    if body[0].startswith("v"):
        body = body[1:]
    joined = "".join(body)
    if joined:
        import json as _json
        try:
            _json.loads(joined)
        except ValueError:
            raise SystemExit(
                "the runner header's JSON does not parse; refusing to minify: "
                + joined[:120])
    return header, lines[len(header):]


def minify(source: str, spaces_per_level: int = 1,
           rename: bool = True) -> tuple[str, dict]:
    header_lines, rest_lines = _split_runner_header(source)
    header = "\n".join(header_lines)

    del rest_lines  # the passes below re-derive their own line numbering

    doc_lines: set[int] = set()
    for start, end in _docstring_spans(source):
        doc_lines.update(range(start, end + 1))

    # Docstrings go first, by line, while line numbers still match the AST.
    kept = [
        line
        for number, line in enumerate(source.split("\n"), start=1)
        if number not in doc_lines and number > len(header_lines)
    ]
    stage = "\n".join(kept)

    stage = _strip_comments(stage)

    # Renaming runs before pooling so the pool's collision check sees the
    # short names that now exist, and after comment stripping so no rename
    # has to reason about a comment that mentions the old name.
    mapping: dict = {}
    def_renames: dict = {}
    if rename:
        stage, mapping, def_renames = _rename_identifiers(stage)

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

    # Nothing may be a comment immediately after the runner header: the header
    # is *defined* as the leading run of comment lines, so a comment there
    # would be read as another line of runner config rather than as a comment.
    while body and body[0].lstrip().startswith("#"):
        body = body[1:]
    return header + "\n" + "\n".join(body) + "\n", mapping, def_renames


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("-o", "--out", type=Path, required=True)
    parser.add_argument("--indent", type=int, default=1)
    parser.add_argument("--no-rename", action="store_true",
                        help="skip the identifier-renaming pass")
    args = parser.parse_args()

    source = args.source.read_text(encoding="utf8")
    result, mapping, def_renames = minify(source, args.indent,
                                          rename=not args.no_rename)

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

    # Renamed module-level functions are expected to differ; everything else
    # must not. Public methods live on a class and are compared exactly.
    renamed = dict(def_renames)
    renamed.update(mapping)
    expected = sorted(renamed.get(name, name) for name in surface(before))
    if expected != surface(after):
        missing = set(expected) - set(surface(after))
        extra = set(surface(after)) - set(expected)
        raise SystemExit(f"public surface changed! missing={missing} extra={extra}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(result, encoding="utf8")
    # The name map travels with the artifact. test_logic.py re-runs the whole
    # suite against the minified file and needs to reach `_score` under
    # whatever it is now called; without this the artifact would be a black
    # box, and an untested artifact is the thing actually being deployed.
    if mapping:
        names_path = args.out.with_suffix(".names.json")
        names_path.write_text(
            json.dumps(mapping, indent=1, sort_keys=True) + "\n",
            encoding="utf8")
        print(f"{names_path}  {len(mapping)} renamed identifiers")

    src_bytes = len(source.encode("utf8"))
    out_bytes = len(result.encode("utf8"))
    print(f"{args.source}  {src_bytes:,} bytes")
    print(f"{args.out}  {out_bytes:,} bytes")
    print(f"saved {src_bytes - out_bytes:,} ({100 * (1 - out_bytes / src_bytes):.1f}%)")
    print(f"definitions preserved: {len(surface(after))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
