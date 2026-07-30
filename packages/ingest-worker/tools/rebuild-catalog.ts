import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Card } from "@riftseer/types";
import {
  buildPublicSlugSegments,
  joinPublicSlug,
  withNameCollisionSuffix,
} from "@riftseer/types/slug";
import { fetchAllPages, fetchAllSets } from "../src/sources/riftcodex.ts";
import { fetchAllGroupResults, fetchGroups } from "../src/sources/tcgcsv.ts";
import { collapseDuplicates } from "../src/pipeline/dedup.ts";
import { buildProductMap, enrichCards, matchTcgGroupsToSets } from "../src/pipeline/enrich.ts";
import { linkChampionsLegends, linkRelatedPrintings, linkSignatures, linkTokens } from "../src/pipeline/link.ts";
import { normalizeCards, normalizeSets } from "../src/pipeline/normalize.ts";
import type { IngestSet } from "../src/pipeline/types.ts";

const execute = process.argv.includes("--execute");
const timeoutMs = 30_000;

function loadEnvFile(path: string): void {
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function supabase(): SupabaseClient {
  loadEnvFile(".env");

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

interface ExistingCardRow {
  id: string;
  public_slug: string | null;
}

function assignPublicSlugs(
  cards: Card[],
  existingCards: ExistingCardRow[],
): Map<string, string> {
  const assigned = new Map<string, string>();
  const existingById = new Map(
    existingCards
      .filter((card): card is ExistingCardRow & { public_slug: string } => Boolean(card.public_slug))
      .map((card) => [card.id, card.public_slug]),
  );
  const taken = new Set(existingById.values());

  for (const card of [...cards].sort((a, b) => a.id.localeCompare(b.id))) {
    const existing = existingById.get(card.id);
    if (existing) {
      assigned.set(card.id, existing);
      continue;
    }

    const base = buildPublicSlugSegments(card);
    let slug: string | null = null;
    for (let attempt = 1; attempt < 1000; attempt++) {
      const candidate = joinPublicSlug(withNameCollisionSuffix(base, attempt));
      if (taken.has(candidate)) continue;
      slug = candidate;
      break;
    }
    if (!slug) slug = `${joinPublicSlug(base)}-${card.id.slice(-6)}`;
    assigned.set(card.id, slug);
    taken.add(slug);
  }

  return assigned;
}

function buildPayload(
  sets: IngestSet[],
  cards: Card[],
  existingCards: ExistingCardRow[],
) {
  const p_sets = sets.map((set) => ({
    set_code: set.set_code,
    set_name: set.set_name,
    set_uri: set.set_uri ?? null,
    set_search_uri: set.set_search_uri ?? null,
    published_on: set.published_on ?? null,
    is_promo: set.is_promo,
    parent_set_code: set.parent_set_code ?? null,
    external_ids: set.external_ids,
  }));

  const artistNames = new Set<string>();
  for (const card of cards) {
    if (card.artist) artistNames.add(card.artist);
  }
  const p_artists = [...artistNames].map((name) => ({ name }));

  const slugs = assignPublicSlugs(cards, existingCards);
  const p_cards = cards.map((card) => ({
    id: card.id,
    name: card.name,
    name_normalized: card.name_normalized,
    collector_number: card.collector_number ?? null,
    released_at: card.released_at ?? null,
    set_code: card.set?.set_code ?? null,
    artist: card.artist ?? null,
    external_ids: card.external_ids ?? {},
    attributes: card.attributes ?? {},
    classification: card.classification ?? {},
    text: card.text ?? {},
    metadata: card.metadata ?? {},
    media: card.media ?? {},
    purchase_uris: card.purchase_uris ?? {},
    prices: card.prices ?? {},
    all_parts: card.all_parts,
    used_by: card.used_by,
    related_champions: card.related_champions,
    related_legends: card.related_legends,
    related_signatures: card.related_signatures,
    related_printings: card.related_printings,
    is_token: card.is_token,
    source: card.source ?? "riftcodex",
    public_slug: slugs.get(card.id) ?? null,
  }));

  return { p_sets, p_artists, p_cards, p_valid_ids: cards.map((card) => card.id) };
}

async function buildCatalogue() {
  const config = {
    baseUrl: process.env.RIFTCODEX_BASE_URL ?? "https://api.riftcodex.com",
    apiKey: process.env.RIFTCODEX_API_KEY,
    timeoutMs,
  };

  const [rawSets, rawCards] = await Promise.all([
    fetchAllSets(config),
    fetchAllPages(config),
  ]);
  const sets = normalizeSets(rawSets);
  const cards = collapseDuplicates(normalizeCards(rawCards));

  try {
    const groups = await fetchGroups(timeoutMs);
    const setGroupMap = matchTcgGroupsToSets(sets, groups);
    const groupResults = await fetchAllGroupResults(groups, timeoutMs);
    enrichCards(cards, buildProductMap(groupResults), setGroupMap);
  } catch (error) {
    console.warn("TCGPlayer enrichment failed; continuing with RiftCodex-only data", error);
  }

  linkTokens(cards);
  linkChampionsLegends(cards);
  linkSignatures(cards);
  linkRelatedPrintings(cards);

  return { rawCards, sets, cards };
}

async function loadExistingCards(client: SupabaseClient): Promise<ExistingCardRow[]> {
  const rows: ExistingCardRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("cards")
      .select("id,public_slug")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`load existing cards failed: ${error.message}`);

    const page = (data ?? []) as ExistingCardRow[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function deleteCardsById(
  client: SupabaseClient,
  ids: string[],
): Promise<number> {
  let deleted = 0;
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    const { error } = await client.from("cards").delete().in("id", chunk);
    if (error) throw new Error(`delete stale cards failed: ${error.message}`);
    deleted += chunk.length;
  }
  return deleted;
}

async function loadTableIds(
  client: SupabaseClient,
  table: "artists" | "sets",
): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select("id")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`load ${table} ids failed: ${error.message}`);

    const page = (data ?? []) as Array<{ id: string }>;
    ids.push(...page.map((row) => row.id));
    if (page.length < pageSize) return ids;
  }
}

