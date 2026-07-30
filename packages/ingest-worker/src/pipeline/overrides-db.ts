/**
 * Durable DB override overlay for Phase 1 ingest.
 *
 * Ingest builds the authoritative RiftCodex + enrichment result first, then this
 * layer applies admin-authored changes from Supabase so they survive every run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card, RelatedCard } from "@riftseer/types";
import { logger, normalizeCardName } from "../utils.ts";
import type { IngestSet } from "./types.ts";

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

interface SetOverrideRow {
  set_code: string;
  patch: unknown;
}

interface ManualSetRow {
  set_code: string;
  definition: unknown;
}

export interface DbOverrideState {
  cardOverrides: CardOverrideRow[];
  manualCards: ManualCardRow[];
  relationshipOverrides: RelationshipOverrideRow[];
  deletedCardIds: Set<string>;
}

export interface DbSetOverrideState {
  setOverrides: SetOverrideRow[];
  manualSets: ManualSetRow[];
  deletedSetCodes: Set<string>;
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

function withSetDefaults(setCode: string, value: unknown): IngestSet | null {
  if (!isObject(value)) return null;

  const name = typeof value.set_name === "string" ? value.set_name.trim() : "";
  if (!name) return null;

  const externalIds = isObject(value.external_ids)
    ? value.external_ids
    : {};

  return {
    set_code: setCode,
    set_name: name,
    set_uri:
      typeof value.set_uri === "string" && value.set_uri
        ? value.set_uri
        : undefined,
    set_search_uri:
      typeof value.set_search_uri === "string" && value.set_search_uri
        ? value.set_search_uri
        : undefined,
    published_on:
      typeof value.published_on === "string"
        ? value.published_on
        : value.published_on === null
          ? null
          : undefined,
    is_promo: Boolean(value.is_promo),
    parent_set_code:
      typeof value.parent_set_code === "string"
        ? value.parent_set_code
        : value.parent_set_code === null
          ? null
          : undefined,
    external_ids: externalIds,
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

  // Manual definitions establish the baseline first. Patches are deliberately
  // applied afterwards so PATCH /admin/cards/:id persists for both RiftCodex
  // and manual cards.
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

export function applyDbSetOverrides(
  sets: IngestSet[],
  state: DbSetOverrideState,
): IngestSet[] {
  const setByCode = new Map<string, IngestSet>();
  const order: string[] = [];

  for (const set of sets) {
    if (state.deletedSetCodes.has(set.set_code)) continue;
    setByCode.set(set.set_code, set);
    order.push(set.set_code);
  }

  let manual = 0;
  for (const row of state.manualSets) {
    if (state.deletedSetCodes.has(row.set_code)) continue;
    const set = withSetDefaults(row.set_code, row.definition);
    if (!set) {
      logger.warn("Skipping invalid manual set definition", {
        setCode: row.set_code,
      });
      continue;
    }
    if (!setByCode.has(row.set_code)) order.push(row.set_code);
    setByCode.set(row.set_code, set);
    manual++;
  }

  let patched = 0;
  for (const row of state.setOverrides) {
    if (state.deletedSetCodes.has(row.set_code)) continue;
    const current = setByCode.get(row.set_code);
    if (!current) continue;
    const merged = withSetDefaults(
      row.set_code,
      mergePatch(current, row.patch),
    );
    if (!merged) {
      logger.warn("Skipping invalid set override patch", {
        setCode: row.set_code,
      });
      continue;
    }
    setByCode.set(row.set_code, merged);
    patched++;
  }

  const finalSets = order.flatMap((setCode) => {
    const set = setByCode.get(setCode);
    return set ? [set] : [];
  });

  if (
    patched > 0 ||
    manual > 0 ||
    state.deletedSetCodes.size > 0
  ) {
    logger.info("Applied DB set overrides", {
      patched,
      manual,
      deleted: state.deletedSetCodes.size,
      outputSets: finalSets.length,
    });
  }

  return finalSets;
}

export async function overlayDbSetOverrides(
  supabase: SupabaseClient,
  sets: IngestSet[],
): Promise<IngestSet[]> {
  const [
    { data: setOverrides, error: setOverridesError },
    { data: manualSets, error: manualSetsError },
    { data: deletions, error: deletionsError },
  ] = await Promise.all([
    supabase.from("set_overrides").select("set_code, patch"),
    supabase.from("manual_sets").select("set_code, definition"),
    supabase.from("set_deletions").select("set_code"),
  ]);

  if (setOverridesError) {
    throw new Error(`load set_overrides failed: ${setOverridesError.message}`);
  }
  if (manualSetsError) {
    throw new Error(`load manual_sets failed: ${manualSetsError.message}`);
  }
  if (deletionsError) {
    throw new Error(`load set_deletions failed: ${deletionsError.message}`);
  }

  return applyDbSetOverrides(sets, {
    setOverrides: (setOverrides ?? []) as SetOverrideRow[],
    manualSets: (manualSets ?? []) as ManualSetRow[],
    deletedSetCodes: new Set(
      ((deletions ?? []) as Array<{ set_code: string }>).map(
        (row) => row.set_code,
      ),
    ),
  });
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
