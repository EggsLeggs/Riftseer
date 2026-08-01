import type { SupabaseClient } from "@supabase/supabase-js";
import { oracleKeyForName } from "@riftseer/types/oracle";

export interface AdminRpcResult {
  ok: boolean;
  reason?: string;
  [key: string]: unknown;
}

export interface AdminSlugCard {
  id: string;
  name: string;
  name_normalized: string;
  collector_number?: string;
  set?: {
    set_code: string;
    set_name: string;
  };
  metadata?: {
    alternate_art?: boolean;
    signature?: boolean;
  };
}

export interface AdminAuditEntry {
  id: number;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface AdminAuditQuery {
  limit: number;
  offset: number;
  action?: string;
  targetType?: string;
  targetId?: string;
  actorId?: string;
}

export interface AdminAuditPage {
  entries: AdminAuditEntry[];
  /** Total matching rows, so the UI can page without re-counting client-side. */
  total: number;
}

export type AdminLegalityStatus = "legal" | "not_legal" | "banned";

/**
 * A format as the admin sees it: including retired formats, and with the number
 * of legality rows that a delete would cascade away, so the UI can warn first.
 */
export interface AdminFormat {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  active: boolean;
  legality_count: number;
  override_count: number;
}

/**
 * One format's legality for one printing, with both layers exposed separately.
 * The public payload only carries the resolved status; the editor needs to know
 * whether it came from the shared card row or this printing's override so the
 * "apply to all printings" toggle can be shown in the right state.
 */
export interface AdminCardLegalityEntry {
  format_id: string;
  format_code: string;
  format_name: string;
  format_active: boolean;
  oracle_status: AdminLegalityStatus | null;
  printing_status: AdminLegalityStatus | null;
  effective_status: AdminLegalityStatus;
}

export interface AdminCardLegalities {
  card_id: string;
  oracle_key: string;
  entries: AdminCardLegalityEntry[];
}

export interface AdminCardRuling {
  id: string;
  type: "ruling" | "note";
  text: string;
  dated: string | null;
  source: string | null;
  active: boolean;
  /** Which target kind put this entry on the card being edited. */
  scope: "printing" | "oracle" | "rule";
  /** True when the entry is shared by every printing of this card. */
  all_printings: boolean;
  /**
   * True when the ruling has several targets or any rule target. The panel must
   * show those read-only: retargeting or deleting one here would silently
   * affect other cards, so they are edited from `/admin/rulings` instead.
   */
  shared: boolean;
  target_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminCardRulings {
  card_id: string;
  oracle_key: string;
  entries: AdminCardRuling[];
}

export type AdminRelationshipKind =
  | "all_parts"
  | "used_by"
  | "related_champions"
  | "related_legends"
  | "related_signatures"
  | "related_printings";

export type AdminRelationshipAction = "add" | "remove";

/** One durable relationship override entry (oracle- or printing-scoped). */
export interface AdminRelationshipEntry {
  kind: AdminRelationshipKind;
  related_card_id: string;
  action: AdminRelationshipAction;
}

/**
 * Layered relationship overrides for the editor. Live arrays live on the card
 * payload; this is only the durable add/remove rows that survive ingest.
 */
export interface AdminCardRelationships {
  card_id: string;
  oracle_key: string;
  oracle_entries: AdminRelationshipEntry[];
  printing_entries: AdminRelationshipEntry[];
}

// ─── Reconciliation queue ─────────────────────────────────────────────────────

export type AdminReconciliationKind =
  | "unmatched_product"
  | "field_diff"
  | "missing_card";

/** Which upstream raised the entry. Decides which half of the payload is set. */
export type AdminReconciliationSource = "tcgplayer" | "gallery";

export type AdminReconciliationStatus = "pending" | "confirmed" | "dismissed";

/** Only the fields ingest is allowed to propose; see `pipeline/reconcile.ts`. */
export type AdminReconciliationField =
  | "collector_number"
  | "released_at"
  | "rarity"
  | "type"
  | "energy"
  | "might"
  | "power"
  | "text";

export interface AdminReconciliationProduct {
  product_id: number;
  name: string;
  url: string;
  image_url: string | null;
  collector_number: string | null;
  group_id: number;
  set_code: string | null;
}

/** A printing the official gallery lists, as filed for review. */
export interface AdminReconciliationGalleryCard {
  riftbound_id: string;
  name: string;
  public_code: string | null;
  set_code: string | null;
  set_name: string | null;
  collector_number: string | null;
  rarity: string | null;
  type: string | null;
  image_url: string | null;
  energy: number | null;
  might: number | null;
  power: number | null;
  text: string | null;
  might_bonus: number | null;
  equipment: string | null;
  signature: boolean;
  special_collection: boolean;
  alternate_art: boolean;
  is_token: boolean;
}

export interface AdminReconciliationPayload {
  /** Set on every `source: "tcgplayer"` entry. */
  product?: AdminReconciliationProduct;
  /** Set on every `source: "gallery"` entry. */
  gallery?: AdminReconciliationGalleryCard;
  field?: AdminReconciliationField;
  current_value?: string | null;
  proposed_value?: string | null;
  card_id?: string;
  card_name?: string;
}

export interface AdminReconciliationEntry {
  id: string;
  kind: AdminReconciliationKind;
  source: AdminReconciliationSource;
  fingerprint: string;
  status: AdminReconciliationStatus;
  payload: AdminReconciliationPayload;
  /** Ingest's suggestion, or the card an admin confirmed the entry against. */
  proposed_card_id: string | null;
  note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  last_seen_at: string;
}

export interface AdminReconciliationQuery {
  limit: number;
  offset: number;
  status?: AdminReconciliationStatus;
  kind?: AdminReconciliationKind;
  source?: AdminReconciliationSource;
}

export interface AdminReconciliationPage {
  entries: AdminReconciliationEntry[];
  /** Total rows matching the filter, so the UI can page without re-counting. */
  total: number;
  /** Rows per status regardless of the filter, for the review tabs. */
  counts: Record<AdminReconciliationStatus, number>;
}

// ─── Rulings tab ──────────────────────────────────────────────────────────────

/**
 * One thing a ruling applies to. `oracle` and `printing` name a card directly;
 * `query` stores an admin-written search string plus the AST it parsed to, and
 * is re-evaluated after every ingest so it keeps covering new releases.
 */
export type AdminRulingTargetKind = "oracle" | "printing" | "query";

export interface AdminRulingTarget {
  id: string;
  kind: AdminRulingTargetKind;
  oracle_key: string | null;
  card_id: string | null;
  /** Resolved for display; null when the printing has since been pruned. */
  card_name: string | null;
  query: string | null;
  ast: unknown;
  /** Materialised match count — query targets only, null for the others. */
  match_count: number | null;
}

export interface AdminRuling {
  id: string;
  type: "ruling" | "note";
  text: string;
  dated: string | null;
  source: string | null;
  active: boolean;
  targets: AdminRulingTarget[];
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminRulingsPage {
  rulings: AdminRuling[];
  total: number;
}

export interface AdminRulingsQuery {
  limit: number;
  offset: number;
  /** Substring match over ruling text and source. */
  query?: string;
  /** Narrow to rulings carrying at least one target of this kind. */
  kind?: AdminRulingTargetKind;
}

/** A bounded sample of what a rule query currently matches. */
export interface AdminRulePreview {
  total: number;
  sample: Array<{
    id: string;
    name: string;
    set_code: string | null;
    collector_number: string | null;
    public_slug: string | null;
  }>;
}

export interface AdminDataRepository {
  callRpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<AdminRpcResult>;
  getSlugCard(cardId: string): Promise<AdminSlugCard | null>;
  /**
   * Slugs that could collide with `baseSlug`. `generatePublicSlug` only ever
   * proposes `<base>` or `<base>-<n>`, so the caller scopes the read to that
   * prefix instead of loading the whole catalogue.
   */
  getTakenSlugs(
    baseSlug: string,
    excludeCardId?: string,
  ): Promise<Set<string>>;
  listAuditLog(query: AdminAuditQuery): Promise<AdminAuditPage>;
  listFormats(): Promise<AdminFormat[]>;
  /**
   * Returns null when the card does not exist, so callers can 404 rather than
   * render an empty legality/ruling table for a card id that never existed.
   */
  listCardLegalities(cardId: string): Promise<AdminCardLegalities | null>;
  listCardRulings(cardId: string): Promise<AdminCardRulings | null>;
  listCardRelationships(
    cardId: string,
  ): Promise<AdminCardRelationships | null>;
  listReconciliation(
    query: AdminReconciliationQuery,
  ): Promise<AdminReconciliationPage>;
  /**
   * Read one entry so the API can build the confirm patch. Returns null for an
   * unknown id, which the route reports as a 404 without calling the RPC.
   */
  getReconciliationEntry(
    entryId: string,
  ): Promise<AdminReconciliationEntry | null>;
  listRulings(query: AdminRulingsQuery): Promise<AdminRulingsPage>;
  /** Evaluate a rule AST without storing it, for the editor's match readout. */
  previewRule(ast: unknown, limit: number): Promise<AdminRulePreview>;
}

export class AdminRepositoryError extends Error {
  constructor(
    message: string,
    readonly databaseCode?: string,
  ) {
    super(message);
    this.name = "AdminRepositoryError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSlugCard(value: unknown): AdminSlugCard | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.name_normalized !== "string"
  ) {
    return null;
  }

