/**
 * Linking passes for the ingest pipeline:
 *   1. linkTokens           — populate all_parts / used_by
 *   2. linkChampionsLegends — populate related_champions / related_legends
 *   3. linkSignatures       — populate related_signatures (+ reverse legend/champion links)
 *   4. linkRelatedPrintings — populate related_printings (same card, different art/print)
 */

import { normalizeCardName, type Card, type RelatedCard } from "@riftseer/types";
import { oracleKeyForName } from "@riftseer/types/oracle";
import { logger } from "../utils.ts";

// Matches a capitalized token name in rules text, optionally followed by a type
// word before "token(s)" — upstream writes references as "Sprite unit token",
// "Gold gear token", "Brush battlefield token", and (older data) "Sprite Token".
const TOKEN_REF_RE =
  /\b((?:[A-Z][a-zA-Z'/-]*)(?:\s+[A-Z][a-zA-Z'/-]*)*)\s+(?:(?:unit|gear|battlefield|spell|rune|counter)\s+)?[Tt]okens?\b/g;

/**
 * Base name used to index a token card. Upstream names carry a face separator
 * and a collector disambiguator — e.g. "Sprite (274) // Buff" or "Gold // Buff".
 * The token itself is the first face with the "(NNN)" suffix stripped, so this
 * yields "sprite" / "gold" for matching against references in rules text.
 */
function baseTokenName(name: string): string {
  const firstFace = name.split("//")[0];
  return normalizeCardName(firstFace.replace(/\s*\([^)]*\)\s*$/, "").trim());
}

export function linkTokens(cards: Card[]): void {
  const tokenByNorm = new Map<string, Card[]>();
  for (const card of cards) {
    if (!card.is_token) continue;
    const key = baseTokenName(card.name);
    const existing = tokenByNorm.get(key);
    if (existing) {
      existing.push(card);
    } else {
      tokenByNorm.set(key, [card]);
    }
  }

  if (tokenByNorm.size === 0) {
    logger.info("No token cards found — skipping token linking");
    return;
  }

  const usedByAccum = new Map<string, RelatedCard[]>();

  for (const card of cards) {
    if (card.is_token) continue;
    const text = card.text?.plain ?? "";
    if (!text) continue;

    const seen = new Set<string>();
    for (const match of text.matchAll(TOKEN_REF_RE)) {
      // The capture greedily eats leading capitalized words ("Create a Sprite
      // token" is fine, but "... Big Sprite token" would capture "Big Sprite").
      // Try the full phrase first, then progressively shorter suffixes so a real
      // token name like "Sprite" or "Gold" still resolves.
      const words = match[1].trim().split(/\s+/);
      let tokenCandidates: Card[] | undefined;
      for (let start = 0; start < words.length; start++) {
        const candidate = tokenByNorm.get(
          normalizeCardName(words.slice(start).join(" ")),
        );
        if (candidate?.length) {
          tokenCandidates = candidate;
          break;
        }
      }
      if (!tokenCandidates?.length) continue;

      const token =
        tokenCandidates.find((t) => t.set?.set_code === card.set?.set_code) ??
        tokenCandidates[0];
      if (seen.has(token.id)) continue;
      seen.add(token.id);

      card.all_parts.push({
        object: "related_card",
        id: token.id,
        name: token.name,
        component: "token",
        uri: `/api/v1/cards/${token.id}`,
      });

      if (!usedByAccum.has(token.id)) usedByAccum.set(token.id, []);
      usedByAccum.get(token.id)!.push({
        object: "related_card",
        id: card.id,
        name: card.name,
        component: "token_of",
        uri: `/api/v1/cards/${card.id}`,
      });
    }
  }

  for (const card of cards) {
    if (!card.is_token) continue;
    const refs = usedByAccum.get(card.id);
    if (refs) card.used_by = refs;
  }

  logger.info("Token linking complete", {
    tokens: tokenByNorm.size,
    linkedTokens: usedByAccum.size,
  });
}

export function linkChampionsLegends(cards: Card[]): void {
  const legendsByTag = new Map<string, Card[]>();
  const championsByTag = new Map<string, Card[]>();

  for (const card of cards) {
    const type = card.classification?.type?.toLowerCase();
    const supertype = card.classification?.supertype?.toLowerCase();
    const tags = card.classification?.tags;
    if (!tags?.length) continue;

    if (type === "legend") {
      for (const tag of tags) {
        if (!legendsByTag.has(tag)) legendsByTag.set(tag, []);
        legendsByTag.get(tag)!.push(card);
      }
    } else if (supertype === "champion") {
      for (const tag of tags) {
        if (!championsByTag.has(tag)) championsByTag.set(tag, []);
        championsByTag.get(tag)!.push(card);
      }
    }
  }

  let linkedLegends = 0;
  let linkedChampions = 0;

  for (const card of cards) {
    const type = card.classification?.type?.toLowerCase();
    const supertype = card.classification?.supertype?.toLowerCase();
    const tags = card.classification?.tags;
    if (!tags?.length) continue;

    if (type === "legend") {
      const seen = new Set<string>();
      for (const tag of tags) {
        for (const champion of championsByTag.get(tag) ?? []) {
          if (seen.has(champion.id)) continue;
          seen.add(champion.id);
          card.related_champions.push({
            object: "related_card",
            id: champion.id,
            name: champion.name,
            component: "champion",
            uri: `/api/v1/cards/${champion.id}`,
          });
          linkedChampions++;
        }
      }
    } else if (supertype === "champion") {
      const seen = new Set<string>();
      for (const tag of tags) {
        for (const legend of legendsByTag.get(tag) ?? []) {
          if (seen.has(legend.id)) continue;
          seen.add(legend.id);
          card.related_legends.push({
            object: "related_card",
            id: legend.id,
            name: legend.name,
            component: "legend",
            uri: `/api/v1/cards/${legend.id}`,
          });
          linkedLegends++;
        }
      }
    }
  }

  logger.info("Champion/legend linking complete", { linkedChampions, linkedLegends });
}

