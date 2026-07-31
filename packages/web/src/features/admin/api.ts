import "server-only";
import { env } from "@/lib/env";
import type {
  AdminAuditFilters,
  AdminAuditPage,
  AdminCardDefinition,
  AdminCardMutationResult,
  AdminCardPatch,
  AdminImageMutationResult,
  AdminRelationshipEntry,
  AdminResult,
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
};
