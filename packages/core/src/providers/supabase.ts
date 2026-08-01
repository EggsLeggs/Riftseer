/**
 * SupabaseCardProvider
 *
 * Reads the card catalogue from Supabase Postgres, populated by the ingest
 * pipeline.
 *
 * Search runs against `resolved_printings` — the projection that has already
 * applied the printing delta layer — so there is exactly one search path here
 * rather than the three the flat model needed. Collapsing results to one row
 * per card happens as `GROUP BY oracle_id` inside the RPC, not as a
 * name-string heuristic applied on every read.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: CACHE_REFRESH_INTERVAL_MS, CARD_IMAGE_BASE_URL
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { printingImageUrls } from "@riftseer/types/card-image";
import { repairFlavourText } from "@riftseer/types/card-text";
import { oracleKeyForName } from "@riftseer/types/oracle";
import {
  exactNameLeaf,
  findTextLeafValue,
  parseCardSearchQuery,
  type CardSearchAst,
} from "../card-search-query.ts";
import { logger } from "../logger.ts";
import { normalizeCardName } from "../normalize.ts";
import type { CardDataProvider } from "../provider.ts";
import { rankIds, type Nameable } from "../search.ts";
import { getSupabaseClient } from "../supabase/client.ts";
import type {
  CardLegality,
  CardPrices,
  CardRequest,
  CardRuling,
  CardSearchOptions,
  Format,
  Oracle,
  OracleSearchResult,
  Printing,
  PrintingSearchResult,
  ResolvedCard,
} from "../types.ts";

const REFRESH_INTERVAL_MS = Number.parseInt(
  process.env.CACHE_REFRESH_INTERVAL_MS ?? "21600000",
  10,
);

const CARD_IMAGE_BASE_URL =
  process.env.CARD_IMAGE_BASE_URL ?? "https://img.riftseer.com";

const ORACLE_SELECT = "*";

const PRINTING_SELECT =
  "*, sets:set_id(set_code, set_name, set_uri, set_search_uri, is_promo, published_on, card_count), artists:artist_id(name), printing_deltas(printing_id)";

/** PostgREST `in` filter URL limits — chunk large id lists. */
const ID_IN_CHUNK_SIZE = 100;

/** Hard ceiling on ids the search RPC will return in one call. */
const MAX_SEARCH_IDS = 5000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ─── Row shapes ───────────────────────────────────────────────────────────────

interface OracleRow {
  id: string;
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
  keywords: string[] | null;
  tags: string[] | null;
  domains: string[] | null;
  meta_flags: string[] | null;
  preferred_printing_id: string | null;
  source: "riftcodex" | "manual" | null;
  updated_at: string | null;
}

