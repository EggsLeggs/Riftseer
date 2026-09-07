# apps/web

Next.js App Router site deployed to Cloudflare Workers through OpenNext. Vocabulary is the root `CONTEXT.md`; the rules below are what this package adds.

<!-- BEGIN:nextjs-agent-rules -->

## Next.js version

This version has breaking APIs, conventions and file structure that may differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before changing Next.js code, and heed its deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commands

```bash
bun dev             # Node development server; does not exercise the Workers runtime
bun run preview     # build and run in workerd; required before deploy
bun run cf-typegen  # after a wrangler.jsonc change
```

## Layout and boundaries

- `app/` owns routing and layouts, `views/` compose pages, `features/` own domain behaviour and API access, `components/` are reusable UI, `lib/` holds cross-feature primitives, `providers/` holds client-state wiring. New shared non-UI code goes in `lib/` or `providers/`, never `components/`.
- Server components are the default. Client components are for state, interactivity or browser APIs; client-side server state goes through TanStack Query.
- Every Riftseer data and auth operation goes through the Elysia API. The only direct database connection is c15t's consent backend; never import Supabase in page, view or feature code.
- API calls live in feature API modules. `src/lib/api/client.ts` is the Eden contract; `src/lib/api/request.ts` holds the shared timeout, no-store and `CardApiError` handling, so a failure reaches the error boundary instead of hanging a render.
- Admin and deck types derive from the Eden `App` type. Hand-written ruling types silently lost fields the API had started returning; never restate a wire shape by hand.
- `src/lib/env.ts` parses at module scope, so importing it with a public var unset throws at import time, build included. Public variables carry the `NEXT_PUBLIC_` prefix.
- Do not hand-edit generated shadcn components unless the change belongs in the shared primitive.

## Cards

- UI always carries an oracle and the printing being viewed. Rules, stats, type, tags and relationships read the oracle; rarity, art, artist, set, collector, flavour and marketplace data read the printing.
- Same-origin paths come from `cardHref()` and `oracleHref()` in `@riftseer/types/render`; absolute links use the API's `riftseer_uri`. Never build a marketplace URL in the browser; that resolution lives in `packages/core`.
- `src/features/cards/card-text.tsx` maps the kernel's `tokenizeCardTextLine()` stream to elements. Only the CSS class per token is web's; the walk over icons, keywords and italics is the kernel's.
- `/card/<printing-id>` is a permanent compatibility route that `permanentRedirect`s to the pinned slug, and the canonical route self-redirects when the path no longer matches `public_slug`, so a rename never leaves a stale URL.
- Search syntax is also the ruling rule language. When search fields change, update `src/views/search-syntax-view.tsx` and `apps/api/docs/search.md`.

## Decks

