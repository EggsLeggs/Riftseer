import type { SupabaseClient } from "@supabase/supabase-js";
import type { SlugPrinting } from "@riftseer/types";

export interface AdminRpcResult {
  ok: boolean;
  reason?: string;
  [key: string]: unknown;
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
 * One format's legality for one printing. `scope` is what the editor needs that
 * the public payload does not carry: whether the status came from this
 * printing's own row, from the oracle, or from the default.
 */
export interface AdminPrintingLegalityEntry {
  format_id: string;
  format_code: string;
  format_name: string;
  status: AdminLegalityStatus;
  scope: "printing" | "oracle" | "default";
}

export interface AdminPrintingLegalities {
  printing_id: string;
  oracle_id: string;
  entries: AdminPrintingLegalityEntry[];
}

export interface AdminPrintingRuling {
  id: string;
  type: "ruling" | "note";
  text: string;
  dated: string | null;
  source: string | null;
  active: boolean;
  /** Which target kind put this entry on the printing being edited. */
  scope: "printing" | "oracle" | "rule";
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

export interface AdminPrintingRulings {
  printing_id: string;
  oracle_id: string;
  entries: AdminPrintingRuling[];
}

/**
 * Oracle → oracle edges. There is no printing scope: a relationship is a
 * property of the rules object, so there is no per-printing exception to
 * express.
 */
export type AdminRelationshipKind = "makes_token" | "character" | "signature";

export interface AdminRelationshipEdge {
  kind: AdminRelationshipKind;
  oracle_id: string;
  name: string;
  slug: string;
  source: "ingest" | "admin";
}

export interface AdminOracleRelationships {
  oracle_id: string;
  outgoing: AdminRelationshipEdge[];
  /** Edges pointing *at* this oracle — the reverse view, not separately stored. */
  incoming: AdminRelationshipEdge[];
}

// ─── Reconciliation queue ─────────────────────────────────────────────────────

export type AdminReconciliationKind =
  | "unmatched_product"
  | "field_diff"
  | "missing_printing"
  | "unmatched_oracle";

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
  printing_id?: string;
  oracle_id?: string;
  card_name?: string;
}

export interface AdminReconciliationEntry {
  id: string;
  kind: AdminReconciliationKind;
  source: AdminReconciliationSource;
  fingerprint: string;
  status: AdminReconciliationStatus;
  payload: AdminReconciliationPayload;
  /** Ingest's suggestions, or what an admin confirmed the entry against. */
  proposed_printing_id: string | null;
  proposed_oracle_id: string | null;
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
  oracle_id: string | null;
  printing_id: string | null;
  query: string | null;
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
  /** Substring match over ruling text. */
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

/** The admin source an upload writes onto a printing before the queue runs. */
export interface AdminPrintingImageSource {
  source_url: string;
  source_hash: string;
  alt_text?: string;
}

export interface AdminDataRepository {
  callRpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<AdminRpcResult>;
  /** Exactly the fields a printing slug is derived from. Null when unknown. */
  getSlugPrinting(printingId: string): Promise<SlugPrinting | null>;
  /** An oracle's display name — the name segment of a new printing's slug. */
  getOracleName(oracleId: string): Promise<string | null>;
  /** The oracle a printing belongs to — also the existence check for one. */
  getPrintingOracleId(printingId: string): Promise<string | null>;
  /**
   * Slugs that could collide with `baseSlug`. Slug generation only ever
   * proposes `<base>` or `<base>-<n>`, so the caller scopes the read to that
   * prefix instead of loading the whole catalogue.
   */
  getTakenPrintingSlugs(
    baseSlug: string,
    excludePrintingId?: string,
  ): Promise<Set<string>>;
  getTakenOracleSlugs(baseSlug: string): Promise<Set<string>>;
  /**
   * Point a printing at an admin-uploaded source and lock its image against the
   * next ingest. Returns false when the printing does not exist.
   */
  setPrintingImageSource(
    printingId: string,
    media: AdminPrintingImageSource,
    actorId: string,
  ): Promise<boolean>;
  listAuditLog(query: AdminAuditQuery): Promise<AdminAuditPage>;
  listFormats(): Promise<AdminFormat[]>;
  /**
   * Return null when the printing does not exist, so callers can 404 rather
   * than render an empty table for an id that never existed.
   */
  listPrintingLegalities(
    printingId: string,
  ): Promise<AdminPrintingLegalities | null>;
  listPrintingRulings(printingId: string): Promise<AdminPrintingRulings | null>;
  listOracleRelationships(
    oracleId: string,
  ): Promise<AdminOracleRelationships | null>;
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

export function createAdminDataRepository(
  client: SupabaseClient,
): AdminDataRepository {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new AdminRepositoryError(error.message, error.code);
    return data;
  };

