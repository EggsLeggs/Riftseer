/**
 * The Tabletop Simulator mod reads the API from inside the game, where a moved
 * field is a broken deck import that no typecheck sees. This test pins the
 * shape `apps/tts` consumes against the committed `openapi.json`, so the API
 * side fails CI before the mod fails in the field.
 *
 * Consumers pinned here, both in `apps/tts/scripts/objects/`:
 *
 *   80c03d_riftbound_card_importer.lua  POST /cards/resolve in batches of 20
 *   25dbaf_riftbound_deck_loader.lua    GET /cards?name=&set=<CODE>&limit=500,
 *                                       then GET <printing uri> for a fallback
 *                                       image
 *
 * Fields the mod reads today that the spec no longer carries are `test.todo`
 * entries naming the exact path, tracked by #126. A failing assertion would
 * only block the API for a breakage the mod already has.
 */

import { describe, expect, it, test } from "bun:test";
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

/** The same assertions, parked: `bun test --todo` runs them and reports which still fail. */
function todoShape(schema: unknown, shape: Shape) {
  for (const [dotted, type] of shape) {
    test.todo(`${dotted} is ${type}`, () => expectField(schema, dotted, type));
  }
}

describe("GET /api/v1/cards, the deck loader's set listing", () => {
  const route = "/api/v1/cards";

  it("is mounted with the query parameters the loader sends", () => {
    expect(operation("get", route)).toBeDefined();
    expect(queryParameters("get", route)).toEqual(expect.arrayContaining(["name", "set", "limit"]));
  });

  describe("response", () => {
    expectShape(responseSchema("get", route), [
      ["cards", "array"],
      ["cards[].name", "string"],
      ["printings", "array"],
      ["printings[].set.set_code", "string"],
      ["printings[].collector_number", "string"],
      ["printings[].oracle_id", "string"],
      ["cards[].printings[].set.set_code", "string"],
      ["cards[].printings[].collector_number", "string"],
    ]);
  });

  describe("read by the loader, missing from the spec (#126)", () => {
    // A `set` filter answers in printings mode: `cards` is empty and the rows
    // are in `printings`, which carry the set and collector number the loader
    // looks for on `cards[]`. Every TTS code lands in "unresolved".
    todoShape(responseSchema("get", route), [
      ["cards[].set.set_code", "string"],
      ["cards[].collector_number", "string"],
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
    expectShape(responseSchema("post", route), [
      ["results", "array"],
      ["results[].request.raw", "string"],
      ["results[].request.name", "string"],
      ["results[].matchType", "string"],
      // The shape #126 moves the importer onto: rules from the oracle, the
      // image from the printing, fallback images from the oracle's printings.
      ["results[].oracle.name", "string"],
      ["results[].oracle.card_type", "string"],
      ["results[].oracle.supertype", "string"],
      ["results[].oracle.text.plain", "string"],
      ["results[].oracle.energy", "number"],
      ["results[].oracle.might", "number"],
      ["results[].oracle.tags", "array"],
      ["results[].oracle.printings[].image.normal", "string"],
      ["results[].printing.image.normal", "string"],
      ["results[].printing.set.set_code", "string"],
      ["results[].printing.collector_number", "string"],
    ]);
  });

  describe("read by the importer, missing from the spec (#126)", () => {
    // The importer reads `results[].card` in the RiftCodex shape the May-era
    // API returned. The spec answers `oracle` plus `printing`, so every name
    // resolves to nil and the import fails.
    todoShape(responseSchema("post", route), [
      ["results[].card", "object"],
      ["results[].card.name", "string"],
      ["results[].card.text.plain", "string"],
      ["results[].card.classification.supertype", "string"],
      ["results[].card.classification.type", "string"],
      ["results[].card.attributes.energy", "number"],
      ["results[].card.attributes.might", "number"],
      ["results[].card.tags", "array"],
      ["results[].card.media.media_urls.normal", "string"],
      ["results[].card.related_printings[].uri", "string"],
    ]);
  });
});

describe("GET /api/v1/printings/{id}, the loader's fallback image", () => {
  const route = "/api/v1/printings/{id}";

  describe("response", () => {
    expectShape(responseSchema("get", route), [["image.normal", "string"]]);
  });

  describe("read by the loader, missing from the spec (#126)", () => {
    // The loader follows `related_printings[].uri` and reads the image from
    // `media.media_urls.normal`; the printing detail spells it `image.normal`.
    todoShape(responseSchema("get", route), [["media.media_urls.normal", "string"]]);
  });
});
