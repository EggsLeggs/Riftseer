"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { decksApi } from "./api";
import { decksServerApi } from "./server-api";
import { deckHref } from "./paths";
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
} from "./types";

/**
 * Deck server actions.
 *
 * Each one fetches the session itself and never accepts a token as an
 * argument — a server action is a public endpoint, so a token parameter would
 * be an argument an attacker supplies, and the browser is never given one to
 * pass in the first place.
 *
 * They resolve to a `DeckResult` rather than throwing, because a thrown error
 * crossing the server/client boundary is replaced by a generic message in a
 * production build and the user would lose the API's actual reason.
 */

const NOT_SIGNED_IN = {
  ok: false as const,
  error: "You are signed out. Sign in again to continue.",
  code: "NOT_AUTHENTICATED",
};

async function withToken<T>(
  run: (accessToken: string) => Promise<DeckResult<T>>,
): Promise<DeckResult<T>> {
  const session = await getSession();
  if (!session) return NOT_SIGNED_IN;
  return run(session.accessToken);
}

/** Both spellings of a deck's URL, since the tail follows the current name. */
function revalidateDeck(deckId: string, name?: string | null) {
  revalidatePath(`/deck/${deckId}`);
  if (name) revalidatePath(deckHref({ id: deckId, name }));
  revalidatePath("/decks");
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function listMyDecksAction(): Promise<DeckResult<DeckListPage>> {
  return withToken((token) => decksServerApi.listMine(token));
}

/**
 * A user's decks as the signed-in caller can see them. Falls back to the
 * anonymous view when signed out, which is the same answer the public API
 * gives — a signed-out visitor is not an error here.
 */
export async function listDecksByHandleAction(
  handle: string,
): Promise<DeckResult<DeckListPage>> {
  const session = await getSession();
  const token = session?.accessToken;
  if (!token) {
    const page = await decksApi.listByHandle(handle).catch(() => null);
    return page
      ? { ok: true, data: page }
      : { ok: false, error: "Profile not found", code: "NOT_FOUND", status: 404 };
  }
  return decksServerApi.listByHandle(token, handle);
}

export async function getDeckAction(
  deckId: string,
): Promise<DeckResult<DeckDetail>> {
  return withToken((token) => decksServerApi.getDeck(token, deckId));
}

export async function listDeckRevisionsAction(
  deckId: string,
): Promise<DeckResult<DeckRevisionsPage>> {
  return withToken((token) => decksServerApi.listRevisions(token, deckId));
}

export async function exportDeckAction(
  deckId: string,
): Promise<DeckResult<DeckExport>> {
  return withToken((token) => decksServerApi.exportDeck(token, deckId));
}

// ─── Deck lifecycle ───────────────────────────────────────────────────────────

export async function createDeckAction(
  input: DeckCreateInput,
): Promise<DeckResult<DeckCreateResult>> {
  const result = await withToken((token) =>
    decksServerApi.createDeck(token, input),
  );
  if (result.ok) revalidatePath("/decks");
  return result;
}

export async function patchDeckAction(
  deckId: string,
  patch: DeckPatch,
): Promise<DeckResult<DeckDetail>> {
  const result = await withToken((token) =>
    decksServerApi.patchDeck(token, deckId, patch),
  );
  if (result.ok) revalidateDeck(deckId, result.data.name);
  return result;
}

export async function deleteDeckAction(
  deckId: string,
): Promise<DeckResult<{ message: string }>> {
  const result = await withToken((token) =>
    decksServerApi.deleteDeck(token, deckId),
  );
  if (result.ok) revalidateDeck(deckId);
  return result;
}

/**
 * Apply a batch of card changes. The response already carries the new list,
 * tokens and violations, so the builder renders from it rather than re-reading
 * the deck.
 */
export async function applyDeckCardChangesAction(
  deckId: string,
  changes: DeckCardChange[],
): Promise<DeckResult<DeckCardsResult>> {
  const result = await withToken((token) =>
    decksServerApi.applyCardChanges(token, deckId, changes),
  );
  if (result.ok) revalidateDeck(deckId);
  return result;
}

export async function importDeckAction(
  input: DeckImportInput,
): Promise<DeckResult<DeckImportResult>> {
  const result = await withToken((token) =>
    decksServerApi.importDeck(token, input),
  );
  if (result.ok) revalidatePath("/decks");
  return result;
}

// ─── Sharing ──────────────────────────────────────────────────────────────────

export async function setDeckInviteAction(
  deckId: string,
  role?: DeckCollaboratorRole,
): Promise<DeckResult<DeckInviteResult>> {
  const result = await withToken((token) =>
    decksServerApi.setInvite(token, deckId, role),
  );
  if (result.ok) revalidateDeck(deckId);
  return result;
}

export async function clearDeckInviteAction(
  deckId: string,
): Promise<DeckResult<{ message: string }>> {
  const result = await withToken((token) =>
    decksServerApi.clearInvite(token, deckId),
  );
  if (result.ok) revalidateDeck(deckId);
  return result;
}

/** Redeeming writes a collaborator row, so revoking the link later is separate. */
export async function joinDeckAction(
  inviteCode: string,
): Promise<DeckResult<DeckJoinResult>> {
  const result = await withToken((token) =>
    decksServerApi.joinDeck(token, inviteCode),
  );
  if (result.ok) {
    revalidatePath("/decks");
    revalidateDeck(result.data.deck_id);
  }
  return result;
}

export async function addDeckCollaboratorAction(
  deckId: string,
  handle: string,
  role?: DeckCollaboratorRole,
): Promise<DeckResult<DeckCollaboratorResult>> {
  const result = await withToken((token) =>
    decksServerApi.addCollaborator(token, deckId, handle, role),
  );
  if (result.ok) revalidateDeck(deckId);
  return result;
}

export async function removeDeckCollaboratorAction(
  deckId: string,
  handle: string,
): Promise<DeckResult<{ message: string }>> {
  const result = await withToken((token) =>
    decksServerApi.removeCollaborator(token, deckId, handle),
  );
  if (result.ok) revalidateDeck(deckId);
  return result;
}
