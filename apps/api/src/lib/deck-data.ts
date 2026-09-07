import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DECK_ZONES,
  LEGALITY_STATUSES,
  VIOLATION_SEVERITIES,
  type DeckZone,
  type FormatRules,
  type FormatZoneRule,
  type LegalityEntry,
  type LegalityMap,
  type LegalityStatus,
  type ViolationSeverity,
} from "@riftseer/types/deck";
import { printingImageUrls } from "@riftseer/types/card-image";
import type { PrintingImage } from "@riftseer/types";

// ─── Deck data access ─────────────────────────────────────────────────────────
//
// Every deck read and write the API performs, behind one interface, mirroring
// `admin-data.ts`. The routes hold the authorisation rules and nothing else;
// this module holds the queries and nothing else, so a route test can run the
// whole permission matrix against an in-memory stub.
//
// The client is the service-role one, so RLS is bypassed: the policies in the
// migration are defence in depth against a leaked anon key, and the real
// boundary is `apps/api/src/authz/deck-access.ts`.

export type DeckVisibility = "private" | "unlisted" | "public";
export type CollaboratorRole = "editor" | "viewer";
export type DeckRole = "owner" | CollaboratorRole;

export interface DeckRpcResult {
  ok: boolean;
  reason?: string;
  [key: string]: unknown;
}

export class DeckRepositoryError extends Error {
  constructor(
    message: string,
    readonly databaseCode?: string,
  ) {
    super(message);
    this.name = "DeckRepositoryError";
  }
}

export interface DeckRow {
  id: string;
  owner_id: string;
  format_id: string;
  name: string;
  description: string | null;
  primer: string | null;
  visibility: DeckVisibility;
  invite_code: string | null;
  invite_role: CollaboratorRole | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface FormatRow {
  id: string;
  code: string;
  name: string;
}

export interface ProfileStub {
  id: string;
  handle: string;
  username: string;
}

/**
 * The catalogue half of a deck row: everything display needs, plus the four
 * oracle fields `validateDeck` reads. Flattened here rather than nested so a
 * deck entry is directly a `DeckEntry`.
 */
export interface DeckCardBase {
  printing_id: string;
  oracle_id: string;
  name: string;
  name_normalized: string;
  card_type: string | null;
  supertype: string | null;
  is_token: boolean;
  domains: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  set_code: string | null;
  collector_number: string | null;
  rarity: string | null;
  public_slug: string | null;
  has_hosted_image: boolean;
  /**
   * Where this printing's art lives, derived at read time. Hosted printings
   * get the full variant set; unhosted ones fall back to the upstream source;
   * a printing with no art at all omits the field. On the payload so a grid of
   * sixty cards is one deck read, not sixty card-detail fetches.
   */
  image?: PrintingImage;
}

export interface DeckCardRow extends DeckCardBase {
  zone: DeckZone;
  quantity: number;
  is_champion: boolean;
}

export interface DeckCardChange {
  zone: DeckZone;
  printing_id: string;
  oracle_id?: string | null;
  quantity: number;
  is_champion?: boolean;
}

export interface NewDeck {
  owner_id: string;
  format_id: string;
  name: string;
  description?: string | null;
  primer?: string | null;
  visibility?: DeckVisibility;
}

export interface DeckPatch {
  name?: string;
  description?: string | null;
  primer?: string | null;
  format_id?: string;
  visibility?: DeckVisibility;
}

export interface DeckRevisionChange {
  zone: DeckZone;
  oracle_id: string;
  printing_id: string;
  qty_before: number;
  qty_after: number;
}

export interface DeckRevision {
  id: string;
  ordinal: number;
  author_id: string | null;
  format_id: string;
  created_at: string;
  changes: DeckRevisionChange[];
}

export interface DeckFolderRow {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface DeckCommentRow {
  id: string;
  deck_id: string;
  author_id: string | null;
  parent_id: string | null;
  depth: number;
  body: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface DeckCollaboratorRow {
  user_id: string;
  role: CollaboratorRole;
  added_via: "invite" | "link";
  created_at: string;
}

export interface DeckDataRepository {
  /** Asserts the `{ ok, reason }` envelope every deck RPC returns. */
  callRpc(name: string, args: Record<string, unknown>): Promise<DeckRpcResult>;

  getDeck(deckId: string): Promise<DeckRow | null>;
  getDeckByInviteCode(code: string): Promise<DeckRow | null>;
  /** Decks owned by `ownerId`, newest edit first. */
  listDecksOwnedBy(ownerId: string): Promise<DeckRow[]>;
  /** Decks `userId` was invited to, newest edit first. */
  listDecksSharedWith(userId: string): Promise<DeckRow[]>;
  createDeck(input: NewDeck): Promise<DeckRow>;
  updateDeck(deckId: string, patch: DeckPatch): Promise<DeckRow | null>;
  deleteDeck(deckId: string): Promise<void>;

  getDeckCards(deckId: string): Promise<DeckCardRow[]>;

