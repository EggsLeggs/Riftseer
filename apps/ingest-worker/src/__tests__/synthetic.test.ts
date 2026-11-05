import { describe, expect, test } from "bun:test";
import { syntheticPrintings, syntheticSets } from "../pipeline/synthetic.ts";
import { buildOracles } from "../pipeline/oracles.ts";
import { linkOracles } from "../pipeline/link.ts";
import { collapseDuplicates } from "../pipeline/dedup.ts";
import { overrides } from "../overrides/index.ts";
import type { IngestPrinting, IngestSet } from "../pipeline/types.ts";

function set(code: string): IngestSet {
  return { set_code: code, set_name: code, is_promo: false };
}

/** A maker card whose rules text names a token, as upstream writes it. */
function maker(id: string, name: string, text: string): IngestPrinting {
  return {
    id,
    name,
    name_normalized: name.toLowerCase(),
    card_type: "Spell",
    is_token: false,
    energy: 1,
    might: null,
    power: null,
    text_plain: text,
    tags: [],
    domains: [],
    set_code: "SFD",
    collector_number: "001",
    finishes: [],
    is_signature: false,
    is_alternate_art: false,
    is_overnumbered: false,
    is_special_collection: false,
  };
}

const ALL_SETS = ["OGN", "OGS", "SFD", "UNL", "VEN", "OPP", "PR", "JDG"].map(set);

