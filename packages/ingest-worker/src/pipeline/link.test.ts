import { describe, expect, it } from "bun:test";
import type { Card } from "@riftseer/types";
import { linkTokens } from "./link";

function makeCard(overrides: Partial<Card>): Card {
  return {
    object: "card",
    id: "card-id",
    name: "Test Card",
    name_normalized: "test card",
    is_token: false,
    all_parts: [],
    used_by: [],
    related_champions: [],
    related_legends: [],
    related_printings: [],
    ...overrides,
  };
}

describe("linkTokens", () => {
  it("links token cards whose names include collector/face suffixes", () => {
    const spriteToken = makeCard({
      id: "sprite-token-id",
      name: "Sprite (274) // Buff",
      name_normalized: "sprite 274 buff",
      is_token: true,
      set: { set_code: "OGN", set_name: "Origins" },
    });
    const producer = makeCard({
      id: "producer-id",
      name: "Lillia - Bashful Bloom",
      name_normalized: "lillia bashful bloom",
      set: { set_code: "UNL", set_name: "Unleashed" },
      text: {
        plain:
          "Play a ready 3 :rb_might: Sprite unit token with [Temporary].",
      },
    });

    linkTokens([spriteToken, producer]);

    expect(producer.all_parts).toHaveLength(1);
    expect(producer.all_parts[0]?.id).toBe("sprite-token-id");
    expect(producer.all_parts[0]?.component).toBe("token");

    expect(spriteToken.used_by).toHaveLength(1);
    expect(spriteToken.used_by[0]?.id).toBe("producer-id");
    expect(spriteToken.used_by[0]?.component).toBe("token_of");
  });
});
