# packages/web

Next.js App Router site deployed to Cloudflare Workers through OpenNext.

<!-- BEGIN:nextjs-agent-rules -->
## Next.js version

This version has breaking APIs, conventions and file structure that may differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before changing Next.js code, and heed its deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commands

```bash
bun dev             # Node development server
bun run typecheck
bun run preview     # build and run in workerd; required before deploy
bun run deploy
bun run cf-typegen
```

`bun dev` does not exercise the Workers runtime. Run `bun run preview` before deploying, especially after dependency, binding or server-runtime changes.

## Layout

- `app/` owns routing and layouts, `views/` compose pages, `features/` own domain behaviour and API access, `components/` are reusable UI.
- `lib/` holds cross-feature primitives: `src/lib/env.ts`, `src/lib/session.ts`, `src/lib/c15t.ts`, `src/lib/api/`.
- `providers/` holds client-state wiring. New shared non-UI code belongs in one of these two, not in `components/`.
- Keep business logic out of route files and generic components.
- Server components are the default. Use client components only for state, interactivity or browser APIs.
- Client-side server state goes through TanStack Query.

## Boundaries

- All Riftseer data and auth operations go through the Elysia API. Never import Supabase in page, view or feature code.
- The only direct database connection is c15t's consent backend.
- API calls live in feature API modules. `src/lib/api/client.ts` is the Eden contract; `src/lib/api/request.ts` holds the shared timeout, no-store and `CardApiError` handling.
- Admin and deck types derive from the Eden `App` type. Do not restate a wire shape by hand.
- `src/lib/env.ts` parses at module scope, so importing it with a public var unset throws at import time, build included.
- Public variables need the `NEXT_PUBLIC_` prefix; secrets do not.

## Cards

- UI code always carries an oracle and the printing being viewed. Rules, stats, type, tags and relationships come from the oracle.
- Rarity, art, artist, set, collector, flavour and marketplace data come from the printing.
- `src/features/cards/api.ts` returns oracle-shaped results by default and passes `unique` for set and gallery views.
- It applies a timeout and disables fetch caching, so a failure reaches the error boundary instead of hanging a render.
- Use `cardHref()` or `oracleHref()` from `src/features/cards/paths.ts` for same-origin paths, and API-provided `riftseer_uri` for absolute links.
- `/card/<printing-id>` is a permanent compatibility route. It resolves the printing and `permanentRedirect`s to the pinned slug.
- The canonical route self-redirects too when the joined path no longer matches `public_slug`, so a rename never leaves a stale URL.
- Card detail loads through `cardsApi.getDetail()` with exactly one oracle id, printing id or slug. React request caching shares the lookup with metadata.
- Search syntax is also the ruling rule language. When search fields change, update `src/views/search-syntax-view.tsx` and the API search documentation.

## Decks

- `src/features/decks/api.ts` is token-less and client-safe. Every authenticated read and every write goes through `server-api.ts` and the `actions.ts` wrappers.
- `server-api.ts` imports `server-only`; the actions fetch the session themselves. An action never takes a token argument.
- A deck the caller may not read answers 404, so "missing" and "not yours" render identically.
- Roles come from the payload's `role`. `canEditDeck()` and `ownsDeck()` are the only place that mapping lives.
- `/deck/<id>/<tail>` — the tail is cosmetic and derived from the current name, so renaming never breaks a link. Build paths with `src/features/decks/paths.ts`.
- Grouping a deck list for display is `src/features/decks/grouping.ts` and nothing else. It is pure, and counts copies rather than rows.
- The builder is the deck page with `?edit=1`, one `DeckZoneSection` and one `DeckCardRow` per zone.
- Card edits go through `use-deck-editor`, which batches them into one `PUT /decks/:id/cards`. The RPC coalesces revisions within five minutes, so a request per click writes a revision row per click.
- Violations arrive precomputed. Render `severity` distinctly and read the structured fields, never `message`.
- `/decks/new` renders signed out. `use-guest-deck` swaps localStorage for the API and `validateDeck` for precomputed violations.
- Every list, row and footer below it is the component the signed-in builder uses. A second builder is the thing this arrangement exists to avoid.
- `guest-deck.ts` is pure and owns the stored shape. A blob it cannot read is no deck, never a crash.
- On sign-in the deck converts through `createDeckAction` then `applyDeckCardChangesAction`, and the local copy clears only once both land.

