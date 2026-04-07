/**
 * Atomic Supabase upsert via the ingest_card_data Postgres RPC.
 * All three tables (sets, artists, cards) are written in a single transaction.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card } from "@riftseer/types";
import type { IngestSet } from "./types.ts";
import { logger } from "../utils.ts";

interface RpcSetPayload {
  set_code: string;
  set_name: string;
  set_uri: string | null;
  set_search_uri: string | null;
  published_on: string | null;
  is_promo: boolean;
  parent_set_code: string | null;
  external_ids: Record<string, unknown>;
}

interface RpcArtistPayload {
  name: string;
}

interface RpcCardPayload {
  id: string;
  name: string;
  name_normalized: string;
  collector_number: string | null;
  released_at: string | null;
  set_code: string | null;
  artist: string | null;
  external_ids: Record<string, unknown>;
  attributes: Record<string, unknown>;
  classification: Record<string, unknown>;
  text: Record<string, unknown>;
  metadata: Record<string, unknown>;
  media: Record<string, unknown>;
  purchase_uris: Record<string, unknown>;
  prices: Record<string, unknown>;
  all_parts: unknown[];
  used_by: unknown[];
  related_champions: unknown[];
  related_legends: unknown[];
  related_printings: unknown[];
  is_token: boolean;
}

export async function ingestCardData(
  supabase: SupabaseClient,
  sets: IngestSet[],
  cards: Card[],
): Promise<void> {
  const p_sets: RpcSetPayload[] = sets.map((s) => ({
    set_code: s.set_code,
    set_name: s.set_name,
    set_uri: s.set_uri ?? null,
    set_search_uri: s.set_search_uri ?? null,
    published_on: s.published_on ?? null,
    is_promo: s.is_promo,
    parent_set_code: s.parent_set_code ?? null,
    external_ids: s.external_ids as Record<string, unknown>,
  }));

  const artistNames = new Set<string>();
  for (const card of cards) {
    if (card.artist) artistNames.add(card.artist);
  }
  const p_artists: RpcArtistPayload[] = Array.from(artistNames).map((name) => ({ name }));

  const p_cards: RpcCardPayload[] = cards.map((card) => ({
    id: card.id,
    name: card.name,
    name_normalized: card.name_normalized,
    collector_number: card.collector_number ?? null,
    released_at: card.released_at ?? null,
    set_code: card.set?.set_code ?? null,
    artist: card.artist ?? null,
    external_ids: (card.external_ids ?? {}) as Record<string, unknown>,
    attributes: (card.attributes ?? {}) as Record<string, unknown>,
    classification: (card.classification ?? {}) as Record<string, unknown>,
    text: (card.text ?? {}) as Record<string, unknown>,
    metadata: (card.metadata ?? {}) as Record<string, unknown>,
    media: (card.media ?? {}) as Record<string, unknown>,
    purchase_uris: (card.purchase_uris ?? {}) as Record<string, unknown>,
    prices: (card.prices ?? {}) as Record<string, unknown>,
    all_parts: card.all_parts,
    used_by: card.used_by,
    related_champions: card.related_champions,
    related_legends: card.related_legends,
    related_printings: card.related_printings,
    is_token: card.is_token,
  }));

  logger.info("Calling ingest_card_data RPC", {
    sets: p_sets.length,
    artists: p_artists.length,
    cards: p_cards.length,
  });

  const { error } = await supabase.rpc("ingest_card_data", {
    p_sets,
    p_artists,
    p_cards,
  });

  if (error) throw new Error(`ingest_card_data RPC failed: ${error.message}`);
  logger.info("ingest_card_data RPC complete");
}
