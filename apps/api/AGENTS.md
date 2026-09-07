# apps/api

Elysia REST API deployed as a Cloudflare Worker. It exposes `CardDataProvider`; routes do not query card tables directly. Vocabulary is the root `CONTEXT.md`.

## Commands

```bash
bun run dev             # localhost:8789, shared Miniflare state
bun run dev:remote      # live Cloudflare bindings
bun run test
bun run generate:spec   # rewrites openapi.json; commit it with the route change
```

Copy `.dev.vars.example` to `.dev.vars` for local secrets. `wrangler.jsonc` and the generated Worker bindings are authoritative.

## Routes

Nine route files, all mounted by `buildApp()` in `src/app.ts`; `src/index.ts` only binds that to the Worker. Check this list before adding a handler; a second `/formats` or `/auth` path is the easy mistake.

- `src/routes/cards.ts`: oracle search and detail, printing lookup, batch resolve. `/cards` is oracle-shaped; `unique=prints` is the explicit printing mode.
- `src/routes/admin.ts`: oracle, printing, delta, relationship, legality, ruling, set, format and reconciliation mutations.
- `src/routes/decks.ts`: decks, zones, collaborators, revisions, invites, text import/export, card tags, favorites, view counts, comments and `/deck-folders`.
- `src/routes/auth.ts`: register, login, refresh, logout, password reset, email change, `/auth/me`.
- `src/routes/users.ts`: public profiles, followers, following, `/users/me`, follow and unfollow.
- `src/routes/metafy.ts`: Metafy OAuth. The webhook and API client are `src/lib/metafy.ts`, and the webhook path is intercepted in `src/index.ts` before Elysia because HMAC verification needs the unconsumed raw body. Change one, check the others.
- `src/routes/formats.ts`, `src/routes/sets.ts`, `src/routes/meta.ts`: public `GET /formats`, `GET /sets`, `GET /health` and `GET /meta`. Format mutations live in `admin.ts`.

## The public reference is the spec

- A route's `detail.summary` and `detail.description` plus its schemas are the documentation. `scripts/generate-spec.ts` runs `buildApp()` against the stub provider and mounts `@elysiajs/swagger` beside it, so a mounted route is in the spec by construction. Run `bun run generate:spec` and commit `openapi.json` with the route change; `bun run spec:check` fails CI on drift.
- The Worker serves the committed JSON as a bundled import at `GET /api/v1/openapi.json` and a static Scalar page at `GET /docs`. `@elysiajs/swagger` must never enter the Worker bundle; it depends on filesystem APIs.
- Tags are declared in `scripts/generate-spec.ts`. Add one there before referencing it from `detail.tags`.
- Response schemas in `src/schemas.ts` are hand-written, but `Mirrors<>` and `Assert<>` check them against `@riftseer/types` in both directions. Preserve both: Elysia strips response fields its schema omits, so a one-way check passes while the field disappears.
- Keep the versioned sub-app under `/api/v1`; CORS belongs on the root app.

## Boundaries

- `src/public-routes.ts` is the list of routes anyone may call from anywhere. A route not on it carries `authPlugin` or `adminPlugin`; `src/__tests__/route-security.test.ts` walks every mounted route and fails the build otherwise. Adding a route to the list also gives it `Access-Control-Allow-Origin: *`.
- CORS is `src/plugins/cors.ts`. Public routes answer `*`, so third-party browser clients on the card data keep working; everything else answers only `SITE_ORIGIN` and localhost, and admin never reflects a foreign origin. Do not reintroduce reflect-any-origin.
- Admin database access is isolated behind `src/lib/admin-data.ts` and admin RPCs. Deck access is isolated behind `src/lib/deck-data.ts` and `deck_apply_card_changes`.
- `src/routes/decks.ts` is the real authorisation boundary. The Worker's service-role key bypasses RLS, so the migration's deck policies are defence in depth. A deck the caller may not read returns 404; a write refused on a readable deck returns 403. Unlisted-by-link access exists only here.
- Deck tokens derive from `makes_token` edges, never stored membership. A `deck_token_printings` row whose oracle left the derived set is ignored and pruned in passing; ingest changing an edge is normal and must never fail a read.
- `SITE_ORIGIN` only decorates responses with `riftseer_uri`; it is never persisted. Prices are opt-in, and affiliate-link rewriting is independent of price inclusion and stays printing-level.
- `POST /cards/resolve` returns an oracle plus the requested printing, or the preferred one when none was asked for. Bots depend on this contract.

## Admin invariants

- Every admin route uses the scoped admin auth plugin. Bearer-token resolution plus `ADMIN_USER_IDS` is the security boundary; UI checks are convenience. Service credentials never leave the Worker.
- Oracle and printing patches use omitted-key/explicit-null merge-patch semantics. Admin RPCs write real columns and add the field to `locked_fields`. Do not reintroduce an override overlay.
- An oracle-slug URL renders the oracle's `preferred_printing_id`, so an oracle with a null pointer 404s even with live printings. A trigger on `printings` maintains the pointer, honouring the same `riftseer.defer_projection` guard the projection uses; do not add per-RPC refresh calls back.
- Legalities resolve printing row, then oracle row, then default legal. Returning a format to default clears the row.
- A ruling is separate from its targets. Query targets use the same parser and SQL renderer as card search; reject an empty parsed AST, which renders as true and would attach the ruling to the whole catalogue. Mutating RPCs refresh affected ruling matches inside the write transaction.
- Review confirmation routes proposals through normal admin mutations so locks survive ingest. `missing_printing` and `unmatched_oracle` entries need manual creation; confirming them records the gap rather than inventing a card. A `field_diff` names only a printing, so an oracle-level field's confirm derives the oracle from it. `reconciliationFieldScope()` is the shared answer to which level a field writes at, asserted against `buildConfirmPatch` per field in the route tests.
- `GET /admin/printings` reads the `printings` table, not `resolved_printings`. The projection excludes soft-deleted rows, and this is the only route back to them. Its filters (deleted, manual, locked, delta-carrying, image-less) are deliberately facts the search grammar does not express.
- Do not use `t.UnionEnum` for optional query parameters. Elysia fills in the first member when the key is absent, silently filtering an unfiltered request. Use a union of literals in query position; `t.UnionEnum` stays correct for response fields and required body fields.

## Worker constraints

- Use `status(code, body)` for early responses from Elysia scoped plugins.
- Cloudflare Workers forbid request I/O at module scope. Provider warmup and binding access stay lazy and retryable from request handling.
- Admin image uploads put bounded, content-addressed source bytes in `CARD_IMAGES` and enqueue transformation on `CARD_IMAGE_QUEUE`. Never transform inline.
- `src/plugins/rate-limit.ts` runs in `onRequest` and limits auth endpoints to 10/min and other non-public writes to 120/min per `CF-Connecting-IP`, sliding-window in Upstash. It fails open when Redis is unconfigured or erroring, so it can never be the outage. The limits are data in `RATE_LIMIT_RULES`.
- Local API and ingest processes must share `../../.wrangler/shared`. A full remote queue path needs a deployed Worker; remote Wrangler does not support Queues.

## Change checklist

- Add route schemas, a `detail` block and a focused handler test, then regenerate and commit the spec.
- Account routes take `clients` and `protectedAuthPlugin` options the way deck and admin routes take a repository. Test them through `src/__tests__/fake_supabase.ts`, never by mocking `lib/supabase` for the whole run.
- Revisit the privacy page when a route collects, stores or logs new personal data.
- Reference kept beside the spec: `docs/search.md` (the search grammar and its one execution path) and `docs/access.md` (CORS and hosted images).
