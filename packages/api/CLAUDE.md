# packages/api — Context for Claude

## Purpose
ElysiaJS REST API running as a Cloudflare Worker. Loads a `CardDataProvider` at isolate startup and exposes card data as HTTP endpoints.

## Running
```bash
wrangler dev        # Local dev at http://localhost:8789
wrangler deploy     # Deploy to Cloudflare Workers
bun run typecheck   # Type-check with tsc --noEmit
```

Requires a `.dev.vars` file for local dev — copy `.dev.vars.example` and fill in your Supabase credentials. `.dev.vars` is gitignored.

## Versioned API Structure
Each API version is a standalone Elysia sub-app with a `prefix`. **Do not use `.group()`** — use the prefix pattern instead:

```typescript
// ✅ Correct — versioned sub-app
const v1 = new Elysia({ prefix: "/api/v1" })
  .get("/health", () => ({ status: "ok" }))
  // ... all v1 routes

export const app = new Elysia({ adapter: CloudflareAdapter })
  .use(cors(...))
  .use(v1)
  .compile();

export type App = typeof app;
export default app;
```

### Adding a New API Version (v2, etc.)
1. Create `const v2 = new Elysia({ prefix: "/api/v2" })` with its routes
2. Add `.use(v2)` to the root app (after `.use(v1)`)
3. Both versions coexist

## Routes

See [`packages/api/docs/`](./docs/) for endpoint reference:
- [`cards.md`](./docs/cards.md) — card lookup, resolve, sets
- [`search.md`](./docs/search.md) — `GET /cards` search mechanics, params, fuzzy/autocomplete
- [`decks.md`](./docs/decks.md) — deck short-form endpoints
- [`meta.md`](./docs/meta.md) — health and provider state
- [`auth.md`](./docs/auth.md) — register, login, refresh, logout
- [`admin.md`](./docs/admin.md) — admin auth gate and durable card/set mutations

## Card response shape — `riftseer_uri`

Every card response runs through `finalizeCard` / `finalizeCards` in
`@riftseer/core`, which add an absolute `riftseer_uri` to the card and to
every related-card stub (`all_parts`, `used_by`, `related_champions`,
`related_legends`, `related_printings`).  `riftseer_uri` is computed at
response time from `SITE_ORIGIN` + `public_slug`; it is never persisted.
Related-card stubs are hydrated in a single batched DB lookup, so the cost
is one extra query per response regardless of related-card count.

`SITE_ORIGIN` is documented in `wrangler.jsonc` → `vars`. Leave it unset to
omit `riftseer_uri` entirely (clients fall back to `/card/<id>`).

## Elysia Patterns
- Define routes on the versioned sub-app (`v1`, `v2`, …), not directly on the root app
- Use `.use(cors())` on the **root app only**
- Response types are inferred — avoid casting when possible
- **Testing**: Use `app.handle(new Request(...))` — no live server needed

```typescript
// Test pattern — build v1 sub-app, mount on root, call .handle()
const v1 = new Elysia({ prefix: "/api/v1" }).get("/health", ...)
const app = new Elysia().use(v1)
const res = await app.handle(new Request("http://localhost/api/v1/health"))
const json = await res.json()
```

## Adding a New Route (to an existing version)
1. Add the route handler to the relevant versioned sub-app (`v1`, etc.) in `src/index.ts`
2. Add Elysia schema annotations (`.query()`, `.body()`, `.response()`) for Eden Treaty types
3. Write a test in `src/__tests__/routes.test.ts`
4. Update or add the relevant doc page in `packages/api/docs/`
5. If the route exposes new personal data or logs new information, update `packages/web/src/views/privacy-view.tsx`

## Error Handling
- Return `{ error: string, code: string }` with appropriate HTTP status codes
- 400 for bad input, 404 for not found, 500 for provider errors
- Do not leak internal stack traces in production responses

## Cloudflare Workers Notes
- `@elysiajs/swagger` is NOT included — it requires `fs` which is unavailable on CF Workers
- `process.env` is populated from worker vars/secrets via the `nodejs_compat` flag
- Secrets set with `wrangler secret put`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Auth routes (`/api/v1/auth/*`) skip card provider warmup, but they are no longer anon-key-only: `SUPABASE_ANON_KEY` covers the Supabase Auth calls (register/login/refresh via `@supabase/supabase-js`, logout via direct REST), while `register`, `login`, and the Metafy routes also need `SUPABASE_SERVICE_ROLE_KEY` for `profiles` / `linked_accounts` writes — `POST /auth/register` returns 503 without it
- **Protected routes**: use `authPlugin` from `src/plugins/auth.ts` — `.use(authPlugin)` injects the authenticated user shape into the handler context via `.resolve({ as: 'scoped' })`. Scope is `scoped` so the middleware only runs for routes in the Elysia instance that explicitly uses the plugin; public routes in the same chain are unaffected. The shared Supabase client lives in `src/lib/supabase.ts`
- **Admin routes**: `adminPlugin` independently reuses the shared bearer-token resolver, then checks `user.id` against comma-separated `ADMIN_USER_IDS`. Every `/api/v1/admin/*` route uses the plugin and writes through `authAdminClient`; the service-role key never leaves the Worker.
- `GET /api/v1/admin/audit-log` is the only read endpoint under `/admin` — it pages `admin_audit_log` newest first via `AdminDataRepository.listAuditLog`. The table is append-only; there is no write endpoint for it.
- Admin image uploads use the `CARD_IMAGES` R2 binding and `CARD_IMAGE_QUEUE` producer binding. The request stores a bounded content-addressed source and queues the Phase 2 image consumer rather than transforming images inline.
- **In Elysia v1.4.x**: use `status(code, body)` (not `error(code, body)`) to return early responses from `resolve`/`derive` — the context has `status`, not `error`
- CF Workers forbid async I/O (fetch) in global scope — `warmup()` is deferred to the first request via `onBeforeHandle` using a lazy promise singleton (retries on failure)
- `setInterval` in `warmup()` may not persist across isolate recycles; `/meta` stats can be stale after a cold start

## Dependencies
- `elysia` — server framework (with CloudflareAdapter)
- `@elysiajs/cors` — CORS headers
- `@riftseer/core` — workspace dep (provider, types)
- `@supabase/supabase-js` — Supabase client used by auth routes

## Testing
```bash
bun test packages/api   # or: bun test from root
```
