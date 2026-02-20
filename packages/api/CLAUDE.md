# packages/api — Context for Claude

## Purpose
ElysiaJS REST API server. Loads a `CardDataProvider` on startup and exposes card data as HTTP endpoints. Serves the built frontend static files in production.

## Running
```bash
bun dev:api         # Hot reload via Bun watcher, port from API_PORT (default 3000)
bun start           # Production (no hot reload)
```
OpenAPI UI is available at `/api/swagger` (documents all API versions).

## Versioned API Structure
Each API version is a standalone Elysia sub-app with a `prefix`. **Do not use `.group()`** — use the prefix pattern instead:

```typescript
// ✅ Correct — versioned sub-app
const v1 = new Elysia({ prefix: "/api/v1" })
  .get("/health", () => ({ status: "ok" }))
  // ... all v1 routes

const app = new Elysia()
  .use(cors(...))
  .use(v1)           // mount the versioned sub-app
  .use(swagger(...)) // swagger stays on the root app; it auto-discovers all mounted routes
  .listen(...)
```

The swagger plugin is mounted on the **root app only** — it discovers routes from all mounted sub-apps automatically.

### Adding a New API Version (v2, etc.)
1. Create `const v2 = new Elysia({ prefix: "/api/v2" })` with its routes
2. Add `.use(v2)` to the root app (after `.use(v1)`)
3. Both versions coexist; the Swagger UI will show all routes under their respective prefixes
4. For separate per-version Swagger tabs, serve filtered spec JSON endpoints and add them to `scalarConfig.sources`

## Routes
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Liveness probe |
| `GET` | `/api/v1/meta` | Provider metadata + cache age |
| `GET` | `/api/v1/cards` | Search cards (query params below) |
| `GET` | `/api/v1/cards/random` | Random card |
| `GET` | `/api/v1/cards/:id` | Single card by UUID |
| `GET` | `/api/v1/cards/:id/text` | Plain-text card summary |
| `POST` | `/api/v1/resolve` | Batch resolve up to 20 `CardRequest` objects |
| `GET` | `/api/v1/prices/tcgplayer` | TCGPlayer USD prices for a card |
| `GET` | `/api/v1/sets` | All sets with card counts |

### GET /api/v1/cards — Query Parameters
| Param | Type | Notes |
|-------|------|-------|
| `name` | string | Name search (fuzzy if `fuzzy=true`) |
| `set` | string | Filter by set code, e.g. `OGN` |
| `collector` | string | Exact collector number filter |
| `fuzzy` | boolean | Enable fuzzy matching |
| `limit` | number | Max results (default 10) |

### POST /api/v1/resolve — Body
```typescript
{ requests: CardRequest[] }  // max 20 items
```

## Elysia Patterns
- Define routes on the versioned sub-app (`v1`, `v2`, …), not directly on the root app
- Use `.use(swagger())` and `.use(cors())` on the **root app only**
- Response types are inferred — avoid casting when possible
- The `raw` field on cards is stripped before sending responses (`sanitiseCard` helper)
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
2. Add Elysia schema annotations (`.query()`, `.body()`, `.response()`) for Swagger
3. Write a test in `src/__tests__/routes.test.ts`
4. If the route exposes new personal data or logs new information, update `PrivacyPage.tsx`

## Error Handling
- Return `{ error: string }` with appropriate HTTP status codes
- 400 for bad input, 404 for not found, 500 for provider errors
- Do not leak internal stack traces in production responses

## Dependencies
- `elysia` — server framework
- `@elysiajs/cors` — CORS headers
- `@elysiajs/swagger` — OpenAPI/Swagger UI
- `@riftseer/core` — workspace dep (provider, types)

## Testing
```bash
bun test packages/api   # or: bun test from root
```