/**
 * Link signature cards (classification.supertype === "Signature") to the legend
 * and champion cards they belong to, matching on the shared character tag.
 *
 * Signature cards (e.g. "Daisy!" for Ivern) carry the champion's tag plus, in a
 * few cases, region/group tags like "Ionia" or "Equipment". Those group tags
 * never identify a legend, so we only match on tags that appear on a Legend card
 * (`characterTags`) — this avoids cross-linking every card that shares a region.
 *
 * Populates `related_signatures` on each legend/champion and the reverse
 * `related_legends` / `related_champions` on the signature card, so the existing
 * card-detail rendering shows the relationship from both sides.
 */
export function linkSignatures(cards: Card[]): void {
  const characterTags = new Set<string>();
  const signaturesByTag = new Map<string, Card[]>();

  for (const card of cards) {
    const tags = card.classification?.tags;
    if (!tags?.length) continue;

    if (card.classification?.type?.toLowerCase() === "legend") {
      for (const tag of tags) characterTags.add(tag);
    }
    if (card.classification?.supertype?.toLowerCase() === "signature") {
      for (const tag of tags) {
        if (!signaturesByTag.has(tag)) signaturesByTag.set(tag, []);
        signaturesByTag.get(tag)!.push(card);
      }
    }
  }

  if (signaturesByTag.size === 0) {
    logger.info("No signature cards found — skipping signature linking");
    return;
  }

  let linkedSignatures = 0;

  for (const card of cards) {
    const isLegend = card.classification?.type?.toLowerCase() === "legend";
    const isChampion = card.classification?.supertype?.toLowerCase() === "champion";
    if (!isLegend && !isChampion) continue;
    const tags = card.classification?.tags;
    if (!tags?.length) continue;

    const seen = new Set<string>();
    for (const tag of tags) {
      if (!characterTags.has(tag)) continue; // skip region/group tags
      for (const signature of signaturesByTag.get(tag) ?? []) {
        if (seen.has(signature.id)) continue;
        seen.add(signature.id);

        card.related_signatures.push({
          object: "related_card",
          id: signature.id,
          name: signature.name,
          component: "signature",
          uri: `/api/v1/cards/${signature.id}`,
        });

        // Reverse link on the signature so its detail page lists the
        // legend/champion, reusing the existing related_legends/champions render.
        const back = isLegend ? signature.related_legends : signature.related_champions;
        back.push({
          object: "related_card",
          id: card.id,
          name: card.name,
          component: isLegend ? "legend" : "champion",
          uri: `/api/v1/cards/${card.id}`,
        });
        linkedSignatures++;
      }
    }
  }

  logger.info("Signature linking complete", { linkedSignatures });
}

function toPrintingStub(other: Card): RelatedCard {
  return {
    object: "related_card",
    id: other.id,
    name: other.name,
    component: "printing",
    uri: `/api/v1/cards/${other.id}`,
    set_code: other.set?.set_code,
    collector_number: other.collector_number,
    published_on: other.set?.published_on ?? other.released_at,
    alternate_art: other.metadata?.alternate_art ?? false,
  };
}

export function linkRelatedPrintings(cards: Card[]): void {
  // Group all cards by oracle key — the same base-name derivation that keys
  // rulings and legalities, so a printing's siblings here are exactly the
  // printings that share its rulings. Tokens are included so variants such as
  // "Recruit (271) // Buff" / "Recruit (272) // Buff" link to each other.
  const byBase = new Map<string, Card[]>();
  for (const card of cards) {
    const key = oracleKeyForName(card.name);
    if (!byBase.has(key)) byBase.set(key, []);
    byBase.get(key)!.push(card);
  }

  let linked = 0;
  for (const group of byBase.values()) {
    if (group.length < 2) continue;
    for (const card of group) {
      card.related_printings = group
        .filter((other) => other.id !== card.id)
        .map((other) => toPrintingStub(other));
      linked++;
    }
  }

  logger.info("Related printing linking complete", { cardsWithPrintings: linked });
}
