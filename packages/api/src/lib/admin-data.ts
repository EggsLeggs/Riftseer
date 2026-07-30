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

// ─── Reconciliation queue ─────────────────────────────────────────────────────

export type AdminReconciliationKind = "unmatched_product" | "field_diff";

export type AdminReconciliationStatus = "pending" | "confirmed" | "dismissed";

/** Only the fields ingest is allowed to propose; see `pipeline/reconcile.ts`. */
export type AdminReconciliationField = "collector_number" | "released_at";

export interface AdminReconciliationProduct {
  product_id: number;
  name: string;
  url: string;
  image_url: string | null;
  collector_number: string | null;
  group_id: number;
  set_code: string | null;
}

export interface AdminReconciliationPayload {
  product: AdminReconciliationProduct;
  field?: AdminReconciliationField;
  current_value?: string | null;
  proposed_value?: string | null;
  card_id?: string;
  card_name?: string;
}

export interface AdminReconciliationEntry {
  id: string;
  kind: AdminReconciliationKind;
  fingerprint: string;
  status: AdminReconciliationStatus;
  tcgplayer_payload: AdminReconciliationPayload;
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
  getTakenSlugs(excludeCardId?: string): Promise<Set<string>>;
  listAuditLog(query: AdminAuditQuery): Promise<AdminAuditPage>;
  listFormats(): Promise<AdminFormat[]>;
  /**
   * Returns null when the card does not exist, so callers can 404 rather than
   * render an empty legality/ruling table for a card id that never existed.
   */
  listCardLegalities(cardId: string): Promise<AdminCardLegalities | null>;
  listCardRulings(cardId: string): Promise<AdminCardRulings | null>;
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

    async getTakenSlugs(excludeCardId) {
      const taken = new Set<string>();
      const pageSize = 1000;

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await client
          .from("cards")
          .select("id, public_slug")
          .order("id")
          .range(from, from + pageSize - 1);
        if (error) {
          throw new AdminRepositoryError(error.message, error.code);
        }

        const rows = data ?? [];
        for (const row of rows) {
          if (
            row.id !== excludeCardId &&
            typeof row.public_slug === "string" &&
            row.public_slug
          ) {
            taken.add(row.public_slug);
          }
        }
        if (rows.length < pageSize) break;
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
      const [formats, legalities, overrides] = await Promise.all([
        client
          .from("formats")
          .select("id, code, name, sort_order, active")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        client.from("card_legalities").select("format_id"),
        client.from("card_legality_overrides").select("format_id"),
      ]);

      for (const result of [formats, legalities, overrides]) {
        if (result.error) {
          throw new AdminRepositoryError(result.error.message, result.error.code);
        }
      }

      // Counted client-side: there are a handful of formats, and PostgREST has
      // no grouped-count that also returns the zero-row formats we must show.
      const countByFormat = (rows: unknown[]): Map<string, number> => {
        const counts = new Map<string, number>();
        for (const row of rows) {
          if (!isRecord(row) || typeof row.format_id !== "string") continue;
          counts.set(row.format_id, (counts.get(row.format_id) ?? 0) + 1);
        }
        return counts;
      };
      const legalityCounts = countByFormat(legalities.data ?? []);
      const overrideCounts = countByFormat(overrides.data ?? []);

      return (formats.data ?? []).map((row) => ({
        id: String(row.id),
        code: String(row.code),
        name: String(row.name),
        sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
        active: row.active !== false,
        legality_count: legalityCounts.get(String(row.id)) ?? 0,
        override_count: overrideCounts.get(String(row.id)) ?? 0,
      }));
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

    async listReconciliation(query) {
      let request = client
        .from("reconciliation_queue")
        .select(
          "id, kind, fingerprint, status, tcgplayer_payload, proposed_card_id, note, resolved_by, resolved_at, created_at, last_seen_at",
          { count: "exact" },
        );

      if (query.status) request = request.eq("status", query.status);
      if (query.kind) request = request.eq("kind", query.kind);

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
          "id, kind, fingerprint, status, tcgplayer_payload, proposed_card_id, note, resolved_by, resolved_at, created_at, last_seen_at",
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

function parseReconciliationEntry(
  row: Record<string, unknown>,
): AdminReconciliationEntry {
  const payload = isRecord(row.tcgplayer_payload) ? row.tcgplayer_payload : {};
  const field =
    payload.field === "collector_number" || payload.field === "released_at"
      ? payload.field
      : undefined;

  return {
    id: String(row.id ?? ""),
    kind: row.kind === "field_diff" ? "field_diff" : "unmatched_product",
    fingerprint: typeof row.fingerprint === "string" ? row.fingerprint : "",
    status:
      row.status === "confirmed" || row.status === "dismissed"
        ? row.status
        : "pending",
    tcgplayer_payload: {
      product: parseReconciliationProduct(payload.product),
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

function parseAuditEntry(row: Record<string, unknown>): AdminAuditEntry {
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
