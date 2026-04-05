---
title: Core Package Overview
sidebar_label: Overview
sidebar_position: 1
---

`@riftseer/core` is the shared library that everything else in the monorepo depends on. It owns the canonical card types, the provider interface all data access goes through, the `[[Card Name]]` parser, the autocomplete search engine, and the deck model.

Nothing in core is runtime-specific — it runs in Bun, Node, and Cloudflare Workers alike (except the server-only entry point, which is Bun/Node).

---

## What's in core

| Module | File | Purpose |
| --- | --- | --- |
| Types | `src/types.ts` | `Card`, `CardRequest`, `ResolvedCard`, `SimplifiedDeck`, and all sub-interfaces |
| Provider interface | `src/provider.ts` | `CardDataProvider` and `SimplifiedDeckProvider` — the only contracts the API cares about |
| Parser | `src/parser.ts` | `parseCardRequests()` — extracts `[[Name\|SET-123]]` tokens from text |
| Search | `src/search.ts` | `autocompleteSearch()` — deterministic, position-aware name ranking |
| Normalize | `src/normalize.ts` | `normalizeCardName()` — shared lowercasing / punctuation stripping |
| Supabase provider | `src/providers/supabase.ts` | `SupabaseCardProvider` — the only `CardDataProvider` implementation |
| Deck | `src/deck.ts` | `Deck` class — in-memory deck model with rule enforcement |
| Serialiser | `src/serialiser.ts` | `DeckSerializerV1` — compact binary + base64url deck encoding |
| Logger | `src/logger.ts` | Lightweight structured logger |
| Server entry | `src/server.ts` | Re-exports Supabase and Redis clients (server-side only) |

---

## Provider pattern

The API does not import any database client directly. All data access goes through the `CardDataProvider` interface. The concrete implementation (`SupabaseCardProvider`) is selected at startup by the `CARD_PROVIDER` env var via the factory in `src/providers/index.ts`.

This means route code never changes when the data source changes — only the provider implementation does.

The [ElysiaJS](https://elysiajs.com) API server calls `provider.warmup()` on startup, then passes the provider into route modules as a dependency. See [Provider Interface](./provider.md) for the full contract.

---

## Exports

The public surface is `src/index.ts`. Import from `@riftseer/core`:

```typescript
import type { Card, CardRequest, ResolvedCard, SimplifiedDeck } from "@riftseer/core";
import { parseCardRequests } from "@riftseer/core";
import { autocompleteSearch } from "@riftseer/core";
import { Deck, DeckIssue } from "@riftseer/core";
import { DeckSerializerV1 } from "@riftseer/core";
```

Server-side clients (Supabase, Redis) are exported from `@riftseer/core/server` — do not import these in Workers or browser builds.

---

## Testing

Tests live in `src/__tests__/`. Run with:

```bash
bun test packages/core
```

The provider tests use `mock()` from `bun:test` to stub the `CardDataProvider` interface. No live database connection is needed.
