import "server-only";
import { env } from "@/lib/env";
import type {
  AdminAuditFilters,
  AdminAuditPage,
  AdminCardDefinition,
  AdminCardLegalities,
  AdminCardMutationResult,
  AdminCardPatch,
  AdminCardRulings,
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
  AdminRulingInput,
  AdminRulingMutationResult,
  AdminRulingPatch,
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

function cardPath(cardId: string, suffix = ""): string {
  return `/cards/${encodeURIComponent(cardId)}${suffix}`;
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

  // ── TCGPlayer review queue ──────────────────────────────────────────────────

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
    cardId?: string,
    note?: string,
  ): Promise<AdminResult<AdminReviewMutationResult>> {
    return request({
      method: "POST",
      path: `/reconciliation/${encodeURIComponent(entryId)}/confirm`,
      accessToken,
      body: {
        ...(cardId ? { card_id: cardId } : {}),
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

  /** Create a manual card; the id is admin-chosen and must not already exist. */
  createCard(
    accessToken: string,
    id: string,
    definition: AdminCardDefinition,
  ): Promise<AdminResult<AdminCardMutationResult>> {
    return request({
      method: "POST",
      path: "/cards",
      accessToken,
      body: { id, definition },
    });
  },

  /** Apply a JSON merge patch. Only send keys the admin actually changed. */
  patchCard(
    accessToken: string,
    cardId: string,
    patch: AdminCardPatch,
    note?: string,
  ): Promise<AdminResult<AdminCardMutationResult>> {
    return request({
      method: "PATCH",
      path: cardPath(cardId),
      accessToken,
      body: note ? { patch, note } : { patch },
    });
  },

  deleteCard(
    accessToken: string,
    cardId: string,
    reason?: string,
  ): Promise<AdminResult<AdminCardMutationResult>> {
    return request({
      method: "DELETE",
      path: cardPath(cardId),
      accessToken,
      body: reason ? { reason } : {},
    });
  },

  regenerateSlug(
    accessToken: string,
    cardId: string,
  ): Promise<AdminResult<AdminSlugMutationResult>> {
    return request({
      method: "POST",
      path: cardPath(cardId, "/regenerate-slug"),
      accessToken,
    });
  },

  moveCard(
    accessToken: string,
    cardId: string,
    setCode: string,
  ): Promise<AdminResult<AdminCardMutationResult>> {
    return request({
      method: "POST",
      path: cardPath(cardId, "/move"),
      accessToken,
      body: { set_code: setCode },
    });
  },

  /** Replaces the card's whole override list — send every entry that should persist. */
  setRelationships(
    accessToken: string,
    cardId: string,
    entries: AdminRelationshipEntry[],
  ): Promise<AdminResult<AdminCardMutationResult>> {
    return request({
      method: "PUT",
      path: cardPath(cardId, "/relationships"),
      accessToken,
      body: { entries },
    });
  },

  uploadCardImage(
    accessToken: string,
    cardId: string,
    formData: FormData,
  ): Promise<AdminResult<AdminImageMutationResult>> {
    return request({
      method: "POST",
      path: cardPath(cardId, "/image"),
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

  listCardLegalities(
    accessToken: string,
    cardId: string,
  ): Promise<AdminResult<AdminCardLegalities>> {
    return request({
      method: "GET",
      path: cardPath(cardId, "/legalities"),
      accessToken,
    });
  },

  /**
   * `applyToAllPrintings` writes the card-level status and clears every
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
      path: cardPath(cardId, "/legalities"),
      accessToken,
      body: {
        format_code: formatCode,
        status,
        apply_to_all_printings: applyToAllPrintings,
      },
    });
  },

  listCardRulings(
    accessToken: string,
    cardId: string,
  ): Promise<AdminResult<AdminCardRulings>> {
    return request({
      method: "GET",
      path: cardPath(cardId, "/rulings"),
      accessToken,
    });
  },

  createCardRuling(
    accessToken: string,
    cardId: string,
    input: AdminRulingInput,
  ): Promise<AdminResult<AdminRulingMutationResult>> {
    return request({
      method: "POST",
      path: cardPath(cardId, "/rulings"),
      accessToken,
      body: input,
    });
  },

  patchCardRuling(
    accessToken: string,
    cardId: string,
    rulingId: string,
    patch: AdminRulingPatch,
  ): Promise<AdminResult<AdminRulingMutationResult>> {
    return request({
      method: "PATCH",
      path: cardPath(cardId, `/rulings/${encodeURIComponent(rulingId)}`),
      accessToken,
      body: { patch },
    });
  },

  deleteCardRuling(
    accessToken: string,
    cardId: string,
    rulingId: string,
  ): Promise<AdminResult<AdminRulingMutationResult>> {
    return request({
      method: "DELETE",
      path: cardPath(cardId, `/rulings/${encodeURIComponent(rulingId)}`),
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
