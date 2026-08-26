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

// ─── Deck data access ─────────────────────────────────────────────────────────
//
// Every deck read and write the API performs, behind one interface, mirroring
// `admin-data.ts`. The routes hold the authorisation rules and nothing else;
// this module holds the queries and nothing else, so a route test can run the
// whole permission matrix against an in-memory stub.
//
// The client is the service-role one, so RLS is bypassed: the policies in the
// migration are defence in depth against a leaked anon key, and the real
// boundary is `packages/api/src/routes/decks.ts`.

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

  getCollaborators(deckId: string): Promise<DeckCollaboratorRow[]>;
  getCollaboratorRole(
    deckId: string,
    userId: string,
  ): Promise<CollaboratorRole | null>;
  addCollaborator(
    deckId: string,
    userId: string,
    role: CollaboratorRole,
    addedVia: "invite" | "link",
  ): Promise<void>;
  removeCollaborator(deckId: string, userId: string): Promise<void>;

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
  "id, owner_id, format_id, name, description, primer, visibility, invite_code, invite_role, created_at, updated_at";

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

export function createDeckDataRepository(
  client: SupabaseClient,
): DeckDataRepository {
  function fail(error: { message: string; code?: string }): never {
    throw new DeckRepositoryError(error.message, error.code);
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

  // Standalone rather than a method reference: `getDeckCards` needs it, and a
  // destructured repository would lose `this`.
  async function resolvedPrintings(printingIds: string[]): Promise<DeckCardBase[]> {
    if (printingIds.length === 0) return [];
    const unique = [...new Set(printingIds)];
    const rows = await selectRows("resolved_printings", CARD_COLUMNS, (q) =>
      q.in("printing_id", unique),
    );
    return rows.flatMap((row) => {
      const card = toCardBase(row);
      return card ? [card] : [];
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
        const rows = await selectRows(
          "printing_legalities",
          "printing_id, status, note",
          (q) => q.eq("format_id", formatId).in("printing_id", printingIds),
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
      const rows = await selectRows(
        "oracle_relationships",
        "from_oracle_id, to_oracle_id",
        (q) => q.eq("kind", "makes_token").in("from_oracle_id", oracleIds),
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
      const ids = rows
        .map((row) => (isRecord(row) ? String(row.id ?? "") : ""))
        .filter(Boolean);
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