interface PrintingRow {
  id: string;
  oracle_id: string;
  collector_number: string | null;
  released_at: string | null;
  rarity: string | null;
  public_slug: string;
  flavour_text: string | null;
  finishes: string[] | null;
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
  image_orientation: string | null;
  image_alt_text: string | null;
  image_hosted_at: string | null;
  price_normal: number | null;
  price_foil: number | null;
  price_low_normal: number | null;
  price_low_foil: number | null;
  tcgplayer_url: string | null;
  cardmarket_url: string | null;
  artist_id: string | null;
  set_id: string | null;
  source: "riftcodex" | "manual" | null;
  updated_at: string | null;
  ingested_at: string | null;
  sets?: {
    set_code: string;
    set_name: string;
    set_uri: string | null;
    set_search_uri: string | null;
    is_promo: boolean;
    published_on: string | null;
    card_count: number | null;
  } | null;
  artists?: { name: string } | null;
  // A to-ONE embed, not an array: printing_deltas is keyed on printing_id, so
  // PostgREST returns the row itself or null. Treating it as an array made
  // `differs_from_oracle` silently always false.
  printing_deltas?: { printing_id: string } | null;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function oracleRowToOracle(row: OracleRow): Oracle {
  return {
    object: "oracle",
    id: row.id,
    // Both fallbacks exist for the same reason: a row written before a
    // migration finished should render, not 500.
    oracle_key: row.oracle_key ?? oracleKeyForName(row.name),
    slug: row.slug,
    name: row.name,
    name_normalized: row.name_normalized ?? normalizeCardName(row.name),
    card_type: row.card_type ?? undefined,
    supertype: row.supertype,
    is_token: Boolean(row.is_token),
    energy: row.energy,
    might: row.might,
    power: row.power,
    // Presence, not truthiness: 0 is a real printed Might bonus, so this stays
    // null-vs-number rather than collapsing through `||`.
    might_bonus: row.might_bonus,
    text: {
      rich: row.text_rich ?? undefined,
      plain: row.text_plain ?? undefined,
      equipment: row.equipment_text ?? undefined,
    },
    keywords: row.keywords ?? [],
    tags: row.tags ?? [],
    domains: row.domains ?? [],
    meta_flags: row.meta_flags ?? [],
    source: row.source ?? "riftcodex",
    updated_at: row.updated_at ?? undefined,
  };
}

/** `21★` for a signature printing, `12a` for alternate art, else the number. */
export function collectorLabel(
  collectorNumber: string | null | undefined,
  flags: { signature?: boolean; alternate_art?: boolean },
): string | undefined {
  if (!collectorNumber) return undefined;
  if (flags.signature) return `${collectorNumber}★`;
  if (flags.alternate_art && /\d$/.test(collectorNumber)) {
    return `${collectorNumber}a`;
  }
  return collectorNumber;
}

function printingPrices(row: PrintingRow): CardPrices | undefined {
  const entry = {
    normal: row.price_normal,
    foil: row.price_foil,
    low_normal: row.price_low_normal,
    low_foil: row.price_low_foil,
  };
  const hasAny = Object.values(entry).some((v) => v !== null && v !== undefined);
  return hasAny ? { tcgplayer: entry } : undefined;
}

function printingRowToPrinting(row: PrintingRow): Printing {
  const signature = Boolean(row.is_signature);
  const alternateArt = Boolean(row.is_alternate_art);

  // Hosted URLs are derived, never stored: `image_hosted_at` is the only
  // signal that the full R2 variant set exists. Anything else falls back to
  // the upstream source so a card page is never blank.
  const image =
    row.image_hosted_at && row.image_source_hash
      ? printingImageUrls(CARD_IMAGE_BASE_URL, row.id, row.image_source_hash)
      : row.image_source_url
        ? { original: row.image_source_url }
        : undefined;

  return {
    object: "printing",
    id: row.id,
    oracle_id: row.oracle_id,
    set: row.sets
      ? {
          set_id: row.set_id ?? undefined,
          set_code: row.sets.set_code,
          set_name: row.sets.set_name,
          set_uri: row.sets.set_uri ?? undefined,
          set_search_uri: row.sets.set_search_uri ?? undefined,
          published_on: row.sets.published_on ?? undefined,
          card_count: row.sets.card_count ?? undefined,
          is_promo: row.sets.is_promo,
        }
      : undefined,
    collector_number: row.collector_number ?? undefined,
    collector_label: collectorLabel(row.collector_number, {
      signature,
      alternate_art: alternateArt,
    }),
    rarity: row.rarity ?? undefined,
    released_at: row.released_at ?? undefined,
    artist: row.artists?.name,
    artist_id: row.artist_id ?? undefined,
    // Upstream flavour text arrives with mangled entities and line breaks;
    // repairing on read means every consumer gets the same string.
    flavour_text: row.flavour_text ? repairFlavourText(row.flavour_text) : undefined,
    finishes: row.finishes ?? [],
    signature,
    alternate_art: alternateArt,
    overnumbered: Boolean(row.is_overnumbered),
    special_collection: Boolean(row.is_special_collection),
    image,
    image_orientation: row.image_orientation ?? undefined,
    image_alt_text: row.image_alt_text ?? undefined,
    prices: printingPrices(row),
    purchase_uris: {
      tcgplayer: row.tcgplayer_url ?? undefined,
      cardmarket: row.cardmarket_url ?? undefined,
    },
    external_ids: {
      riftcodex_id: row.riftcodex_id ?? undefined,
      riftbound_id: row.riftbound_id ?? undefined,
      tcgplayer_id: row.tcgplayer_id ?? undefined,
      cardmarket_id: row.cardmarket_id ?? undefined,
    },
    public_slug: row.public_slug,
    differs_from_oracle: row.printing_deltas != null,
    source: row.source ?? "riftcodex",
    updated_at: row.updated_at ?? undefined,
    ingested_at: row.ingested_at ?? undefined,
  };
}

/**
 * Rewrite every free-text leaf as an exact-name match.
 *
 * `fuzzy: false` means "exact name only". A `text` leaf renders to a prefix
 * tsquery, which is the fuzzy behaviour the caller is opting out of, so the
 * only honest way to honour the flag is to change the leaf. A name that
 * normalises to nothing can match nothing, so the leaf is dropped and the
 * surrounding AND/OR still holds.
 */
function exactNameOnly(ast: CardSearchAst): CardSearchAst {
  switch (ast.op) {
    case "text":
      return exactNameLeaf(ast.value) ?? { op: "exact_name", value: "" };
    case "and":
    case "or":
      return { ...ast, children: ast.children.map(exactNameOnly) };
    case "not":
      return { op: "not", child: exactNameOnly(ast.child) };
    default:
      return ast;
  }
}

/** Release order: set publication, then collector number, then id. */
export function comparePrintings(a: Printing, b: Printing): number {
  const at = a.set?.published_on ?? a.released_at;
  const bt = b.set?.published_on ?? b.released_at;
  // An unknown release date sorts last rather than first — a printing we know
  // nothing about is not the oldest one.
  const av = at ? Date.parse(at) : Number.POSITIVE_INFINITY;
  const bv = bt ? Date.parse(bt) : Number.POSITIVE_INFINITY;
  if (av !== bv) return av - bv;

  const an = Number.parseInt((a.collector_number ?? "").replace(/\D/g, ""), 10);
  const bn = Number.parseInt((b.collector_number ?? "").replace(/\D/g, ""), 10);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;

  return a.id.localeCompare(b.id);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class SupabaseCardProvider implements CardDataProvider {
  readonly sourceName = "supabase";

  private client: SupabaseClient | null = null;
  private lastRefresh = 0;
  private oracleCount = 0;
  private printingCount = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  private get db(): SupabaseClient {
    if (!this.client) this.client = getSupabaseClient();
    return this.client;
  }

  async warmup(): Promise<void> {
    logger.info("Supabase provider warming up", { url: process.env.SUPABASE_URL });
    await this.refresh();

    this.refreshTimer = setInterval(() => {
      this.refresh().catch((err) =>
        logger.error("Scheduled refresh failed", { error: String(err) }),
      );
    }, REFRESH_INTERVAL_MS);
    // Never hold a Bun/Node process open for a stats refresh.
    this.refreshTimer.unref?.();

    logger.info("Supabase provider ready", {
      oracles: this.oracleCount,
      printings: this.printingCount,
    });
  }

  async refresh(): Promise<void> {
    const [oracles, printings] = await Promise.all([
      this.db
        .from("oracles")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      this.db
        .from("printings")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
    ]);
    if (oracles.error) throw new Error(oracles.error.message);
    if (printings.error) throw new Error(printings.error.message);

    this.oracleCount = oracles.count ?? 0;
    this.printingCount = printings.count ?? 0;
    this.lastRefresh = Math.floor(Date.now() / 1000);
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getStats() {
    return {
      lastRefresh: this.lastRefresh,
      oracleCount: this.oracleCount,
      printingCount: this.printingCount,
    };
  }

  // ── Oracles ──────────────────────────────────────────────────────────────

  private async oracleBy(column: string, value: string): Promise<Oracle | null> {
    const { data, error } = await this.db
      .from("oracles")
      .select(ORACLE_SELECT)
      .eq(column, value)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(`getOracleBy${column} failed: ${error.message}`);
    if (!data) return null;
    const [oracle] = await this.attachPreferredPrintings([data as OracleRow]);
    return oracle ?? null;
  }

  getOracleById(id: string): Promise<Oracle | null> {
    return this.oracleBy("id", id);
  }

  getOracleByKey(oracleKey: string): Promise<Oracle | null> {
    return this.oracleBy("oracle_key", oracleKey);
  }

  getOracleBySlug(slug: string): Promise<Oracle | null> {
    return this.oracleBy("slug", slug.replace(/^\/+|\/+$/g, ""));
  }

  private async oracleRowsByIds(ids: string[]): Promise<OracleRow[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    const rows: OracleRow[] = [];
    for (const part of chunk(unique, ID_IN_CHUNK_SIZE)) {
      const { data, error } = await this.db
        .from("oracles")
        .select(ORACLE_SELECT)
        .in("id", part)
        .is("deleted_at", null);
      if (error) throw new Error(`getOraclesByIds failed: ${error.message}`);
      rows.push(...((data ?? []) as OracleRow[]));
    }
    return rows;
  }

  async getOraclesByIds(ids: string[]): Promise<Oracle[]> {
    const rows = await this.oracleRowsByIds(ids);
    const hydrated = await this.attachPreferredPrintings(rows);
    const byId = new Map(hydrated.map((o) => [o.id, o]));
    return ids.map((id) => byId.get(id)).filter((o): o is Oracle => Boolean(o));
  }

  async getPrintingsForOracle(oracleId: string): Promise<Printing[]> {
    const { data, error } = await this.db
      .from("printings")
      .select(PRINTING_SELECT)
      .eq("oracle_id", oracleId)
      .is("deleted_at", null);
    if (error) throw new Error(`getPrintingsForOracle failed: ${error.message}`);
    return ((data ?? []) as PrintingRow[])
      .map(printingRowToPrinting)
      .sort(comparePrintings);
  }

  async getOracleRelationships(oracleId: string) {
    // Edges are directed and stored once, so both ends have to be read.
    const [outgoing, incoming] = await Promise.all([
      this.db
        .from("oracle_relationships")
        .select("kind, to_oracle_id")
        .eq("from_oracle_id", oracleId),
      this.db
        .from("oracle_relationships")
        .select("kind, from_oracle_id")
        .eq("to_oracle_id", oracleId),
    ]);
    if (outgoing.error) throw new Error(outgoing.error.message);
    if (incoming.error) throw new Error(incoming.error.message);

    const out = (outgoing.data ?? []) as { kind: string; to_oracle_id: string }[];
    const inc = (incoming.data ?? []) as { kind: string; from_oracle_id: string }[];

    // `used_by` is exactly the reverse of `makes_token`. `character` and
    // `signature` read the same from either end, so both directions merge.
    const makesTokenIds = out
      .filter((e) => e.kind === "makes_token")
      .map((e) => e.to_oracle_id);
    const usedByIds = inc
      .filter((e) => e.kind === "makes_token")
      .map((e) => e.from_oracle_id);
    const characterIds = [
      ...out.filter((e) => e.kind === "character").map((e) => e.to_oracle_id),
      ...inc.filter((e) => e.kind === "character").map((e) => e.from_oracle_id),
    ];
    const signatureIds = [
      ...out.filter((e) => e.kind === "signature").map((e) => e.to_oracle_id),
      ...inc.filter((e) => e.kind === "signature").map((e) => e.from_oracle_id),
    ];

    const all = await this.getOraclesByIds([
      ...new Set([...makesTokenIds, ...usedByIds, ...characterIds, ...signatureIds]),
    ]);
    const byId = new Map(all.map((o) => [o.id, o]));
    const pick = (ids: string[]) =>
      [...new Set(ids)]
        .map((id) => byId.get(id))
        .filter((o): o is Oracle => Boolean(o))
        .sort((a, b) => a.name.localeCompare(b.name));

    return {
      makes_tokens: pick(makesTokenIds),
      used_by: pick(usedByIds),
      characters: pick(characterIds),
      signatures: pick(signatureIds),
    };
  }

  // ── Printings ────────────────────────────────────────────────────────────

  private async printingBy(column: string, value: string): Promise<Printing | null> {
    const { data, error } = await this.db
      .from("printings")
      .select(PRINTING_SELECT)
      .eq(column, value)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(`getPrintingBy${column} failed: ${error.message}`);
    return data ? printingRowToPrinting(data as PrintingRow) : null;
  }

  getPrintingById(id: string): Promise<Printing | null> {
    return this.printingBy("id", id);
  }

  getPrintingBySlug(slug: string): Promise<Printing | null> {
    const trimmed = slug.replace(/^\/+|\/+$/g, "");
    return trimmed ? this.printingBy("public_slug", trimmed) : Promise.resolve(null);
  }

  async getPrintingsByIds(ids: string[]): Promise<Printing[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];

    const rows: PrintingRow[] = [];
    for (const part of chunk(unique, ID_IN_CHUNK_SIZE)) {
      const { data, error } = await this.db
        .from("printings")
        .select(PRINTING_SELECT)
        .in("id", part)
        .is("deleted_at", null);
      if (error) throw new Error(`getPrintingsByIds failed: ${error.message}`);
      rows.push(...((data ?? []) as PrintingRow[]));
    }
    const byId = new Map(rows.map((r) => [r.id, printingRowToPrinting(r)]));
    return ids.map((id) => byId.get(id)).filter((p): p is Printing => Boolean(p));
  }

  async getPrintingsBySet(
    setCode: string,
    opts: { limit?: number } = {},
  ): Promise<Printing[]> {
    const { data: set, error: setError } = await this.db
      .from("sets")
      .select("id")
      .eq("set_code", setCode.toUpperCase())
      .is("deleted_at", null)
      .maybeSingle();
    if (setError) throw new Error(`getPrintingsBySet failed: ${setError.message}`);
    if (!set) return [];

    const { data, error } = await this.db
      .from("printings")
      .select(PRINTING_SELECT)
      .eq("set_id", (set as { id: string }).id)
      .is("deleted_at", null);
    if (error) throw new Error(`getPrintingsBySet failed: ${error.message}`);

    return ((data ?? []) as PrintingRow[])
      .map(printingRowToPrinting)
      .sort(comparePrintings)
      .slice(0, clamp(opts.limit ?? 1000, 1, 2000));
  }

  // ── Search ───────────────────────────────────────────────────────────────

  /**
   * The one search path. `search_printing_ids` renders the AST against
   * `resolved_printings` and optionally collapses to one row per oracle. We
   * hydrate the ids it returns and, when the query carried free text, re-rank
   * in TypeScript — relevance ordering is not something SQL should be asked
   * to reproduce.
   */
  private async searchIds(
    ast: CardSearchAst,
    opts: CardSearchOptions,
    collapse: boolean,
  ): Promise<{ ids: string[]; total: number }> {
    const limit = clamp(opts.limit ?? 10, 1, 100);
    const offset = Math.max(opts.offset ?? 0, 0);

    const { data, error } = await this.db.rpc("search_printing_ids", {
      p_ast: opts.fuzzy === false ? exactNameOnly(ast) : ast,
      p_set: opts.set ?? null,
      p_collector: opts.collector != null ? String(opts.collector) : null,
      // Over-fetch so TypeScript re-ranking has something to reorder before
      // the page is sliced.
      p_max_ids: clamp((offset + limit) * 5, 200, MAX_SEARCH_IDS),
      p_collapse: collapse,
    });
    if (error) throw new Error(`search failed: ${error.message}`);

    const payload = (data ?? { ids: [], total: 0 }) as { ids: string[]; total: number };
    return { ids: payload.ids ?? [], total: payload.total ?? 0 };
  }

  private rankByText(
    ast: CardSearchAst,
    printings: Printing[],
    names: Map<string, string>,
  ): Printing[] {
    const query = findTextLeafValue(ast);
    if (!query) return printings;

    const nameable: Nameable[] = printings.map((p) => ({
      id: p.id,
      name: names.get(p.id) ?? "",
      name_normalized: normalizeCardName(names.get(p.id) ?? ""),
    }));
    const order = new Map(
      rankIds(nameable, query, nameable.length).map((id, i) => [id, i] as const),
    );
    // Rows the ranker scored below its floor still matched the query, so they
    // are appended rather than dropped.
    return [...printings].sort(
      (a, b) =>
        (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  searchOracles(q: string, opts: CardSearchOptions = {}): Promise<OracleSearchResult> {
    const { ast } = parseCardSearchQuery(q);
    if (!ast) return Promise.resolve({ oracles: [], total: 0 });
    return this.searchOraclesByAst(ast, opts);
  }

  async searchOraclesByAst(
    ast: CardSearchAst,
    opts: CardSearchOptions = {},
  ): Promise<OracleSearchResult> {
    const limit = clamp(opts.limit ?? 10, 1, 100);
    const offset = Math.max(opts.offset ?? 0, 0);

    const { ids, total } = await this.searchIds(ast, opts, true);
    if (ids.length === 0) return { oracles: [], total };

    const printings = await this.getPrintingsByIds(ids);
    const rows = await this.oracleRowsByIds(printings.map((p) => p.oracle_id));
    const oracleById = new Map(rows.map((r) => [r.id, oracleRowToOracle(r)]));
    const names = new Map(
      printings.map((p) => [p.id, oracleById.get(p.oracle_id)?.name ?? ""]),
    );

    const page = this.rankByText(ast, printings, names).slice(offset, offset + limit);

    return {
      // The matching printing is the one embedded — a search for `is:special`
      // should show the showcase printing, not the card's default one.
      oracles: page.flatMap((printing): Oracle[] => {
        const oracle = oracleById.get(printing.oracle_id);
        return oracle ? [{ ...oracle, preferred_printing: printing }] : [];
      }),
      total,
    };
  }

  async searchPrintingsByAst(
    ast: CardSearchAst,
    opts: CardSearchOptions = {},
  ): Promise<PrintingSearchResult> {
    const limit = clamp(opts.limit ?? 10, 1, 100);
    const offset = Math.max(opts.offset ?? 0, 0);

    const { ids, total } = await this.searchIds(ast, opts, false);
    if (ids.length === 0) return { printings: [], total };

    const printings = await this.getPrintingsByIds(ids);
    const rows = await this.oracleRowsByIds(printings.map((p) => p.oracle_id));
    const nameById = new Map(rows.map((r) => [r.id, r.name]));
    const names = new Map(printings.map((p) => [p.id, nameById.get(p.oracle_id) ?? ""]));

    return {
      printings: this.rankByText(ast, printings, names).slice(offset, offset + limit),
      total,
    };
  }

  async browseOracles(opts: {
    limit: number;
    offset: number;
  }): Promise<OracleSearchResult> {
    const limit = clamp(opts.limit, 1, 100);
    const offset = Math.max(opts.offset, 0);

    const { data, error, count } = await this.db
      .from("oracles")
      .select(ORACLE_SELECT, { count: "exact" })
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`browseOracles failed: ${error.message}`);

    return {
      oracles: await this.attachPreferredPrintings((data ?? []) as OracleRow[]),
      total: count ?? 0,
    };
  }

  async getRandomOracle(): Promise<Oracle | null> {
    const { count, error } = await this.db
      .from("oracles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    if (error) throw new Error(`getRandomOracle failed: ${error.message}`);
    if (!count) return null;

    const offset = Math.floor(Math.random() * count);
    const { data, error: rowError } = await this.db
      .from("oracles")
      .select(ORACLE_SELECT)
      .is("deleted_at", null)
      .range(offset, offset)
      .maybeSingle();
    if (rowError) throw new Error(`getRandomOracle failed: ${rowError.message}`);
    if (!data) return null;

    const [oracle] = await this.attachPreferredPrintings([data as OracleRow]);
    return oracle ?? null;
  }

  /** One batched printing fetch for a page of oracle rows. */
  private async attachPreferredPrintings(rows: OracleRow[]): Promise<Oracle[]> {
    const oracles = rows.map(oracleRowToOracle);
    const ids = rows
      .map((r) => r.preferred_printing_id)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return oracles;

    const printings = await this.getPrintingsByIds(ids);
    const byOracle = new Map(printings.map((p) => [p.oracle_id, p]));
    return oracles.map((o) => ({ ...o, preferred_printing: byOracle.get(o.id) }));
  }

  // ── Resolution ───────────────────────────────────────────────────────────

  async resolveRequest(req: CardRequest): Promise<ResolvedCard> {
    const miss: ResolvedCard = {
      request: req,
      oracle: null,
      printing: null,
      matchType: "not-found",
    };

    let matchType: ResolvedCard["matchType"] = "exact";
    let oracle = await this.oracleBy("name_normalized", normalizeCardName(req.name)).catch(
      (err) => {
        logger.error("resolveRequest exact query failed", { error: String(err) });
        return null;
      },
    );

    if (!oracle) {
      // Fall back to the full search path so a near miss still resolves.
      const { ast } = parseCardSearchQuery(req.name);
      if (!ast) return miss;
      const result = await this.searchOraclesByAst(ast, { limit: 1 }).catch((err) => {
        logger.error("resolveRequest search failed", { error: String(err) });
        return { oracles: [], total: 0 };
      });
      oracle = result.oracles[0] ?? null;
      matchType = "fuzzy";
    }
    if (!oracle) return miss;

    const printings = await this.getPrintingsForOracle(oracle.id);
    const printing = pickRequestedPrinting(printings, req, oracle.preferred_printing);
    if (!printing) return miss;

    return { request: req, oracle: { ...oracle, printings }, printing, matchType };
  }

  // ── Sets, formats, rulings ───────────────────────────────────────────────

  async getSets() {
    const { data, error } = await this.db
      .from("sets")
      .select("set_code, set_name, card_count, is_promo, published_on")
      .is("deleted_at", null)
      .order("set_name");
    if (error) throw new Error(`getSets failed: ${error.message}`);

    return (
      (data ?? []) as {
        set_code: string;
        set_name: string;
        card_count: number | null;
        is_promo: boolean;
        published_on: string | null;
      }[]
    ).map((row) => ({
      setCode: row.set_code,
      setName: row.set_name,
      cardCount: row.card_count ?? 0,
      isPromo: row.is_promo,
      publishedOn: row.published_on,
    }));
  }

  async getFormats(opts: { includeInactive?: boolean } = {}): Promise<Format[]> {
    let query = this.db
      .from("formats")
      .select("id, code, name, sort_order, active")
      .order("sort_order")
      .order("name");
    if (!opts.includeInactive) query = query.eq("active", true);

    const { data, error } = await query;
    if (error) throw new Error(`getFormats failed: ${error.message}`);
    return ((data ?? []) as Omit<Format, "object">[]).map((row) => ({
      object: "format" as const,
      ...row,
    }));
  }

  async getLegalities(printingId: string): Promise<CardLegality[]> {
    const { data, error } = await this.db.rpc("legalities_for_printing", {
      p_printing_id: printingId,
    });
    if (error) throw new Error(`getLegalities failed: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      object: "card_legality" as const,
      format_id: String(row.format_id),
      format_code: String(row.format_code),
      format_name: String(row.name),
      status: row.status as CardLegality["status"],
      scope: row.scope as CardLegality["scope"],
    }));
  }

  async getRulings(printingId: string): Promise<CardRuling[]> {
    const { data, error } = await this.db.rpc("rulings_for_printing", {
      p_printing_id: printingId,
    });
    if (error) throw new Error(`getRulings failed: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      object: "card_ruling" as const,
      id: String(row.id),
      type: row.type as CardRuling["type"],
      text: String(row.text),
      dated: (row.dated as string) ?? undefined,
      source: (row.source as string) ?? undefined,
      scope: row.scope as CardRuling["scope"],
      created_at: (row.created_at as string) ?? undefined,
      updated_at: (row.updated_at as string) ?? undefined,
    }));
  }
}

/**
 * Pick the printing a `[[Name|SET-123]]` request asked for.
 *
 * Set then collector narrow the candidates; a filter that matches nothing is
 * ignored rather than emptying the result, so `[[Brush|XYZ]]` still resolves
 * the card. With no usable filter the caller gets the preferred printing.
 */
export function pickRequestedPrinting(
  printings: Printing[],
  req: CardRequest,
  preferred?: Printing,
): Printing | null {
  if (printings.length === 0) return null;

  let candidates = printings;
  let narrowed = false;

  if (req.set) {
    const wanted = req.set.toUpperCase();
    const inSet = candidates.filter((p) => p.set?.set_code?.toUpperCase() === wanted);
    if (inSet.length > 0) {
      candidates = inSet;
      narrowed = true;
    }
  }
  if (req.collector) {
    const wanted = String(req.collector).toLowerCase();
    const matching = candidates.filter(
      (p) => p.collector_number?.toLowerCase() === wanted,
    );
    if (matching.length > 0) {
      candidates = matching;
      narrowed = true;
    }
  }

  if (!narrowed && preferred) {
    const hit = candidates.find((p) => p.id === preferred.id);
    if (hit) return hit;
  }
  return candidates[0] ?? null;
}
