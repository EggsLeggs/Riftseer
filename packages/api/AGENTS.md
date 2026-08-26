# packages/api

Elysia REST API deployed as a Cloudflare Worker. It exposes `CardDataProvider`; routes do not query card tables directly.

## Commands

```bash
bun run dev          # localhost:8789, shared Miniflare state
bun run dev:remote   # live Cloudflare bindings
bun run typecheck
bun run test
bun run deploy
```

Copy `.dev.vars.example` to `.dev.vars` for local secrets. Treat `wrangler.jsonc` and the generated Worker bindings as authoritative.

## Routes

Nine route files, all mounted in `src/index.ts`. Check this list before adding a handler — a second `/formats` or `/auth` path is the easy mistake.

- `src/routes/cards.ts` — oracle search and detail, printing lookup, batch resolve. `/cards` is oracle-shaped; `unique=prints` is the explicit printing mode.
- `src/routes/admin.ts` — oracle, printing, delta, relationship, legality, ruling, set, **format** and reconciliation mutations.
- `src/routes/decks.ts` — decks, zones, collaborators, revisions, invites and text import/export.
- `src/routes/auth.ts` — register, login, refresh, logout, password reset, email change, `/auth/me`.
- `src/routes/users.ts` — public profiles, followers, following, `/users/me`, follow and unfollow.
- `src/routes/metafy.ts` — Metafy OAuth connect, callback, status, disconnect.
- `src/routes/formats.ts` — public `GET /formats`. Format *mutations* live in `admin.ts`.
- `src/routes/sets.ts` — public `GET /sets`.
- `src/routes/meta.ts` — `GET /health` and `GET /meta`.

Metafy is split three ways: OAuth routes in `src/routes/metafy.ts`, the webhook and API client in `src/lib/metafy.ts`, and the webhook path intercepted in `src/index.ts`. Change one, check the others.

## Boundaries

- Public endpoint documentation lives in `docs/`. Update the relevant page when a route contract changes.
- Admin database access is isolated behind `src/lib/admin-data.ts` and admin RPCs. Deck access is isolated behind `src/lib/deck-data.ts` and `deck_apply_card_changes`.
- `src/routes/decks.ts` is the **real** authorisation boundary. The Worker's service-role key bypasses RLS, so the migration's deck policies are defence in depth.
- `unlisted`-by-link access exists only here. A deck the caller may not read returns 404; a write refused on a readable deck returns 403.
- Deck tokens derive from `makes_token` edges, never stored membership. A `deck_token_printings` row whose oracle left the derived set is ignored and pruned in passing.
- Ingest changing an edge is normal and must never fail a read.
- Response schemas in `src/schemas.ts` are hand-written, but `Mirrors<>` and `Assert<>` check them against `@riftseer/types` in both directions.
- Preserve both directions. Elysia strips response fields its schema omits, so a one-way check passes while the field disappears.
- Keep the versioned sub-app under `/api/v1`; CORS belongs on the root app.

## Card model at the HTTP boundary

- An oracle is the rules object with a UUID. A printing is one physical card keeping its text ObjectId.
- `GET /cards/:id` resolves an oracle handle. `GET /printings/:id` resolves a printing.
- `GET /cards/detail` accepts exactly one of `oracle`, `printing` or `slug` and returns the aggregate oracle-detail payload.
- `POST /cards/resolve` is an oracle lookup that also selects the requested printing, or the preferred one when none was asked for. Bots depend on this contract.
- `SITE_ORIGIN` only decorates responses with `riftseer_uri`; it is never persisted.
- Prices are opt-in. Affiliate-link rewriting is independent of price inclusion and stays printing-level.

## Admin invariants

- Every admin route uses the scoped admin auth plugin. Bearer-token resolution plus `ADMIN_USER_IDS` is the security boundary; UI checks are convenience.
- Service credentials never leave the Worker.
- Oracle and printing patches use omitted-key/explicit-null merge-patch semantics. Admin RPCs write real columns and add the field to `locked_fields`.
- Do not reintroduce an override overlay.
- An oracle-slug URL renders the oracle's `preferred_printing_id`, so an oracle with a null pointer 404s even with live printings.
- A trigger on `printings` maintains it, honouring the same `riftseer.defer_projection` guard the projection uses. Do not add per-RPC refresh calls back.
- Printing deltas express genuine per-printing rules differences. They are not locks.
- Relationships are oracle-to-oracle only. Incoming relationships are reverse reads, not separately stored edges.
- Legalities resolve printing row, then oracle row, then default legal. Returning a format to default clears the row.
- A ruling is separate from its targets. Query targets use the same parser and SQL renderer as card search.
- Reject an empty parsed AST: it renders as true and would attach the ruling to the whole catalogue.
- Mutating RPCs refresh affected ruling matches inside the write transaction.
- Review confirmation routes proposals through normal admin mutations so locks survive ingest.
- `missing_printing` and `unmatched_oracle` entries need manual creation; confirming them records the gap rather than inventing a card.
- A `field_diff` names only a printing, so an oracle-level field's confirm derives the oracle from it.
- `reconciliationFieldScope()` is the shared answer to which level a field writes at, asserted against `buildConfirmPatch` per field in the route tests.
- `GET /admin/printings` reads the `printings` table, not `resolved_printings`. The projection excludes soft-deleted rows, and this is the only route back to them.
- Its filters — deleted, manual, locked, delta-carrying, image-less — are deliberately facts the search grammar does not express.
- Do not use `t.UnionEnum` for optional query parameters. Elysia fills in the first member when the key is absent, silently filtering an unfiltered request.
- Use a union of literals in query position. `t.UnionEnum` stays correct for response fields and required body fields.

## Worker-specific constraints

- Use `status(code, body)` for early responses from Elysia scoped plugins.
- Cloudflare Workers forbid request I/O at module scope. Provider warmup and binding access stay lazy and retryable from request handling.
- The Metafy webhook is intercepted before Elysia because HMAC verification needs the unconsumed raw request body.
- Admin image uploads put bounded, content-addressed source bytes in `CARD_IMAGES` and enqueue transformation on `CARD_IMAGE_QUEUE`. Never transform inline.
- Local API and ingest processes must share `../../.wrangler/shared`. A full remote queue path needs a deployed Worker; remote Wrangler does not support Queues.
- `@elysiajs/swagger` must not enter the Worker bundle; it depends on filesystem APIs.

## Change checklist

- Add route schemas and a focused handler test.
- Update the relevant page under `docs/`.
- Revisit the privacy page when a route collects, stores or logs new personal data.
- Regenerate the spec when the public contract changes.
