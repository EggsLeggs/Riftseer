# packages/types

Zero-dependency canonical types and runtime-neutral helpers shared by Bun, Node, Cloudflare Workers and browser builds. Do not add a runtime dependency; this package is safe to import everywhere precisely because it has none.

## Card model

- `src/card.ts` owns `Oracle`, `Printing` and resolution/search types. `src/card-detail.ts` owns the aggregate `OracleDetail` payload.
- Oracle fields describe the rules object. Printing fields describe one physical card. Rarity is printing-level.
- `oracle_key` is a name-derived lookup slug, never identity. `oracleKeyForName()` in `src/oracle.ts` is used only when ingest guesses which oracle a new printing belongs to.
- Unmatched printings go to review rather than creating a second oracle.
- `OracleRef` is the relationship shape. Relationships are oracle edges; sibling printings are a foreign-key traversal, not a relationship array.
- `might_bonus` uses presence to identify equipment. Zero is a real printed bonus.

## Deck model

- `src/deck.ts` owns the zone vocabulary, `zoneForCard()`, the counting groups and `DEFAULT_LEGALITY_SEVERITY`.
- `src/deck-validate.ts` owns `validateDeck()`. `src/deck-text.ts` owns text import and export.
- A deck entry carries **both** `oracle_id` and `printing_id`. Counting is by oracle, display is by printing.
- Three copies across two arts is three toward the copy limit and two rows.
- `validateDeck()` is advisory and non-throwing. Format rules are never database constraints, so a deck stays loadable after they change.
- `zoneForCard()` keys off `card_type` (`Legend`, `Rune`, `Battlefield`), never `supertype`. The old model used `supertype` and routed every rune and battlefield into the main deck.
- Deck text is line-based and human-pasteable, marking champions with `*CH*` and pinning a printing with a `(SET) COLLECTOR` suffix.
- It replaced an opaque binary short form. Keep it diffable; do not reintroduce a compact encoding.
- `src/deck/` is the deck logic a client runs, and the boundary lint keeps it inside this package so it never reaches React or an app. `grouping.ts` and `stats.ts` are display, counting copies rather than rows. `changes.ts` is the change queue, its merge rules and the optimistic projection; `add.ts` is zone eligibility and what a second `+` means. `guest-deck.ts` owns the signed-out deck's stored shape and its projections, with the localStorage calls left in web. `primer-markup.ts` scans mention spans over `src/parser.ts`. `editor.ts` is the builder's write path as a reducer over `changes.ts`: it decides what is queued, what is sent at once and what the list shows meanwhile, and leaves the debounce and the request to the hook that wraps it.
- The change body and the guest row in `src/deck/` restate the wire shape by hand because a mobile client cannot derive them from Eden; `apps/web/src/features/decks/types.ts` asserts the two still agree at compile time.

## Shared derivations

- `src/card-image.ts` is the sole derivation of hosted image URLs and R2 keys. URLs derive from printing id and optional source hash, never stored.
- `src/slug.ts` owns oracle and printing URL slugs. Both are pinned on first insert. Collision suffixes change only the final name segment. Turning a slug into a site URL is `src/render/urls.ts`.
- `src/keywords.ts` contains the TypeScript keyword extractor used outside Postgres. The database trigger remains the write-time authority.
- `src/parser.ts` owns both `[[Name|SET-123]]` token parsing and name normalization. Consumers import it rather than maintaining client-specific parsers.
- `src/card-text.ts` repairs upstream flavour text on the way in. Everything a surface renders from lives in `src/render/`.
- `src/reconciliation.ts` owns the reconciliation fields the API can confirm, so API and admin UI exhaustiveness checks derive from one value.

## Render kernel

`src/render/` is pure functions over card text and card fields, returning plain data. It is what web, Discord, Reddit and Raycast render from, so it never imports React, a DOM API or a Discord asset.

- `src/render/index.ts` is the whole public surface, exported as `@riftseer/types/render` and from the package root. The boundary lint rejects any import of the files behind it.
- `tokens.ts` owns the `:rb_<key>:` vocabulary: `tokenizeCardTextLine()` yields the neutral token stream (text, icon runs, keyword badges with absorbed costs, literal brackets, reminder italics); `replaceIconTokens()` serves text-only surfaces.
- `card-text.ts` owns `normalizeCardTextLayout()`, the one paragraph splitter, plus `text.rich` parsing and the clipboard formatter.
- `domains.ts` owns the six domain keys, their printed names, the rune-art hex fills and the softer wash triples. Go through `domainKey()`; never compare a domain string by hand.
- `type-line.ts` owns `cardTypeLine()` ("Champion Unit", a bare "Legend", "Token Unit") and its glyph key.
- `urls.ts` owns relative card paths and absolute `riftseer_uri` derivation from a `siteOrigin`, plus `cardSiteUrl()` for clients that prefer the API's field.
- Surfaces keep only medium-specific assets: web's CSS class per token, Discord's emoji-id map in `@riftseer/core/icons`, Raycast's asset paths. Hand-rolling a regex in a client instead of importing the kernel is the mistake it exists to prevent.

## API client

- `src/client/index.ts` is `createRiftseerClient()`, the zero-dependency fetch client the standalone surfaces and the mobile app read the API through, exported as `@riftseer/types/client` and from the root. It declares the response envelopes (`CardSearchResponse`, `CardResolveResponse`, `SetSummary`, `FormatListResponse`, `ApiError`) once; the card, printing, format and detail halves are this package's own types.
- Every method answers a `ClientResult<T>` and never throws. `status: 0` is the client's own code for a request that never reached the API.
- `apps/api/src/__tests__/client-contract.test.ts` asserts each response type against the route's inferred schema in both directions and runs the client against `buildApp()` in memory. Change a route's response, and that test says which side to fix.
- Raycast resolves modules with `moduleResolution: node`, which ignores `exports`; it imports from the package root, so keep the client and the render kernel re-exported from `index.ts`.

## Vocabularies kept in step

These mirror something outside TypeScript. A stale copy fails silently rather than erroring.

- `src/admin-actions.ts` — `ADMIN_AUDIT_ACTIONS`, mirrored against the migration by its own test. A missing action yields an audit trail that looks empty.
- `src/admin-printing.ts` — `ADMIN_PRINTING_STATES`, shared by API validation and the admin filter UI.
- `src/social-links.ts` — `SOCIAL_PLATFORM_IDS`, kept in step with the web platform list.

## Working here

```bash
bun test packages/types
```

- Exports are declared in `package.json` and re-exported from `index.ts`. Add a subpath export only for a runtime module consumers benefit from importing directly.
- When the public shape changes, update the type first, then its API schema, provider and ingest writers, then clients.
- Review the privacy page if the change affects stored user data. Vocabulary is the root `CONTEXT.md`; reference read once is `docs/deck-model.md` (why the deck model is shaped as it is) and `docs/render-kernel.md` (the kernel's public functions).
