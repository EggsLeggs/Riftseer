import { describe, expect, test } from "bun:test";
import { oracleKeyForName } from "@riftseer/types/oracle";
import { collapseDuplicates } from "../pipeline/dedup.ts";
import { derivedFinishes, rawToPrinting } from "../sources/riftcodex.ts";
import type { RawCard } from "../sources/riftcodex.ts";

/**
 * Upstream files a metal card as a second row under the *same* `riftbound_id`,
 * distinguished only by `(Metal)` on the name and a different TCGPlayer id.
 * Treating that as a duplicate dropped 16 OPP products on every run.
 */
function rawCard(name: string, overrides: Partial<RawCard> = {}): RawCard {
  return {
    id: `id-${name}`,
    name,
    riftbound_id: "opp-259-298",
    collector_number: 259,
    classification: { type: "Legend", rarity: "Rare" },
    set: { set_id: "OPP", label: "Organized Play" },
    ...overrides,
  } as unknown as RawCard;
}

describe("derivedFinishes", () => {
  test("reads a metal finish off the printed name", () => {
    expect(derivedFinishes("Yasuo - Unforgiven (Metal)")).toEqual(["metal"]);
    expect(derivedFinishes("Yasuo - Unforgiven (metal)")).toEqual(["metal"]);
  });

  test("leaves every other card alone", () => {
    for (const name of [
      "Yasuo - Unforgiven",
      "Poppy - Paragon (Alternate Art)",
      "Draven - Vanquisher (Overnumbered)",
      "Metalworks Foundry", // the word, not the suffix
      "",
    ]) {
      expect(derivedFinishes(name)).toEqual([]);
    }
  });

  test("upstream metadata wins when it is actually supplied", () => {
    const printing = rawToPrinting(
      rawCard("Yasuo - Unforgiven (Metal)", {
        metadata: { finishes: ["foil"] },
      } as Partial<RawCard>),
    );

    expect(printing.finishes).toEqual(["foil"]);
  });
});

describe("collapseDuplicates with finishes", () => {
  test("a metal card is its own printing, not a duplicate of the base", () => {
    const base = rawToPrinting(rawCard("Yasuo - Unforgiven", { tcgplayer_id: "662890" }));
    const metal = rawToPrinting(rawCard("Yasuo - Unforgiven (Metal)", { tcgplayer_id: "669257" }));

    const kept = collapseDuplicates([base, metal]);

    expect(kept).toHaveLength(2);
    // both products survive; before this the metal id was simply discarded
    expect(new Set(kept.map((p) => p.tcgplayer_id))).toEqual(new Set(["662890", "669257"]));
  });

  test("but they remain one card — same oracle, two printings", () => {
    expect(oracleKeyForName("Yasuo - Unforgiven (Metal)")).toBe(
      oracleKeyForName("Yasuo - Unforgiven"),
    );
  });

  test("genuine duplicates still collapse", () => {
    // Two rows, same id, same finish: this is what the dedup exists for, and
    // Vendetta ships 131 of them.
    const a = rawToPrinting(rawCard("Yasuo - Unforgiven", { tcgplayer_id: "662890" }));
    const b = rawToPrinting(rawCard("Yasuo - Unforgiven", { id: "other" }));

    expect(collapseDuplicates([a, b])).toHaveLength(1);
  });

  test("the surviving duplicate still inherits what the dropped row had", () => {
    const withoutProduct = rawToPrinting(rawCard("Yasuo - Unforgiven", { id: "a" }));
    const withProduct = rawToPrinting(rawCard("Yasuo - Unforgiven", { id: "b" }));
    withProduct.tcgplayer_id = "662890";

    const [survivor] = collapseDuplicates([withoutProduct, withProduct]);

    expect(survivor!.tcgplayer_id).toBe("662890");
  });
});