async function loadCardReferences(
  client: SupabaseClient,
): Promise<Array<{ set_id: string | null; artist_id: string | null }>> {
  const rows: Array<{ set_id: string | null; artist_id: string | null }> = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("cards")
      .select("set_id,artist_id")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`load card references failed: ${error.message}`);

    const page = (data ?? []) as Array<{
      set_id: string | null;
      artist_id: string | null;
    }>;
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function deleteRowsById(
  client: SupabaseClient,
  table: "artists" | "sets",
  ids: string[],
): Promise<number> {
  let deleted = 0;
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    const { error } = await client.from(table).delete().in("id", chunk);
    if (error) throw new Error(`delete orphan ${table} failed: ${error.message}`);
    deleted += chunk.length;
  }
  return deleted;
}

async function deleteOrphanCatalogueRows(
  client: SupabaseClient,
): Promise<{ artists: number; sets: number }> {
  const [references, artistIds, setIds] = await Promise.all([
    loadCardReferences(client),
    loadTableIds(client, "artists"),
    loadTableIds(client, "sets"),
  ]);
  const usedArtistIds = new Set(
    references.flatMap((row) => (row.artist_id ? [row.artist_id] : [])),
  );
  const usedSetIds = new Set(
    references.flatMap((row) => (row.set_id ? [row.set_id] : [])),
  );
  const orphanArtistIds = artistIds.filter((id) => !usedArtistIds.has(id));
  const orphanSetIds = setIds.filter((id) => !usedSetIds.has(id));

  return {
    artists: await deleteRowsById(client, "artists", orphanArtistIds),
    sets: await deleteRowsById(client, "sets", orphanSetIds),
  };
}