describe("synthetic token cards", () => {
  test("every override entry becomes a printing when its set exists", () => {
    const printings = syntheticPrintings(ALL_SETS);
    // rad-t02 is the exception: Radiance has no set row yet.
    const expected = Object.values(overrides.syntheticCards).filter((c) =>
      ALL_SETS.some((s) => s.set_code === c.set_code.toUpperCase()),
    ).length;

    expect(printings).toHaveLength(expected);
    expect(printings.every((p) => p.is_token)).toBe(true);
  });

  test("a card naming an unknown set is dropped, not silently mis-joined", () => {
    // `ingest_catalogue` joins printings to sets by code, so a card whose set
    // is missing would vanish inside the JOIN with no error.
    const printings = syntheticPrintings([set("OGN")]);

    expect(printings.every((p) => p.set_code === "OGN")).toBe(true);
    expect(printings.some((p) => p.set_code === "SFD")).toBe(false);
  });

  test("the whole point: a synthetic token earns makes_token edges", () => {
    const printings = collapseDuplicates([
      ...syntheticPrintings(ALL_SETS),
      maker("m1", "Desert's Call", "Play a 2 [might] Sand Soldier unit token."),
      maker("m2", "Death Mark", "Play a 0 [might] Shadow Clone unit token."),
      maker("m3", "Assembly Rig", "Play a 3 [might] Mech unit token."),
    ]);
    const { oracles } = buildOracles(printings);
    const edges = linkOracles(oracles);

    const tokenEdges = edges.filter((e) => e.kind === "makes_token");
    const byMaker = new Map(tokenEdges.map((e) => [e.from_oracle_key, e.to_oracle_key]));

    // Before this, none of these three tokens existed in the pipeline at all,
    // so every one of these edges was unwritable and no client could offer it.
    // `oracle_key` drops apostrophes, hence `deserts call`.
    expect(byMaker.get("deserts call")).toBe("sand soldier");
    expect(byMaker.get("death mark")).toBe("shadow clone");
    expect(byMaker.get("assembly rig")).toBe("mech");
  });

  test("Radiance arrives as a set, since no upstream path can create one", () => {
    const built = syntheticSets(ALL_SETS);
    const rad = built.find((s) => s.set_code === "RAD");

    expect(rad?.set_name).toBe("Radiance");
    expect(rad?.published_on).toBe("2026-10-23");
    expect(rad?.is_promo).toBe(false);
    // card_count is recomputed by the RPC from the printings that landed
    expect(rad).not.toHaveProperty("card_count");
  });

  test("a set RiftCodex already publishes is never shadowed", () => {
    // The override fills a gap; it must not override live upstream data.
    const built = syntheticSets([...ALL_SETS, set("RAD")]);

    expect(built.find((s) => s.set_code === "RAD")).toBeUndefined();
  });

  test("Radiance variant flags derive from the printed id, not from authoring", () => {
    const rad = syntheticPrintings([...ALL_SETS, set("RAD")]).filter((p) => p.set_code === "RAD");

    expect(rad.length).toBeGreaterThan(200);
    // `rad-020a-167` is alternate art, `rad-sp1-005` a special collection,
    // `rad-175-167` overnumbered against a 167-card run, `rad-168*-167` a signature.
    expect(rad.find((p) => p.id === "rad-020a-167")?.is_alternate_art).toBe(true);
    expect(rad.find((p) => p.id === "rad-sp1-005")?.is_special_collection).toBe(true);
    expect(rad.find((p) => p.id === "rad-175-167")?.is_overnumbered).toBe(true);
    expect(rad.some((p) => p.is_signature)).toBe(true);
    // and a plain one carries none of them
    const plain = rad.find((p) => p.id === "rad-001-167");
    expect([plain?.is_alternate_art, plain?.is_overnumbered, plain?.is_special_collection]).toEqual(
      [false, false, false],
    );
  });

  test("a signature is another printing of its base oracle, not a new one", () => {
    const rad = syntheticPrintings([...ALL_SETS, set("RAD")]).filter((p) => p.set_code === "RAD");
    const { oracles } = buildOracles(collapseDuplicates(rad));
    const ekko = rad.filter((p) => p.name.startsWith("Ekko - Boy Who Shattered Time"));

    // the base printing and the starred signature share one oracle name
    expect(ekko.length).toBeGreaterThan(1);
    expect(new Set(ekko.map((p) => p.name)).size).toBe(1);
    // 234 printings collapse to far fewer oracles
    expect(oracles.length).toBeLessThan(rad.length);
  });

  test("synthetic ids never take the shape of a RiftCodex ObjectId", () => {
    // The upsert is ON CONFLICT (id); a collision would overwrite a real row.
    for (const id of Object.keys(overrides.syntheticCards)) {
      expect(id).not.toMatch(/^[0-9a-f]{24}$/i);
    }
  });

  test("battlefield tokens keep their landscape orientation", () => {
    const printings = syntheticPrintings(ALL_SETS);
    const baronPit = printings.find((p) => p.name === "Baron Pit");
    const mech = printings.find((p) => p.name === "Mech");

    expect(baronPit?.image_orientation).toBe("landscape");
    expect(mech?.image_orientation).toBe("portrait");
  });

  test("a printing either has an image source or is knowingly waiting for one", () => {
    // `loadPendingCardImageJobs` skips a row with no source rather than
    // queueing a job that cannot run, so an entry may be created ahead of its
    // art — which is where the three Radiance token reprints sit, waiting on
    // an admin upload because no published scan of them exists yet.
    const AWAITING_ART = new Set(["rad-t01", "rad-t05", "rad-t06"]);

    for (const p of syntheticPrintings(ALL_SETS)) {
      if (AWAITING_ART.has(p.id)) {
        expect(p.image_source_url).toBeUndefined();
        continue;
      }
      expect(p.image_source_url).toBeTruthy();
    }
  });
});

describe("synthetic slugs match what RiftCodex would produce", () => {
  test("a signature's marker lives on the id, never on the collector number", () => {
    // `buildPublicSlugSegments` puts the collector number straight into the
    // path, so `168*` would pin `rad/168*/signature/…` where the RiftCodex
    // mapper stores `168`. Slugs are pinned on first insert.
    for (const [id, card] of Object.entries(overrides.syntheticCards)) {
      expect(card.collector_number).not.toContain("*");
      if (card.is_signature) {
        expect(card.riftbound_id).toContain("*");
        expect(id).not.toContain("*");
      }
    }
  });

  test("every synthetic card carries its printed id", () => {
    // `buildGalleryReconciliationEntries` indexes on `riftbound_id`; without
    // one, the queue files a false missing-printing entry every run.
    for (const p of syntheticPrintings(ALL_SETS)) {
      expect(p.riftbound_id).toBeTruthy();
    }
  });
});
