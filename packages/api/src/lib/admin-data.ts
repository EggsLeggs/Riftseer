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
  /** Null means the entry applies to every printing of the card. */
  card_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminCardRulings {
  card_id: string;
  oracle_key: string;
  entries: AdminCardRuling[];
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
      const oracleKey = await loadOracleKey(client, cardId);
      if (oracleKey === null) return null;

      const { data, error } = await client
        .from("card_rulings")
        .select("id, card_id, type, text, dated, source, created_at, updated_at")
        .eq("oracle_key", oracleKey)
        .order("dated", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) {
        throw new AdminRepositoryError(error.message, error.code);
      }

      return {
        card_id: cardId,
        oracle_key: oracleKey,
        // Entries scoped to a *sibling* printing are dropped: they are not
        // visible on this printing and are edited from that printing's page.
        entries: (data ?? [])
          .filter((row) => row.card_id === null || row.card_id === cardId)
          .map(parseCardRuling),
      };
    },
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
  return {
    id: String(row.id ?? ""),
    type: row.type === "note" ? "note" : "ruling",
    text: typeof row.text === "string" ? row.text : "",
    dated: typeof row.dated === "string" ? row.dated : null,
    source: typeof row.source === "string" ? row.source : null,
    card_id: typeof row.card_id === "string" ? row.card_id : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
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
