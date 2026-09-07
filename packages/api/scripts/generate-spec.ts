/**
 * Writes the OpenAPI spec to packages/api/openapi.json.
 *
 * The spec comes from the same `buildApp` the Worker runs, so every mounted
 * route is in it by construction. It is built under plain Bun against the
 * in-memory stub provider: no adapter, no credentials, no network. Nothing
 * time- or environment-dependent reaches the JSON, so a rerun on an unchanged
 * tree is byte-identical and `bun run spec:check` can diff it in CI.
 *
 * Usage:
 *   cd packages/api && bun run generate:spec
 */

import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { buildApp } from "../src/app";
import { StubProvider } from "../src/__tests__/stub_card_provider";

const app = new Elysia()
  .use(buildApp(new StubProvider()))
  .use(
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
      },
    }),
  );

const res = await app.handle(new Request("http://localhost/swagger/json"));
if (!res.ok) {
  console.error("Failed to build OpenAPI spec:", res.status, await res.text());
  process.exit(1);
}
const spec = await res.json();

const outPath = resolve(import.meta.dir, "../openapi.json");
writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");
console.log(`OpenAPI spec written to ${outPath}`);
process.exit(0);
