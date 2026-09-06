/**
 * Supabase upsert via the `ingest_catalogue` Postgres RPC.
 *
 * Rows are sent in bounded, individually atomic batches. Stale-row pruning is a
 * separate final call and therefore cannot run unless every upsert batch
 * completed — a failed batch leaves stale rows in place rather than deleting a
 * catalogue it only half wrote.
 *
 * Batches are cut on **oracle** boundaries, not printing ones. The RPC clears
 * ingest-owned deltas for every printing of an oracle it touches, so an oracle
 * split across two batches would have the second batch delete the first's
 * deltas. Keeping a card whole in one call is what makes that safe.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateOracleSlug,
  generatePublicSlug,
  type SlugPrinting,
} from "@riftseer/types/slug";
import type {
  IngestOracle,
  IngestPrinting,
  IngestSet,
  OracleEdge,
  PrintingDelta,
} from "./types.ts";
import { logger } from "../utils.ts";
import { callRpcWithRetry } from "./retry.ts";

const DATABASE_PAGE_SIZE = 1000;

/**
 * Keep each RPC comfortably below Supabase's request/connection limits.
 *
 * 300 cards (~700 KiB of JSON) drew repeated opaque `internal error` responses
 * mid-run; 150 halves the work held open in one transaction and shortens the
 * window a dropped connection can land in. Combined with the retry, a batch
 * failing is no longer fatal either way.
 */
export const INGEST_RPC_CARD_BATCH_SIZE = 150;

interface RpcSet {
  set_code: string;
  set_name: string;
  set_uri: string | null;
  set_search_uri: string | null;
  published_on: string | null;
  is_promo: boolean;
  parent_set_code: string | null;
  riftcodex_set_id: string | null;
  tcgplayer_group_id: string | null;
  cardmarket_id: string | null;
}

interface RpcOracle {
  oracle_key: string;
  slug: string;
  name: string;
  name_normalized: string;
  card_type: string | null;
  supertype: string | null;
  is_token: boolean;
  energy: number | null;
  might: number | null;
  power: number | null;
  might_bonus: number | null;
  equipment_text: string | null;
  text_rich: string | null;
  text_plain: string | null;
  tags: string[];
  domains: string[];
  meta_flags: string[];
}

interface RpcPrinting {
  id: string;
  oracle_key: string;
  set_code: string | null;
  artist: string | null;
  collector_number: string | null;
  released_at: string | null;
  rarity: string | null;
  public_slug: string;
  flavour_text: string | null;
  finishes: string[];
  is_signature: boolean;
  is_alternate_art: boolean;
  is_overnumbered: boolean;
  is_special_collection: boolean;
  riftcodex_id: string | null;
  riftbound_id: string | null;
  tcgplayer_id: string | null;
  cardmarket_id: string | null;
  image_source_url: string | null;
  image_source_hash: string | null;
  image_source_provider: string | null;
  image_orientation: string | null;
  image_alt_text: string | null;
  price_normal: number | null;
  price_foil: number | null;
  price_low_normal: number | null;
  price_low_foil: number | null;
  tcgplayer_url: string | null;
  cardmarket_url: string | null;
}

