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
5. If the route exposes new personal data or logs new information, update `PrivacyPage.tsx`

## Error Handling
- Return `{ error: string }` with appropriate HTTP status codes
- 400 for bad input, 404 for not found, 500 for provider errors
- Do not leak internal stack traces in production responses

## Cloudflare Workers Notes
- `@elysiajs/swagger` is NOT included — it requires `fs` which is unavailable on CF Workers
- `process.env` is populated from worker vars/secrets via the `nodejs_compat` flag
- Secrets set with `wrangler secret put`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- CF Workers forbid async I/O (fetch) in global scope — `warmup()` is deferred to the first request via `onBeforeHandle` using a lazy promise singleton (retries on failure)
- `setInterval` in `warmup()` may not persist across isolate recycles; `/meta` stats can be stale after a cold start

## Dependencies
- `elysia` — server framework (with CloudflareAdapter)
- `@elysiajs/cors` — CORS headers
- `@riftseer/core` — workspace dep (provider, types)

## Testing
```bash
bun test packages/api   # or: bun test from root
```
