import "server-only";
import { env } from "@/lib/env";
import type {
  DeckCardChange,
  DeckCardsResult,
  DeckCollaboratorResult,
  DeckCollaboratorRole,
  DeckCreateInput,
  DeckCreateResult,
  DeckDetail,
  DeckExport,
  DeckImportInput,
  DeckImportResult,
  DeckInviteResult,
  DeckJoinResult,
  DeckListPage,
  DeckPatch,
  DeckResult,
  DeckRevisionsPage,
  DeckFolder,
  DeckFolderContents,
  DeckFolderListPage,
  DeckComment,
  DeckCommentsPage,
} from "./types";

/**
 * Authenticated deck reads and every deck write.
 *
 * `import "server-only"` is the enforcement, not a convention: an access token
 * that reaches a client bundle is a leaked credential, so this module cannot be
 * imported from a client component at all. Public, token-less reads live in
 * `api.ts`; server actions in `actions.ts` fetch the session themselves and
 * call in here.
 *
 * Every call resolves to a {@link DeckResult} rather than throwing, so a form
 * can render the API's own message and machine `code`.
 */

const API_BASE = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
const V1_BASE = `${API_BASE}/api/v1`;
const DECKS_BASE = `${V1_BASE}/decks`;

/** Deck writes are small; a bounded timeout keeps a hung API from wedging a form. */
const REQUEST_TIMEOUT_MS = 15_000;

interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  accessToken: string;
  body?: unknown;
  /** Resolve `path` against `/api/v1` rather than `/api/v1/decks` (folders). */
  root?: boolean;
}

