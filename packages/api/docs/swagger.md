---
title: Swagger / OpenAPI
sidebar_label: Swagger
sidebar_position: 2
---

The API ships a live [Scalar](https://scalar.com) UI (served via `@elysiajs/swagger`) that lets you browse and try every endpoint without writing any code.

- **Production UI:** `https://riftseerapi-production.up.railway.app/api/swagger`
- **Raw OpenAPI JSON:** `https://riftseerapi-production.up.railway.app/api/swagger/json`

---

## Running locally

Start the API, then open the UI in a browser:

```bash
bun dev:api
# → http://localhost:3000/api/swagger
# → http://localhost:3000/api/swagger/json  (raw spec)
```

The UI is served by the API process itself — no separate tool needed.

---

## How it works

The swagger plugin is mounted on the **root Elysia app** and auto-discovers routes from all mounted sub-apps. You never need to register routes manually with Swagger — adding a route to the `v1` sub-app (or any future version) makes it appear in the UI automatically.

The spec is generated at startup from the Elysia schema annotations on each route (`detail`, `query`, `body`, `response`). Tags (`Meta`, `Cards`, `Decks`) are defined in `src/index.ts` and assigned per-route via `detail.tags`.

---

## Updating the spec

The spec reflects whatever annotations exist on the route handlers. To improve or extend what Swagger shows for a route, edit the `detail` object and schema annotations in the relevant route file:

```typescript
// packages/api/src/routes/cards.ts
.get("/cards/random", handler, {
  response: { 200: CardSchema, 404: ErrorSchema },
  detail: {
    tags: ["Cards"],
    summary: "Get a random card",
    description: "Returns a single random card from the index.",
  },
})
```

| Annotation | What it controls |
| --- | --- |
| `detail.summary` | One-line label shown in the endpoint list |
| `detail.description` | Longer description shown when the endpoint is expanded |
| `detail.tags` | Which group the endpoint appears under |
| `query` / `body` | Request parameter and body schemas (types + descriptions) |
| `response` | Response schemas per status code |

To add a description to an individual parameter, pass it in the schema:

```typescript
query: t.Object({
  name: t.Optional(t.String({ description: "Card name to search for" })),
})
```

### Adding a new tag

Tags are declared in the `documentation.tags` array in `src/index.ts`. Add the tag there first, then reference it by name in `detail.tags` on the routes that belong to it.

---

## Environment variables

When the API is deployed behind a reverse proxy or at a non-root path, set `BASE_URL` (or `SWAGGER_BASE_URL`) so the spec's `servers` field points to the correct base:

```bash
BASE_URL=https://riftseerapi-production.up.railway.app
```

Without this, the "Try it" requests in the UI will use `/` as the base and may fail if the API is not at the root.
