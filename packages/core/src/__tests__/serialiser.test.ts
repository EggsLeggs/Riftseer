import { describe, expect, test } from "bun:test";
import { DeckSerializerV1 } from "../serialiser.ts";
import type { SimplifiedDeck } from "../types.ts";

const serializer = new DeckSerializerV1();
const empty: SimplifiedDeck = {
  id: null,
  legendId: null,
  chosenChampionId: null,
  mainDeck: [],
  sideboard: [],
  runes: [],
  battlegrounds: [],
};
const complete: SimplifiedDeck = {
  ...empty,
  legendId: "11111111-2222-3333-4444-555555555555",
  chosenChampionId: "aaaabbbb-cccc-dddd-eeee-ffffffffffff",
  mainDeck: ["00000000-0000-0000-0000-000000000001:3", "short-id:2"],
  sideboard: ["00000000-0000-0000-0000-000000000002:1"],
  runes: ["rune:255"],
  battlegrounds: ["ground-a", "ground-b", "ground-c"],
};

describe("DeckSerializerV1", () => {
  test("round-trips empty and fully populated decks", () => {
    expect(serializer.deserializeDeck(serializer.serializeDeck(empty))).toEqual(empty);
    expect(serializer.deserializeDeck(serializer.serializeDeck(complete))).toEqual(complete);
  });

  test("preserves nullable champion slots independently", () => {
    const deck = { ...complete, chosenChampionId: null };
    expect(serializer.deserializeDeck(serializer.serializeDeck(deck))).toEqual(deck);
  });

  test("emits stable opaque base64url strings", () => {
    const encoded = serializer.serializeDeck(complete);
    expect(encoded).toBe(serializer.serializeDeck(complete));
    expect(encoded).not.toMatch(/[+/={}"]/);
    expect(encoded).not.toContain("legendId");
  });

  test("different decks do not alias", () => {
    expect(serializer.serializeDeck(complete)).not.toBe(serializer.serializeDeck({ ...complete, legendId: "other" }));
  });

  test("rejects invalid or truncated short forms", () => {
    const encoded = serializer.serializeDeck(complete);
    for (const invalid of ["not-a-valid-deck", encoded.slice(0, 4)]) {
      expect(() => serializer.deserializeDeck(invalid)).toThrow();
    }
  });

  test("rejects malformed quantity entries before encoding", () => {
    expect(() => serializer.serializeDeck({ ...empty, mainDeck: ["missing-quantity"] })).toThrow();
  });
});
