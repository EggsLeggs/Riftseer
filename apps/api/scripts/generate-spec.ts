/**
 * Writes the OpenAPI spec to apps/api/openapi.json.
 *
 * The spec comes from the same `buildApp` the Worker runs, so every mounted
 * route is in it by construction. It is built under plain Bun against the
 * in-memory stub provider: no adapter, no credentials, no network. Nothing
 * time- or environment-dependent reaches the JSON, so a rerun on an unchanged
 * tree is byte-identical and `bun run spec:check` can diff it in CI.
 *
 * `security` is stamped on afterwards from `src/route-guards.ts` rather than
 * written into each route's `detail` block, which keeps ~50 identical literals
 * out of the route files and means the document tracks the guards by itself.
 *
 * Usage:
 *   cd apps/api && bun run generate:spec
 */

import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { buildApp } from "../src/app";
import { securityByOperation, type SecurityRequirement } from "../src/route-guards";
import { StubProvider } from "../src/__tests__/stub_card_provider";

const api = buildApp(new StubProvider());
const app = new Elysia().use(api).use(
  swagger({
    path: "/swagger",
    documentation: {
      info: {
        title: "Riftseer API",
        version: "0.1.0",
        description:
          "Riftbound TCG card data, decks and accounts. Every route is under " +
          "`/api/v1`; the interactive reference is served at `/docs`.",
      },
      tags: [
        { name: "Meta", description: "Server health and metadata" },
        { name: "Cards", description: "Card lookup and search" },
        { name: "Sets", description: "Card set listing" },
        { name: "Formats", description: "Deck formats and their rules" },
        { name: "Decks", description: "Deck building and sharing" },
        { name: "Auth", description: "User registration, sessions and linked accounts" },
        { name: "Users", description: "Public profiles and the follow graph" },
        { name: "Admin", description: "Admin-only durable card and set mutations" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description:
              "A Supabase access token from `POST /api/v1/auth/login` or " +
              "`POST /api/v1/auth/refresh`, sent as `Authorization: Bearer <token>`. " +
              "Admin routes take the same token and additionally require the account " +
              "to be listed in the Worker's `ADMIN_USER_IDS`.",
          },
        },
      },
    },
  }),
);

const res = await app.handle(new Request("http://localhost/swagger/json"));
if (!res.ok) {
  console.error("Failed to build OpenAPI spec:", res.status, await res.text());
  process.exit(1);
}
interface Operation {
  security?: readonly SecurityRequirement[];
}
const spec: { paths: Record<string, Record<string, Operation>> } = await res.json();

// A guarded route with no operation to stamp means the route and the document
// have already drifted, which is the failure this whole mechanism exists to
// prevent. Fail rather than write a spec that is quietly missing a lock.
const unstamped: string[] = [];
for (const [operation, security] of securityByOperation(api.routes)) {
  const [method, path] = operation.split(" ");
  const item = spec.paths[path]?.[method.toLowerCase()];
  if (!item) {
    unstamped.push(operation);
    continue;
  }
  item.security = security;
}
if (unstamped.length > 0) {
  console.error("Routes needing auth that the spec has no operation for:", unstamped.join(", "));
  process.exit(1);
}

const outPath = resolve(import.meta.dir, "../openapi.json");
writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");
console.log(`OpenAPI spec written to ${outPath}`);
process.exit(0);