  const joinedSet = Array.isArray(value.sets) ? value.sets[0] : value.sets;
  const set =
    isRecord(joinedSet) &&
    typeof joinedSet.set_code === "string" &&
    typeof joinedSet.set_name === "string"
      ? {
          set_code: joinedSet.set_code,
          set_name: joinedSet.set_name,
        }
      : undefined;
  const metadata = isRecord(value.metadata)
    ? {
        alternate_art:
          typeof value.metadata.alternate_art === "boolean"
            ? value.metadata.alternate_art
            : undefined,
        signature:
          typeof value.metadata.signature === "boolean"
            ? value.metadata.signature
            : undefined,
      }
    : undefined;

  return {
    id: value.id,
    name: value.name,
    name_normalized: value.name_normalized,
    collector_number:
      typeof value.collector_number === "string"
        ? value.collector_number
        : undefined,
    set,
    metadata,
  };
}

export function createAdminDataRepository(
  client: SupabaseClient,
): AdminDataRepository {
  return {
    async callRpc(name, args) {
      const { data, error } = await client.rpc(name, args);
      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }
      if (!isRecord(data) || typeof data.ok !== "boolean") {
        throw new AdminRepositoryError(
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

    async getSlugCard(cardId) {
      const { data, error } = await client
        .from("cards")
        .select(
          "id, name, name_normalized, collector_number, metadata, sets:set_id(set_code, set_name)",
        )
        .eq("id", cardId)
        .maybeSingle();
      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }
      return data ? parseSlugCard(data) : null;
    },

    async getTakenSlugs(baseSlug, excludeCardId) {
      // Prefix match rather than equality: the candidates are `<base>` and
      // `<base>-<n>`. It can over-match (`.../card` also returns `.../cardio`),
      // which is harmless — such rows never equal a proposed candidate — while
      // under-matching is impossible, so no collision can slip through.
      let query = client
        .from("cards")
        .select("public_slug")
        .like("public_slug", `${baseSlug}%`);
      if (excludeCardId) {
        query = query.neq("id", excludeCardId);
      }

      const { data, error } = await query;
      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }

      const taken = new Set<string>();
      for (const row of data ?? []) {
        if (typeof row.public_slug === "string" && row.public_slug) {
          taken.add(row.public_slug);
        }
      }
      return taken;
    },

    async listAuditLog(query) {
      let request = client
        .from("admin_audit_log")
        .select("id, actor_id, action, target_type, target_id, detail, created_at", {
          count: "exact",
        });

      if (query.action) request = request.eq("action", query.action);
      if (query.targetType) request = request.eq("target_type", query.targetType);
      if (query.targetId) request = request.eq("target_id", query.targetId);
      if (query.actorId) request = request.eq("actor_id", query.actorId);

      const { data, error, count } = await request
        // `id` breaks ties: bigserial is monotonic, and mutations inside one
        // transaction share a `created_at`, which would make paging unstable.
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(query.offset, query.offset + query.limit - 1);

      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }

      return {
        entries: (data ?? []).map(parseAuditEntry),
        total: count ?? 0,
      };
    },

    async listFormats() {
      const formats = await client
        .from("formats")
        .select("id, code, name, sort_order, active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (formats.error) {
        throw new AdminRepositoryError(
          formats.error.message,
          formats.error.code,
        );
      }

      // Selecting the rows and counting them here would silently stop at
      // PostgREST's 1000-row cap and under-report the delete warning. `head`
      // requests return the exact count and no rows, and there are only a
      // handful of formats to ask about.
      const countFor = async (table: string, formatId: string) => {
        const { count, error } = await client
          .from(table)
          .select("format_id", { count: "exact", head: true })
          .eq("format_id", formatId);
        if (error) {
          throw new AdminRepositoryError(error.message, error.code);
        }
        return count ?? 0;
      };

      return await Promise.all(
        (formats.data ?? []).map(async (row) => {
          const id = String(row.id);
          const [legalityCount, overrideCount] = await Promise.all([
            countFor("card_legalities", id),
            countFor("card_legality_overrides", id),
          ]);
          return {
            id,
            code: String(row.code),
            name: String(row.name),
            sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
            active: row.active !== false,
            legality_count: legalityCount,
            override_count: overrideCount,
          };
        }),
      );
    },

    async listCardLegalities(cardId) {
      const oracleKey = await loadOracleKey(client, cardId);
      if (oracleKey === null) return null;

      const [formats, oracleRows, overrideRows] = await Promise.all([
        client
          .from("formats")
          .select("id, code, name, sort_order, active")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        client
          .from("card_legalities")
          .select("format_id, status")
          .eq("oracle_key", oracleKey),
        client
          .from("card_legality_overrides")
          .select("format_id, status")
          .eq("card_id", cardId),
      ]);

      for (const result of [formats, oracleRows, overrideRows]) {
        if (result.error) {
          throw new AdminRepositoryError(result.error.message, result.error.code);
        }
      }

      const byOracle = indexStatuses(oracleRows.data ?? []);
      const byPrinting = indexStatuses(overrideRows.data ?? []);

      return {
        card_id: cardId,
        oracle_key: oracleKey,
        entries: (formats.data ?? []).map((row) => {
          const formatId = String(row.id);
          const oracleStatus = byOracle.get(formatId) ?? null;
          const printingStatus = byPrinting.get(formatId) ?? null;
          return {
            format_id: formatId,
            format_code: String(row.code),
            format_name: String(row.name),
            format_active: row.active !== false,
            oracle_status: oracleStatus,
            printing_status: printingStatus,
            effective_status:
              printingStatus ?? oracleStatus ?? ("legal" as AdminLegalityStatus),
          };
        }),
      };
    },

    async listCardRulings(cardId) {
      // An RPC rather than a table read: entries now arrive through three target
      // kinds (this printing, the oracle group, or a rule match), and each one
      // needs its scope and shared-ness resolved before the panel can decide
      // which controls to offer. Entries scoped to a *sibling* printing are
      // absent by construction — nothing in the RPC matches them.
      const { data, error } = await client.rpc("admin_card_rulings", {
        p_card_id: cardId,
      });
      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }
      if (!data) return null;

      const payload = data as {
        card_id?: string;
        oracle_key?: string;
        entries?: Array<Record<string, unknown>>;
      };
      return {
        card_id: String(payload.card_id ?? cardId),
        oracle_key: String(payload.oracle_key ?? ""),
        entries: (payload.entries ?? []).map(parseCardRuling),
      };
    },

