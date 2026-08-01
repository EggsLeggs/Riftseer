---
title: API Overview
sidebar_label: Overview
sidebar_position: 1
---

The Riftseer API is a read-mostly REST API that exposes Riftbound TCG card data. It powers the Riftseer frontend, Discord bot, and Reddit bot. It can also be used directly by third-party tools.

- **Base URL:** `https://api.riftseer.com`
- **All versioned routes:** `/api/v1/...`

---

## Authentication

Most endpoints are publicly accessible and require no authentication. The
`/api/v1/auth` endpoints manage user sessions; authenticated requests should
include `Authorization: Bearer <access_token>` where required. Admin mutations
also require the token's user UUID to be listed in `ADMIN_USER_IDS`.

---

## Request format

Requests with JSON bodies use `Content-Type: application/json`. Admin image
uploads use `multipart/form-data`. Protected routes additionally require
`Authorization: Bearer <access_token>`.

---

## Response format

Successful resource responses return JSON. Collection endpoints wrap their
results with count or pagination metadata, for example:

```json
{
  "count": 3,
  "cards": [ ... ]
}
```

Single-resource responses return the object directly:

```json
{
  "object": "oracle",
  "id": "...",
  "name": "Sun Disc",
  ...
}
```

Rules objects carry `"object": "oracle"`, physical editions carry
`"object": "printing"`, and relationship references carry
`"object": "oracle_ref"`.

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
| `401` | Unauthenticated — missing or invalid token (auth routes only) |
| `404` | Resource not found |
| `500` | Internal server error |

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
  .use(setsRoutes(...))
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
| `cards.ts` | `/cards`, `/cards/random`, `/cards/detail`, `/cards/:id`, `/cards/:id/text`, `/cards/by-slug/*`, `/cards/resolve`, `/printings/:id` |
| `sets.ts` | `/sets` |
| `formats.ts` | `/formats` |
| `decks.ts` | `/decks/u`, `/decks/u/:shortForm` |
| `auth.ts` | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/me`, `/auth/reset-password` |
| `admin.ts` | `/admin/oracles/*`, `/admin/printings/*`, `/admin/sets/*`, `/admin/formats/*`, `/admin/rulings/*`, `/admin/reconciliation/*` |

---

## Provider pattern

Public card reads go through the `CardDataProvider` interface from `@riftseer/core`.
The active implementation is `SupabaseCardProvider`, selected through the
`CARD_PROVIDER` binding. Admin mutations use a service-role-backed repository so
each RPC can update the live row, lock the changed fields, and append an audit
event atomically.

This means the API has no opinion on where data comes from — swapping the provider requires no changes to route code.

---

## Adding an endpoint

1. Add the handler to the relevant route module in `src/routes/`
2. Annotate it with Elysia schema types (`.query()`, `.body()`, `.response()`) and a `detail` block (used for Eden Treaty types and static spec generation)
3. Write a test in `src/__tests__/routes/`
4. Update the relevant doc page in `packages/api/docs/`
5. If the endpoint stores or exposes new personal data, review
   `packages/web/src/views/privacy-view.tsx`

---

## Endpoints

| Method | Path | Doc |
| --- | --- | --- |
| `GET` | `/api/v1/health` | [Meta](./meta.md) |
| `GET` | `/api/v1/meta` | [Meta](./meta.md) |
| `GET` | `/api/v1/cards` | [Search](./search.md) |
| `GET` | `/api/v1/cards/random` | [Cards](./cards.md) |
| `GET` | `/api/v1/cards/detail` | [Cards](./cards.md) |
| `GET` | `/api/v1/cards/:id` | [Cards](./cards.md) |
| `GET` | `/api/v1/cards/:id/text` | [Cards](./cards.md) |
| `GET` | `/api/v1/cards/by-slug/*` | [Cards](./cards.md) |
| `POST` | `/api/v1/cards/resolve` | [Cards](./cards.md) |
| `GET` | `/api/v1/printings/:id` | [Cards](./cards.md) |
| `GET` | `/api/v1/sets` | [Sets](./sets.md) |
| `GET` | `/api/v1/formats` | [Formats](./formats.md) |
| `GET` | `/api/v1/decks/u/:shortForm` | [Decks](./decks.md) |
| `POST` | `/api/v1/decks/u/:shortForm` | [Decks](./decks.md) |
| `POST` | `/api/v1/decks/u` | [Decks](./decks.md) |
| `POST` | `/api/v1/auth/register` | [Auth](./auth.md) |
| `POST` | `/api/v1/auth/login` | [Auth](./auth.md) |
| `POST` | `/api/v1/auth/refresh` | [Auth](./auth.md) |
| `POST` | `/api/v1/auth/logout` | [Auth](./auth.md) |
| `POST` | `/api/v1/auth/forgot-password` | [Auth](./auth.md) |
| `GET` | `/api/v1/auth/me` | [Auth](./auth.md) |
| `POST` | `/api/v1/auth/reset-password` | [Auth](./auth.md) |
| `GET` | `/api/v1/admin/audit-log` | [Admin](./admin.md) |
| `GET` | `/api/v1/admin/reconciliation` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/reconciliation/:id/confirm` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/reconciliation/:id/dismiss` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/oracles` | [Admin](./admin.md) |
| `PATCH` | `/api/v1/admin/oracles/:id` | [Admin](./admin.md) |
| `DELETE` | `/api/v1/admin/oracles/:id` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/oracles/:id/restore` | [Admin](./admin.md) |
| `GET` | `/api/v1/admin/oracles/:id/relationships` | [Admin](./admin.md) |
| `PUT` | `/api/v1/admin/oracles/:id/relationships` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/printings` | [Admin](./admin.md) |
| `PATCH` | `/api/v1/admin/printings/:id` | [Admin](./admin.md) |
| `DELETE` | `/api/v1/admin/printings/:id` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/printings/:id/restore` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/printings/:id/regenerate-slug` | [Admin](./admin.md) |
| `GET` | `/api/v1/admin/printings/:id/deltas` | [Admin](./admin.md) |
| `PUT` | `/api/v1/admin/printings/:id/deltas` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/printings/:id/image` | [Admin](./admin.md) |
| `GET` | `/api/v1/admin/printings/:id/legalities` | [Admin](./admin.md) |
| `PUT` | `/api/v1/admin/printings/:id/legalities` | [Admin](./admin.md) |
| `GET` | `/api/v1/admin/printings/:id/rulings` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/sets` | [Admin](./admin.md) |
| `PATCH` | `/api/v1/admin/sets/:setCode` | [Admin](./admin.md) |
| `DELETE` | `/api/v1/admin/sets/:setCode` | [Admin](./admin.md) |
| `GET` | `/api/v1/admin/formats` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/formats` | [Admin](./admin.md) |
| `PUT` | `/api/v1/admin/formats/order` | [Admin](./admin.md) |
| `PATCH` | `/api/v1/admin/formats/:code` | [Admin](./admin.md) |
| `DELETE` | `/api/v1/admin/formats/:code` | [Admin](./admin.md) |
| `GET` | `/api/v1/admin/rulings` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/rulings/preview` | [Admin](./admin.md) |
| `POST` | `/api/v1/admin/rulings` | [Admin](./admin.md) |
| `PATCH` | `/api/v1/admin/rulings/:rulingId` | [Admin](./admin.md) |
| `DELETE` | `/api/v1/admin/rulings/:rulingId` | [Admin](./admin.md) |