async function loadSetIdMap(client: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await client.from("sets").select("id,set_code");
  if (error) throw new Error(`load set id map failed: ${error.message}`);
  return new Map(
    ((data ?? []) as Array<{ id: string; set_code: string }>).map((row) => [
      row.set_code,
      row.id,
    ]),
  );
}

async function loadArtistIdMap(client: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await client.from("artists").select("id,name");
  if (error) throw new Error(`load artist id map failed: ${error.message}`);
  return new Map(
    ((data ?? []) as Array<{ id: string; name: string }>).map((row) => [
      row.name,
      row.id,
    ]),
  );
}

async function directTableUpsert(
  client: SupabaseClient,
  payload: ReturnType<typeof buildPayload>,
): Promise<void> {
  const { error: setsError } = await client
    .from("sets")
    .upsert(payload.p_sets, { onConflict: "set_code" });
  if (setsError) throw new Error(`upsert sets failed: ${setsError.message}`);

  const { error: artistsError } = await client
    .from("artists")
    .upsert(payload.p_artists, { onConflict: "name" });
  if (artistsError) throw new Error(`upsert artists failed: ${artistsError.message}`);

  const [setIds, artistIds] = await Promise.all([
    loadSetIdMap(client),
    loadArtistIdMap(client),
  ]);
  const rows = payload.p_cards.map((card) => ({
    id: card.id,
    name: card.name,
    name_normalized: card.name_normalized,
    collector_number: card.collector_number,
    released_at: card.released_at,
    set_id: card.set_code ? (setIds.get(card.set_code) ?? null) : null,
    artist_id: card.artist ? (artistIds.get(card.artist) ?? null) : null,
    external_ids: card.external_ids,
    attributes: card.attributes,
    classification: card.classification,
    text: card.text,
    metadata: card.metadata,
    media: card.media,
    purchase_uris: card.purchase_uris,
    prices: card.prices,
    all_parts: card.all_parts,
    used_by: card.used_by,
    related_champions: card.related_champions,
    related_legends: card.related_legends,
    related_signatures: card.related_signatures,
    related_printings: card.related_printings,
    is_token: card.is_token,
    public_slug: card.public_slug,
  }));

  for (let offset = 0; offset < rows.length; offset += 50) {
    const batch = rows.slice(offset, offset + 50);
    const { error } = await client.from("cards").upsert(batch, { onConflict: "id" });
    if (error) {
      throw new Error(
        `upsert cards batch ${offset / 50 + 1} failed: ${error.message}`,
      );
    }
  }
}

async function refreshSetCardCounts(client: SupabaseClient): Promise<void> {
  const [references, setIds] = await Promise.all([
    loadCardReferences(client),
    loadTableIds(client, "sets"),
  ]);
  const counts = new Map<string, number>();
  for (const row of references) {
    if (row.set_id) counts.set(row.set_id, (counts.get(row.set_id) ?? 0) + 1);
  }

  for (const id of setIds) {
    const { error } = await client
      .from("sets")
      .update({ card_count: counts.get(id) ?? 0 })
      .eq("id", id);
    if (error) throw new Error(`refresh set card count failed: ${error.message}`);
  }
}

async function countRows(client: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return null;
    throw new Error(`count ${table} failed: ${error.message}`);
  }
  return count ?? 0;
}

async function pickWriteMode(
  client: SupabaseClient,
): Promise<"ingest_card_data_v2" | "direct-table-upsert"> {
  const v2 = await client.rpc("ingest_card_data_v2", {
    p_sets: [],
    p_artists: [],
    p_cards: [],
    p_valid_ids: [],
  });
  if (!v2.error) return "ingest_card_data_v2";
  return "direct-table-upsert";
}