    async listCardRelationships(cardId) {
      const { data, error } = await client.rpc("admin_list_card_relationships", {
        p_card_id: cardId,
      });
      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }
      if (!data) return null;

      const payload = data as {
        card_id?: string;
        oracle_key?: string;
        oracle_entries?: Array<Record<string, unknown>>;
        printing_entries?: Array<Record<string, unknown>>;
      };
      return {
        card_id: String(payload.card_id ?? cardId),
        oracle_key: String(payload.oracle_key ?? ""),
        oracle_entries: (payload.oracle_entries ?? [])
          .map(parseRelationshipEntry)
          .filter((entry): entry is AdminRelationshipEntry => entry !== null),
        printing_entries: (payload.printing_entries ?? [])
          .map(parseRelationshipEntry)
          .filter((entry): entry is AdminRelationshipEntry => entry !== null),
      };
    },

    async listReconciliation(query) {
      let request = client
        .from("reconciliation_queue")
        .select(
          "id, kind, source, fingerprint, status, payload, proposed_card_id, note, resolved_by, resolved_at, created_at, last_seen_at",
          { count: "exact" },
        );

      if (query.status) request = request.eq("status", query.status);
      if (query.kind) request = request.eq("kind", query.kind);
      if (query.source) request = request.eq("source", query.source);

      const [page, ...statusCounts] = await Promise.all([
        request
          // Newest first, with the uuid primary key breaking ties so a batch of
          // entries written in one ingest pages stably.
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(query.offset, query.offset + query.limit - 1),
        ...RECONCILIATION_STATUSES.map((status) =>
          client
            .from("reconciliation_queue")
            .select("id", { count: "exact", head: true })
            .eq("status", status),
        ),
      ]);

      for (const result of [page, ...statusCounts]) {
        if (result.error) {
          throw new AdminRepositoryError(result.error.message, result.error.code);
        }
      }

      const counts = {} as Record<AdminReconciliationStatus, number>;
      RECONCILIATION_STATUSES.forEach((status, index) => {
        counts[status] = statusCounts[index].count ?? 0;
      });

      return {
        entries: (page.data ?? []).map(parseReconciliationEntry),
        total: page.count ?? 0,
        counts,
      };
    },

