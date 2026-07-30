"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { adminApi } from "./api";
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

const NOT_SIGNED_IN = {
  ok: false as const,
  error: "You are signed out. Sign in again to continue.",
  code: "NOT_AUTHENTICATED",
};

/**
 * Server actions are public endpoints, so the API's `ADMIN_USER_IDS` gate — not
 * this token lookup — is the security boundary. Every call below forwards the
 * caller's own token and surfaces the API's `403 ADMIN_REQUIRED` verbatim.
 */
async function withToken<T>(
  run: (accessToken: string) => Promise<AdminResult<T>>,
): Promise<AdminResult<T>> {
  const session = await getSession();
  if (!session) return NOT_SIGNED_IN;
  return run(session.accessToken);
}

/** Drop the caches that can still show the pre-edit card after a mutation. */
function revalidateCard(cardId: string, publicSlug?: string) {
  revalidatePath(`/card/${cardId}`);
  if (publicSlug) revalidatePath(`/card/${publicSlug}`);
  revalidatePath("/admin/cards");
}

export async function listAuditLogAction(
  filters: AdminAuditFilters = {},
): Promise<AdminResult<AdminAuditPage>> {
  return withToken((token) => adminApi.listAuditLog(token, filters));
}

export async function createCardAction(
  id: string,
  definition: AdminCardDefinition,
): Promise<AdminResult<AdminCardMutationResult>> {
  const result = await withToken((token) =>
    adminApi.createCard(token, id, definition),
  );
  if (result.ok) revalidatePath("/admin/cards");
  return result;
}

export async function patchCardAction(
  cardId: string,
  patch: AdminCardPatch,
  options: { note?: string; publicSlug?: string } = {},
): Promise<AdminResult<AdminCardMutationResult>> {
  const result = await withToken((token) =>
    adminApi.patchCard(token, cardId, patch, options.note),
  );
  if (result.ok) revalidateCard(cardId, options.publicSlug);
  return result;
}

export async function deleteCardAction(
  cardId: string,
  reason?: string,
): Promise<AdminResult<AdminCardMutationResult>> {
  const result = await withToken((token) =>
    adminApi.deleteCard(token, cardId, reason),
  );
  if (result.ok) revalidateCard(cardId);
  return result;
}

export async function regenerateSlugAction(
  cardId: string,
  previousSlug?: string,
): Promise<AdminResult<AdminSlugMutationResult>> {
  const result = await withToken((token) =>
    adminApi.regenerateSlug(token, cardId),
  );
  if (result.ok) {
    revalidateCard(cardId, previousSlug);
    revalidatePath(`/card/${result.data.public_slug}`);
  }
  return result;
}

export async function moveCardAction(
  cardId: string,
  setCode: string,
  publicSlug?: string,
): Promise<AdminResult<AdminCardMutationResult>> {
  const result = await withToken((token) =>
    adminApi.moveCard(token, cardId, setCode),
  );
  if (result.ok) {
    revalidateCard(cardId, publicSlug);
    revalidatePath(`/sets/${setCode.toLowerCase()}`);
  }
  return result;
}

export async function setRelationshipsAction(
  cardId: string,
  entries: AdminRelationshipEntry[],
  publicSlug?: string,
): Promise<AdminResult<AdminCardMutationResult>> {
  const result = await withToken((token) =>
    adminApi.setRelationships(token, cardId, entries),
  );
  if (result.ok) revalidateCard(cardId, publicSlug);
  return result;
}

export async function uploadCardImageAction(
  cardId: string,
  formData: FormData,
): Promise<AdminResult<AdminImageMutationResult>> {
  const result = await withToken((token) =>
    adminApi.uploadCardImage(token, cardId, formData),
  );
  if (result.ok) revalidateCard(cardId);
  return result;
}

export async function createSetAction(
  setCode: string,
  definition: AdminSetDefinition,
): Promise<AdminResult<AdminSetMutationResult>> {
  const result = await withToken((token) =>
    adminApi.createSet(token, setCode, definition),
  );
  if (result.ok) {
    revalidatePath("/admin/sets");
    revalidatePath("/sets");
  }
  return result;
}

export async function patchSetAction(
  setCode: string,
  patch: AdminSetPatch,
  note?: string,
): Promise<AdminResult<AdminSetMutationResult>> {
  const result = await withToken((token) =>
    adminApi.patchSet(token, setCode, patch, note),
  );
  if (result.ok) {
    revalidatePath("/admin/sets");
    revalidatePath("/sets");
    revalidatePath(`/sets/${setCode.toLowerCase()}`);
  }
  return result;
}

export async function deleteSetAction(
  setCode: string,
  reason?: string,
): Promise<AdminResult<AdminSetMutationResult>> {
  const result = await withToken((token) =>
    adminApi.deleteSet(token, setCode, reason),
  );
  if (result.ok) {
    revalidatePath("/admin/sets");
    revalidatePath("/sets");
  }
  return result;
}
