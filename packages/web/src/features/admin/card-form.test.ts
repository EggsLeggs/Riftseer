import { describe, expect, test } from "bun:test";
import type { Card } from "@riftseer/types";
import {
  buildCardPatch,
  cardEditorSchema,
  cardToEditorValues,
  parseList,
} from "./card-form";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    object: "card",
    id: "67f4064886be8495f7165dd7",
    name: "Sun Disc",
    name_normalized: "sun disc",
    collector_number: "21",
    released_at: "2025-10-31",
    artist: "Some Artist",
    is_token: false,
    external_ids: { tcgplayer_id: "12345" },
    attributes: { energy: 3, might: null, power: 2 },
    classification: {
      type: "Gear",
      rarity: "Rare",
      tags: ["Poro", "Relic"],
      domains: ["Fury"],
    },
    text: { plain: "Equipped Champion gains +2 Power." },
    metadata: { finishes: ["Normal", "Foil"], signature: true },
    media: { orientation: "portrait" },
    purchase_uris: { tcgplayer: "https://tcgplayer.com/x" },
    prices: { tcgplayer: { normal: 1.25, foil: null } },
    all_parts: [],
    used_by: [],
    related_champions: [],
    related_legends: [],
    related_signatures: [],
    related_printings: [],
    ...overrides,
  };
}

describe("cardToEditorValues", () => {
  test("flattens a card into string form values", () => {
    const values = cardToEditorValues(makeCard());

    expect(values.name).toBe("Sun Disc");
    expect(values.attributes.energy).toBe("3");
    expect(values.classification.tags).toBe("Poro, Relic");
    expect(values.metadata.signature).toBe(true);
    expect(values.prices.tcgplayer.normal).toBe("1.25");
  });

  test("renders absent and null values as empty strings, not 'null'", () => {
    const values = cardToEditorValues(
      makeCard({ attributes: { energy: null }, artist: undefined }),
    );

    expect(values.attributes.energy).toBe("");
    expect(values.attributes.might).toBe("");
    expect(values.artist).toBe("");
  });

  test("truncates a timestamped release date to the API's date format", () => {
    const values = cardToEditorValues(
      makeCard({ released_at: "2025-10-31T00:00:00.000Z" }),
    );

    expect(values.released_at).toBe("2025-10-31");
  });

  test("produces values the editor schema accepts", () => {
    const result = cardEditorSchema.safeParse(cardToEditorValues(makeCard()));
    expect(result.success).toBe(true);
  });
});

describe("buildCardPatch", () => {
  const initial = cardToEditorValues(makeCard());

  test("is empty when nothing changed", () => {
    expect(buildCardPatch(initial, initial)).toEqual({});
  });

  test("sends only the changed leaf, not its whole group", () => {
    const patch = buildCardPatch(
      { ...initial, attributes: { ...initial.attributes, energy: "5" } },
      initial,
    );

    expect(patch).toEqual({ attributes: { energy: 5 } });
  });

  test("clears an emptied field with null so the merge patch deletes it", () => {
    const patch = buildCardPatch({ ...initial, artist: "  " }, initial);

    expect(patch).toEqual({ artist: null });
  });

  test("never nulls the required name", () => {
    const patch = buildCardPatch({ ...initial, name: "  Sun Disc  " }, initial);

    expect(patch).toEqual({});
  });

  test("replaces list fields wholesale and nulls an emptied list", () => {
    const patch = buildCardPatch(
      {
        ...initial,
        classification: { ...initial.classification, tags: "Poro", domains: "" },
      },
      initial,
    );

    expect(patch).toEqual({
      classification: { tags: ["Poro"], domains: null },
    });
  });

  test("ignores list reformatting that does not change the entries", () => {
    const patch = buildCardPatch(
      {
        ...initial,
        classification: {
          ...initial.classification,
          tags: "  Poro ,Relic,  ",
        },
      },
      initial,
    );

    expect(patch).toEqual({});
  });

  test("emits a boolean only when it is flipped", () => {
    expect(
      buildCardPatch(
        { ...initial, metadata: { ...initial.metadata, overnumbered: false } },
        initial,
      ),
    ).toEqual({});

    expect(
      buildCardPatch(
        { ...initial, metadata: { ...initial.metadata, overnumbered: true } },
        initial,
      ),
    ).toEqual({ metadata: { overnumbered: true } });
  });

  test("keeps price providers independent", () => {
    const patch = buildCardPatch(
      {
        ...initial,
        prices: {
          ...initial.prices,
          cardmarket: { ...initial.prices.cardmarket, normal: "2.50" },
        },
      },
      initial,
    );

    expect(patch).toEqual({ prices: { cardmarket: { normal: 2.5 } } });
  });

  test("excludes the audit note — it is sent alongside the patch, not inside it", () => {
    const patch = buildCardPatch({ ...initial, note: "Fixed the art" }, initial);

    expect(patch).toEqual({});
  });
});

describe("cardEditorSchema", () => {
  const valid = cardToEditorValues(makeCard());

  test("rejects a blank name", () => {
    expect(cardEditorSchema.safeParse({ ...valid, name: "   " }).success).toBe(
      false,
    );
  });

  test("rejects a malformed release date but allows an empty one", () => {
    expect(
      cardEditorSchema.safeParse({ ...valid, released_at: "31/10/2025" }).success,
    ).toBe(false);
    expect(
      cardEditorSchema.safeParse({ ...valid, released_at: "" }).success,
    ).toBe(true);
  });

  test("rejects non-integer stats and non-URL purchase links", () => {
    expect(
      cardEditorSchema.safeParse({
        ...valid,
        attributes: { ...valid.attributes, energy: "3.5" },
      }).success,
    ).toBe(false);
    expect(
      cardEditorSchema.safeParse({
        ...valid,
        purchase_uris: { ...valid.purchase_uris, tcgplayer: "not a url" },
      }).success,
    ).toBe(false);
  });
});

describe("parseList", () => {
  test("trims entries and drops blanks while keeping order", () => {
    expect(parseList(" b , , a ,")).toEqual(["b", "a"]);
    expect(parseList("")).toEqual([]);
  });
});
