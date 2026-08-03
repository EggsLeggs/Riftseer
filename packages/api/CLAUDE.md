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

## Boundaries

- Public endpoint documentation lives in `docs/`. Update the relevant page when a route contract changes.
- `src/routes/cards.ts` owns oracle search/detail, printing lookup and batch resolve. `/cards` is oracle-shaped by default; `unique=prints` is the explicit printing-shaped mode.
- `src/routes/admin.ts` owns oracle, printing, delta, relationship, legality, ruling, set and reconciliation mutations. Database access is isolated behind `src/lib/admin-data.ts` and admin RPCs.
- Elysia response schemas in `src/schemas.ts` are necessarily hand-written, but bidirectional compile-time assertions guard them against drift from `@riftseer/types`. Preserve both directions: Elysia strips response fields that its schema omits.
- Keep the versioned sub-app under `/api/v1`; CORS belongs on the root app.

## Card model at the HTTP boundary

- An oracle is the rules object and has a UUID. A printing is one physical card and keeps its text ObjectId. Rarity, art, collector data and marketplace data belong to the printing.
- `GET /cards/:id` resolves an oracle handle. `GET /printings/:id` resolves a physical printing. `GET /cards/detail` accepts exactly one of `oracle`, `printing` or `slug` and returns the aggregate oracle-detail payload.
- `POST /cards/resolve` is an oracle lookup which also selects the requested printing, or the preferred printing when none was requested. Bots depend on this contract.
- `SITE_ORIGIN` is used only to decorate responses with `riftseer_uri`; it is never persisted. Prefer API-provided URLs over rebuilding public card URLs in clients.
- Prices are opt-in. Affiliate-link rewriting is independent of price inclusion and remains printing-level.

## Admin invariants

- Every admin route uses the scoped admin auth plugin. UI checks are convenience only; bearer-token resolution plus `ADMIN_USER_IDS` is the security boundary, and service credentials never leave the Worker.
- Oracle and printing patches use omitted-key/explicit-null merge-patch semantics. Admin RPCs write real columns and add the field to `locked_fields`; do not reintroduce an override overlay.
- An oracle-slug URL renders the oracle's `preferred_printing_id`, so an oracle whose pointer is null 404s even with live printings. A trigger on `printings` maintains it, honouring the same `riftseer.defer_projection` guard the projection uses; do not add per-RPC refresh calls back.
- Printing deltas express genuine per-printing rules differences. They are not locks. Relationships are oracle-to-oracle only; incoming relationships are reverse reads, not separately stored edges.
- Legalities resolve printing row → oracle row → default legal. Only non-legal oracle statuses are stored; returning a format to default clears the row.
- A ruling is separate from its targets. Query targets use the same parser and SQL renderer as card search. Reject an empty parsed AST: it renders as true and would attach the ruling to the whole catalogue. Mutating RPCs refresh affected ruling matches inside the write transaction.
- Review confirmation routes proposals through normal admin mutations so locks survive ingest. `missing_printing` and `unmatched_oracle` entries require manual creation; confirming them records the reviewed gap rather than inventing a card. A `field_diff` names only a printing, so an oracle-level field's confirm derives the oracle from it; `reconciliationFieldScope()` in `@riftseer/types/reconciliation` is the shared answer to which level a field writes at, asserted against `buildConfirmPatch` per field in the route tests.
- `GET /admin/printings` is the admin catalogue list and reads the `printings` table, not `resolved_printings`: the projection excludes soft-deleted rows, which is what makes `deleted_at` a real delete for every other reader and leaves this the only route back. Its filters are facts about the catalogue — deleted, manual, locked, delta-carrying, image-less — deliberately none of which the search grammar expresses.
- Do not use `t.UnionEnum` for optional query parameters: Elysia fills in the first member when the key is absent, silently filtering an unfiltered request. Use a union of literals there.

## Worker-specific constraints

- Use `status(code, body)` for early responses from Elysia scoped plugins.
- Cloudflare Workers forbid request I/O at module scope. Provider warmup and binding access stay lazy and retryable from request handling.
- The Metafy webhook is intercepted before Elysia because HMAC verification needs the unconsumed raw request body.
- Admin image uploads put bounded, content-addressed source bytes in `CARD_IMAGES` and enqueue transformation on `CARD_IMAGE_QUEUE`; never transform inline. Local API and ingest processes must share `../../.wrangler/shared`. A full remote queue path needs a deployed Worker because remote Wrangler does not support Queues.
- `@elysiajs/swagger` must not enter the Worker bundle; it depends on filesystem APIs.

## Change checklist

- Add route schemas and a focused handler test.
- Update the relevant page under `docs/`.
- Revisit the privacy page when a route collects, stores or logs new personal data.
- Regenerate the spec when the public contract changes.