  getFormat(formatId: string): Promise<FormatRow | null>;
  getFormatByCode(code: string): Promise<FormatRow | null>;
  getFormatRules(formatId: string): Promise<FormatRules>;
  /** Only rows for `formatId`; a deck is validated in exactly one format. */
  getLegalityMap(
    formatId: string,
    oracleIds: string[],
    printingIds: string[],
  ): Promise<LegalityMap>;

  /** `makes_token` edges out of the given oracles. Membership, not decoration. */
  getTokenEdges(
    oracleIds: string[],
  ): Promise<Array<{ from_oracle_id: string; to_oracle_id: string }>>;
  getTokenPrintingChoices(
    deckId: string,
  ): Promise<Array<{ oracle_id: string; printing_id: string }>>;
  /** Lazy cleanup of choices whose oracle is no longer a derived token. */
  pruneTokenPrintings(deckId: string, oracleIds: string[]): Promise<void>;
  getPreferredPrintings(
    oracleIds: string[],
  ): Promise<Array<{ oracle_id: string; printing_id: string }>>;
  getResolvedPrintings(printingIds: string[]): Promise<DeckCardBase[]>;
  /** Import resolution: every printing whose oracle carries one of these names. */
  findPrintingsByNames(normalizedNames: string[]): Promise<DeckCardBase[]>;

  listRevisions(deckId: string, limit: number): Promise<DeckRevision[]>;

  /** Manual tags for the deck's cards, keyed by oracle so edits never drop them. */
  getDeckCardTags(deckId: string): Promise<Array<{ oracle_id: string; tag: string }>>;
  /** Replace one oracle's manual tags wholesale. */
  setDeckCardTags(deckId: string, oracleId: string, tags: string[]): Promise<void>;

  getCollaborators(deckId: string): Promise<DeckCollaboratorRow[]>;
  getCollaboratorRole(deckId: string, userId: string): Promise<CollaboratorRole | null>;
  addCollaborator(
    deckId: string,
    userId: string,
    role: CollaboratorRole,
    addedVia: "invite" | "link",
  ): Promise<void>;
  removeCollaborator(deckId: string, userId: string): Promise<void>;

  /** Favorite counts for many decks at once; absent means zero. */
  getFavoriteCounts(deckIds: string[]): Promise<Map<string, number>>;
  /** Which of these decks `userId` has favorited. */
  getFavoritesFor(userId: string, deckIds: string[]): Promise<Set<string>>;
  addFavorite(deckId: string, userId: string): Promise<void>;
  removeFavorite(deckId: string, userId: string): Promise<void>;
  /** Decks `userId` favorited, newest favorite first. Unfiltered — the route prunes. */
  listFavoriteDecks(userId: string): Promise<DeckRow[]>;

  /** Flat, newest root first isn't decided here — just newest first, capped. */
  listComments(deckId: string, limit: number): Promise<DeckCommentRow[]>;
  getComment(commentId: string): Promise<DeckCommentRow | null>;
  insertComment(input: {
    deck_id: string;
    author_id: string;
    parent_id: string | null;
    depth: number;
    body: string;
  }): Promise<DeckCommentRow>;
  /** Tombstone: keeps the row so replies stay coherent. */
  softDeleteComment(commentId: string): Promise<void>;

  /** Like counts for many comments at once; absent means zero. */
  getCommentLikeCounts(commentIds: string[]): Promise<Map<string, number>>;
  /** Which of these comments `userId` has liked. */
  getCommentLikesFor(userId: string, commentIds: string[]): Promise<Set<string>>;
  addCommentLike(commentId: string, userId: string): Promise<void>;
  removeCommentLike(commentId: string, userId: string): Promise<void>;

  /** The owner's folders, newest first. */
  listFolders(ownerId: string): Promise<DeckFolderRow[]>;
  getFolder(folderId: string): Promise<DeckFolderRow | null>;
  createFolder(ownerId: string, name: string): Promise<DeckFolderRow>;
  renameFolder(folderId: string, name: string): Promise<DeckFolderRow | null>;
  deleteFolder(folderId: string): Promise<void>;
  /** deck ids per folder, for item counts and membership checks. */
  getFolderItems(folderIds: string[]): Promise<Map<string, string[]>>;
  addFolderItem(folderId: string, deckId: string): Promise<void>;
  removeFolderItem(folderId: string, deckId: string): Promise<void>;
  /** Decks filed in one folder, newest addition first. Unfiltered — the route prunes. */
  listFolderDecks(folderId: string): Promise<DeckRow[]>;

  getProfileByHandle(handle: string): Promise<ProfileStub | null>;
  getProfiles(ids: string[]): Promise<ProfileStub[]>;

