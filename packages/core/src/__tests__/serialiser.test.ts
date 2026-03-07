import { describe, it, expect } from "bun:test";
import { DeckSerializerV1 } from "../serialiser.ts";
import { SimplifiedDeck } from "../types.ts";

const serializer = new DeckSerializerV1();

const EMPTY_DECK: SimplifiedDeck = {
    id: null,
    legendId: null,
    chosenChampionId: null,
    mainDeck: [],
    sideboard: [],
    runes: [],
    battlegrounds: [],
};

const SHORT_ID_DECK: SimplifiedDeck = {
    id: null,
    legendId: "l1",
    chosenChampionId: "c1",
    mainDeck: ["u1:3", "u2:2", "u3:1"],
    sideboard: ["u4:2"],
    runes: ["r1:6", "r2:6"],
    battlegrounds: ["b1", "b2", "b3"],
};

const UUID_DECK: SimplifiedDeck = {
    id: null,
    legendId: "11111111-2222-3333-4444-555555555555",
    chosenChampionId: "aaaabbbb-cccc-dddd-eeee-ffffffffffff",
    mainDeck: [
        "00000000-0000-0000-0000-000000000001:3",
        "00000000-0000-0000-0000-000000000002:2",
    ],
    sideboard: ["00000000-0000-0000-0000-000000000003:1"],
    runes: ["00000000-0000-0000-0000-000000000004:12"],
    battlegrounds: [
        "00000000-0000-0000-0000-000000000005",
        "00000000-0000-0000-0000-000000000006",
        "00000000-0000-0000-0000-000000000007",
    ],
};

describe("DeckSerializerV1", () => {
    describe("round-trips", () => {
        it("empty deck", () => {
            const result = serializer.deserializeDeck(serializer.serializeDeck(EMPTY_DECK));
            expect(result).toEqual(EMPTY_DECK);
        });

        it("deck with short string IDs", () => {
            const result = serializer.deserializeDeck(serializer.serializeDeck(SHORT_ID_DECK));
            expect(result).toEqual(SHORT_ID_DECK);
        });

        it("deck with UUID IDs", () => {
            const result = serializer.deserializeDeck(serializer.serializeDeck(UUID_DECK));
            expect(result).toEqual(UUID_DECK);
        });

        it("deck with null legendId and chosenChampionId", () => {
            const deck: SimplifiedDeck = { ...SHORT_ID_DECK, legendId: null, chosenChampionId: null };
            const result = serializer.deserializeDeck(serializer.serializeDeck(deck));
            expect(result).toEqual(deck);
        });

        it("deck with max rune quantity (255)", () => {
            const deck: SimplifiedDeck = { ...EMPTY_DECK, runes: ["r1:255"] };
            const result = serializer.deserializeDeck(serializer.serializeDeck(deck));
            expect(result.runes).toEqual(["r1:255"]);
        });
    });

    describe("output format", () => {
        it("produces a non-empty string", () => {
            expect(serializer.serializeDeck(EMPTY_DECK).length).toBeGreaterThan(0);
        });

        it("output contains no JSON-like characters (not trivially readable)", () => {
            const encoded = serializer.serializeDeck(SHORT_ID_DECK);
            expect(encoded).not.toContain("{");
            expect(encoded).not.toContain('"');
            expect(encoded).not.toContain("legendId");
            expect(encoded).not.toContain("l1");
        });

        it("output is base64url-safe (no +, /, or = characters)", () => {
            const encoded = serializer.serializeDeck(UUID_DECK);
            expect(encoded).not.toMatch(/[+/=]/);
        });

        it("two identical decks produce the same string", () => {
            expect(serializer.serializeDeck(SHORT_ID_DECK)).toBe(serializer.serializeDeck(SHORT_ID_DECK));
        });

        it("two different decks produce different strings", () => {
            const a = serializer.serializeDeck(SHORT_ID_DECK);
            const b = serializer.serializeDeck({ ...SHORT_ID_DECK, legendId: "l2" });
            expect(a).not.toBe(b);
        });
    });

    describe("error handling", () => {
        it("throws on completely invalid input", () => {
            expect(() => serializer.deserializeDeck("not-a-valid-deck")).toThrow();
        });

        it("throws on truncated input", () => {
            const encoded = serializer.serializeDeck(SHORT_ID_DECK);
            expect(() => serializer.deserializeDeck(encoded.slice(0, 4))).toThrow();
        });

        it("throws on malformed entry without colon separator", () => {
            expect(() =>
                serializer.serializeDeck({ ...EMPTY_DECK, mainDeck: ["invalidentry"] })
            ).toThrow();
        });
    });
});