    async getReconciliationEntry(entryId) {
      const { data, error } = await client
        .from("reconciliation_queue")
        .select(
          "id, kind, source, fingerprint, status, payload, proposed_card_id, note, resolved_by, resolved_at, created_at, last_seen_at",
        )
        .eq("id", entryId)
        .maybeSingle();
      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }
      return isRecord(data) ? parseReconciliationEntry(data) : null;
    },

    async listRulings(query) {
      const { data, error } = await client.rpc("admin_list_rulings", {
        p_query: query.query ?? null,
        p_kind: query.kind ?? null,
        p_limit: query.limit,
        p_offset: query.offset,
      });
      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }
      const payload = isRecord(data) ? data : {};
      return {
        total: typeof payload.total === "number" ? payload.total : 0,
        rulings: Array.isArray(payload.rulings)
          ? payload.rulings.filter(isRecord).map(parseRuling)
          : [],
      };
    },

    async previewRule(ast, limit) {
      const { data, error } = await client.rpc("card_ruling_rule_preview", {
        p_ast: ast,
        p_limit: limit,
      });
      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }
      const payload = isRecord(data) ? data : {};
      return {
        total: typeof payload.total === "number" ? payload.total : 0,
        sample: Array.isArray(payload.sample)
          ? payload.sample.filter(isRecord).map((row) => ({
              id: String(row.id ?? ""),
              name: typeof row.name === "string" ? row.name : "",
              set_code: typeof row.set_code === "string" ? row.set_code : null,
              collector_number:
                typeof row.collector_number === "string"
                  ? row.collector_number
                  : null,
              public_slug:
                typeof row.public_slug === "string" ? row.public_slug : null,
            }))
          : [],
      };
    },
  };
}

