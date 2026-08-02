/**
 * Relationship linking: three passes over the oracles, each emitting
 * oracle → oracle edges.
 *
 *   makes_token  maker → the token it creates
 *   character    legend → champion (the same character in another role)
 *   signature    legend/champion → its signature card
 *
 * Only one direction is emitted. The reverse of every edge is a query against
 * `oracle_relationships`, not a second row — and "other printings of this card"
 * is not an edge at all any more, it is `printings WHERE oracle_id = …`.
 */

import { normalizeCardName } from "../utils.ts";
import { logger } from "../utils.ts";
import type { IngestOracle, OracleEdge } from "./types.ts";

// Matches a capitalized token name in rules text, optionally followed by a type
// word before "token(s)" — upstream writes references as "Sprite unit token",
// "Gold gear token", "Brush battlefield token", and (older data) "Sprite Token".
const TOKEN_REF_RE =
  /\b((?:[A-Z][a-zA-Z'/-]*)(?:\s+[A-Z][a-zA-Z'/-]*)*)\s+(?:(?:unit|gear|battlefield|spell|rune|counter)\s+)?[Tt]okens?\b/g;

/**
 * Base name used to index a token oracle. Oracle names have already had the
 * face separator and collector disambiguator stripped, but older upstream data
 * still ships "Gold // Buff" shapes; this is the belt to that braces.
 */
function baseTokenName(name: string): string {
  const firstFace = name.split("//")[0];
  return normalizeCardName(firstFace.replace(/\s*\([^)]*\)\s*$/, "").trim());
}

/**
 * The character half of a champion/legend name, before the epithet — "Poppy"
 * from "Poppy - Paragon", "Kennen" from "Kennen, Keeper of Balance". The two
 * separators are both in use: `-` in Origins through Unleashed, `,` in Vendetta.
 */
function characterPart(name: string): string {
  const withoutVariant = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return withoutVariant.split(/\s+-\s+|,\s+/, 1)[0] ?? withoutVariant;
}

/**
 * The tags that name the card's character, rather than its region or species.
 *
 * A champion carries all three kinds — Poppy - Paragon is tagged `Yordle`,
 * `Demacia` and `Poppy` — and matching on any of them cross-links every
 * character that shares a region or species. Only the character tag is written
 * into the name, so intersecting the tags with the name's character half picks
 * it out: `Poppy` matches, `Yordle` and `Demacia` do not. RiftCodex also puts a
 * species tag on some legends the printed card does not carry — Heart of the
 * Tempest reads `LEGEND | KENNEN` but arrives tagged `Yordle, Kennen`, which
 * used to link every Yordle champion to Kennen.
 *
 * Matching the *character half* rather than the whole name matters — "Nidalee -
 * Cat Form" and "Lillia - Fae Fawn" would otherwise claim the `Cat` and `Fae`
 * species tags out of their epithets.
 */
function characterTags(oracle: IngestOracle): string[] {
  const haystack = ` ${normalizeCardName(characterPart(oracle.name))} `;
  const matched = oracle.tags.filter((tag) =>
    haystack.includes(` ${normalizeCardName(tag)} `),
  );
  // No tag in the name is not a shape we have seen; fall back to the old
  // behaviour rather than silently dropping the card's links.
  return matched.length > 0 ? matched : oracle.tags;
}

/** Collects edges, discarding duplicates and self-edges. */
export class EdgeSet {
  private readonly seen = new Set<string>();
  readonly edges: OracleEdge[] = [];

