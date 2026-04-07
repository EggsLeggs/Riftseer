---
title: API Overview
sidebar_label: Overview
sidebar_position: 1
---

The Riftseer API is a read-mostly REST API that exposes Riftbound TCG card data. It powers the Riftseer frontend, Discord bot, and Reddit bot. It can also be used directly by third-party tools.

- **Base URL:** `https://riftseer-api.thinkhuman-21f.workers.dev`
- **All versioned routes:** `/api/v1/...`

---

## Authentication

No authentication is required. All endpoints are publicly accessible.

---

## Request format

All requests use standard HTTP. Query parameters are plain strings. The only endpoint that accepts a request body is `POST /api/v1/cards/resolve` and the deck endpoints — these accept `application/json`.

No special headers are required beyond `Content-Type: application/json` on POST requests with a body.

---

## Response format

All successful responses return JSON. List responses use a consistent envelope:

```json
{
  "count": 3,
  "cards": [ ... ]
}
```

Single-resource responses return the object directly (no envelope):

```json
{
  "object": "card",
  "id": "...",
  "name": "Sun Disc",
  ...
}
```

All card objects carry `"object": "card"` and related card references carry `"object": "related_card"`.

---

## Errors

Errors return a JSON body with `error` (human-readable message) and `code` (machine-readable string):

```json
{
  "error": "Query parameter `name` is required",
  "code": "MISSING_PARAM"
}
```

| Status | Meaning |
| --- | --- |
| `400` | Bad request — missing or invalid parameter |
| `404` | Resource not found |
| `500` | Internal server error |

There is no 401 or 403 — the API has no authentication layer.

---

## Versioning

All routes are versioned under a path prefix (`/api/v1/...`). The version is part of the URL, not a header. If a breaking change is ever needed, a new `/api/v2/...` prefix will be introduced alongside v1 — old versions are not removed.

The Swagger UI at `/api/swagger` documents all active versions.

---

## Framework

The API is built with [ElysiaJS](https://elysiajs.com) deployed as a [Cloudflare Worker](https://workers.cloudflare.com). Elysia uses the `CloudflareAdapter` and a versioned sub-app pattern rather than `.group()`:

```typescript
// Each version is a standalone Elysia sub-app
const v1 = new Elysia({ prefix: "/api/v1" })
  .use(metaRoutes(...))
  .use(cardsRoutes(...))
  .use(decksRoutes(...))

// Mounted on the root app with CloudflareAdapter
export const app = new Elysia({ adapter: CloudflareAdapter })
  .use(cors(...))
  .use(v1)
  .compile()

export default app
```

Route modules live in `packages/api/src/routes/`:

| Module | Routes |
| --- | --- |
| `meta.ts` | `/health`, `/meta` |
| `cards.ts` | `/cards`, `/cards/random`, `/cards/:id`, `/cards/:id/text`, `/cards/resolve` |
| `sets.ts` | `/sets` |
| `decks.ts` | `/decks/u`, `/decks/u/:shortForm` |

---

## Provider pattern

The API does not query the database directly. All data access goes through the `CardDataProvider` interface from `@riftseer/core`. The active implementation is `SupabaseCardProvider`, selected at startup via the `CARD_PROVIDER` env var.

This means the API has no opinion on where data comes from — swapping the provider requires no changes to route code.

---

## Adding an endpoint

1. Add the handler to the relevant route module in `src/routes/`
2. Annotate it with Elysia schema types (`.query()`, `.body()`, `.response()`) and a `detail` block (used for Eden Treaty types and static spec generation)
3. Write a test in `src/__tests__/routes/`
4. Update the relevant doc page in `packages/api/docs/`
5. If the endpoint stores or exposes new personal data, update `PrivacyPage.tsx`

---

## Endpoints

| Method | Path | Doc |
| --- | --- | --- |
| `GET` | `/api/v1/health` | [Meta](./meta.md) |
| `GET` | `/api/v1/meta` | [Meta](./meta.md) |
| `GET` | `/api/v1/cards` | [Search](./search.md) |
| `GET` | `/api/v1/cards/random` | [Cards](./cards.md) |
| `GET` | `/api/v1/cards/:id` | [Cards](./cards.md) |
| `GET` | `/api/v1/cards/:id/text` | [Cards](./cards.md) |
| `POST` | `/api/v1/cards/resolve` | [Cards](./cards.md) |
| `GET` | `/api/v1/sets` | [Sets](./sets.md) |
| `GET` | `/api/v1/decks/u/:shortForm` | [Decks](./decks.md) |
| `POST` | `/api/v1/decks/u/:shortForm` | [Decks](./decks.md) |
| `POST` | `/api/v1/decks/u` | [Decks](./decks.md) |
