/**
 * Linking passes for the ingest pipeline:
 *   1. linkTokens           — populate all_parts / used_by
 *   2. linkChampionsLegends — populate related_champions / related_legends
 *   3. linkRelatedPrintings — populate related_printings (same card, different art/print)
 */

import { normalizeCardName, type Card, type RelatedCard } from "@riftseer/types";
import { logger } from "../utils.ts";

const TOKEN_REF_RE = /\b((?:[A-Z][a-zA-Z'/-]*)(?:\s+[A-Z][a-zA-Z'/-]*)*)\s+[Tt]okens?\b/g;

export function linkTokens(cards: Card[]): void {
  const tokenByNorm = new Map<string, Card[]>();
  for (const card of cards) {
    if (!card.is_token) continue;
    const existing = tokenByNorm.get(card.name_normalized);
    if (existing) {
      existing.push(card);
    } else {
      tokenByNorm.set(card.name_normalized, [card]);
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
      const tokenNorm = normalizeCardName(match[1].trim());
      const tokenCandidates = tokenByNorm.get(tokenNorm);
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
 * Strip the "(Alternate Art)" suffix (and similar) to get a base name for grouping.
 * Cards that share the same base name but have different ids are related printings.
 */
function baseName(name: string): string {
  let s = name.trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  } while (s !== prev);
  return normalizeCardName(s);
}

export function linkRelatedPrintings(cards: Card[]): void {
  // Group non-token cards by base name
  const byBase = new Map<string, Card[]>();
  for (const card of cards) {
    if (card.is_token) continue;
    const key = baseName(card.name);
    if (!byBase.has(key)) byBase.set(key, []);
    byBase.get(key)!.push(card);
  }

  let linked = 0;
  for (const group of byBase.values()) {
    if (group.length < 2) continue;
    for (const card of group) {
      card.related_printings = group
        .filter((other) => other.id !== card.id)
        .map((other) => ({
          object: "related_card" as const,
          id: other.id,
          name: other.name,
          component: "printing",
          uri: `/api/v1/cards/${other.id}`,
        }));
      linked++;
    }
  }

  logger.info("Related printing linking complete", { cardsWithPrintings: linked });
}