function chunkOraclesByPrintingCount(
  oracles: IngestOracle[],
  maxPrintings: number,
): IngestOracle[][] {
  const batches: IngestOracle[][] = [];
  let current: IngestOracle[] = [];
  let size = 0;
  for (const oracle of oracles) {
    if (current.length > 0 && size + oracle.printings.length > maxPrintings) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(oracle);
    size += oracle.printings.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Read every slug already in use, and which rows already own one.
 *
 * A slug is pinned on first insert, so an existing one is authoritative and a
 * generated candidate only has to avoid colliding with the rest.
 */
async function loadTakenSlugs(
  supabase: SupabaseClient,
  table: "printings" | "oracles",
  idColumn: "id" | "oracle_key",
  slugColumn: "public_slug" | "slug",
): Promise<{ existing: Map<string, string>; taken: Set<string> }> {
  const existing = new Map<string, string>();
  const taken = new Set<string>();

  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(`${idColumn}, ${slugColumn}`)
      .order(idColumn)
      .range(from, from + DATABASE_PAGE_SIZE - 1);
    if (error) throw new Error(`load ${table} slugs failed: ${error.message}`);

    const rows = (data ?? []) as unknown as Array<Record<string, string | null>>;
    for (const row of rows) {
      const slug = row[slugColumn];
      const id = row[idColumn];
      if (!slug || !id) continue;
      taken.add(slug);
      existing.set(id, slug);
    }
    if (rows.length < DATABASE_PAGE_SIZE) break;
  }

  return { existing, taken };
}

/**
 * Pin a slug on every oracle and printing.
 *
 * Existing rows keep theirs; new ones take the first non-colliding candidate.
 * Processed in a stable order so collision suffixes come out identical across
 * re-runs of the same catalogue.
 */
async function assignSlugs(
  supabase: SupabaseClient,
  oracles: IngestOracle[],
  printings: IngestPrinting[],
): Promise<{
  oracleSlugs: Map<string, string>;
  printingSlugs: Map<string, string>;
  newOracleSlugs: number;
  newPrintingSlugs: number;
}> {
  const [oracleState, printingState] = await Promise.all([
    loadTakenSlugs(supabase, "oracles", "oracle_key", "slug"),
    loadTakenSlugs(supabase, "printings", "id", "public_slug"),
  ]);

  const oracleSlugs = new Map<string, string>();
  let newOracleSlugs = 0;
  for (const oracle of [...oracles].sort((a, b) =>
    a.oracle_key.localeCompare(b.oracle_key),
  )) {
    const existing = oracleState.existing.get(oracle.oracle_key);
    if (existing) {
      oracleSlugs.set(oracle.oracle_key, existing);
      continue;
    }
    const slug = generateOracleSlug(oracle.name, (candidate) =>
      oracleState.taken.has(candidate),
    );
    oracleState.taken.add(slug);
    oracleSlugs.set(oracle.oracle_key, slug);
    newOracleSlugs++;
  }

  const printingSlugs = new Map<string, string>();
  let newPrintingSlugs = 0;
  for (const printing of [...printings].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const existing = printingState.existing.get(printing.id);
    if (existing) {
      printingSlugs.set(printing.id, existing);
      continue;
    }
    const slugPrinting: SlugPrinting = {
      id: printing.id,
      name: printing.name,
      setCode: printing.set_code,
      collectorNumber: printing.collector_number,
      alternateArt: printing.is_alternate_art,
      signature: printing.is_signature,
    };
    const slug = generatePublicSlug(slugPrinting, (candidate) =>
      printingState.taken.has(candidate),
    );
    printingState.taken.add(slug);
    printingSlugs.set(printing.id, slug);
    newPrintingSlugs++;
  }

  return { oracleSlugs, printingSlugs, newOracleSlugs, newPrintingSlugs };
}

function toRpcSet(set: IngestSet): RpcSet {
  return {
    set_code: set.set_code,
    set_name: set.set_name,
    set_uri: set.set_uri ?? null,
    set_search_uri: set.set_search_uri ?? null,
    published_on: set.published_on ?? null,
    is_promo: set.is_promo,
    parent_set_code: set.parent_set_code ?? null,
    riftcodex_set_id: set.riftcodex_set_id ?? null,
    tcgplayer_group_id:
      set.tcgplayer_group_id === undefined
        ? null
        : String(set.tcgplayer_group_id),
    cardmarket_id: set.cardmarket_id ?? null,
  };
}

function toRpcOracle(oracle: IngestOracle, slug: string): RpcOracle {
  return {
    oracle_key: oracle.oracle_key,
    slug,
    name: oracle.name,
    name_normalized: oracle.name_normalized,
    card_type: oracle.card_type ?? null,
    supertype: oracle.supertype ?? null,
    is_token: oracle.is_token,
    energy: oracle.energy,
    might: oracle.might,
    power: oracle.power,
    might_bonus: oracle.might_bonus ?? null,
    equipment_text: oracle.equipment_text ?? null,
    text_rich: oracle.text_rich ?? null,
    text_plain: oracle.text_plain ?? null,
    tags: oracle.tags,
    domains: oracle.domains,
    // Ingest observes no meta flags: the `is:` vocabulary they back is
    // admin-authored, and an admin edit locks the column against this write.
    meta_flags: [],
  };
}

function toRpcPrinting(
  printing: IngestPrinting,
  oracleKey: string,
  publicSlug: string,
): RpcPrinting {
  return {
    id: printing.id,
    oracle_key: oracleKey,
    set_code: printing.set_code ?? null,
    artist: printing.artist ?? null,
    collector_number: printing.collector_number ?? null,
    released_at: printing.released_at ?? null,
    rarity: printing.rarity ?? null,
    public_slug: publicSlug,
    flavour_text: printing.flavour_text ?? null,
    finishes: printing.finishes,
    is_signature: printing.is_signature,
    is_alternate_art: printing.is_alternate_art,
    is_overnumbered: printing.is_overnumbered,
    is_special_collection: printing.is_special_collection,
    riftcodex_id: printing.riftcodex_id ?? null,
    riftbound_id: printing.riftbound_id ?? null,
    tcgplayer_id: printing.tcgplayer_id ?? null,
    cardmarket_id: printing.cardmarket_id ?? null,
    image_source_url: printing.image_source_url ?? null,
    image_source_hash: printing.image_source_hash ?? null,
    image_source_provider: printing.image_source_provider ?? null,
    image_orientation: printing.image_orientation ?? null,
    image_alt_text: printing.image_alt_text ?? null,
    price_normal: printing.price_normal ?? null,
    price_foil: printing.price_foil ?? null,
    price_low_normal: printing.price_low_normal ?? null,
    price_low_foil: printing.price_low_foil ?? null,
    tcgplayer_url: printing.tcgplayer_url ?? null,
    cardmarket_url: printing.cardmarket_url ?? null,
  };
}

export interface IngestCatalogueResult {
  oracles: number;
  printings: number;
  batches: number;
  newOracleSlugs: number;
  newPrintingSlugs: number;
}

export async function ingestCatalogue(
  supabase: SupabaseClient,
  sets: IngestSet[],
  oracles: IngestOracle[],
  deltas: PrintingDelta[],
  relationships: OracleEdge[],
): Promise<IngestCatalogueResult> {
  const printings = oracles.flatMap((oracle) => oracle.printings);

  const p_sets = sets.map(toRpcSet);

  const artistNames = new Set<string>();
  for (const printing of printings) {
    if (printing.artist) artistNames.add(printing.artist);
  }
  // A plain array of strings, not objects — `jsonb_array_elements_text`.
  const p_artists = [...artistNames];

  const { oracleSlugs, printingSlugs, newOracleSlugs, newPrintingSlugs } =
    await assignSlugs(supabase, oracles, printings);
  logger.info("Computed slugs", {
    oracles: oracles.length,
    printings: printings.length,
    newOracleSlugs,
    newPrintingSlugs,
  });

  const deltasByPrintingId = new Map(deltas.map((d) => [d.printing_id, d]));
  const batches = chunkOraclesByPrintingCount(
    oracles,
    INGEST_RPC_CARD_BATCH_SIZE,
  );

  logger.info("Starting batched ingest_catalogue RPC", {
    sets: p_sets.length,
    artists: p_artists.length,
    oracles: oracles.length,
    printings: printings.length,
    relationships: relationships.length,
    batches: batches.length,
  });

  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index]!;
    const batchPrintings = batch.flatMap((oracle) =>
      oracle.printings.map((printing) =>
        toRpcPrinting(
          printing,
          oracle.oracle_key,
          printingSlugs.get(printing.id)!,
        ),
      ),
    );
    const batchDeltas = batchPrintings
      .map((printing) => deltasByPrintingId.get(printing.id))
      .filter((delta): delta is PrintingDelta => delta !== undefined);

    await callRpcWithRetry(
      supabase,
      "ingest_catalogue",
      {
        p_sets,
        p_artists,
        p_oracles: batch.map((oracle) =>
          toRpcOracle(oracle, oracleSlugs.get(oracle.oracle_key)!),
        ),
        p_printings: batchPrintings,
        p_deltas: batchDeltas,
        // Relationships reference oracles that may not exist until a later
        // batch, and the RPC rewrites the whole ingest-owned edge set on every
        // call — so they are sent exactly once, at the end.
        p_relationships: null,
        p_valid_printing_ids: null,
        p_prune: false,
      },
      `ingest_catalogue batch ${index + 1}/${batches.length}`,
    );
  }

  logger.info("Calling ingest_catalogue final prune", {
    validPrintingIds: printings.length,
    relationships: relationships.length,
  });
  await callRpcWithRetry(
    supabase,
    "ingest_catalogue",
    {
      p_sets,
      p_artists,
      p_oracles: null,
      p_printings: null,
      p_deltas: null,
      p_relationships: relationships,
      p_valid_printing_ids: printings.map((printing) => printing.id),
      p_prune: true,
    },
    "ingest_catalogue final prune",
  );

  logger.info("Batched ingest_catalogue RPC complete");
  return {
    oracles: oracles.length,
    printings: printings.length,
    batches: batches.length,
    newOracleSlugs,
    newPrintingSlugs,
  };
}

