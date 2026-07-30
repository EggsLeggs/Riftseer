/**
 * Durable DB override overlay for Phase 1 ingest.
 *
 * Ingest builds the authoritative RiftCodex + enrichment result first, then this
 * layer applies admin-authored changes from Supabase so they survive every run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card, RelatedCard } from "@riftseer/types";
import { logger, normalizeCardName } from "../utils.ts";

type JsonObject = Record<string, unknown>;

const RELATIONSHIP_KINDS = [
  "all_parts",
  "used_by",
  "related_champions",
  "related_legends",
  "related_signatures",
  "related_printings",
] as const;

type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

interface CardOverrideRow {
  card_id: string;
  patch: unknown;
}

interface ManualCardRow {
  id: string;
  definition: unknown;
}

interface RelationshipOverrideRow {
  id: string;
  card_id: string;
  kind: string;
  related_card_id: string;
  action: string;
  created_at: string;
}

export interface DbOverrideState {
  cardOverrides: CardOverrideRow[];
  manualCards: ManualCardRow[];
  relationshipOverrides: RelationshipOverrideRow[];
  deletedCardIds: Set<string>;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRelationshipKind(value: string): value is RelationshipKind {
  return (RELATIONSHIP_KINDS as readonly string[]).includes(value);
}

function mergePatch(target: unknown, patch: unknown): unknown {
  if (!isObject(patch)) return patch;

  const base: JsonObject = isObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete base[key];
      continue;
    }
    base[key] = mergePatch(base[key], value);
  }
  return base;
}

function asRelatedCards(value: unknown): RelatedCard[] {
  return Array.isArray(value) ? (value as RelatedCard[]) : [];
}

function withCardDefaults(id: string, value: unknown): Card | null {
  if (!isObject(value)) return null;

  const name = typeof value.name === "string" ? value.name : null;
  if (!name) return null;

  const normalized =
    typeof value.name_normalized === "string" && value.name_normalized.trim()
      ? value.name_normalized
      : normalizeCardName(name);

  return {
    ...(value as Partial<Card>),
    object: "card",
    id,
    name,
    name_normalized: normalized,
    collector_number:
      value.collector_number === undefined || value.collector_number === null
        ? undefined
        : String(value.collector_number),
    is_token: Boolean(value.is_token),
    source: (value.source === "manual" ? "manual" : "riftcodex") as Card["source"],
    all_parts: asRelatedCards(value.all_parts),
    used_by: asRelatedCards(value.used_by),
    related_champions: asRelatedCards(value.related_champions),
    related_legends: asRelatedCards(value.related_legends),
    related_signatures: asRelatedCards(value.related_signatures),
    related_printings: asRelatedCards(value.related_printings),
  };
}

function relationshipComponent(kind: RelationshipKind): string {
  switch (kind) {
    case "all_parts":
      return "part";
    case "used_by":
      return "used_by";
    case "related_champions":
      return "champion";
    case "related_legends":
      return "legend";
    case "related_signatures":
      return "signature";
    case "related_printings":
      return "printing";
  }
}

function toRelatedCard(card: Card, kind: RelationshipKind): RelatedCard {
  return {
    object: "related_card",
    id: card.id,
    name: card.name,
    component: relationshipComponent(kind),
    uri: `/api/v1/cards/${card.id}`,
    set_code: card.set?.set_code,
    collector_number: card.collector_number,
    published_on: card.set?.published_on ?? card.released_at,
    alternate_art: card.metadata?.alternate_art ?? false,
  };
}

function getRelationshipList(card: Card, kind: RelationshipKind): RelatedCard[] {
  const current = card[kind];
  return Array.isArray(current) ? current : [];
}

function setRelationshipList(
  card: Card,
  kind: RelationshipKind,
  next: RelatedCard[],
): void {
  card[kind] = next;
}

export function applyDbOverrides(cards: Card[], state: DbOverrideState): Card[] {
  const cardById = new Map<string, Card>();
  const order: string[] = [];

  for (const card of cards) {
    if (state.deletedCardIds.has(card.id)) continue;
    cardById.set(card.id, card);
    order.push(card.id);
  }

  let patched = 0;
  for (const row of state.cardOverrides) {
    if (state.deletedCardIds.has(row.card_id)) continue;
    const current = cardById.get(row.card_id);
    if (!current) continue;

    const merged = withCardDefaults(
      row.card_id,
      mergePatch(current, row.patch),
    );
    if (!merged) {
      logger.warn("Skipping invalid card override patch", { cardId: row.card_id });
      continue;
    }
    merged.id = row.card_id;
    merged.source = current.source ?? "riftcodex";
    cardById.set(row.card_id, merged);
    patched++;
  }

  let manual = 0;
  for (const row of state.manualCards) {
    if (state.deletedCardIds.has(row.id)) continue;
    const card = withCardDefaults(row.id, row.definition);
    if (!card) {
      logger.warn("Skipping invalid manual card definition", { cardId: row.id });
      continue;
    }
    card.source = "manual";
    if (!cardById.has(row.id)) order.push(row.id);
    cardById.set(row.id, card);
    manual++;
  }

  const relationshipRows = [...state.relationshipOverrides].sort((a, b) => {
    const byCreatedAt = a.created_at.localeCompare(b.created_at);
    return byCreatedAt !== 0 ? byCreatedAt : a.id.localeCompare(b.id);
  });

  let relationshipEdits = 0;
  for (const row of relationshipRows) {
    if (!isRelationshipKind(row.kind)) {
      logger.warn("Skipping invalid relationship override kind", {
        id: row.id,
        kind: row.kind,
      });
      continue;
    }
    if (state.deletedCardIds.has(row.card_id)) continue;

    const card = cardById.get(row.card_id);
    if (!card) continue;

    const current = getRelationshipList(card, row.kind);
    if (row.action === "remove") {
      setRelationshipList(
        card,
        row.kind,
        current.filter((related) => related.id !== row.related_card_id),
      );
      relationshipEdits++;
      continue;
    }

    if (row.action !== "add") {
      logger.warn("Skipping invalid relationship override action", {
        id: row.id,
        action: row.action,
      });
      continue;
    }

    const related = cardById.get(row.related_card_id);
    if (!related) {
      logger.warn("Skipping relationship add for missing related card", {
        id: row.id,
        cardId: row.card_id,
        relatedCardId: row.related_card_id,
      });
      continue;
    }
    if (current.some((existing) => existing.id === row.related_card_id)) continue;

    setRelationshipList(card, row.kind, [
      ...current,
      toRelatedCard(related, row.kind),
    ]);
    relationshipEdits++;
  }

  const finalCards = order.flatMap((id) => {
    const card = cardById.get(id);
    return card ? [card] : [];
  });

  if (
    patched > 0 ||
    manual > 0 ||
    relationshipEdits > 0 ||
    state.deletedCardIds.size > 0
  ) {
    logger.info("Applied DB overrides", {
      patched,
      manual,
      relationshipEdits,
      deleted: state.deletedCardIds.size,
      outputCards: finalCards.length,
    });
  }

  return finalCards;
}

export async function overlayDbOverrides(
  supabase: SupabaseClient,
  cards: Card[],
): Promise<Card[]> {
  const [
    { data: cardOverrides, error: cardOverridesError },
    { data: manualCards, error: manualCardsError },
    { data: relationshipOverrides, error: relationshipOverridesError },
    { data: deletions, error: deletionsError },
  ] = await Promise.all([
    supabase.from("card_overrides").select("card_id, patch"),
    supabase.from("manual_cards").select("id, definition"),
    supabase
      .from("card_relationship_overrides")
      .select("id, card_id, kind, related_card_id, action, created_at"),
    supabase.from("card_deletions").select("card_id"),
  ]);

  if (cardOverridesError) {
    throw new Error(`load card_overrides failed: ${cardOverridesError.message}`);
  }
  if (manualCardsError) {
    throw new Error(`load manual_cards failed: ${manualCardsError.message}`);
  }
  if (relationshipOverridesError) {
    throw new Error(
      `load card_relationship_overrides failed: ${relationshipOverridesError.message}`,
    );
  }
  if (deletionsError) {
    throw new Error(`load card_deletions failed: ${deletionsError.message}`);
  }

  return applyDbOverrides(cards, {
    cardOverrides: (cardOverrides ?? []) as CardOverrideRow[],
    manualCards: (manualCards ?? []) as ManualCardRow[],
    relationshipOverrides:
      (relationshipOverrides ?? []) as RelationshipOverrideRow[],
    deletedCardIds: new Set(
      ((deletions ?? []) as Array<{ card_id: string }>).map((row) => row.card_id),
    ),
  });
}