function settSummary(cards: Card[]) {
  const isSettBrawler = (name: string) => /Sett\s*[-,]\s*Brawler/.test(name);
  return cards
    .filter((card) => isSettBrawler(card.name))
    .map((card) => ({
      id: card.id,
      name: card.name,
      set: card.set?.set_code,
      collector: card.collector_number,
      riftbound_id: card.external_ids?.riftbound_id,
      tcgplayer_id: card.external_ids?.tcgplayer_id ?? null,
      printings: card.related_printings.length,
    }));
}

async function main() {
  const client = supabase();
  const { rawCards, sets, cards } = await buildCatalogue();
  const existingCards = await loadExistingCards(client);
  const payload = buildPayload(sets, cards, existingCards);
  const writeMode = await pickWriteMode(client);
  const validIds = new Set(cards.map((card) => card.id));
  const upstreamIds = new Set(rawCards.map((card) => card.id));
  const staleIds = existingCards
    .map((card) => card.id)
    .filter((id) => upstreamIds.has(id) && !validIds.has(id));
  const existingCanonicalIds = existingCards.filter((card) =>
    validIds.has(card.id),
  ).length;
  const retainedDatabaseOnlyIds = existingCards.filter(
    (card) => !upstreamIds.has(card.id),
  ).length;
  const newIds = cards.length - existingCanonicalIds;

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "dry-run",
        writeMode,
        rawCards: rawCards.length,
        canonicalCards: cards.length,
        collapsedDuplicates: rawCards.length - cards.length,
        sets: sets.length,
        existingCards: existingCards.length,
        preservedIds: existingCanonicalIds,
        newIds,
        retainedDatabaseOnlyIds,
        staleCardsToDelete: staleIds.length,
        settBrawler: settSummary(cards),
      },
      null,
      2,
    ),
  );

  if (!execute) {
    console.log(
      "Dry run only. Re-run with --execute to upsert the catalogue and delete only stale card IDs.",
    );
    return;
  }

  const before = {
    cards: await countRows(client, "cards"),
    rulings: await countRows(client, "rulings"),
    sets: await countRows(client, "sets"),
    artists: await countRows(client, "artists"),
  };

  if (writeMode === "ingest_card_data_v2") {
    const { error } = await client.rpc(writeMode, payload);
    if (error) {
      throw new Error(`${writeMode} failed during catalogue upsert: ${error.message}`);
    }
  } else {
    await directTableUpsert(client, payload);
  }

  // v2 prunes atomically. The legacy RPC does not, so remove only IDs that are
  // absent from the canonical RiftCodex-derived catalogue after the upsert has
  // succeeded. This preserves surviving card rows, slugs, and unrelated tables.
  const deletedStaleCards =
    writeMode === "ingest_card_data_v2"
      ? staleIds.length
      : await deleteCardsById(client, staleIds);

  await refreshSetCardCounts(client);
  const deletedOrphans = await deleteOrphanCatalogueRows(client);

  const after = {
    cards: await countRows(client, "cards"),
    rulings: await countRows(client, "rulings"),
    sets: await countRows(client, "sets"),
    artists: await countRows(client, "artists"),
  };

  const settIds = settSummary(cards).map((card) => card.id);
  const { data: settRows, error: settError } = await client
    .from("cards")
    .select("id,name,collector_number,external_ids,related_printings,sets:set_id(set_code)")
    .in("id", settIds);
  if (settError) throw new Error(`verify Sett rows failed: ${settError.message}`);

  console.log(
    JSON.stringify(
      {
        before,
        deletedStaleCards,
        deletedOrphans,
        after,
        settRows: settRows?.map((row) => ({
          id: row.id,
          name: row.name,
          set: Array.isArray(row.sets) ? row.sets[0]?.set_code : row.sets?.set_code,
          collector: row.collector_number,
          riftbound_id: row.external_ids?.riftbound_id,
          related_printings: Array.isArray(row.related_printings)
            ? row.related_printings.length
            : null,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
