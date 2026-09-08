/**
 * The Tabletop Simulator mod reads the API from inside the game, where a moved
 * field is a broken deck import that no typecheck sees. This test pins the
 * shape `apps/tts` consumes against the committed `openapi.json`, so the API
 * side fails CI before the mod fails in the field.
 *
 * Consumers pinned here, both in `apps/tts/scripts/objects/`:
 *
 *   80c03d_riftbound_card_importer.lua  POST /cards/resolve in batches of 20
 *   25dbaf_riftbound_deck_loader.lua    GET /cards?q=set:<CODE>&unique=prints,
 *                                       paged, to turn a TTS code into a name
 *
 * Every path below is one the mod reads, so a failure here is a mod that has
 * broken. Add a path when the Lua starts reading it and drop one when the Lua
 * stops; an assertion nothing consumes only makes the API harder to change.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

/** Unwraps `anyOf: [T, null]`, the spec's spelling of a nullable object. */
function concrete(schema: unknown): unknown {
  const anyOf = field(schema, "anyOf");
  if (!Array.isArray(anyOf)) return schema;
  return anyOf.find((member) => field(member, "type") !== "null") ?? schema;
}

/** Walks `a.b[].c` through `properties` and `items`; `undefined` when a step is missing. */
function resolve(schema: unknown, dotted: string): unknown {
  let current = concrete(schema);
  for (const step of dotted.split(".")) {
    const isArray = step.endsWith("[]");
    const key = isArray ? step.slice(0, -2) : step;
    current = concrete(field(field(current, "properties"), key));
    if (isArray) current = concrete(field(current, "items"));
    if (current === undefined) return undefined;
  }
  return current;
}

const spec: unknown = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../openapi.json"), "utf8"),
);

function operation(method: string, route: string): unknown {
  return field(field(field(spec, "paths"), route), method);
}

function jsonSchema(content: unknown): unknown {
  return field(field(field(content, "content"), "application/json"), "schema");
}

function responseSchema(method: string, route: string): unknown {
  return jsonSchema(field(field(operation(method, route), "responses"), "200"));
}

function requestSchema(method: string, route: string): unknown {
  return jsonSchema(field(operation(method, route), "requestBody"));
}

function queryParameters(method: string, route: string): string[] {
  const parameters = field(operation(method, route), "parameters");
  if (!Array.isArray(parameters)) return [];
  return parameters
    .filter((parameter) => field(parameter, "in") === "query")
    .map((parameter) => field(parameter, "name"))
    .filter((name): name is string => typeof name === "string");
}

/** `[dotted path, JSON schema type]` rows for `it.each`. */
type Shape = readonly (readonly [string, string])[];

function expectField(schema: unknown, dotted: string, type: string) {
  const found = resolve(schema, dotted);
  expect(found).toBeDefined();
  expect(field(found, "type")).toBe(type);
}

function expectShape(schema: unknown, shape: Shape) {
  it.each(shape)("%s is %s", (dotted, type) => expectField(schema, dotted, type));
}

describe("GET /api/v1/cards, the deck loader's set listing", () => {
  const route = "/api/v1/cards";

  it("is mounted with the query parameters the loader sends", () => {
    expect(operation("get", route)).toBeDefined();
    expect(queryParameters("get", route)).toEqual(
      expect.arrayContaining(["q", "unique", "limit", "offset"]),
    );
  });

  describe("response", () => {
    // A TTS code is a set and a collector number, which are printing-level, and
    // the name it translates to is the oracle's. `unique=prints` answers with
    // both halves: the printings, and the oracles that own them. `total` ends
    // the paging walk, which search needs because it clamps `limit` to 100.
    expectShape(responseSchema("get", route), [
      ["printings", "array"],
      ["printings[].set.set_code", "string"],
      ["printings[].collector_number", "string"],
      ["printings[].oracle_id", "string"],
      ["cards", "array"],
      ["cards[].id", "string"],
      ["cards[].name", "string"],
      ["total", "number"],
    ]);
  });
});

describe("POST /api/v1/cards/resolve, the importer's name resolution", () => {
  const route = "/api/v1/cards/resolve";

  it("takes the batch the importer sends", () => {
    expect(operation("post", route)).toBeDefined();
    const requests = resolve(requestSchema("post", route), "requests");
    expect(field(requests, "type")).toBe("array");
    expect(field(field(requests, "items"), "type")).toBe("string");
  });

  describe("response", () => {
    // A card on the table is the pair: the nickname, rules text and the zone it
    // spawns into come from the oracle, the face image from the printing resolve
    // picked. The oracle's own printings carry the images the loader falls back
    // to when that face URL is dead, so a fallback costs no second request.
    expectShape(responseSchema("post", route), [
      ["results", "array"],
      ["results[].request.raw", "string"],
      ["results[].request.name", "string"],
      ["results[].oracle.name", "string"],
      ["results[].oracle.card_type", "string"],
      ["results[].oracle.supertype", "string"],
      ["results[].oracle.text.plain", "string"],
      ["results[].oracle.energy", "number"],
      ["results[].oracle.might", "number"],
      ["results[].oracle.tags", "array"],
      ["results[].oracle.is_token", "boolean"],
      ["results[].oracle.relationships.makes_tokens[].id", "string"],
      ["results[].oracle.relationships.makes_tokens[].name", "string"],
      ["results[].oracle.printings[].image.normal", "string"],
      ["results[].printing.image.normal", "string"],
    ]);
  });
});