## Admin

- `requireAdmin()` protects the route subtree for UX. The API's bearer token and `ADMIN_USER_IDS` checks are the security boundary.
- Admin status is fetched from `/auth/me`, never trusted from a cookie, so revocation takes effect immediately.
- Oracle and printing editors stay separate even on one screen. Form patches contain only changed keys: omission preserves, explicit null clears.
- Genuine printing-specific rules differences belong in the delta panel, not the oracle form.
- The delta panel reads the stored row before it writes. `PUT /deltas` replaces wholesale, so Save stays disabled until the read lands.
- Admin bookkeeping — `locked_fields`, `deleted_at`, delta source — comes from `/admin/printings`, never from the card payload.
- Types in `src/features/admin/types.ts` derive from the Elysia `App` type. Hand-written ruling types silently lost fields the API had started returning.
- Relationships replace an oracle's outgoing edge list. Incoming edges are context only, and there is no printing-scoped relationship control.
- Legality edits choose oracle or printing scope; default means clearing the stored row.
- Shared or query-targeted rulings are edited from the central rulings page, because changing them in a printing panel could affect other cards.
- Review entries never auto-apply. Confirming a field uses the normal admin mutation path so it becomes locked against ingest.
- Server actions are public endpoints. An action doing its own side effect before calling the protected API must authenticate itself.
- The gallery image importer restricts HTTPS hosts, revalidates redirect hops, limits bytes and time, and streams the response, all to prevent SSRF.

## Auth

- Session cookies are server-managed in `src/lib/session.ts`. Client components receive session data from a server parent and never read tokens.
- `proxy.ts` is this Next version's renamed `middleware.ts`. There is no `middleware.ts` here, and adding one does nothing.
- It refreshes tokens within five minutes of expiry. Page and layout authorization uses `requireAuth()` or `requireAdmin()`, not the proxy.
- `proxy.ts` uses `getValidatedPublicApiUrl()` rather than importing `env`, so a missing variable cannot crash the proxy runtime.
- Password recovery tokens arrive in the callback URL fragment and move through session storage, because fragments never reach the server.

## Consent and legal copy

- Consent entry points are `src/components/consent-manager/`, `src/app/api/c15t/[...all]/route.ts` and `src/lib/c15t.ts`.
- For changes, use the repository c15t skill and the installed package's version-matched documentation.
- The c15t Postgres connection uses the Supabase transaction pooler with prepared statements disabled. `C15T_DATABASE_URL` is a secret.
- Canonical legal copy lives in `src/views/privacy-view.tsx` and `src/views/terms-view.tsx`, using `src/views/legal-document.tsx`.
- Update the page's "Last updated" date whenever copy changes, and bump the matching API legal version for a material change.
- Review privacy copy when collection, storage, logging, third parties, consent behaviour or bot persistence changes.
- Review terms for age, acceptable use, attribution, liability, disputes, jurisdiction or contact changes.

## Cloudflare and styling

- Do not add an Edge runtime declaration; OpenNext supplies the Worker runtime. Keep `nodejs_compat` and the generated shims the type-only API import needs.
- Production needs the same public values at build time and Worker runtime. `wrangler.jsonc` is authoritative for runtime bindings.
- Import `src/app/icons.css` directly from the root layout. Tailwind drops it when nested through the global stylesheet, making light-theme glyphs disappear.
- Do not hand-edit generated shadcn components unless the change intentionally belongs in the shared primitive.
