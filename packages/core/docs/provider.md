---
title: Provider Interface
sidebar_label: Provider Interface
sidebar_position: 3
---

`src/provider.ts` defines the two provider interfaces that form the boundary between the API and its data sources. Route code depends only on these interfaces — never on a concrete implementation.

---

## CardDataProvider

The main interface. All data access for card lookups, search, and sets goes through this contract.

```typescript
interface CardDataProvider {
  readonly sourceName: string;

  warmup(): Promise<void>;
  refresh(): Promise<void>;

  getCardById(id: string): Promise<Card | null>;
  searchByName(q: string, opts?: CardSearchOptions): Promise<Card[]>;
  resolveRequest(req: CardRequest): Promise<ResolvedCard>;
  getSets(): Promise<Array<{ setCode: string; setName: string; cardCount: number }>>;
  getCardsBySet(setCode: string, opts?: { limit?: number }): Promise<Card[]>;
  getRandomCard(): Promise<Card | null>;
  getStats(): { lastRefresh: number; cardCount: number };
}
```

### CardDataProvider methods

#### `warmup()`

Called once at app startup. Should:

1. Load the card cache (fast path from Redis or cold load from Supabase).
2. Schedule background refreshes.

In the ElysiaJS API, `warmup()` is called before the server begins accepting requests. Elysia's [lifecycle hooks](https://elysiajs.com/life-cycle/overview.html) (`onStart`) provide the right place to call this.

#### `refresh()`

Pulls fresh data from the upstream source and rebuilds the in-memory index. Falls back to the existing cache if the upstream is unreachable. Called on a schedule by the provider itself after `warmup()`.

#### `getCardById(id)`

Returns a single card by its stable UUID. Returns `null` if not found — never throws.

#### `searchByName(q, opts?)`

Full-text search with optional set/collector filters. Performs exact match first; falls back to autocomplete fuzzy ranking unless `opts.fuzzy === false`.

#### `resolveRequest(req)`

Resolves a structured `CardRequest` to the single best matching printing. Handles set/collector fallback internally. Never throws — returns `{ card: null, matchType: "not-found" }` on miss.

#### `getSets()`

Returns all known sets with code, name, and card count. Providers that don't support set listing may return `[]`.

#### `getCardsBySet(setCode, opts?)`

Returns cards in a set ordered by collector number.

#### `getRandomCard()`

Returns one random card from the index. Returns `null` if the index is empty.

#### `getStats()`

Returns `{ lastRefresh: number, cardCount: number }` for the `/meta` endpoint. `lastRefresh` is a Unix timestamp (seconds).

---

## SimplifiedDeckProvider

Interface for deck storage operations. Works with `SimplifiedDeck` (the compact, serialisable deck format) and a `shortForm` string used as the URL-safe deck identifier.

```typescript
interface SimplifiedDeckProvider {
  addCards(
    cards: { id: string; quantity: number }[],
    deckShortForm?: string,
  ): Promise<{ deck: SimplifiedDeck; shortForm: string }>;

  removeCards(
    cards: { id: string; quantity: number }[],
    deckShortForm: string,
  ): Promise<{ deck: SimplifiedDeck; shortForm: string }>;

  getDeckFromShortForm(
    deckShortForm: string,
  ): Promise<{ deck: SimplifiedDeck; shortForm: string }>;
}
```

### SimplifiedDeckProvider methods

#### `addCards(cards, deckShortForm?)`

Adds cards to an existing deck or creates a new one if `deckShortForm` is omitted. Returns the updated deck and the new short form string.

#### `removeCards(cards, deckShortForm)`

Removes the specified quantities from an existing deck. Returns the updated deck and short form.

#### `getDeckFromShortForm(deckShortForm)`

Decodes and returns the deck represented by a short form string. Throws if the string is invalid.

---

## Factory

`src/providers/index.ts` exports `createProvider()`, which reads `CARD_PROVIDER` from the environment and returns the appropriate `CardDataProvider`. Only `"supabase"` is supported. See [Supabase Provider](./supabase-provider.md) for implementation details.
