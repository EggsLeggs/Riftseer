"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { adminApi } from "./api";
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
  AdminRulingInput,
  AdminRulingMutationResult,
  AdminRulingPatch,
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

// ─── Formats ──────────────────────────────────────────────────────────────────

/**
 * A format change moves the legality table on every card page, so these
 * revalidate `/card` wholesale rather than trying to guess which cards were
 * affected.
 */
function revalidateFormats() {
  revalidatePath("/admin/formats");
  revalidatePath("/card", "layout");
}

export async function listFormatsAction(): Promise<
  AdminResult<AdminFormatListResult>
> {
  return withToken((token) => adminApi.listFormats(token));
}

export async function createFormatAction(
  input: AdminFormatInput,
): Promise<AdminResult<AdminFormatMutationResult>> {
  const result = await withToken((token) => adminApi.createFormat(token, input));
  if (result.ok) revalidateFormats();
  return result;
}

export async function patchFormatAction(
  code: string,
  patch: AdminFormatPatch,
): Promise<AdminResult<AdminFormatMutationResult>> {
  const result = await withToken((token) =>
    adminApi.patchFormat(token, code, patch),
  );
  if (result.ok) revalidateFormats();
  return result;
}

export async function deleteFormatAction(
  code: string,
): Promise<AdminResult<AdminFormatDeleteResult>> {
  const result = await withToken((token) => adminApi.deleteFormat(token, code));
  if (result.ok) revalidateFormats();
  return result;
}

export async function reorderFormatsAction(
  codes: string[],
): Promise<AdminResult<AdminReorderResult>> {
  const result = await withToken((token) =>
    adminApi.reorderFormats(token, codes),
  );
  if (result.ok) revalidateFormats();
  return result;
}

// ─── Legalities and rulings ───────────────────────────────────────────────────

export async function listCardLegalitiesAction(
  cardId: string,
): Promise<AdminResult<AdminCardLegalities>> {
  return withToken((token) => adminApi.listCardLegalities(token, cardId));
}

export async function setCardLegalityAction(
  cardId: string,
  formatCode: string,
  status: AdminLegalityStatusInput,
  applyToAllPrintings: boolean,
  publicSlug?: string,
): Promise<AdminResult<AdminLegalityMutationResult>> {
  const result = await withToken((token) =>
    adminApi.setCardLegality(
      token,
      cardId,
      formatCode,
      status,
      applyToAllPrintings,
    ),
  );
  if (result.ok) {
    // A card-level status changes every printing's page, and the sibling slugs
    // are not known here, so revalidate the whole card subtree in that case.
    if (applyToAllPrintings) revalidatePath("/card", "layout");
    else revalidateCard(cardId, publicSlug);
  }
  return result;
}

export async function listCardRulingsAction(
  cardId: string,
): Promise<AdminResult<AdminCardRulings>> {
  return withToken((token) => adminApi.listCardRulings(token, cardId));
}

export async function createCardRulingAction(
  cardId: string,
  input: AdminRulingInput,
  publicSlug?: string,
): Promise<AdminResult<AdminRulingMutationResult>> {
  const result = await withToken((token) =>
    adminApi.createCardRuling(token, cardId, input),
  );
  if (result.ok) revalidateRuling(cardId, input.apply_to_all_printings, publicSlug);
  return result;
}

export async function patchCardRulingAction(
  cardId: string,
  rulingId: string,
  patch: AdminRulingPatch,
  publicSlug?: string,
): Promise<AdminResult<AdminRulingMutationResult>> {
  const result = await withToken((token) =>
    adminApi.patchCardRuling(token, cardId, rulingId, patch),
  );
  if (result.ok) revalidateRuling(cardId, true, publicSlug);
  return result;
}

export async function deleteCardRulingAction(
  cardId: string,
  rulingId: string,
  publicSlug?: string,
): Promise<AdminResult<AdminRulingMutationResult>> {
  const result = await withToken((token) =>
    adminApi.deleteCardRuling(token, cardId, rulingId),
  );
  if (result.ok) revalidateRuling(cardId, true, publicSlug);
  return result;
}

/**
 * A card-wide ruling shows on every printing, so drop the whole `/card`
 * subtree unless the entry is known to be scoped to this printing alone.
 */
function revalidateRuling(
  cardId: string,
  cardWide: boolean | undefined,
  publicSlug?: string,
) {
  if (cardWide === false) revalidateCard(cardId, publicSlug);
  else revalidatePath("/card", "layout");
}
