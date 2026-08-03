import "server-only";
import { env } from "@/lib/env";
import type {
  AdminAuditFilters,
  AdminAuditPage,
  AdminOracleDefinition,
  AdminOracleMutationResult,
  AdminOraclePatch,
  AdminOracleRelationships,
  AdminPrintingDefinition,
  AdminPrintingDelta,
  AdminPrintingDeltaRead,
  AdminPrintingListFilters,
  AdminPrintingListPage,
  AdminStats,
  AdminPrintingLegalities,
  AdminPrintingMutationResult,
  AdminPrintingPatch,
  AdminPrintingRulings,
  AdminFormatDeleteResult,
  AdminFormatInput,
  AdminFormatListResult,
  AdminFormatMutationResult,
  AdminFormatPatch,
  AdminImageMutationResult,
  AdminLegalityMutationResult,
  AdminLegalityStatusInput,
  AdminRelationshipEntry,
  AdminReorderResult,
  AdminResult,
  AdminReviewFilters,
  AdminReviewMutationResult,
  AdminReviewPage,
  AdminRuling,
  AdminRulingCreateInput,
  AdminRulingRecordPatch,
  AdminRulingsPage,
  AdminRulingsQuery,
  AdminRulePreview,
  AdminSetDefinition,
  AdminSetMutationResult,
  AdminSetPatch,
  AdminSlugMutationResult,
} from "./types";

const API_BASE = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
const ADMIN_BASE = `${API_BASE}/api/v1/admin`;

/** Mutations are small; a bounded timeout keeps a hung API from wedging a form. */
const MUTATION_TIMEOUT_MS = 15_000;
/** Image uploads carry up to 20 MB, so they get a longer ceiling. */
const UPLOAD_TIMEOUT_MS = 60_000;

interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  accessToken: string;
  body?: unknown;
  formData?: FormData;
  timeoutMs?: number;
}

