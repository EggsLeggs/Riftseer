---
title: OpenAPI
sidebar_label: OpenAPI
sidebar_position: 2
---

The API describes itself with Elysia schema annotations (`detail`, `query`, `body`, `response`) on each route. The OpenAPI spec is generated from those annotations, committed at `packages/api/openapi.json`, and served by the Worker itself.

---

## Where to find it

| URL                                            | What                                                           |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `https://api.riftseer.com/docs`                | Interactive reference, powered by [Scalar](https://scalar.com) |
| `https://api.riftseer.com/api/v1/openapi.json` | The spec the reference reads                                   |

Both work against `wrangler dev` too (`http://localhost:8789/docs`), and Scalar's "try it" requests go to whichever origin served the page.

---

## One source

`packages/api/src/app.ts` exports `buildApp(provider, options)`, the complete route composition. The Worker calls it with the Cloudflare adapter; `packages/api/scripts/generate-spec.ts` calls it under plain Bun with the in-memory stub provider and mounts `@elysiajs/swagger` beside it to extract the spec. Because both go through the same function, a mounted route is in the spec by construction — there is no second list to forget a route in.

The generator needs no credentials and nothing time- or environment-dependent reaches the JSON, so rerunning it on an unchanged tree is byte-identical.

```bash
cd packages/api
bun run generate:spec     # rewrites packages/api/openapi.json
```

`bun run spec:check` (part of `bun run check`, so CI runs it) regenerates and fails on any diff. When a route contract changes, regenerate and commit the spec in the same PR.

`@elysiajs/swagger` stays a dev dependency: the Worker serves the committed JSON as a bundled import and one static HTML string, and never loads the plugin.

---

## Updating what the reference shows

Edit the `detail` object and schemas in the relevant route file:

```typescript
// packages/api/src/routes/cards.ts
.get("/cards/random", handler, {
  response: { 200: CardSchema, 404: ErrorSchema },
  detail: {
    tags: ["Cards"],
    summary: "Get a random card",
    description: "Returns a single random card, with its preferred printing.",
  },
})
```

| Annotation           | What it controls                                          |
| -------------------- | --------------------------------------------------------- |
| `detail.summary`     | One-line label shown in the endpoint list                 |
| `detail.description` | Longer description shown when the endpoint is expanded    |
| `detail.tags`        | Which group the endpoint appears under                    |
| `detail.hide`        | Leaves the route out of the spec entirely                 |
| `query` / `body`     | Request parameter and body schemas (types + descriptions) |
| `response`           | Response schemas per status code                          |

To describe an individual parameter, pass it in the schema:

```typescript
query: t.Object({
  name: t.Optional(t.String({ description: "Card name to search for" })),
});
```

Tags are declared in the `documentation.tags` array in `scripts/generate-spec.ts`. Add a tag there first, then reference it by name from `detail.tags`.

---

## Eden Treaty

`App` in `src/app.ts` (re-exported from `src/index.ts`) exposes all route types for Eden Treaty clients. This is independent of the OpenAPI spec — Eden uses TypeScript inference at compile time, not the runtime spec.

The Discord bot (`packages/discord-bot/src/api.ts`) and the website consume it:

```typescript
import type { App } from "@riftseer/api";
```