/**
 * Resolve the surrogate ids of oracles by their matching key.
 *
 * The review queue proposes an oracle for a printing the gallery lists but we
 * do not hold, and `reconciliation_queue.proposed_oracle_id` is a uuid — which
 * only exists once the catalogue has been written.
 */
export async function loadOracleIdsByKey(
  supabase: SupabaseClient,
  oracleKeys: string[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const wanted = [...new Set(oracleKeys)];
  /** PostgREST `in` filters travel in the URL — chunk large key lists. */
  const CHUNK = 100;

  for (let i = 0; i < wanted.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("oracles")
      .select("id, oracle_key")
      .in("oracle_key", wanted.slice(i, i + CHUNK));
    if (error) throw new Error(`load oracle ids failed: ${error.message}`);
    for (const row of (data ?? []) as Array<{ id: string; oracle_key: string }>) {
      ids.set(row.oracle_key, row.id);
    }
  }
  return ids;
}

/**
 * Re-evaluate every rule-scoped ruling target against the freshly ingested
 * catalogue.
 *
 * This is what makes a rule like `t:unit kw:deathknell` cover cards that did not
 * exist when it was written: the admin UI materialises a rule when it is saved,
 * and this call re-materialises all of them once new printings have landed.
 *
 * Advisory, like the review queue — rulings are supplementary to the card page,
 * so a failure here is logged and swallowed rather than failing an ingest that
 * has already committed its catalogue.
 */
export async function refreshRulingRuleMatches(
  supabase: SupabaseClient,
): Promise<{ targets: number; matches: number; skipped: number } | null> {
  try {
    const { data, error } = await supabase.rpc("refresh_ruling_rule_matches", {
      p_target_id: null,
    });
    if (error) throw new Error(error.message);

    const payload = (data ?? {}) as {
      targets?: number;
      matches?: number;
      skipped?: number;
    };
    const result = {
      targets: payload.targets ?? 0,
      matches: payload.matches ?? 0,
      skipped: payload.skipped ?? 0,
    };
    if (result.skipped > 0) {
      // A skipped target kept its previous matches — its stored AST no longer
      // renders, which means the grammar moved on without it.
      logger.warn("Some ruling rules could not be evaluated", result);
    }
    logger.info("Ruling rule matches refreshed", result);
    return result;
  } catch (err) {
    logger.warn("Ruling rule refresh failed — continuing", {
      error: String(err),
    });
    return null;
  }
}
