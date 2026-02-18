# packages/api — Context for Claude

## Purpose
ElysiaJS REST API server. Loads a `CardDataProvider` on startup and exposes card data as HTTP endpoints. Serves the built frontend static files in production.

## Running
```bash
bun dev:api         # Hot reload via Bun watcher, port from API_PORT (default 3000)
bun start           # Production (no hot reload)
```
OpenAPI UI is available at `/api/swagger`.

## Routes
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/meta` | Provider metadata + cache age |
| `GET` | `/api/cards` | Search cards (query params below) |
| `GET` | `/api/cards/random` | Random card |
| `GET` | `/api/cards/:id` | Single card by UUID |
| `GET` | `/api/cards/:id/text` | Plain-text card summary |
| `POST` | `/api/resolve` | Batch resolve up to 20 `CardRequest` objects |
| `GET` | `/api/sets` | All sets with card counts |

### GET /api/cards — Query Parameters
| Param | Type | Notes |
|-------|------|-------|
| `q` | string | Name search (fuzzy if `fuzzy=true`) |
| `set` | string | Filter by set_id |
| `collector` | string | Exact collector number (requires `set`) |
| `fuzzy` | boolean | Enable fuzzy matching |
| `limit` | number | Max results |

### POST /api/resolve — Body
```typescript
{ requests: CardRequest[] }  // max 20 items
```

## Elysia Patterns
- Define routes with `.get()`, `.post()`, etc. directly on the app instance
- Use `.use(swagger())` and `.use(cors())` plugins at the top level
- Response types are inferred — avoid casting when possible
- The `raw` field on cards is stripped before sending responses
- **Testing**: Use `app.handle(new Request(...))` — no live server needed

```typescript
// Test pattern
const res = await app.handle(new Request('http://localhost/api/health'))
const json = await res.json()
```

## Adding a New Route
1. Add the route handler in `src/index.ts`
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
