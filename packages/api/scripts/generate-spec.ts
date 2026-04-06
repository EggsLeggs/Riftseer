/**
 * Generates the OpenAPI spec for the Riftseer API.
 *
 * Uses plain Elysia (no CloudflareAdapter — this runs in Bun, not a CF Worker)
 * with @elysiajs/swagger mounted, hits the spec endpoint, and writes the JSON
 * to docs/static/openapi.json in the repo root.
 *
 * Usage:
 *   cd packages/api && bun run generate:spec
 */

import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import {
  createProvider,
  DeckSerializerV1,
  NotFoundError,
  SimplifiedDeckProviderImpl,
} from "@riftseer/core";
import { metaRoutes } from "../src/routes/meta";
import { cardsRoutes } from "../src/routes/cards";
import { setsRoutes } from "../src/routes/sets";
import { decksRoutes } from "../src/routes/decks";

const cardProvider = createProvider();
try {
  await cardProvider.warmup();
} catch {
  // Missing credentials in CI — fine, warmup is non-fatal for spec generation
}

const deckProvider = new SimplifiedDeckProviderImpl(
  new DeckSerializerV1(),
  async (id: string) => {
    const card = await cardProvider.getCardById(id);
    if (!card) throw new NotFoundError(`Card not found: ${id}`);
    return card;
  },
);

const app = new Elysia()
  .use(
    new Elysia({ prefix: "/api/v1" })
      .use(metaRoutes(cardProvider, Date.now()))
      .use(cardsRoutes(cardProvider))
      .use(setsRoutes(cardProvider))
      .use(decksRoutes(deckProvider)),
  )
  .use(
    swagger({
      path: "/swagger",
      documentation: {
        info: { title: "Riftseer API", version: "0.1.0" },
        tags: [
          { name: "Meta", description: "Server health and metadata" },
          { name: "Cards", description: "Card lookup and search" },
          { name: "Sets", description: "Card set listing" },
          { name: "Decks", description: "Deck building and sharing" },
        ],
      },
    }),
  );

const res = await app.handle(new Request("http://localhost/swagger/json"));
if (!res.ok) {
  console.error("Failed to fetch OpenAPI spec:", res.status, await res.text());
  process.exit(1);
}
const spec = await res.text();

// Write to docs/static/openapi.json (repo root / docs / static)
const outPath = resolve(import.meta.dir, "../../../docs/static/openapi.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, spec);
console.log(`OpenAPI spec written to ${outPath}`);
process.exit(0);