async function request<T>({
  method,
  path,
  accessToken,
  body,
  formData,
  timeoutMs = MUTATION_TIMEOUT_MS,
}: RequestOptions): Promise<AdminResult<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  // Let fetch set the multipart boundary itself — an explicit Content-Type here
  // would produce a body the API cannot parse.
  if (formData === undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${ADMIN_BASE}${path}`, {
      method,
      headers,
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return {
        ok: false,
        error: "The request timed out. Please try again.",
        code: "TIMEOUT",
      };
    }
    return {
      ok: false,
      error: "Couldn't reach the Riftseer API.",
      code: "NETWORK_ERROR",
    };
  }

  const payload = (await res.json().catch(() => null)) as
    | (Partial<T> & { error?: string; code?: string })
    | null;

  if (!res.ok) {
    return {
      ok: false,
      error: payload?.error ?? `Request failed (${res.status})`,
      code: payload?.code ?? "REQUEST_FAILED",
      status: res.status,
    };
  }

  // A 2xx with an empty or unparseable body would otherwise hand callers a
  // `null` typed as `T`, and they dereference it straight away (e.g.
  // `result.data.public_slug`). Fail as a result instead of a TypeError.
  if (payload === null) {
    return {
      ok: false,
      error: "The Riftseer API returned an unreadable response.",
      code: "INVALID_RESPONSE",
      status: res.status,
    };
  }

  return { ok: true, data: payload as T };
}

function oraclePath(oracleId: string, suffix = ""): string {
  return `/oracles/${encodeURIComponent(oracleId)}${suffix}`;
}

function printingPath(printingId: string, suffix = ""): string {
  return `/printings/${encodeURIComponent(printingId)}${suffix}`;
}

function setPath(setCode: string): string {
  return `/sets/${encodeURIComponent(setCode)}`;
}

function formatPath(code: string): string {
  return `/formats/${encodeURIComponent(code)}`;
}

export const adminApi = {
  /** Read the append-only audit log, newest first. */
  listAuditLog(
    accessToken: string,
    filters: AdminAuditFilters = {},
  ): Promise<AdminResult<AdminAuditPage>> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      const raw = typeof value === "number" ? String(value) : value?.trim();
      if (raw) params.set(key, raw);
    }
    const search = params.toString();
    return request({
      method: "GET",
      path: search ? `/audit-log?${search}` : "/audit-log",
      accessToken,
    });
  },

  // ── Ingest review queue ─────────────────────────────────────────────────────

  /** Defaults to pending entries when no status is given. */
  listReview(
    accessToken: string,
    filters: AdminReviewFilters = {},
  ): Promise<AdminResult<AdminReviewPage>> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      const raw = typeof value === "number" ? String(value) : value?.trim();
      if (raw) params.set(key, raw);
    }
    const search = params.toString();
    return request({
      method: "GET",
      path: search ? `/reconciliation?${search}` : "/reconciliation",
      accessToken,
    });
  },

  /**
   * Applies the entry's proposal as a durable card override. `cardId` overrides
   * ingest's suggestion and is required when it made none.
   */
  confirmReviewEntry(
    accessToken: string,
    entryId: string,
    printingId?: string,
    oracleId?: string,
    note?: string,
  ): Promise<AdminResult<AdminReviewMutationResult>> {
    return request({
      method: "POST",
      path: `/reconciliation/${encodeURIComponent(entryId)}/confirm`,
      accessToken,
      body: {
        ...(printingId ? { printing_id: printingId } : {}),
        ...(oracleId ? { oracle_id: oracleId } : {}),
        ...(note ? { note } : {}),
      },
    });
  },

  /** Closes the entry without touching a card; the dismissal is durable. */
  dismissReviewEntry(
    accessToken: string,
    entryId: string,
    note?: string,
  ): Promise<AdminResult<AdminReviewMutationResult>> {
    return request({
      method: "POST",
      path: `/reconciliation/${encodeURIComponent(entryId)}/dismiss`,
      accessToken,
      body: note ? { note } : {},
    });
  },

  createOracle(
    accessToken: string,
    definition: AdminOracleDefinition,
  ): Promise<AdminResult<AdminOracleMutationResult>> {
    return request({
      method: "POST",
      path: "/oracles",
      accessToken,
      body: { definition },
    });
  },

  patchOracle(
    accessToken: string,
    oracleId: string,
    patch: AdminOraclePatch,
  ): Promise<AdminResult<AdminOracleMutationResult>> {
    return request({
      method: "PATCH",
      path: oraclePath(oracleId),
      accessToken,
      body: { patch },
    });
  },

  deleteOracle(
    accessToken: string,
    oracleId: string,
    reason?: string,
  ): Promise<AdminResult<AdminOracleMutationResult>> {
    return request({
      method: "DELETE",
      path: oraclePath(oracleId),
      accessToken,
      body: reason ? { reason } : {},
    });
  },

  /** Dashboard totals, counted server-side from the tables. */
  getStats(accessToken: string): Promise<AdminResult<AdminStats>> {
    return request({ method: "GET", path: "/stats", accessToken });
  },

  /** The admin catalogue list. See `AdminPrintingListPage` for why it is not public search. */
  listPrintings(
    accessToken: string,
    filters: AdminPrintingListFilters = {},
  ): Promise<AdminResult<AdminPrintingListPage>> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      const raw = typeof value === "number" ? String(value) : value?.trim();
      if (raw) params.set(key, raw);
    }
    const search = params.toString();
    return request({
      method: "GET",
      path: search ? `/printings?${search}` : "/printings",
      accessToken,
    });
  },

  createPrinting(
    accessToken: string,
    id: string,
    oracleId: string,
    setCode: string,
    definition: AdminPrintingDefinition,
  ): Promise<AdminResult<AdminPrintingMutationResult>> {
    return request({ method: "POST", path: "/printings", accessToken, body: {
      id, oracle_id: oracleId, set_code: setCode, definition,
    } });
  },

  patchPrinting(
    accessToken: string,
    printingId: string,
    patch: AdminPrintingPatch,
  ): Promise<AdminResult<AdminPrintingMutationResult>> {
    return request({ method: "PATCH", path: printingPath(printingId), accessToken, body: { patch } });
  },

  deletePrinting(
    accessToken: string,
    printingId: string,
    reason?: string,
  ): Promise<AdminResult<AdminPrintingMutationResult>> {
    return request({ method: "DELETE", path: printingPath(printingId), accessToken, body: reason ? { reason } : {} });
  },

  /**
   * Read before write. `PUT /deltas` replaces the row wholesale, so the editor
   * has to start from what is stored or saving one field would drop the rest.
   */
  getPrintingDelta(
    accessToken: string,
    printingId: string,
  ): Promise<AdminResult<AdminPrintingDeltaRead>> {
    return request({ method: "GET", path: printingPath(printingId, "/deltas"), accessToken });
  },

  setPrintingDelta(
    accessToken: string,
    printingId: string,
    delta: AdminPrintingDelta | null,
  ): Promise<AdminResult<AdminPrintingMutationResult>> {
    return request({ method: "PUT", path: printingPath(printingId, "/deltas"), accessToken, body: { delta } });
  },

  /** Lift a soft delete. The row was never removed; `deleted_at` just hid it. */
  restorePrinting(
    accessToken: string,
    printingId: string,
  ): Promise<AdminResult<AdminPrintingMutationResult>> {
    return request({ method: "POST", path: printingPath(printingId, "/restore"), accessToken });
  },

  restoreOracle(
    accessToken: string,
    oracleId: string,
  ): Promise<AdminResult<AdminOracleMutationResult>> {
    return request({ method: "POST", path: oraclePath(oracleId, "/restore"), accessToken });
  },

  regenerateSlug(
    accessToken: string,
    printingId: string,
  ): Promise<AdminResult<AdminSlugMutationResult>> {
    return request({
      method: "POST",
      path: printingPath(printingId, "/regenerate-slug"),
      accessToken,
    });
  },

  listOracleRelationships(
    accessToken: string,
    oracleId: string,
  ): Promise<AdminResult<AdminOracleRelationships>> {
    return request({
      method: "GET",
      path: oraclePath(oracleId, "/relationships"),
      accessToken,
    });
  },

  /** Relationships are oracle properties, so this replaces the whole edge list. */
  setRelationships(
    accessToken: string,
    oracleId: string,
    entries: AdminRelationshipEntry[],
  ): Promise<AdminResult<AdminOracleMutationResult>> {
    return request({
      method: "PUT",
      path: oraclePath(oracleId, "/relationships"),
      accessToken,
      body: { entries },
    });
  },

  uploadCardImage(
    accessToken: string,
    printingId: string,
    formData: FormData,
  ): Promise<AdminResult<AdminImageMutationResult>> {
    return request({
      method: "POST",
      path: printingPath(printingId, "/image"),
      accessToken,
      formData,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  },

  createSet(
    accessToken: string,
    setCode: string,
    definition: AdminSetDefinition,
  ): Promise<AdminResult<AdminSetMutationResult>> {
    return request({
      method: "POST",
      path: "/sets",
      accessToken,
      body: { set_code: setCode, definition },
    });
  },

  patchSet(
    accessToken: string,
    setCode: string,
    patch: AdminSetPatch,
    note?: string,
  ): Promise<AdminResult<AdminSetMutationResult>> {
    return request({
      method: "PATCH",
      path: setPath(setCode),
      accessToken,
      body: note ? { patch, note } : { patch },
    });
  },

  deleteSet(
    accessToken: string,
    setCode: string,
    reason?: string,
  ): Promise<AdminResult<AdminSetMutationResult>> {
    return request({
      method: "DELETE",
      path: setPath(setCode),
      accessToken,
      body: reason ? { reason } : {},
    });
  },

  // ── Formats ─────────────────────────────────────────────────────────────────

  /** Includes retired formats and the counts a delete would cascade away. */
  listFormats(
    accessToken: string,
  ): Promise<AdminResult<AdminFormatListResult>> {
    return request({ method: "GET", path: "/formats", accessToken });
  },

  createFormat(
    accessToken: string,
    input: AdminFormatInput,
  ): Promise<AdminResult<AdminFormatMutationResult>> {
    return request({
      method: "POST",
      path: "/formats",
      accessToken,
      body: input,
    });
  },

  patchFormat(
    accessToken: string,
    code: string,
    patch: AdminFormatPatch,
  ): Promise<AdminResult<AdminFormatMutationResult>> {
    return request({
      method: "PATCH",
      path: formatPath(code),
      accessToken,
      body: { patch },
    });
  },

  deleteFormat(
    accessToken: string,
    code: string,
  ): Promise<AdminResult<AdminFormatDeleteResult>> {
    return request({
      method: "DELETE",
      path: formatPath(code),
      accessToken,
    });
  },

  /** Send the complete ordered list — an unknown code is rejected, not skipped. */
  reorderFormats(
    accessToken: string,
    codes: string[],
  ): Promise<AdminResult<AdminReorderResult>> {
    return request({
      method: "PUT",
      path: "/formats/order",
      accessToken,
      body: { codes },
    });
  },

  // ── Legalities and rulings ──────────────────────────────────────────────────

  listPrintingLegalities(
    accessToken: string,
    cardId: string,
  ): Promise<AdminResult<AdminPrintingLegalities>> {
    return request({
      method: "GET",
      path: printingPath(cardId, "/legalities"),
      accessToken,
    });
  },

  /**
   * `applyToAllPrintings` writes the oracle-level status and clears every
   * per-printing override for that format; without it only this printing moves.
   * Pass `"default"` to clear the stored status back to legal.
   */
  setCardLegality(
    accessToken: string,
    cardId: string,
    formatCode: string,
    status: AdminLegalityStatusInput,
    applyToAllPrintings: boolean,
  ): Promise<AdminResult<AdminLegalityMutationResult>> {
    return request({
      method: "PUT",
      path: printingPath(cardId, "/legalities"),
      accessToken,
      body: {
        format_code: formatCode,
        status,
        apply_to_all_printings: applyToAllPrintings,
      },
    });
  },

  listPrintingRulings(
    accessToken: string,
    cardId: string,
  ): Promise<AdminResult<AdminPrintingRulings>> {
    return request({
      method: "GET",
      path: printingPath(cardId, "/rulings"),
      accessToken,
    });
  },

  // ── Rulings tab ─────────────────────────────────────────────────────────────

  listRulings(
    accessToken: string,
    filters: AdminRulingsQuery = {},
  ): Promise<AdminResult<AdminRulingsPage>> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      const raw = typeof value === "number" ? String(value) : value?.trim();
      if (raw) params.set(key, raw);
    }
    const search = params.toString();
    return request({
      method: "GET",
      path: search ? `/rulings?${search}` : "/rulings",
      accessToken,
    });
  },

  /**
   * Evaluates a rule without storing it. The API parses the query with the same
   * parser the search bar uses, so a syntax error here is the same error a user
   * would see in search.
   */
  previewRule(
    accessToken: string,
    query: string,
    limit?: number,
  ): Promise<AdminResult<AdminRulePreview>> {
    return request({
      method: "POST",
      path: "/rulings/preview",
      accessToken,
      body: limit === undefined ? { query } : { query, limit },
    });
  },

  createRuling(
    accessToken: string,
    input: AdminRulingCreateInput,
  ): Promise<AdminResult<{ ok: true; ruling: AdminRuling }>> {
    return request({
      method: "POST",
      path: "/rulings",
      accessToken,
      body: input,
    });
  },

  patchRuling(
    accessToken: string,
    rulingId: string,
    patch: AdminRulingRecordPatch,
  ): Promise<AdminResult<{ ok: true; ruling: AdminRuling }>> {
    return request({
      method: "PATCH",
      path: `/rulings/${encodeURIComponent(rulingId)}`,
      accessToken,
      body: { patch },
    });
  },

  deleteRuling(
    accessToken: string,
    rulingId: string,
  ): Promise<AdminResult<{ ok: true; ruling_id: string }>> {
    return request({
      method: "DELETE",
      path: `/rulings/${encodeURIComponent(rulingId)}`,
      accessToken,
    });
  },
};