  setInvite(deckId: string, code: string, role: CollaboratorRole): Promise<void>;
  clearInvite(deckId: string): Promise<void>;
}

// ─── Row mapping ──────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

const DECK_COLUMNS =
  "id, owner_id, format_id, name, description, primer, visibility, invite_code, invite_role, view_count, created_at, updated_at";

const CARD_COLUMNS =
  "printing_id, oracle_id, name, name_normalized, card_type, supertype, is_token, domains, energy, might, power, set_code, collector_number, rarity, public_slug, has_hosted_image";

/** Names per `in(...)` filter, so an import's lookup never overruns the URL. */
const NAME_LOOKUP_CHUNK = 100;

const DECK_ZONE_SET: ReadonlySet<string> = new Set(DECK_ZONES);
const LEGALITY_STATUS_SET: ReadonlySet<string> = new Set(LEGALITY_STATUSES);
const VIOLATION_SEVERITY_SET: ReadonlySet<string> = new Set(VIOLATION_SEVERITIES);

function toDeckRow(row: unknown): DeckRow | null {
  if (!isRecord(row) || typeof row.id !== "string") return null;
  return {
    id: row.id,
    owner_id: String(row.owner_id ?? ""),
    format_id: String(row.format_id ?? ""),
    name: String(row.name ?? ""),
    description: text(row.description),
    primer: text(row.primer),
    visibility: (text(row.visibility) ?? "private") as DeckVisibility,
    invite_code: text(row.invite_code),
    invite_role: text(row.invite_role) as CollaboratorRole | null,
    view_count: num(row.view_count) ?? 0,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function toCardBase(row: unknown): DeckCardBase | null {
  if (!isRecord(row) || typeof row.printing_id !== "string") return null;
  return {
    printing_id: row.printing_id,
    oracle_id: String(row.oracle_id ?? ""),
    name: String(row.name ?? ""),
    name_normalized: String(row.name_normalized ?? ""),
    card_type: text(row.card_type),
    supertype: text(row.supertype),
    is_token: row.is_token === true,
    domains: stringArray(row.domains),
    energy: num(row.energy),
    might: num(row.might),
    power: num(row.power),
    set_code: text(row.set_code),
    collector_number: text(row.collector_number),
    rarity: text(row.rarity),
    public_slug: text(row.public_slug),
    has_hosted_image: row.has_hosted_image === true,
  };
}

function toCommentRow(row: unknown): DeckCommentRow | null {
  if (!isRecord(row) || typeof row.id !== "string") return null;
  return {
    id: row.id,
    deck_id: String(row.deck_id ?? ""),
    author_id: text(row.author_id),
    parent_id: text(row.parent_id),
    depth: num(row.depth) ?? 0,
    body: text(row.body),
    created_at: String(row.created_at ?? ""),
    deleted_at: text(row.deleted_at),
  };
}

function toFolderRow(row: unknown): DeckFolderRow | null {
  if (!isRecord(row) || typeof row.id !== "string") return null;
  return {
    id: row.id,
    owner_id: String(row.owner_id ?? ""),
    name: String(row.name ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/**
 * A deleted printing leaves a deck row pointing at no catalogue row. The entry
 * is **kept** and stands in for the card, so the deck still loads and the copy
 * still counts; the name falls back to the printing id.
 */
function placeholderCard(printingId: string, oracleId: string): DeckCardBase {
  return {
    printing_id: printingId,
    oracle_id: oracleId,
    name: printingId,
    name_normalized: "",
    card_type: null,
    supertype: null,
    is_token: false,
    domains: [],
    energy: null,
    might: null,
    power: null,
    set_code: null,
    collector_number: null,
    rarity: null,
    public_slug: null,
    has_hosted_image: false,
  };
}

// ─── Supabase implementation ──────────────────────────────────────────────────

export interface DeckDataRepositoryOptions {
  /**
   * Base for hosted image URLs. A getter because Workers bindings only arrive
   * with the first request, after this factory has already run.
   */
  imageBaseUrl?: () => string;
}

export function createDeckDataRepository(
  client: SupabaseClient,
  options: DeckDataRepositoryOptions = {},
): DeckDataRepository {
  const imageBaseUrl = options.imageBaseUrl ?? (() => "https://img.riftseer.com");
  function fail(error: { message: string; code?: string }): never {
    throw new DeckRepositoryError(error.message, error.code);
  }

  /** PostgREST / Postgres when the relation has not been migrated yet. */
  function isMissingRelation(error: { message: string; code?: string }): boolean {
    return (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /does not exist|Could not find the table/i.test(error.message)
    );
  }

  async function selectRows(
    table: string,
    columns: string,
    apply: (query: any) => any,
  ): Promise<unknown[]> {
    const { data, error } = await apply(client.from(table).select(columns));
    if (error) fail(error);
    return Array.isArray(data) ? data : [];
  }

  // Hosted URLs are derived, never stored — `resolved_printings` records only
  // *whether* art is hosted, and the cache-busting suffix needs the source
  // hash, which lives on `printings`. One indexed IN-query alongside the
  // catalogue read; mirrors `printingRowToPrinting` in `@riftseer/core`.
  async function printingImages(printingIds: string[]): Promise<Map<string, PrintingImage>> {
    const rows = await selectRows(
      "printings",
      "id, image_source_hash, image_hosted_at, image_source_url",
      (q) => q.in("id", printingIds),
    );
    const images = new Map<string, PrintingImage>();
    for (const row of rows) {
      if (!isRecord(row) || typeof row.id !== "string") continue;
      if (row.image_hosted_at && typeof row.image_source_hash === "string") {
        images.set(row.id, printingImageUrls(imageBaseUrl(), row.id, row.image_source_hash));
      } else if (typeof row.image_source_url === "string" && row.image_source_url) {
        images.set(row.id, { original: row.image_source_url });
      }
    }
    return images;
  }

  // Standalone rather than a method reference: `getDeckCards` needs it, and a
  // destructured repository would lose `this`.
  async function resolvedPrintings(printingIds: string[]): Promise<DeckCardBase[]> {
    if (printingIds.length === 0) return [];
    const unique = [...new Set(printingIds)];
    const [rows, images] = await Promise.all([
      selectRows("resolved_printings", CARD_COLUMNS, (q) => q.in("printing_id", unique)),
      printingImages(unique),
    ]);
    return rows.flatMap((row) => {
      const card = toCardBase(row);
      if (!card) return [];
      const image = images.get(card.printing_id);
      return [image ? { ...card, image } : card];
    });
  }

  return {
    async callRpc(name, args) {
      const { data, error } = await client.rpc(name, args);
      if (error) fail(error);
      if (!isRecord(data) || typeof data.ok !== "boolean") {
        throw new DeckRepositoryError(
          `${name} returned an invalid response`,
          "INVALID_RPC_RESPONSE",
        );
      }
      const { ok, reason, ...rest } = data;
      return {
        ...rest,
        ok,
        ...(typeof reason === "string" ? { reason } : {}),
      };
    },

    async getDeck(deckId) {
      const { data, error } = await client
        .from("decks")
        .select(DECK_COLUMNS)
        .eq("id", deckId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") fail(error);
      return toDeckRow(data);
    },

    async getDeckByInviteCode(code) {
      const { data, error } = await client
        .from("decks")
        .select(DECK_COLUMNS)
        .eq("invite_code", code)
        .maybeSingle();
      if (error && error.code !== "PGRST116") fail(error);
      return toDeckRow(data);
    },

    async listDecksOwnedBy(ownerId) {
      const rows = await selectRows("decks", DECK_COLUMNS, (q) =>
        q.eq("owner_id", ownerId).order("updated_at", { ascending: false }),
      );
      return rows.map(toDeckRow).filter((r): r is DeckRow => r !== null);
    },

    async listDecksSharedWith(userId) {
      const links = await selectRows("deck_collaborators", "deck_id", (q) =>
        q.eq("user_id", userId),
      );
      const ids = links
        .map((row) => (isRecord(row) ? String(row.deck_id ?? "") : ""))
        .filter(Boolean);
      if (ids.length === 0) return [];
      const rows = await selectRows("decks", DECK_COLUMNS, (q) =>
        q.in("id", ids).order("updated_at", { ascending: false }),
      );
      return rows.map(toDeckRow).filter((r): r is DeckRow => r !== null);
    },

    async createDeck(input) {
      const { data, error } = await client
        .from("decks")
        .insert({
          owner_id: input.owner_id,
          format_id: input.format_id,
          name: input.name,
          description: input.description ?? null,
          primer: input.primer ?? null,
          visibility: input.visibility ?? "private",
        })
        .select(DECK_COLUMNS)
        .single();
      if (error) fail(error);
      const row = toDeckRow(data);
      if (!row) throw new DeckRepositoryError("Deck insert returned no row");
      return row;
    },

    async updateDeck(deckId, patch) {
      const { data, error } = await client
        .from("decks")
        .update(patch)
        .eq("id", deckId)
        .select(DECK_COLUMNS)
        .maybeSingle();
      if (error && error.code !== "PGRST116") fail(error);
      return toDeckRow(data);
    },

    async deleteDeck(deckId) {
      const { error } = await client.from("decks").delete().eq("id", deckId);
      if (error) fail(error);
    },

    async getDeckCards(deckId) {
      const rows = await selectRows(
        "deck_cards",
        "zone, printing_id, oracle_id, quantity, is_champion",
        (q) => q.eq("deck_id", deckId),
      );
      const printingIds = rows
        .map((row) => (isRecord(row) ? String(row.printing_id ?? "") : ""))
        .filter(Boolean);
      const catalogue = await resolvedPrintings(printingIds);
      const byId = new Map(catalogue.map((card) => [card.printing_id, card]));
      return rows.flatMap((row) => {
        if (!isRecord(row)) return [];
        const printingId = String(row.printing_id ?? "");
        const oracleId = String(row.oracle_id ?? "");
        const base = byId.get(printingId) ?? placeholderCard(printingId, oracleId);
        return [
          {
            ...base,
            oracle_id: oracleId || base.oracle_id,
            zone: String(row.zone ?? "main") as DeckZone,
            quantity: num(row.quantity) ?? 0,
            is_champion: row.is_champion === true,
          },
        ];
      });
    },

    async getFormat(formatId) {
      const { data, error } = await client
        .from("formats")
        .select("id, code, name")
        .eq("id", formatId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") fail(error);
      return isRecord(data)
        ? { id: String(data.id), code: String(data.code), name: String(data.name) }
        : null;
    },

    async getFormatByCode(code) {
      const { data, error } = await client
        .from("formats")
        .select("id, code, name")
        .eq("code", code)
        .maybeSingle();
      if (error && error.code !== "PGRST116") fail(error);
      return isRecord(data)
        ? { id: String(data.id), code: String(data.code), name: String(data.name) }
        : null;
    },

    async getFormatRules(formatId) {
      const [zoneRows, severityRows] = await Promise.all([
        selectRows("format_zone_rules", "zone, min_count, max_count, copy_limit", (q) =>
          q.eq("format_id", formatId),
        ),
        selectRows("format_legality_severities", "status, severity", (q) =>
          q.eq("format_id", formatId),
        ),
      ]);

      // Filtered rather than cast: an unrecognised zone or severity would reach
      // `validateDeck` and then the builder, which renders a violation by its
      // severity and has no label for one it has never heard of.
      const zones: FormatZoneRule[] = zoneRows.flatMap((row) => {
        if (!isRecord(row)) return [];
        const zone = String(row.zone ?? "");
        if (!DECK_ZONE_SET.has(zone)) return [];
        return [
          {
            zone: zone as DeckZone,
            min_count: num(row.min_count),
            max_count: num(row.max_count),
            copy_limit: num(row.copy_limit),
          },
        ];
      });

      const overrides: Partial<Record<LegalityStatus, ViolationSeverity>> = {};
      for (const row of severityRows) {
        if (!isRecord(row)) continue;
        const status = String(row.status ?? "");
        const severity = String(row.severity ?? "");
        if (!LEGALITY_STATUS_SET.has(status) || !VIOLATION_SEVERITY_SET.has(severity)) {
          continue;
        }
        overrides[status as LegalityStatus] = severity as ViolationSeverity;
      }

      return Object.keys(overrides).length > 0
        ? { zones, severity_overrides: overrides }
        : { zones };
    },

    async getLegalityMap(formatId, oracleIds, printingIds) {
      const map: LegalityMap = {};
      if (oracleIds.length > 0) {
        const rows = await selectRows("oracle_legalities", "oracle_id, status, note", (q) =>
          q.eq("format_id", formatId).in("oracle_id", oracleIds),
        );
        const oracles: Record<string, LegalityEntry> = {};
        for (const row of rows) {
          if (!isRecord(row)) continue;
          oracles[String(row.oracle_id)] = {
            status: String(row.status) as LegalityStatus,
            note: text(row.note),
          };
        }
        map.oracles = oracles;
      }
      if (printingIds.length > 0) {
        const rows = await selectRows("printing_legalities", "printing_id, status, note", (q) =>
          q.eq("format_id", formatId).in("printing_id", printingIds),
        );
        const printings: Record<string, LegalityEntry> = {};
        for (const row of rows) {
          if (!isRecord(row)) continue;
          printings[String(row.printing_id)] = {
            status: String(row.status) as LegalityStatus,
            note: text(row.note),
          };
        }
        map.printings = printings;
      }
      return map;
    },

    async getTokenEdges(oracleIds) {
      if (oracleIds.length === 0) return [];
      const rows = await selectRows("oracle_relationships", "from_oracle_id, to_oracle_id", (q) =>
        q.eq("kind", "makes_token").in("from_oracle_id", oracleIds),
      );
      return rows.flatMap((row) =>
        isRecord(row)
          ? [
              {
                from_oracle_id: String(row.from_oracle_id),
                to_oracle_id: String(row.to_oracle_id),
              },
            ]
          : [],
      );
    },

    async getTokenPrintingChoices(deckId) {
      const rows = await selectRows("deck_token_printings", "oracle_id, printing_id", (q) =>
        q.eq("deck_id", deckId),
      );
      return rows.flatMap((row) =>
        isRecord(row)
          ? [{ oracle_id: String(row.oracle_id), printing_id: String(row.printing_id) }]
          : [],
      );
    },

    async pruneTokenPrintings(deckId, oracleIds) {
      if (oracleIds.length === 0) return;
      const { error } = await client
        .from("deck_token_printings")
        .delete()
        .eq("deck_id", deckId)
        .in("oracle_id", oracleIds);
      if (error) fail(error);
    },

    async getDeckCardTags(deckId) {
      const rows = await selectRows("deck_card_tags", "oracle_id, tag", (q) =>
        q.eq("deck_id", deckId).eq("kind", "manual").order("tag"),
      );
      return rows.flatMap((row) =>
        isRecord(row) && typeof row.tag === "string"
          ? [{ oracle_id: String(row.oracle_id), tag: row.tag }]
          : [],
      );
    },

    async setDeckCardTags(deckId, oracleId, tags) {
      // Replace wholesale: the dialog edits the full list, and a diff would
      // only recreate what the PK already guarantees.
      const { error: deleteError } = await client
        .from("deck_card_tags")
        .delete()
        .eq("deck_id", deckId)
        .eq("oracle_id", oracleId)
        .eq("kind", "manual");
      if (deleteError) fail(deleteError);
      if (tags.length === 0) return;
      const { error } = await client
        .from("deck_card_tags")
        .insert(tags.map((tag) => ({ deck_id: deckId, oracle_id: oracleId, tag })));
      if (error) fail(error);
    },

    async getPreferredPrintings(oracleIds) {
      if (oracleIds.length === 0) return [];
      const rows = await selectRows("oracles", "id, preferred_printing_id", (q) =>
        q.in("id", oracleIds),
      );
      return rows.flatMap((row) =>
        isRecord(row) && typeof row.preferred_printing_id === "string"
          ? [{ oracle_id: String(row.id), printing_id: row.preferred_printing_id }]
          : [],
      );
    },

    getResolvedPrintings: resolvedPrintings,

    async findPrintingsByNames(normalizedNames) {
      if (normalizedNames.length === 0) return [];
      const unique = [...new Set(normalizedNames)];
      // PostgREST puts `in(...)` in the query string, so one request per name is
      // one URL segment. An import is bounded only by its 100 000-character
      // body, which is thousands of distinct names — enough to overrun the URL
      // limit and fail the whole import. Chunked, the request count grows and
      // nothing overflows.
      const batches: DeckCardBase[][] = [];
      for (let i = 0; i < unique.length; i += NAME_LOOKUP_CHUNK) {
        const rows = await selectRows("resolved_printings", CARD_COLUMNS, (q) =>
          q.in("name_normalized", unique.slice(i, i + NAME_LOOKUP_CHUNK)),
        );
        batches.push(
          rows.flatMap((row) => {
            const card = toCardBase(row);
            return card ? [card] : [];
          }),
        );
      }
      return batches.flat();
    },

    async listRevisions(deckId, limit) {
      const rows = await selectRows(
        "deck_revisions",
        "id, ordinal, author_id, format_id, created_at",
        (q) => q.eq("deck_id", deckId).order("ordinal", { ascending: false }).limit(limit),
      );
      const ids = rows.map((row) => (isRecord(row) ? String(row.id ?? "") : "")).filter(Boolean);
      const changeRows =
        ids.length === 0
          ? []
          : await selectRows(
              "deck_revision_changes",
              "revision_id, zone, oracle_id, printing_id, qty_before, qty_after",
              (q) => q.in("revision_id", ids),
            );
      const byRevision = new Map<string, DeckRevisionChange[]>();
      for (const row of changeRows) {
        if (!isRecord(row)) continue;
        const list = byRevision.get(String(row.revision_id)) ?? [];
        list.push({
          zone: String(row.zone) as DeckZone,
          oracle_id: String(row.oracle_id),
          printing_id: String(row.printing_id),
          qty_before: num(row.qty_before) ?? 0,
          qty_after: num(row.qty_after) ?? 0,
        });
        byRevision.set(String(row.revision_id), list);
      }
      return rows.flatMap((row) => {
        if (!isRecord(row)) return [];
        const id = String(row.id);
        return [
          {
            id,
            ordinal: num(row.ordinal) ?? 0,
            author_id: text(row.author_id),
            format_id: String(row.format_id ?? ""),
            created_at: String(row.created_at ?? ""),
            changes: byRevision.get(id) ?? [],
          },
        ];
      });
    },

    async getCollaborators(deckId) {
      const rows = await selectRows(
        "deck_collaborators",
        "user_id, role, added_via, created_at",
        (q) => q.eq("deck_id", deckId).order("created_at", { ascending: true }),
      );
      return rows.flatMap((row) =>
        isRecord(row)
          ? [
              {
                user_id: String(row.user_id),
                role: String(row.role) as CollaboratorRole,
                added_via: String(row.added_via) as "invite" | "link",
                created_at: String(row.created_at ?? ""),
              },
            ]
          : [],
      );
    },

    async getCollaboratorRole(deckId, userId) {
      const { data, error } = await client
        .from("deck_collaborators")
        .select("role")
        .eq("deck_id", deckId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") fail(error);
      return isRecord(data) ? (String(data.role) as CollaboratorRole) : null;
    },

    async addCollaborator(deckId, userId, role, addedVia) {
      const { error } = await client
        .from("deck_collaborators")
        .upsert(
          { deck_id: deckId, user_id: userId, role, added_via: addedVia },
          { onConflict: "deck_id,user_id" },
        );
      if (error) fail(error);
    },

    async removeCollaborator(deckId, userId) {
      const { error } = await client
        .from("deck_collaborators")
        .delete()
        .eq("deck_id", deckId)
        .eq("user_id", userId);
      if (error) fail(error);
    },

    async getFavoriteCounts(deckIds) {
      const counts = new Map<string, number>();
      if (deckIds.length === 0) return counts;
      // Row scan rather than GROUP BY: PostgREST has no aggregate here, and a
      // deck's favorites are bounded by its readers.
      const rows = await selectRows("deck_favorites", "deck_id", (q) => q.in("deck_id", deckIds));
      for (const row of rows) {
        if (!isRecord(row) || typeof row.deck_id !== "string") continue;
        counts.set(row.deck_id, (counts.get(row.deck_id) ?? 0) + 1);
      }
      return counts;
    },

    async getFavoritesFor(userId, deckIds) {
      if (deckIds.length === 0) return new Set();
      const rows = await selectRows("deck_favorites", "deck_id", (q) =>
        q.eq("user_id", userId).in("deck_id", deckIds),
      );
      return new Set(
        rows.flatMap((row) =>
          isRecord(row) && typeof row.deck_id === "string" ? [row.deck_id] : [],
        ),
      );
    },

    async addFavorite(deckId, userId) {
      const { error } = await client
        .from("deck_favorites")
        .upsert(
          { deck_id: deckId, user_id: userId },
          { onConflict: "deck_id,user_id", ignoreDuplicates: true },
        );
      if (error) fail(error);
    },

    async removeFavorite(deckId, userId) {
      const { error } = await client
        .from("deck_favorites")
        .delete()
        .eq("deck_id", deckId)
        .eq("user_id", userId);
      if (error) fail(error);
    },

    async listFavoriteDecks(userId) {
      const rows = await selectRows("deck_favorites", "deck_id, created_at", (q) =>
        q.eq("user_id", userId).order("created_at", { ascending: false }),
      );
      const ids = rows.flatMap((row) =>
        isRecord(row) && typeof row.deck_id === "string" ? [row.deck_id] : [],
      );
      if (ids.length === 0) return [];
      const deckRows = await selectRows("decks", DECK_COLUMNS, (q) => q.in("id", ids));
      const byId = new Map(
        deckRows.flatMap((row) => {
          const deck = toDeckRow(row);
          return deck ? [[deck.id, deck] as const] : [];
        }),
      );
      return ids.flatMap((id) => {
        const deck = byId.get(id);
        return deck ? [deck] : [];
      });
    },

    async listComments(deckId, limit) {
      const rows = await selectRows(
        "deck_comments",
        "id, deck_id, author_id, parent_id, depth, body, created_at, deleted_at",
        (q) => q.eq("deck_id", deckId).order("created_at", { ascending: false }).limit(limit),
      );
      return rows.flatMap((row) => {
        const comment = toCommentRow(row);
        return comment ? [comment] : [];
      });
    },

    async getComment(commentId) {
      const { data, error } = await client
        .from("deck_comments")
        .select("id, deck_id, author_id, parent_id, depth, body, created_at, deleted_at")
        .eq("id", commentId)
        .maybeSingle();
      if (error) fail(error);
      return toCommentRow(data);
    },

    async insertComment(input) {
      const { data, error } = await client
        .from("deck_comments")
        .insert(input)
        .select("id, deck_id, author_id, parent_id, depth, body, created_at, deleted_at")
        .single();
      if (error) fail(error);
      const comment = toCommentRow(data);
      if (!comment) throw new DeckRepositoryError("Comment insert returned no row");
      return comment;
    },

    async softDeleteComment(commentId) {
      const { error } = await client
        .from("deck_comments")
        .update({ deleted_at: new Date().toISOString(), body: null })
        .eq("id", commentId);
      if (error) fail(error);
    },

    async getCommentLikeCounts(commentIds) {
      const counts = new Map<string, number>();
      if (commentIds.length === 0) return counts;
      // PostgREST truncates a select at max_rows (1000 here), so a deck whose
      // comments hold more likes than that would silently under-count the
      // later ones. Page until a short page says the set is exhausted.
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await client
          .from("deck_comment_likes")
          .select("comment_id")
          .in("comment_id", commentIds)
          .order("comment_id")
          .range(offset, offset + pageSize - 1);
        if (error) {
          if (isMissingRelation(error)) return counts;
          fail(error);
        }
        const rows = data ?? [];
        for (const row of rows) {
          if (!isRecord(row) || typeof row.comment_id !== "string") continue;
          counts.set(row.comment_id, (counts.get(row.comment_id) ?? 0) + 1);
        }
        if (rows.length < pageSize) return counts;
      }
    },

    async getCommentLikesFor(userId, commentIds) {
      if (commentIds.length === 0) return new Set();
      const { data, error } = await client
        .from("deck_comment_likes")
        .select("comment_id")
        .eq("user_id", userId)
        .in("comment_id", commentIds);
      if (error) {
        if (isMissingRelation(error)) return new Set();
        fail(error);
      }
      return new Set(
        (data ?? []).flatMap((row) =>
          isRecord(row) && typeof row.comment_id === "string" ? [row.comment_id] : [],
        ),
      );
    },

    async addCommentLike(commentId, userId) {
      const { error } = await client
        .from("deck_comment_likes")
        .upsert(
          { comment_id: commentId, user_id: userId },
          { onConflict: "comment_id,user_id", ignoreDuplicates: true },
        );
      if (error) fail(error);
    },

    async removeCommentLike(commentId, userId) {
      const { error } = await client
        .from("deck_comment_likes")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", userId);
      if (error) fail(error);
    },

    async listFolders(ownerId) {
      const rows = await selectRows(
        "deck_folders",
        "id, owner_id, name, created_at, updated_at",
        (q) => q.eq("owner_id", ownerId).order("created_at", { ascending: false }),
      );
      return rows.flatMap((row) => {
        const folder = toFolderRow(row);
        return folder ? [folder] : [];
      });
    },

    async getFolder(folderId) {
      const { data, error } = await client
        .from("deck_folders")
        .select("id, owner_id, name, created_at, updated_at")
        .eq("id", folderId)
        .maybeSingle();
      if (error) fail(error);
      return toFolderRow(data);
    },

    async createFolder(ownerId, name) {
      const { data, error } = await client
        .from("deck_folders")
        .insert({ owner_id: ownerId, name })
        .select("id, owner_id, name, created_at, updated_at")
        .single();
      if (error) fail(error);
      const folder = toFolderRow(data);
      if (!folder) throw new DeckRepositoryError("Folder insert returned no row");
      return folder;
    },

    async renameFolder(folderId, name) {
      const { data, error } = await client
        .from("deck_folders")
        .update({ name })
        .eq("id", folderId)
        .select("id, owner_id, name, created_at, updated_at")
        .maybeSingle();
      if (error) fail(error);
      return toFolderRow(data);
    },

    async deleteFolder(folderId) {
      const { error } = await client.from("deck_folders").delete().eq("id", folderId);
      if (error) fail(error);
    },

    async getFolderItems(folderIds) {
      const items = new Map<string, string[]>();
      if (folderIds.length === 0) return items;
      const rows = await selectRows("deck_folder_items", "folder_id, deck_id, added_at", (q) =>
        q.in("folder_id", folderIds).order("added_at", { ascending: false }),
      );
      for (const row of rows) {
        if (!isRecord(row)) continue;
        const folderId = String(row.folder_id ?? "");
        const deckId = String(row.deck_id ?? "");
        if (!folderId || !deckId) continue;
        const list = items.get(folderId);
        if (list) list.push(deckId);
        else items.set(folderId, [deckId]);
      }
      return items;
    },

    async addFolderItem(folderId, deckId) {
      const { error } = await client
        .from("deck_folder_items")
        .upsert(
          { folder_id: folderId, deck_id: deckId },
          { onConflict: "folder_id,deck_id", ignoreDuplicates: true },
        );
      if (error) fail(error);
    },

    async removeFolderItem(folderId, deckId) {
      const { error } = await client
        .from("deck_folder_items")
        .delete()
        .eq("folder_id", folderId)
        .eq("deck_id", deckId);
      if (error) fail(error);
    },

    async listFolderDecks(folderId) {
      const rows = await selectRows("deck_folder_items", "deck_id, added_at", (q) =>
        q.eq("folder_id", folderId).order("added_at", { ascending: false }),
      );
      const ids = rows.flatMap((row) =>
        isRecord(row) && typeof row.deck_id === "string" ? [row.deck_id] : [],
      );
      if (ids.length === 0) return [];
      const deckRows = await selectRows("decks", DECK_COLUMNS, (q) => q.in("id", ids));
      const byId = new Map(
        deckRows.flatMap((row) => {
          const deck = toDeckRow(row);
          return deck ? [[deck.id, deck] as const] : [];
        }),
      );
      return ids.flatMap((id) => {
        const deck = byId.get(id);
        return deck ? [deck] : [];
      });
    },

    async getProfileByHandle(handle) {
      const { data, error } = await client
        .from("profiles")
        .select("id, handle, username")
        .eq("handle", handle)
        .maybeSingle();
      if (error && error.code !== "PGRST116") fail(error);
      return isRecord(data)
        ? {
            id: String(data.id),
            handle: String(data.handle ?? ""),
            username: String(data.username ?? ""),
          }
        : null;
    },

    async getProfiles(ids) {
      if (ids.length === 0) return [];
      const rows = await selectRows("profiles", "id, handle, username", (q) =>
        q.in("id", [...new Set(ids)]),
      );
      return rows.flatMap((row) =>
        isRecord(row)
          ? [
              {
                id: String(row.id),
                handle: String(row.handle ?? ""),
                username: String(row.username ?? ""),
              },
            ]
          : [],
      );
    },

    async setInvite(deckId, code, role) {
      const { error } = await client
        .from("decks")
        .update({ invite_code: code, invite_role: role })
        .eq("id", deckId);
      if (error) fail(error);
    },

    async clearInvite(deckId) {
      const { error } = await client
        .from("decks")
        .update({ invite_code: null, invite_role: null })
        .eq("id", deckId);
      if (error) fail(error);
    },
  };
}
