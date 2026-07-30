/**
 * Atomic Supabase upsert via the ingest_card_data_v2 Postgres RPC.
 * Sets, artists, cards, and stale-card pruning happen in a single transaction.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card } from "@riftseer/types";
import {
  buildPublicSlugSegments,
  joinPublicSlug,
  withNameCollisionSuffix,
} from "@riftseer/types/slug";
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
  related_signatures: unknown[];
  related_printings: unknown[];
  is_token: boolean;
  source: "riftcodex" | "manual";
  /**
   * Stable public URL path. Set on first ingest (or backfill) and never
   * overwritten by the RPC, so card URLs do not drift between runs.
   */
  public_slug: string | null;
}

/** PostgREST rejects very large `in.(…)` filters — stay under URL/query limits. */
const ID_IN_CHUNK_SIZE = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fetch existing public_slug values so we know:
 *   • which IDs in the batch already have a slug (skip them; they own the URL)
 *   • the full set of slugs in use (for collision checks when generating new ones)
 */
async function loadExistingSlugs(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{
  existingByCardId: Map<string, string>;
  allTakenSlugs: Set<string>;
}> {
  const existingByCardId = new Map<string, string>();
  const allTakenSlugs = new Set<string>();

  // All slugs already in use, anywhere in the table — used to avoid collisions
  // when assigning new slugs.  This is small (one row per card) so a single
  // pass is fine.
  const { data: allRows, error: allErr } = await supabase
    .from("cards")
    .select("public_slug")
    .not("public_slug", "is", null);
  if (allErr) throw new Error(`load all slugs failed: ${allErr.message}`);
  for (const row of (allRows ?? []) as Array<{ public_slug: string | null }>) {
    if (row.public_slug) allTakenSlugs.add(row.public_slug);
  }

  // Slug-by-id for the cards in this batch — drives "skip if already set"
  if (ids.length > 0) {
    for (const idChunk of chunk(ids, ID_IN_CHUNK_SIZE)) {
      const { data: idRows, error: idErr } = await supabase
        .from("cards")
        .select("id, public_slug")
        .in("id", idChunk);
      if (idErr) throw new Error(`load batch slugs failed: ${idErr.message}`);
      for (const row of (idRows ?? []) as Array<{
        id: string;
        public_slug: string | null;
      }>) {
        if (row.public_slug) existingByCardId.set(row.id, row.public_slug);
      }
    }
  }

  return { existingByCardId, allTakenSlugs };
}

/**
 * Assign a `public_slug` to every card in the batch:
 *   • If the row already has a slug in the DB, reuse it (URLs are immutable).
 *   • Otherwise pick the first non-colliding candidate, taking both DB rows
 *     and other newly-assigned slugs in this batch into account.
 *
 * Cards are processed in id order so collision suffixes are deterministic
 * across re-runs of the same batch.
 */
function assignPublicSlugs(
  cards: Card[],
  existingByCardId: Map<string, string>,
  allTakenSlugs: Set<string>,
): Map<string, string> {
  const assigned = new Map<string, string>();
  const batchSlugs = new Set<string>();

  const sorted = [...cards].sort((a, b) => a.id.localeCompare(b.id));

  for (const card of sorted) {
    const existing = existingByCardId.get(card.id);
    if (existing) {
      assigned.set(card.id, existing);
      continue;
    }
    const base = buildPublicSlugSegments(card);
    let slug: string | null = null;
    for (let attempt = 1; attempt < 1000; attempt++) {
      const candidate = joinPublicSlug(withNameCollisionSuffix(base, attempt));
      if (allTakenSlugs.has(candidate) || batchSlugs.has(candidate)) continue;
      slug = candidate;
      break;
    }
    if (!slug) {
      // Extraordinarily unlikely — fall back to id-suffixed slug.
      slug = `${joinPublicSlug(base)}-${card.id.slice(-6)}`;
    }
    assigned.set(card.id, slug);
    batchSlugs.add(slug);
    allTakenSlugs.add(slug); // future cards in the loop avoid this too
  }

  return assigned;
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

  const ids = cards.map((c) => c.id);
  const { existingByCardId, allTakenSlugs } = await loadExistingSlugs(
    supabase,
    ids,
  );
  const slugByCardId = assignPublicSlugs(cards, existingByCardId, allTakenSlugs);
  const newSlugCount = cards.reduce(
    (n, c) => (existingByCardId.has(c.id) ? n : n + 1),
    0,
  );
  logger.info("Computed public slugs", {
    cards: cards.length,
    existing: existingByCardId.size,
    newlyAssigned: newSlugCount,
  });

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
    related_signatures: card.related_signatures,
    related_printings: card.related_printings,
    is_token: card.is_token,
    source: card.source ?? "riftcodex",
    public_slug: slugByCardId.get(card.id) ?? null,
  }));

  const p_valid_ids = cards.map((card) => card.id);

  logger.info("Calling ingest_card_data_v2 RPC", {
    sets: p_sets.length,
    artists: p_artists.length,
    cards: p_cards.length,
    validIds: p_valid_ids.length,
  });

  const { error } = await supabase.rpc("ingest_card_data_v2", {
    p_sets,
    p_artists,
    p_cards,
    p_valid_ids,
  });

  if (error) throw new Error(`ingest_card_data_v2 RPC failed: ${error.message}`);
  logger.info("ingest_card_data_v2 RPC complete");
}