function parseRulingTarget(row: Record<string, unknown>): AdminRulingTarget {
  const kind =
    row.kind === "printing" || row.kind === "query" ? row.kind : "oracle";
  return {
    id: String(row.id ?? ""),
    kind,
    oracle_key: typeof row.oracle_key === "string" ? row.oracle_key : null,
    card_id: typeof row.card_id === "string" ? row.card_id : null,
    card_name: typeof row.card_name === "string" ? row.card_name : null,
    query: typeof row.query === "string" ? row.query : null,
    ast: row.ast ?? null,
    match_count:
      typeof row.match_count === "number" ? row.match_count : null,
  };
}

function parseRuling(row: Record<string, unknown>): AdminRuling {
  return {
    id: String(row.id ?? ""),
    type: row.type === "note" ? "note" : "ruling",
    text: typeof row.text === "string" ? row.text : "",
    dated: typeof row.dated === "string" ? row.dated : null,
    source: typeof row.source === "string" ? row.source : null,
    active: row.active !== false,
    targets: Array.isArray(row.targets)
      ? row.targets.filter(isRecord).map(parseRulingTarget)
      : [],
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

const RECONCILIATION_STATUSES = [
  "pending",
  "confirmed",
  "dismissed",
] as const satisfies readonly AdminReconciliationStatus[];

function parseReconciliationProduct(
  value: unknown,
): AdminReconciliationProduct {
  const row = isRecord(value) ? value : {};
  return {
    product_id: Number(row.product_id ?? 0),
    name: typeof row.name === "string" ? row.name : "",
    url: typeof row.url === "string" ? row.url : "",
    image_url: typeof row.image_url === "string" ? row.image_url : null,
    collector_number:
      typeof row.collector_number === "string" ? row.collector_number : null,
    group_id: Number(row.group_id ?? 0),
    set_code: typeof row.set_code === "string" ? row.set_code : null,
  };
}

const RECONCILIATION_FIELDS = new Set<string>([
  "collector_number",
  "released_at",
  "rarity",
  "type",
  "energy",
  "might",
  "power",
  "text",
]);

function parseReconciliationGalleryCard(
  value: unknown,
): AdminReconciliationGalleryCard {
  const row = isRecord(value) ? value : {};
  const str = (key: string): string | null =>
    typeof row[key] === "string" ? (row[key] as string) : null;
  const num = (key: string): number | null =>
    typeof row[key] === "number" && Number.isFinite(row[key] as number)
      ? (row[key] as number)
      : null;
  const bool = (key: string): boolean => row[key] === true;
  return {
    riftbound_id: str("riftbound_id") ?? "",
    name: str("name") ?? "",
    public_code: str("public_code"),
    set_code: str("set_code"),
    set_name: str("set_name"),
    collector_number: str("collector_number"),
    rarity: str("rarity"),
    type: str("type"),
    image_url: str("image_url"),
    energy: num("energy"),
    might: num("might"),
    power: num("power"),
    text: str("text"),
    might_bonus: num("might_bonus"),
    equipment: str("equipment"),
    signature: bool("signature"),
    special_collection: bool("special_collection"),
    alternate_art: bool("alternate_art"),
    is_token: bool("is_token"),
  };
}

function parseReconciliationEntry(
  row: Record<string, unknown>,
): AdminReconciliationEntry {
  const payload = isRecord(row.payload) ? row.payload : {};
  const field =
    typeof payload.field === "string" && RECONCILIATION_FIELDS.has(payload.field)
      ? (payload.field as AdminReconciliationField)
      : undefined;
  const source = row.source === "gallery" ? "gallery" : "tcgplayer";

  return {
    id: String(row.id ?? ""),
    kind:
      row.kind === "field_diff" || row.kind === "missing_card"
        ? row.kind
        : "unmatched_product",
    source,
    fingerprint: typeof row.fingerprint === "string" ? row.fingerprint : "",
    status:
      row.status === "confirmed" || row.status === "dismissed"
        ? row.status
        : "pending",
    payload: {
      // Only the half its source populates, and only when the row actually
      // carries it: a gallery entry has no TCGPlayer product, and synthesising
      // an empty one would render as a broken link.
      ...(source === "tcgplayer" && isRecord(payload.product)
        ? { product: parseReconciliationProduct(payload.product) }
        : {}),
      ...(source === "gallery" && isRecord(payload.gallery)
        ? { gallery: parseReconciliationGalleryCard(payload.gallery) }
        : {}),
      ...(field ? { field } : {}),
      current_value:
        typeof payload.current_value === "string" ? payload.current_value : null,
      proposed_value:
        typeof payload.proposed_value === "string"
          ? payload.proposed_value
          : null,
      ...(typeof payload.card_id === "string"
        ? { card_id: payload.card_id }
        : {}),
      ...(typeof payload.card_name === "string"
        ? { card_name: payload.card_name }
        : {}),
    },
    proposed_card_id:
      typeof row.proposed_card_id === "string" ? row.proposed_card_id : null,
    note: typeof row.note === "string" ? row.note : null,
    resolved_by: typeof row.resolved_by === "string" ? row.resolved_by : null,
    resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    last_seen_at: typeof row.last_seen_at === "string" ? row.last_seen_at : "",
  };
}

/**
 * The oracle key for a live card, mirroring the SQL `admin__card_oracle_key`
 * fallback so a row that predates the column still resolves its group.
 */
async function loadOracleKey(
  client: SupabaseClient,
  cardId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("cards")
    .select("name, oracle_key")
    .eq("id", cardId)
    .maybeSingle();
  if (error) {
    throw new AdminRepositoryError(error.message, error.code);
  }
  if (!isRecord(data)) return null;
  if (typeof data.oracle_key === "string" && data.oracle_key) {
    return data.oracle_key;
  }
  return typeof data.name === "string" ? oracleKeyForName(data.name) : null;
}

function indexStatuses(
  rows: unknown[],
): Map<string, AdminLegalityStatus> {
  const byFormat = new Map<string, AdminLegalityStatus>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    if (typeof row.format_id !== "string") continue;
    if (
      row.status === "legal" ||
      row.status === "not_legal" ||
      row.status === "banned"
    ) {
      byFormat.set(row.format_id, row.status);
    }
  }
  return byFormat;
}

function parseCardRuling(row: Record<string, unknown>): AdminCardRuling {
  const scope =
    row.scope === "printing" || row.scope === "rule" ? row.scope : "oracle";
  return {
    id: String(row.id ?? ""),
    type: row.type === "note" ? "note" : "ruling",
    text: typeof row.text === "string" ? row.text : "",
    dated: typeof row.dated === "string" ? row.dated : null,
    source: typeof row.source === "string" ? row.source : null,
    active: row.active !== false,
    scope,
    all_printings: row.all_printings === true,
    // A rule-matched entry is shared by definition, whatever the count says.
    shared: row.shared === true || scope === "rule",
    target_count:
      typeof row.target_count === "number" ? row.target_count : 1,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

const RELATIONSHIP_KINDS = new Set<AdminRelationshipKind>([
  "all_parts",
  "used_by",
  "related_champions",
  "related_legends",
  "related_signatures",
  "related_printings",
]);

function parseRelationshipEntry(
  row: Record<string, unknown>,
): AdminRelationshipEntry | null {
  if (
    typeof row.kind !== "string" ||
    !RELATIONSHIP_KINDS.has(row.kind as AdminRelationshipKind)
  ) {
    return null;
  }
  if (typeof row.related_card_id !== "string" || !row.related_card_id) {
    return null;
  }
  if (row.action !== "add" && row.action !== "remove") return null;
  return {
    kind: row.kind as AdminRelationshipKind,
    related_card_id: row.related_card_id,
    action: row.action,
  };
}

function parseAuditEntry(row: Record<string, unknown>): AdminAuditEntry {
  // The defaults keep one bad row from breaking the whole page, but silently
  // coercing an identifier to "" would hide a genuine schema or write bug, so
  // the malformed fields are named in the log first.
  const malformed = (
    [
      ["id", typeof row.id === "number" || Number.isFinite(Number(row.id))],
      ["actor_id", typeof row.actor_id === "string"],
      ["action", typeof row.action === "string"],
      ["target_type", typeof row.target_type === "string"],
      ["target_id", typeof row.target_id === "string" || row.target_id == null],
      ["detail", isRecord(row.detail)],
      ["created_at", typeof row.created_at === "string"],
    ] as const
  )
    .filter(([, ok]) => !ok)
    .map(([field]) => field);

  if (malformed.length > 0) {
    console.warn(
      JSON.stringify({
        message: "malformed admin audit row",
        fields: malformed,
        id: row.id ?? null,
      }),
    );
  }

  return {
    id: typeof row.id === "number" ? row.id : Number(row.id ?? 0),
    actor_id: typeof row.actor_id === "string" ? row.actor_id : "",
    action: typeof row.action === "string" ? row.action : "",
    target_type: typeof row.target_type === "string" ? row.target_type : "",
    target_id: typeof row.target_id === "string" ? row.target_id : null,
    detail: isRecord(row.detail) ? row.detail : {},
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}
