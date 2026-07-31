import { describe, expect, test } from "bun:test";
import {
  buildDefinitionFromPrefill,
  galleryToPrefill,
} from "./review-draft";
import type { AdminReviewGalleryCard } from "./types";

function gallery(
  overrides: Partial<AdminReviewGalleryCard> = {},
): AdminReviewGalleryCard {
  return {
    riftbound_id: "unl-t01",
    name: "Baron Pit",
    public_code: "UNL-T01",
    set_code: "UNL",
    set_name: "Unleashed",
    collector_number: "T01",
    rarity: null,
    type: "Battlefield",
    image_url: null,
    energy: null,
    might: null,
    power: null,
    text: "When you play this…",
    might_bonus: null,
    equipment: null,
    signature: false,
    special_collection: false,
    alternate_art: false,
    is_token: true,
    ...overrides,
  };
}

describe("galleryToPrefill", () => {
  test("maps enriched gallery fields into the create form", () => {
    const prefill = galleryToPrefill(
      gallery({
        energy: 2,
        might: 3,
        power: 1,
        rarity: "Common",
      }),
    );

    expect(prefill).toMatchObject({
      name: "Baron Pit",
      setCode: "UNL",
      collectorNumber: "T01",
      isToken: true,
      type: "Battlefield",
      rarity: "Common",
      energy: "2",
      might: "3",
      power: "1",
      text: "When you play this…",
      riftboundId: "unl-t01",
    });
  });

  test("derives token / signature flags from older sparse payloads", () => {
    const token = galleryToPrefill({
      riftbound_id: "unl-t03",
      name: "Gold",
      public_code: "UNL-T03",
      set_code: "unl",
      collector_number: "T03",
      rarity: null,
      type: null,
      image_url: null,
    });
    expect(token.isToken).toBe(true);
    expect(token.setCode).toBe("UNL");

    const signature = galleryToPrefill({
      riftbound_id: "ogn-305*-298",
      name: "Signed",
      public_code: "OGN-305*",
      set_code: "OGN",
      collector_number: "305",
      rarity: null,
      type: null,
      image_url: null,
    });
    expect(signature.signature).toBe(true);
  });
});

describe("buildDefinitionFromPrefill", () => {
  test("includes identity, external id, stats and text", () => {
    const definition = buildDefinitionFromPrefill(
      galleryToPrefill(
        gallery({
          energy: 1,
          text: "[Assault]",
          equipment: "Equipped unit has…",
          might_bonus: 2,
        }),
      ),
      { setCode: "UNL", setName: "Unleashed" },
    );

    expect(definition).toEqual({
      name: "Baron Pit",
      is_token: true,
      collector_number: "T01",
      metadata: {
        signature: false,
        alternate_art: false,
        special_collection: false,
      },
      set: { set_code: "UNL", set_name: "Unleashed" },
      external_ids: { riftbound_id: "unl-t01" },
      attributes: { energy: 1, might_bonus: 2 },
      classification: { type: "Battlefield" },
      text: {
        rich: "[Assault]",
        plain: "[Assault]",
        equipment: "Equipped unit has…",
      },
    });
  });
});
