---
title: OpenAPI / Swagger
sidebar_label: OpenAPI
sidebar_position: 2
---

The API uses Elysia schema annotations (`detail`, `query`, `body`, `response`) to define its contract. Because `@elysiajs/swagger` requires `fs` (unavailable on Cloudflare Workers), the spec is generated at build time using a separate Bun script and served as a static file via GitHub Pages alongside the dev docs.

---

## Interactive reference

The API reference is available at [/Riftseer/api-reference/](https://eggsleggs.github.io/Riftseer/api-reference/) and is powered by [Scalar](https://scalar.com). It is regenerated on every docs deploy from the OpenAPI spec.

---

## Static spec generation

`packages/api/scripts/generate-spec.ts` builds the Elysia app under Bun (where `fs` is available), mounts `@elysiajs/swagger`, fetches `/swagger/json`, and writes the result to `docs/static/openapi.json` in the repo root. Docusaurus copies everything in `docs/static/` verbatim to the build output, so the spec becomes available at `/Riftseer/openapi.json`.

```bash
# Generate the spec locally (needs .dev.vars with Supabase credentials, or
# credentials will be absent and warmup will be skipped — spec still generates)
cd packages/api
bun run generate:spec
# → writes docs/static/openapi.json
```

The CI workflow (`.github/workflows/docs.yml`) runs this step automatically before `bun run build` in the docs site. No Supabase secrets are needed in CI — the warmup failure is caught and non-fatal for spec generation.

---

## Updating the spec

The spec is derived from the Elysia schema annotations on each route handler. To improve what appears in the docs, edit the `detail` object and schemas in the relevant route file:

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

Tags are declared in the `documentation.tags` array in `scripts/generate-spec.ts`. Add the tag there first, then reference it by name in `detail.tags` on the routes that belong to it.

---

## Eden Treaty

`export type App = typeof app` in `src/index.ts` exposes all route types for Eden Treaty clients. This is independent of the OpenAPI spec — Eden Treaty uses TypeScript inference at compile time, not the runtime spec.

The Discord bot (`packages/discord-bot/src/api.ts`) consumes this:

```typescript
import type { App } from "@riftseer/api";
```
