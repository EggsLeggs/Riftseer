# Domain docs

How the domain vocabulary is kept and how the engineering skills consume it.

## One context

This repository is a single context. The glossary is the root `CONTEXT.md` and there is no `CONTEXT-MAP.md`; add one only when a package grows a vocabulary that genuinely contradicts the root, which none does today.

`CONTEXT.md` is a glossary and nothing else. Each entry is the term, a one- or two-sentence definition of what the thing is, an `_Avoid_:` line naming the synonyms not to use, and a `_Related_:` line naming the terms it touches. `scripts/check-docs-references.mjs` fails on an entry missing any of those parts. Implementation details (columns, files, RPC names) stay out; they belong in the package's `AGENTS.md`.

Ambiguities the vocabulary has not settled sit under the `## Ambiguities` heading at the end. Add one there when you find it; do not resolve it in passing.

## Before exploring

Read `CONTEXT.md`. When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the glossary's term and never a word it lists under `_Avoid_`.

If the concept you need is not in the glossary, that is a signal: either you are inventing language the project does not use, or there is a real gap. Add the term when a maintainer confirms it, in the same format, and run the check.

## Decisions

There is no ADR directory. A decision that is hard to reverse, surprising without context and the result of a real trade-off goes in the package's `docs/` as a short note with the cost story, and its one-line consequence goes in the nearest `AGENTS.md` under Invariants. The Invariants section of the root `AGENTS.md` already holds the system-wide ones; contradict one out loud or not at all.