  return {
    async callRpc(name, args) {
      const data = await rpc(name, args);
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

    async getSlugPrinting(printingId) {
      // The projection, not `printings`: a slug needs the resolved name, which
      // lives on the oracle and can be overridden by a printing delta.
      const { data, error } = await client
        .from("resolved_printings")
        .select("printing_id, name, set_code, collector_number, is_alternate_art, is_signature")
        .eq("printing_id", printingId)
        .maybeSingle();
      if (error) throw new AdminRepositoryError(error.message, error.code);
      if (!isRecord(data) || typeof data.name !== "string") return null;
      return {
        id: printingId,
        name: data.name,
        setCode: typeof data.set_code === "string" ? data.set_code : undefined,
        collectorNumber:
          typeof data.collector_number === "string"
            ? data.collector_number
            : undefined,
        alternateArt: data.is_alternate_art === true,
        signature: data.is_signature === true,
      };
    },

    async getOracleName(oracleId) {
      const { data, error } = await client
        .from("oracles")
        .select("name")
        .eq("id", oracleId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new AdminRepositoryError(error.message, error.code);
      return isRecord(data) && typeof data.name === "string" ? data.name : null;
    },

    async getPrintingOracleId(printingId) {
      const { data, error } = await client
        .from("printings")
        .select("oracle_id")
        .eq("id", printingId)
        .maybeSingle();
      if (error) throw new AdminRepositoryError(error.message, error.code);
      return isRecord(data) && typeof data.oracle_id === "string"
        ? data.oracle_id
        : null;
    },

    async getTakenPrintingSlugs(baseSlug, excludePrintingId) {
      // Prefix match rather than equality: the candidates are `<base>` and
      // `<base>-<n>`. It can over-match (`.../card` also returns `.../cardio`),
      // which is harmless — such rows never equal a proposed candidate — while
      // under-matching is impossible, so no collision can slip through.
      let query = client
        .from("printings")
        .select("public_slug")
        .like("public_slug", `${baseSlug}%`);
      if (excludePrintingId) query = query.neq("id", excludePrintingId);

      const { data, error } = await query;
      if (error) throw new AdminRepositoryError(error.message, error.code);

      const taken = new Set<string>();
      for (const row of data ?? []) {
        if (typeof row.public_slug === "string" && row.public_slug) {
          taken.add(row.public_slug);
        }
      }
      return taken;
    },

    async getTakenOracleSlugs(baseSlug) {
      const { data, error } = await client
        .from("oracles")
        .select("slug")
        .like("slug", `${baseSlug}%`);
      if (error) throw new AdminRepositoryError(error.message, error.code);

      const taken = new Set<string>();
      for (const row of data ?? []) {
        if (typeof row.slug === "string" && row.slug) taken.add(row.slug);
      }
      return taken;
    },

    async setPrintingImageSource(printingId, media, actorId) {
      const existing = await client
        .from("printings")
        .select("locked_fields")
        .eq("id", printingId)
        .maybeSingle();
      if (existing.error) {
        throw new AdminRepositoryError(existing.error.message, existing.error.code);
      }
      if (!isRecord(existing.data)) return false;

      // An admin upload is a deliberate choice, so it claims the image the same
      // way any other admin edit claims a field.
      const locked = new Set(
        Array.isArray(existing.data.locked_fields)
          ? existing.data.locked_fields.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
      );
      locked.add("image");

      const { error } = await client
        .from("printings")
        .update({
          image_source_url: media.source_url,
          image_source_hash: media.source_hash,
          image_source_provider: "admin",
          // The variants for the previous source no longer describe this
          // printing; the queue consumer republishes once it has built them.
          image_hosted_at: null,
          ...(media.alt_text === undefined
            ? {}
            : { image_alt_text: media.alt_text }),
          locked_fields: [...locked].sort(),
        })
        .eq("id", printingId);
      if (error) throw new AdminRepositoryError(error.message, error.code);

      const logged = await client.from("admin_audit_log").insert({
        actor_id: actorId,
        action: "printing.image",
        target_type: "printing",
        target_id: printingId,
        detail: { source_hash: media.source_hash },
      });
      if (logged.error) {
        throw new AdminRepositoryError(logged.error.message, logged.error.code);
      }
      return true;
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

      if (error) throw new AdminRepositoryError(error.message, error.code);

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
        if (error) throw new AdminRepositoryError(error.message, error.code);
        return count ?? 0;
      };

      return await Promise.all(
        (formats.data ?? []).map(async (row) => {
          const id = String(row.id);
          const [legalityCount, overrideCount] = await Promise.all([
            countFor("oracle_legalities", id),
            countFor("printing_legalities", id),
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

    async listPrintingLegalities(printingId) {
      // `legalities_for_printing` cross-joins the printing, so a missing one
      // returns an empty array indistinguishable from "no active formats".
      const oracleId = await this.getPrintingOracleId(printingId);
      if (!oracleId) return null;

      const data = await rpc("legalities_for_printing", {
        p_printing_id: printingId,
      });
      return {
        printing_id: printingId,
        oracle_id: oracleId,
        entries: Array.isArray(data)
          ? data.filter(isRecord).map(parseLegalityEntry)
          : [],
      };
    },

    async listPrintingRulings(printingId) {
      const oracleId = await this.getPrintingOracleId(printingId);
      if (!oracleId) return null;

      const data = await rpc("admin_printing_rulings", {
        p_printing_id: printingId,
      });
      return {
        printing_id: printingId,
        oracle_id: oracleId,
        entries: Array.isArray(data)
          ? data.filter(isRecord).map(parsePrintingRuling)
          : [],
      };
    },

    async listOracleRelationships(oracleId) {
      const data = await rpc("admin_list_oracle_relationships", {
        p_oracle_id: oracleId,
      });
      if (!isRecord(data)) return null;
      return {
        oracle_id: String(data.oracle_id ?? oracleId),
        outgoing: parseEdges(data.outgoing, "to_oracle_id"),
        incoming: parseEdges(data.incoming, "from_oracle_id"),
      };
    },

    async listReconciliation(query) {
      let request = client
        .from("reconciliation_queue")
        .select(RECONCILIATION_COLUMNS, { count: "exact" });

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
        .select(RECONCILIATION_COLUMNS)
        .eq("id", entryId)
        .maybeSingle();
      if (error) throw new AdminRepositoryError(error.message, error.code);
      return isRecord(data) ? parseReconciliationEntry(data) : null;
    },

    async listRulings(query) {
      const data = await rpc("admin_list_rulings", {
        p_query: query.query ?? null,
        p_kind: query.kind ?? null,
        p_limit: query.limit,
        p_offset: query.offset,
      });
      const payload = isRecord(data) ? data : {};
      return {
        total: typeof payload.total === "number" ? payload.total : 0,
        rulings: Array.isArray(payload.rulings)
          ? payload.rulings.filter(isRecord).map(parseRuling)
          : [],
      };
    },

    async previewRule(ast, limit) {
      const data = await rpc("ruling_rule_preview", {
        p_ast: ast,
        p_limit: limit,
      });
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

const LEGALITY_STATUSES = new Set<string>(["legal", "not_legal", "banned"]);

function parseLegalityEntry(
  row: Record<string, unknown>,
): AdminPrintingLegalityEntry {
  const status =
    typeof row.status === "string" && LEGALITY_STATUSES.has(row.status)
      ? (row.status as AdminLegalityStatus)
      : "legal";
  return {
    format_id: String(row.format_id ?? ""),
    format_code: String(row.format_code ?? ""),
    // `legalities_for_printing` names the column `name`, not `format_name`.
    format_name: typeof row.name === "string" ? row.name : "",
    status,
    scope:
      row.scope === "printing" || row.scope === "oracle" ? row.scope : "default",
  };
}

function parsePrintingRuling(row: Record<string, unknown>): AdminPrintingRuling {
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
    // A rule-matched entry is shared by definition, whatever the count says.
    shared: row.shared === true || scope === "rule",
    target_count: typeof row.target_count === "number" ? row.target_count : 1,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

const RELATIONSHIP_KINDS = new Set<string>([
  "makes_token",
  "character",
  "signature",
]);

function parseEdges(value: unknown, idKey: string): AdminRelationshipEdge[] {
  if (!Array.isArray(value)) return [];
  const edges: AdminRelationshipEdge[] = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    if (typeof row.kind !== "string" || !RELATIONSHIP_KINDS.has(row.kind)) continue;
    const oracleId = row[idKey];
    if (typeof oracleId !== "string" || !oracleId) continue;
    edges.push({
      kind: row.kind as AdminRelationshipKind,
      oracle_id: oracleId,
      name: typeof row.name === "string" ? row.name : "",
      slug: typeof row.slug === "string" ? row.slug : "",
      source: row.source === "admin" ? "admin" : "ingest",
    });
  }
  return edges;
}

function parseRulingTarget(row: Record<string, unknown>): AdminRulingTarget {
  const kind =
    row.kind === "printing" || row.kind === "query" ? row.kind : "oracle";
  return {
    id: String(row.id ?? ""),
    kind,
    oracle_id: typeof row.oracle_id === "string" ? row.oracle_id : null,
    printing_id: typeof row.printing_id === "string" ? row.printing_id : null,
    query: typeof row.query === "string" ? row.query : null,
    match_count: typeof row.match_count === "number" ? row.match_count : null,
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

const RECONCILIATION_COLUMNS =
  "id, kind, source, fingerprint, status, payload, proposed_printing_id, proposed_oracle_id, note, resolved_by, resolved_at, created_at, last_seen_at";

const RECONCILIATION_STATUSES = [
  "pending",
  "confirmed",
  "dismissed",
] as const satisfies readonly AdminReconciliationStatus[];

const RECONCILIATION_KINDS = new Set<string>([
  "unmatched_product",
  "field_diff",
  "missing_printing",
  "unmatched_oracle",
]);

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
      typeof row.kind === "string" && RECONCILIATION_KINDS.has(row.kind)
        ? (row.kind as AdminReconciliationKind)
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
      ...(typeof payload.printing_id === "string"
        ? { printing_id: payload.printing_id }
        : {}),
      ...(typeof payload.oracle_id === "string"
        ? { oracle_id: payload.oracle_id }
        : {}),
      ...(typeof payload.card_name === "string"
        ? { card_name: payload.card_name }
        : {}),
    },
    proposed_printing_id:
      typeof row.proposed_printing_id === "string"
        ? row.proposed_printing_id
        : null,
    proposed_oracle_id:
      typeof row.proposed_oracle_id === "string" ? row.proposed_oracle_id : null,
    note: typeof row.note === "string" ? row.note : null,
    resolved_by: typeof row.resolved_by === "string" ? row.resolved_by : null,
    resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    last_seen_at: typeof row.last_seen_at === "string" ? row.last_seen_at : "",
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
