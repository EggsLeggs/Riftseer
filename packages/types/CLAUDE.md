# packages/types

Zero-dependency canonical types and runtime-neutral helpers shared by Bun, Node, Cloudflare Workers and browser builds. Do not add a runtime dependency; this package is safe to import everywhere precisely because it has none.

## Card model

- `src/card.ts` owns `Oracle`, `Printing` and resolution/search types. `src/card-detail.ts` owns the aggregate `OracleDetail` payload.
- Oracle fields describe the rules object. Printing fields describe one physical card. Rarity is printing-level.
- `oracle_key` is a name-derived lookup slug, never identity. `oracleKeyForName()` in `src/oracle.ts` is used only when ingest guesses which oracle a new printing belongs to; unmatched printings go to review.
- `OracleRef` is the relationship shape. Relationships are oracle edges; sibling printings are a foreign-key traversal, not a relationship array.
- `might_bonus` uses presence to identify equipment. Zero is a real printed bonus.

## Deck model

- `src/deck.ts` owns the zone vocabulary, `zoneForCard()`, the counting groups and `DEFAULT_LEGALITY_SEVERITY`. `src/deck-validate.ts` owns `validateDeck()`. `src/deck-text.ts` owns text import/export.
- A deck entry carries **both** `oracle_id` and `printing_id`. Counting is by oracle, display is by printing: three copies across two arts is three toward the copy limit and two rows.
- `validateDeck()` is advisory and non-throwing. Format rules are never database constraints, so a deck saved under one set of rules stays loadable after they change.
- `zoneForCard()` keys off `card_type` (`Legend`, `Rune`, `Battlefield`), never `supertype`. The pre-oracle-rewrite deck model used `supertype` and silently routed every rune and battlefield into the main deck.

## Shared derivations

- `src/card-image.ts` is the sole derivation of hosted image URLs and R2 keys. URLs are derived from printing id and optional source hash, never stored.
- `src/slug.ts` owns oracle and printing URL slugs. Both are pinned on first insert. Printing slugs include set/collector/variant shape; oracle slugs are single name segments. Collision suffixes change only the final name segment.
- `src/keywords.ts` contains the TypeScript keyword extractor used outside Postgres. The database trigger remains the write-time authority.
- `src/parser.ts` owns both `[[Name|SET-123]]` token parsing and name normalization. Consumers import it rather than maintaining client-specific parsers.
- `src/reconciliation.ts` owns the shared set of reconciliation fields the API can confirm, so API and admin UI exhaustiveness checks derive from one value.

## Working here

```bash
bun test packages/types
```

Exports are declared in `package.json` and re-exported from `index.ts`. Add a subpath export only for a runtime module that consumers benefit from importing directly.

When the public shape changes, update the type first, then compile its API schema, provider/ingest writers and clients. Update the relevant card documentation and review the privacy page if the change affects collected or stored user data.