  add(from: string, to: string, kind: OracleEdge["kind"]): boolean {
    if (from === to) return false;
    const key = `${from}|${kind}|${to}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.edges.push({ from_oracle_key: from, to_oracle_key: to, kind });
    return true;
  }
}

function isLegend(oracle: IngestOracle): boolean {
  return oracle.card_type?.toLowerCase() === "legend";
}

function isChampion(oracle: IngestOracle): boolean {
  return oracle.supertype?.toLowerCase() === "champion";
}

export function linkTokens(oracles: IngestOracle[], edges: EdgeSet): number {
  const tokensByName = new Map<string, IngestOracle>();
  for (const oracle of oracles) {
    if (!oracle.is_token) continue;
    const key = baseTokenName(oracle.name);
    // First writer wins; oracle names are already deduplicated by key, so a
    // collision here means two token cards genuinely share a base name.
    if (!tokensByName.has(key)) tokensByName.set(key, oracle);
  }

  if (tokensByName.size === 0) {
    logger.info("No token cards found — skipping token linking");
    return 0;
  }

  let linked = 0;
  for (const oracle of oracles) {
    if (oracle.is_token) continue;
    const text = oracle.text_plain;
    if (!text) continue;

    for (const match of text.matchAll(TOKEN_REF_RE)) {
      // The capture greedily eats leading capitalized words ("Create a Sprite
      // token" is fine, but "... Big Sprite token" would capture "Big Sprite").
      // Try the full phrase first, then progressively shorter suffixes so a real
      // token name like "Sprite" or "Gold" still resolves.
      const words = match[1].trim().split(/\s+/);
      for (let start = 0; start < words.length; start++) {
        const token = tokensByName.get(normalizeCardName(words.slice(start).join(" ")));
        if (!token) continue;
        if (edges.add(oracle.oracle_key, token.oracle_key, "makes_token")) linked++;
        break;
      }
    }
  }

  logger.info("Token linking complete", { tokens: tokensByName.size, edges: linked });
  return linked;
}

export function linkChampionsLegends(
  oracles: IngestOracle[],
  edges: EdgeSet,
): number {
  const championsByTag = new Map<string, IngestOracle[]>();
  for (const oracle of oracles) {
    if (!isChampion(oracle) || oracle.tags.length === 0) continue;
    for (const tag of characterTags(oracle)) {
      const list = championsByTag.get(tag);
      if (list) list.push(oracle);
      else championsByTag.set(tag, [oracle]);
    }
  }

  let linked = 0;
  for (const oracle of oracles) {
    if (!isLegend(oracle)) continue;
    // Legends look up on every tag they carry, because the index key is always
    // the champion's own character tag — a legend's spurious species tag simply
    // finds nothing.
    for (const tag of oracle.tags) {
      for (const champion of championsByTag.get(tag) ?? []) {
        if (edges.add(oracle.oracle_key, champion.oracle_key, "character")) linked++;
      }
    }
  }

  logger.info("Champion/legend linking complete", { edges: linked });
  return linked;
}

/**
 * Link signature cards (supertype "Signature") to the legend and champion they
 * belong to, matching on the shared character tag.
 *
 * Signature cards (e.g. "Daisy!" for Ivern) carry the champion's tag plus, in a
 * few cases, region/group tags like "Ionia" or "Equipment". Those group tags
 * never identify a legend, so only tags that appear on a Legend are matched.
 * No `characterTags` filter is needed here: no signature carries more than one
 * tag that also appears on a Legend.
 */
export function linkSignatures(oracles: IngestOracle[], edges: EdgeSet): number {
  const legendTags = new Set<string>();
  const signaturesByTag = new Map<string, IngestOracle[]>();

  for (const oracle of oracles) {
    if (oracle.tags.length === 0) continue;
    if (isLegend(oracle)) {
      for (const tag of oracle.tags) legendTags.add(tag);
    }
    if (oracle.supertype?.toLowerCase() === "signature") {
      for (const tag of oracle.tags) {
        const list = signaturesByTag.get(tag);
        if (list) list.push(oracle);
        else signaturesByTag.set(tag, [oracle]);
      }
    }
  }

  if (signaturesByTag.size === 0) {
    logger.info("No signature cards found — skipping signature linking");
    return 0;
  }

  let linked = 0;
  for (const oracle of oracles) {
    if (!isLegend(oracle) && !isChampion(oracle)) continue;
    for (const tag of oracle.tags) {
      if (!legendTags.has(tag)) continue; // skip region/group tags
      for (const signature of signaturesByTag.get(tag) ?? []) {
        if (edges.add(oracle.oracle_key, signature.oracle_key, "signature")) linked++;
      }
    }
  }

  logger.info("Signature linking complete", { edges: linked });
  return linked;
}

/** Run all three passes and return the deduplicated edge list. */
export function linkOracles(oracles: IngestOracle[]): OracleEdge[] {
  const edges = new EdgeSet();
  linkTokens(oracles, edges);
  linkChampionsLegends(oracles, edges);
  linkSignatures(oracles, edges);
  logger.info("Relationship linking complete", { edges: edges.edges.length });
  return edges.edges;
}