async function request<T>({
  method,
  path,
  accessToken,
  body,
  root = false,
}: RequestOptions): Promise<DeckResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${root ? V1_BASE : DECKS_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

  // A 2xx with an unreadable body would hand the caller a `null` typed as `T`,
  // which the next line dereferences. Fail as a result instead of a TypeError.
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

function deckPath(deckId: string, suffix = ""): string {
  return `/${encodeURIComponent(deckId)}${suffix}`;
}

export const decksServerApi = {
  // ── Reads ───────────────────────────────────────────────────────────────────

  /** The caller's own decks plus every deck shared with them. */
  listMine(accessToken: string): Promise<DeckResult<DeckListPage>> {
    return request({ method: "GET", path: "", accessToken });
  },

  /** The caller's favorites, pruned server-side to what they can still read. */
  listFavorites(accessToken: string): Promise<DeckResult<DeckListPage>> {
    return request({ method: "GET", path: "?filter=favorites", accessToken });
  },

  /**
   * One user's decks as the caller can see them — their own private decks when
   * it is their handle, only the public ones otherwise.
   */
  listByHandle(accessToken: string, handle: string): Promise<DeckResult<DeckListPage>> {
    return request({
      method: "GET",
      path: `?handle=${encodeURIComponent(handle)}`,
      accessToken,
    });
  },

  /** 404 covers both "no such deck" and "not yours" — do not distinguish them. */
  getDeck(accessToken: string, deckId: string): Promise<DeckResult<DeckDetail>> {
    return request({ method: "GET", path: deckPath(deckId), accessToken });
  },

  listRevisions(
    accessToken: string,
    deckId: string,
    limit?: number,
  ): Promise<DeckResult<DeckRevisionsPage>> {
    return request({
      method: "GET",
      path: deckPath(
        deckId,
        limit != null ? `/revisions?limit=${encodeURIComponent(limit)}` : "/revisions",
      ),
      accessToken,
    });
  },

  exportDeck(accessToken: string, deckId: string): Promise<DeckResult<DeckExport>> {
    return request({
      method: "GET",
      path: deckPath(deckId, "/export"),
      accessToken,
    });
  },

  // ── Deck lifecycle ──────────────────────────────────────────────────────────

  createDeck(accessToken: string, input: DeckCreateInput): Promise<DeckResult<DeckCreateResult>> {
    return request({ method: "POST", path: "", accessToken, body: input });
  },

  /** Omitted keys are left alone; an explicit `null` clears a nullable field. */
  patchDeck(
    accessToken: string,
    deckId: string,
    patch: DeckPatch,
  ): Promise<DeckResult<DeckDetail>> {
    return request({
      method: "PATCH",
      path: deckPath(deckId),
      accessToken,
      body: patch,
    });
  },

  deleteDeck(accessToken: string, deckId: string): Promise<DeckResult<{ message: string }>> {
    return request({ method: "DELETE", path: deckPath(deckId), accessToken });
  },

  /**
   * Apply a whole batch of zone changes in one transaction. `quantity: 0`
   * removes a card, and the API answers with the re-rendered list, its derived
   * tokens and its violations — so a caller never has to re-read the deck.
   */
  applyCardChanges(
    accessToken: string,
    deckId: string,
    changes: DeckCardChange[],
  ): Promise<DeckResult<DeckCardsResult>> {
    return request({
      method: "PUT",
      path: deckPath(deckId, "/cards"),
      accessToken,
      body: { changes },
    });
  },

  listFolders(accessToken: string, deckId?: string): Promise<DeckResult<DeckFolderListPage>> {
    return request({
      method: "GET",
      path: deckId ? `/deck-folders?deck=${encodeURIComponent(deckId)}` : "/deck-folders",
      root: true,
      accessToken,
    });
  },

  getFolder(accessToken: string, folderId: string): Promise<DeckResult<DeckFolderContents>> {
    return request({
      method: "GET",
      path: `/deck-folders/${encodeURIComponent(folderId)}`,
      accessToken,
      root: true,
    });
  },

  createFolder(accessToken: string, name: string): Promise<DeckResult<DeckFolder>> {
    return request({
      method: "POST",
      path: "/deck-folders",
      accessToken,
      root: true,
      body: { name },
    });
  },

  renameFolder(
    accessToken: string,
    folderId: string,
    name: string,
  ): Promise<DeckResult<DeckFolder>> {
    return request({
      method: "PATCH",
      path: `/deck-folders/${encodeURIComponent(folderId)}`,
      accessToken,
      root: true,
      body: { name },
    });
  },

  deleteFolder(accessToken: string, folderId: string): Promise<DeckResult<{ message: string }>> {
    return request({
      method: "DELETE",
      path: `/deck-folders/${encodeURIComponent(folderId)}`,
      accessToken,
      root: true,
    });
  },

  setFolderMembership(
    accessToken: string,
    folderId: string,
    deckId: string,
    filed: boolean,
  ): Promise<DeckResult<{ message: string }>> {
    return request({
      method: filed ? "PUT" : "DELETE",
      path: `/deck-folders/${encodeURIComponent(folderId)}/decks/${encodeURIComponent(deckId)}`,
      root: true,
      accessToken,
    });
  },

  postComment(
    accessToken: string,
    deckId: string,
    body: string,
    parentId?: string,
  ): Promise<DeckResult<DeckComment>> {
    return request({
      method: "POST",
      path: deckPath(deckId, "/comments"),
      accessToken,
      body: { body, ...(parentId ? { parent_id: parentId } : {}) },
    });
  },

  deleteComment(
    accessToken: string,
    deckId: string,
    commentId: string,
  ): Promise<DeckResult<{ message: string }>> {
    return request({
      method: "DELETE",
      path: deckPath(deckId, `/comments/${encodeURIComponent(commentId)}`),
      accessToken,
    });
  },

  listComments(accessToken: string, deckId: string): Promise<DeckResult<DeckCommentsPage>> {
    return request({
      method: "GET",
      path: deckPath(deckId, "/comments"),
      accessToken,
    });
  },

  likeComment(
    accessToken: string,
    deckId: string,
    commentId: string,
    on: boolean,
  ): Promise<DeckResult<{ liked: boolean; like_count: number }>> {
    return request({
      method: on ? "POST" : "DELETE",
      path: deckPath(deckId, `/comments/${encodeURIComponent(commentId)}/like`),
      accessToken,
    });
  },

  favorite(
    accessToken: string,
    deckId: string,
    on: boolean,
  ): Promise<DeckResult<{ favorited: boolean; favorite_count: number }>> {
    return request({
      method: on ? "POST" : "DELETE",
      path: deckPath(deckId, "/favorite"),
      accessToken,
    });
  },

  setCardTags(
    accessToken: string,
    deckId: string,
    oracleId: string,
    tags: string[],
  ): Promise<DeckResult<{ oracle_id: string; tags: string[] }>> {
    return request({
      method: "PUT",
      path: deckPath(deckId, "/card-tags"),
      accessToken,
      body: { oracle_id: oracleId, tags },
    });
  },

  importDeck(accessToken: string, input: DeckImportInput): Promise<DeckResult<DeckImportResult>> {
    return request({
      method: "POST",
      path: "/import",
      accessToken,
      body: input,
    });
  },

  // ── Sharing ─────────────────────────────────────────────────────────────────

  /**
   * Create or regenerate the invite link. Regenerating replaces the link and
   * nothing else: redemption wrote a collaborator row, so people already on the
   * deck keep their access and stay individually revocable.
   */
  setInvite(
    accessToken: string,
    deckId: string,
    role?: DeckCollaboratorRole,
  ): Promise<DeckResult<DeckInviteResult>> {
    return request({
      method: "POST",
      path: deckPath(deckId, "/invite"),
      accessToken,
      body: role ? { role } : {},
    });
  },

  clearInvite(accessToken: string, deckId: string): Promise<DeckResult<{ message: string }>> {
    return request({
      method: "DELETE",
      path: deckPath(deckId, "/invite"),
      accessToken,
    });
  },

  joinDeck(accessToken: string, inviteCode: string): Promise<DeckResult<DeckJoinResult>> {
    return request({
      method: "POST",
      path: `/join/${encodeURIComponent(inviteCode)}`,
      accessToken,
    });
  },

  addCollaborator(
    accessToken: string,
    deckId: string,
    handle: string,
    role?: DeckCollaboratorRole,
  ): Promise<DeckResult<DeckCollaboratorResult>> {
    return request({
      method: "POST",
      path: deckPath(deckId, "/collaborators"),
      accessToken,
      body: role ? { handle, role } : { handle },
    });
  },

  removeCollaborator(
    accessToken: string,
    deckId: string,
    handle: string,
  ): Promise<DeckResult<{ message: string }>> {
    return request({
      method: "DELETE",
      path: deckPath(deckId, `/collaborators?handle=${encodeURIComponent(handle)}`),
      accessToken,
    });
  },
};