- `src/features/decks/api.ts` is token-less and client-safe. Authenticated reads and every write go through `server-api.ts` (which imports `server-only`) and the `actions.ts` wrappers; an action fetches the session itself and never takes a token argument.
- Server actions are public endpoints. An action doing its own side effect before calling the protected API must authenticate itself.
- A deck the caller may not read answers 404, so "missing" and "not yours" render identically. Roles come from the payload's `role`; `canEditDeck()` and `ownsDeck()` are the only place that mapping lives.
- The deck page is modeless: `canEditDeck(role)` alone turns the edit affordances on. `?edit=1` is retired and the route redirects it away.
- `DeckWorkspace` is the one body both the deck page and the guest builder render. A second builder is the thing this arrangement exists to avoid.
- Grouping, display order and stats are `@riftseer/types/deck/grouping` and `@riftseer/types/deck/stats`, pure, counting copies rather than rows. All three list views and Prev/Next navigation read `deckDisplayOrder()`, so switching views never reorders a deck.
- Card edits go through `use-deck-editor`, which batches them into one `PUT /decks/:id/cards`. The RPC coalesces revisions within five minutes, so a request per click would write a revision row per click.
- Violations arrive precomputed. Render `severity` distinctly and read the structured fields, never `message`.
- Social state is server-decided: favorite, view count, `can_delete` and `is_liked` come from the payload, and the UI never re-derives moderation. Comment threads arrive flat; `deck-comments.ts` builds the tree and promotes orphans rather than dropping them.
- `/decks/new` renders signed out. `@riftseer/types/deck/guest-deck` is pure and owns the stored shape, and `src/features/decks/guest-deck.ts` is only the localStorage calls; a blob it cannot read is no deck, never a crash. On sign-in the local copy clears only once both `createDeckAction` and `applyDeckCardChangesAction` land.
- Drag between zones is `deck-dnd.tsx`, pointer and touch only, with an 8px activation distance that keeps plain clicks working. The card menu's "Move to" is the keyboard path; there is deliberately no KeyboardSensor.
- A card name in the list is a real `<Link>` whose click opens `CardQuickView`. The handler bails on modified and non-primary clicks so ⌘-click and "copy link address" keep working.
- Primer span scanning is `@riftseer/types/deck/primer-markup`; the card-mention grammar stays in `@riftseer/types/parser`, never a second regex.
- `DeckBanner` framing lives in one `FRAMING` const. `fadeStops` must ascend; CSS clamps an out-of-order stop into a hard step rather than erroring. `FRAMING.focus` is a fraction of the card, not an `object-position`, because those percentages drift as the banner changes height. No per-printing focal points before a specific card demonstrably needs one.
- Card tags never enter text export, and the guest builder hides the affordance rather than faking a store.

## Admin

- `requireAdmin()` protects the route subtree for UX. The API's bearer token and `ADMIN_USER_IDS` checks are the security boundary, and admin status is fetched from `/auth/me`, never a cookie, so revocation is immediate.
- Oracle and printing editors stay separate even on one screen. Form patches contain only changed keys: omission preserves, explicit null clears.
- Genuine printing-specific rules differences belong in the delta panel, not the oracle form. The delta panel reads the stored row before it writes because `PUT /deltas` replaces wholesale, so Save stays disabled until the read lands.
- Admin bookkeeping (`locked_fields`, `deleted_at`, delta source) comes from `/admin/printings`, never from the card payload.
- Relationships replace an oracle's outgoing edge list; incoming edges are context only. Legality edits choose oracle or printing scope, and default means clearing the stored row.
- Shared or query-targeted rulings are edited from the central rulings page, because changing them in a printing panel could affect other cards.
- Review entries never auto-apply. Confirming a field uses the normal admin mutation path so it becomes locked against ingest.
- The gallery image importer restricts HTTPS hosts, revalidates redirect hops, limits bytes and time, and streams the response, all to prevent SSRF.

## Auth

- Session cookies are server-managed in `src/lib/session.ts`. Client components receive session data from a server parent and never read tokens.
- `proxy.ts` is this Next version's renamed `middleware.ts`; adding a `middleware.ts` does nothing. It refreshes tokens within five minutes of expiry and uses `getValidatedPublicApiUrl()` rather than `env`, so a missing variable cannot crash the proxy runtime. Page and layout authorization is `requireAuth()` or `requireAdmin()`, not the proxy.
- Password recovery tokens arrive in the callback URL fragment and move through session storage, because fragments never reach the server.

## Consent and legal copy

- Consent entry points are `src/components/consent-manager/`, `src/app/api/c15t/[...all]/route.ts` and `src/lib/c15t.ts`. Use the repository c15t skill and the installed package's version-matched documentation.
- Legal copy is `src/views/privacy-view.tsx` and `src/views/terms-view.tsx` through `src/views/legal-document.tsx`. The root `AGENTS.md` "Legal and consent" section says when a change elsewhere is a copy change.

## Cloudflare and styling

- Do not add an Edge runtime declaration; OpenNext supplies the Worker runtime. Keep `nodejs_compat` and the generated shims the type-only API import needs.
- Production needs the same public values at build time and Worker runtime. `wrangler.jsonc` is authoritative for runtime bindings, and its `env.production` block is a hand-kept copy because wrangler does not inherit bindings under `--env`.
- Import `src/app/icons.css` directly from the root layout. Tailwind drops it when nested through the global stylesheet, making light-theme glyphs disappear.
