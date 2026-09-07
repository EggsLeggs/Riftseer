#!/usr/bin/env python3
"""Reject migration files with top-level COMMIT/ROLLBACK.

Used by .github/workflows/db-migrate.yml so each migration + schema_migrations
insert can run under psql --single-transaction. A top-level COMMIT/ROLLBACK
would end that transaction early and let the history insert commit alone.

Skips -- and /* */ comments, single- and double-quoted literals, and
dollar-quoted bodies so PL/pgSQL BEGIN / transaction-control text inside
function bodies is allowed.
"""
from __future__ import annotations

import re
import sys


def has_toplevel_txn_end(sql: str) -> bool:
    i, n = 0, len(sql)
    out: list[str] = []
    while i < n:
        c = sql[i]
        if c == "-" and i + 1 < n and sql[i + 1] == "-":
            while i < n and sql[i] != "\n":
                i += 1
            continue
        if c == "/" and i + 1 < n and sql[i + 1] == "*":
            i += 2
            while i + 1 < n and not (sql[i] == "*" and sql[i + 1] == "/"):
                i += 1
            i = min(i + 2, n)
            continue
        if c == "$":
            m = re.match(r"\$[A-Za-z0-9_]*\$", sql[i:])
            if m:
                tag = m.group(0)
                i += len(tag)
                end = sql.find(tag, i)
                if end == -1:
                    break
                i = end + len(tag)
                out.append(" ")
                continue
        if c == "'":
            i += 1
            while i < n:
                if sql[i] == "'":
                    if i + 1 < n and sql[i + 1] == "'":
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            out.append(" ")
            continue
        if c == '"':
            i += 1
            while i < n:
                if sql[i] == '"':
                    if i + 1 < n and sql[i + 1] == '"':
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            out.append(" ")
            continue
        out.append(c)
        i += 1
    return bool(
        re.search(r"(?is)(?:^|;)\s*(?:COMMIT|ROLLBACK)\b", "".join(out))
    )


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <migration.sql>", file=sys.stderr)
        return 2
    path = sys.argv[1]
    sql = open(path, encoding="utf-8").read()
    if has_toplevel_txn_end(sql):
        print(
            f"refusing {path}: top-level COMMIT/ROLLBACK breaks --single-transaction",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
