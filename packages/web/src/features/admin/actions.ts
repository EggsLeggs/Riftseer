"use server";

import { revalidatePath } from "next/cache";
import { getSession, isAdminSession } from "@/lib/session";
import { adminApi } from "./api";
import { detectImageContentType, extensionForImageType } from "./image-type";
import type {
  AdminAuditFilters,
  AdminAuditPage,
  AdminCardDefinition,
  AdminCardLegalities,
  AdminCardMutationResult,
  AdminCardPatch,
  AdminCardRelationships,
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

// ─── Ingest review queue ──────────────────────────────────────────────────────

export async function listReviewAction(
  filters: AdminReviewFilters = {},
): Promise<AdminResult<AdminReviewPage>> {
  return withToken((token) => adminApi.listReview(token, filters));
}

export async function confirmReviewEntryAction(
  entryId: string,
  cardId?: string,
  note?: string,
): Promise<AdminResult<AdminReviewMutationResult>> {
  const result = await withToken((token) =>
    adminApi.confirmReviewEntry(token, entryId, cardId, note),
  );
  if (result.ok) {
    revalidatePath("/admin/review");
    // Confirming writes a card override, so the affected card page is stale.
    if (result.data.card_id) revalidateCard(result.data.card_id);
  }
  return result;
}

export async function dismissReviewEntryAction(
  entryId: string,
  note?: string,
): Promise<AdminResult<AdminReviewMutationResult>> {
  const result = await withToken((token) =>
    adminApi.dismissReviewEntry(token, entryId, note),
  );
  if (result.ok) revalidatePath("/admin/review");
  return result;
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

export async function listCardRelationshipsAction(
  cardId: string,
): Promise<AdminResult<AdminCardRelationships>> {
  return withToken((token) => adminApi.listCardRelationships(token, cardId));
}

export async function setRelationshipsAction(
  cardId: string,
  entries: AdminRelationshipEntry[],
  applyToAllPrintings: boolean,
  publicSlug?: string,
): Promise<AdminResult<AdminCardMutationResult>> {
  const result = await withToken((token) =>
    adminApi.setRelationships(token, cardId, entries, applyToAllPrintings),
  );
  if (result.ok) {
    // Oracle-scoped overrides change every printing in the group; sibling
    // slugs are not known here, so revalidate the whole card subtree.
    if (applyToAllPrintings) revalidatePath("/card", "layout");
    else revalidateCard(cardId, publicSlug);
    revalidatePath("/admin/cards");
  }
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

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const IMPORT_TIMEOUT_MS = 30_000;

/**
 * Fetch a remote image (e.g. the gallery art on a missing-card draft) and
 * upload it through the normal admin image endpoint. Runs server-side so CDN
 * CORS does not block the browser.
 *
 * Unlike every other action here, the API's allowlist is *not* enough on its
 * own: the outbound fetch is a side effect this Worker performs before the API
 * is ever called, so an ungated action would let anyone use it to probe
 * arbitrary URLs. `isAdminSession()` gates the request itself; the API still
 * enforces the allowlist on the upload that follows.
 */
export async function importCardImageFromUrlAction(
  cardId: string,
  imageUrl: string,
  accessibilityText?: string,
): Promise<AdminResult<AdminImageMutationResult>> {
  const session = await getSession();
  if (!session) return NOT_SIGNED_IN;
  if (!(await isAdminSession())) {
    return {
      ok: false,
      error: "Admin access is required",
      code: "ADMIN_REQUIRED",
    };
  }

  const trimmed = imageUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: "Image URL is not valid",
      code: "INVALID_IMAGE_URL",
    };
  }
  // HTTPS only. Every source we import from serves it, and allowing plain HTTP
  // would widen what this action can be pointed at for no gain.
  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      error: "Image URL must be https",
      code: "INVALID_IMAGE_URL",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(trimmed, {
      signal: controller.signal,
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "RiftseerAdmin/1.0 (+https://riftseer.com)",
      },
      redirect: "follow",
    });
  } catch {
    return {
      ok: false,
      error: "Could not download the gallery image",
      code: "IMAGE_FETCH_FAILED",
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `Gallery image download failed (${response.status})`,
      code: "IMAGE_FETCH_FAILED",
    };
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: "Gallery image must be between 1 byte and 20 MB",
      code: "INVALID_IMAGE_SIZE",
    };
  }

  const contentType = detectImageContentType(bytes);
  if (!contentType) {
    return {
      ok: false,
      error: "Gallery image is not a supported type",
      code: "INVALID_IMAGE_TYPE",
    };
  }

  const formData = new FormData();
  formData.append(
    "file",
    new File([bytes], `gallery.${extensionForImageType(contentType)}`, {
      type: contentType,
    }),
  );
  const alt = accessibilityText?.trim();
  if (alt) formData.append("accessibility_text", alt);

  return uploadCardImageAction(cardId, formData);
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

// ─── Rulings tab ──────────────────────────────────────────────────────────────

/**
 * A ruling from this tab can point at any number of cards — and a rule target at
 * cards nobody has enumerated — so there is no useful narrower revalidation than
 * the whole `/card` subtree.
 */
function revalidateRulings() {
  revalidatePath("/admin/rulings");
  revalidatePath("/card", "layout");
}

export async function listRulingsAction(
  filters: AdminRulingsQuery = {},
): Promise<AdminResult<AdminRulingsPage>> {
  return withToken((token) => adminApi.listRulings(token, filters));
}

export async function previewRuleAction(
  query: string,
  limit?: number,
): Promise<AdminResult<AdminRulePreview>> {
  return withToken((token) => adminApi.previewRule(token, query, limit));
}

export async function createRulingAction(
  input: AdminRulingCreateInput,
): Promise<AdminResult<{ ok: true; ruling: AdminRuling }>> {
  const result = await withToken((token) => adminApi.createRuling(token, input));
  if (result.ok) revalidateRulings();
  return result;
}

export async function patchRulingAction(
  rulingId: string,
  patch: AdminRulingRecordPatch,
): Promise<AdminResult<{ ok: true; ruling: AdminRuling }>> {
  const result = await withToken((token) =>
    adminApi.patchRuling(token, rulingId, patch),
  );
  if (result.ok) revalidateRulings();
  return result;
}

export async function deleteRulingAction(
  rulingId: string,
): Promise<AdminResult<{ ok: true; ruling_id: string }>> {
  const result = await withToken((token) =>
    adminApi.deleteRuling(token, rulingId),
  );
  if (result.ok) revalidateRulings();
  return result;
}
