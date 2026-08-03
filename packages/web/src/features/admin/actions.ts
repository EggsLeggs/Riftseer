"use server";

import { revalidatePath } from "next/cache";
import { getSession, isAdminSession } from "@/lib/session";
import { adminApi } from "./api";
import { detectImageContentType, extensionForImageType } from "./image-type";
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
  AdminDeckZone,
  AdminFormatDeleteResult,
  AdminFormatInput,
  AdminFormatListResult,
  AdminFormatMutationResult,
  AdminFormatPatch,
  AdminFormatSeverityMutationResult,
  AdminFormatZoneRuleDeleteResult,
  AdminFormatZoneRuleInput,
  AdminFormatZoneRuleMutationResult,
  AdminImageMutationResult,
  AdminLegalityMutationResult,
  AdminLegalityStatus,
  AdminLegalityStatusInput,
  AdminViolationSeverityInput,
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
function revalidatePrinting(printingId: string, publicSlug?: string) {
  revalidatePath(`/card/${printingId}`);
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
  printingId?: string,
  oracleId?: string,
  note?: string,
): Promise<AdminResult<AdminReviewMutationResult>> {
  const result = await withToken((token) =>
    adminApi.confirmReviewEntry(token, entryId, printingId, oracleId, note),
  );
  if (result.ok) {
    revalidatePath("/admin/review");
    if (result.data.printing_id) revalidatePrinting(result.data.printing_id);
    if (result.data.oracle_id) revalidatePath("/card", "layout");
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

export async function createOracleAction(
  definition: AdminOracleDefinition,
): Promise<AdminResult<AdminOracleMutationResult>> {
  const result = await withToken((token) =>
    adminApi.createOracle(token, definition),
  );
  if (result.ok) revalidatePath("/admin/cards");
  return result;
}

export async function patchOracleAction(
  oracleId: string,
  patch: AdminOraclePatch,
): Promise<AdminResult<AdminOracleMutationResult>> {
  const result = await withToken((token) =>
    adminApi.patchOracle(token, oracleId, patch),
  );
  if (result.ok) revalidatePath("/card", "layout");
  return result;
}

export async function deleteOracleAction(
  oracleId: string,
  reason?: string,
): Promise<AdminResult<AdminOracleMutationResult>> {
  const result = await withToken((token) =>
    adminApi.deleteOracle(token, oracleId, reason),
  );
  if (result.ok) revalidatePath("/card", "layout");
  return result;
}

export async function getAdminStatsAction(): Promise<AdminResult<AdminStats>> {
  return withToken((token) => adminApi.getStats(token));
}

export async function listPrintingsAction(
  filters: AdminPrintingListFilters = {},
): Promise<AdminResult<AdminPrintingListPage>> {
  return withToken((token) => adminApi.listPrintings(token, filters));
}

export async function restorePrintingAction(
  printingId: string,
  publicSlug?: string,
): Promise<AdminResult<AdminPrintingMutationResult>> {
  const result = await withToken((token) =>
    adminApi.restorePrinting(token, printingId),
  );
  if (result.ok) revalidatePrinting(printingId, publicSlug);
  return result;
}

export async function restoreOracleAction(
  oracleId: string,
): Promise<AdminResult<AdminOracleMutationResult>> {
  const result = await withToken((token) => adminApi.restoreOracle(token, oracleId));
  if (result.ok) revalidatePath("/card", "layout");
  return result;
}

export async function createPrintingAction(
  id: string,
  oracleId: string,
  setCode: string,
  definition: AdminPrintingDefinition,
): Promise<AdminResult<AdminPrintingMutationResult>> {
  const result = await withToken((token) =>
    adminApi.createPrinting(token, id, oracleId, setCode, definition),
  );
  if (result.ok) revalidatePath("/admin/cards");
  return result;
}

export async function patchPrintingAction(
  printingId: string,
  patch: AdminPrintingPatch,
  publicSlug?: string,
): Promise<AdminResult<AdminPrintingMutationResult>> {
  const result = await withToken((token) =>
    adminApi.patchPrinting(token, printingId, patch),
  );
  if (result.ok) revalidatePrinting(printingId, publicSlug);
  return result;
}

export async function deletePrintingAction(
  printingId: string,
  reason?: string,
): Promise<AdminResult<AdminPrintingMutationResult>> {
  const result = await withToken((token) =>
    adminApi.deletePrinting(token, printingId, reason),
  );
  if (result.ok) revalidatePrinting(printingId);
  return result;
}

export async function getPrintingDeltaAction(
  printingId: string,
): Promise<AdminResult<AdminPrintingDeltaRead>> {
  return withToken((token) => adminApi.getPrintingDelta(token, printingId));
}

export async function setPrintingDeltaAction(
  printingId: string,
  delta: AdminPrintingDelta | null,
  publicSlug?: string,
): Promise<AdminResult<AdminPrintingMutationResult>> {
  const result = await withToken((token) =>
    adminApi.setPrintingDelta(token, printingId, delta),
  );
  if (result.ok) revalidatePrinting(printingId, publicSlug);
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
    revalidatePrinting(cardId, previousSlug);
    revalidatePath(`/card/${result.data.public_slug}`);
  }
  return result;
}

export async function listOracleRelationshipsAction(
  oracleId: string,
): Promise<AdminResult<AdminOracleRelationships>> {
  return withToken((token) => adminApi.listOracleRelationships(token, oracleId));
}

export async function setRelationshipsAction(
  oracleId: string,
  entries: AdminRelationshipEntry[],
): Promise<AdminResult<AdminOracleMutationResult>> {
  const result = await withToken((token) =>
    adminApi.setRelationships(token, oracleId, entries),
  );
  if (result.ok) {
    revalidatePath("/card", "layout");
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
  if (result.ok) revalidatePrinting(cardId);
  return result;
}

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const IMPORT_TIMEOUT_MS = 30_000;
/** Redirect hops followed, each re-validated against the host allowlist. */
const MAX_IMPORT_REDIRECTS = 3;

/**
 * Hosts this action may fetch from. The only caller imports the card art on a
 * gallery `missing_printing` payload, which Riot's CMS serves from its Sanity CDN
 * (`cmsassets.rgpub.io`); `assetcdn.rgpub.io` carries the same assets. Keeping
 * it to a list means a poisoned payload cannot turn this Worker into a probe
 * for arbitrary internal addresses.
 */
const IMPORT_HOST_ALLOWLIST = new Set([
  "cmsassets.rgpub.io",
  "assetcdn.rgpub.io",
]);

const INVALID_IMPORT_URL = {
  ok: false as const,
  error: "Image URL is not an allowed source",
  code: "INVALID_IMAGE_URL",
};

/** An https URL on an allowlisted host, or null. */
function allowedImportUrl(value: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  // HTTPS only. Every source we import from serves it, and allowing plain HTTP
  // would widen what this action can be pointed at for no gain.
  if (parsed.protocol !== "https:") return null;
  if (!IMPORT_HOST_ALLOWLIST.has(parsed.hostname.toLowerCase())) return null;
  return parsed;
}

/**
 * Read at most `limit` bytes, aborting a body that runs over rather than
 * buffering it whole — `Content-Length` is upstream's claim, not a guarantee.
 * Returns null when the source is empty or oversized.
 */
async function readCappedBody(
  response: Response,
  limit: number,
): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) return null;

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

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

  let target = allowedImportUrl(imageUrl.trim());
  if (!target) return INVALID_IMPORT_URL;

  const controller = new AbortController();
  // Covers the body read as well as the request: an oversized body is refused
  // by the cap, a merely endless one by this.
  const timeout = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);
  let response: Response;
  let bytes: Uint8Array | null;
  try {
    // Redirects are followed by hand so every hop is checked against the
    // allowlist — `redirect: "follow"` would let the first response send the
    // fetch anywhere.
    for (let hop = 0; ; hop++) {
      response = await fetch(target.toString(), {
        signal: controller.signal,
        headers: {
          Accept: "image/*,*/*;q=0.8",
          "User-Agent": "RiftseerAdmin/1.0 (+https://riftseer.com)",
        },
        redirect: "manual",
      });

      const location =
        response.status >= 300 && response.status < 400
          ? response.headers.get("location")
          : null;
      if (!location) break;

      if (hop >= MAX_IMPORT_REDIRECTS) {
        return {
          ok: false,
          error: "Gallery image redirected too many times",
          code: "IMAGE_FETCH_FAILED",
        };
      }
      const next = allowedImportUrl(new URL(location, target).toString());
      if (!next) return INVALID_IMPORT_URL;
      target = next;
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `Gallery image download failed (${response.status})`,
        code: "IMAGE_FETCH_FAILED",
      };
    }

    bytes = await readCappedBody(response, MAX_IMPORT_BYTES);
  } catch {
    return {
      ok: false,
      error: "Could not download the gallery image",
      code: "IMAGE_FETCH_FAILED",
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!bytes) {
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
    new File(
      [Uint8Array.from(bytes)],
      `gallery.${extensionForImageType(contentType)}`,
      { type: contentType },
    ),
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

/**
 * Deck construction rules move what every deck in the format validates against,
 * so these revalidate the deck pages as well as `/admin/formats`.
 */
function revalidateFormatRules() {
  revalidatePath("/admin/formats");
  revalidatePath("/decks", "layout");
}

export async function setFormatZoneRuleAction(
  code: string,
  zone: AdminDeckZone,
  rule: AdminFormatZoneRuleInput,
): Promise<AdminResult<AdminFormatZoneRuleMutationResult>> {
  const result = await withToken((token) =>
    adminApi.setFormatZoneRule(token, code, zone, rule),
  );
  if (result.ok) revalidateFormatRules();
  return result;
}

export async function deleteFormatZoneRuleAction(
  code: string,
  zone: AdminDeckZone,
): Promise<AdminResult<AdminFormatZoneRuleDeleteResult>> {
  const result = await withToken((token) =>
    adminApi.deleteFormatZoneRule(token, code, zone),
  );
  if (result.ok) revalidateFormatRules();
  return result;
}

export async function setFormatLegalitySeverityAction(
  code: string,
  legalityStatus: AdminLegalityStatus,
  severity: AdminViolationSeverityInput,
): Promise<AdminResult<AdminFormatSeverityMutationResult>> {
  const result = await withToken((token) =>
    adminApi.setFormatLegalitySeverity(token, code, legalityStatus, severity),
  );
  if (result.ok) revalidateFormatRules();
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

export async function listPrintingLegalitiesAction(
  printingId: string,
): Promise<AdminResult<AdminPrintingLegalities>> {
  return withToken((token) => adminApi.listPrintingLegalities(token, printingId));
}

export async function setCardLegalityAction(
  cardId: string,
  formatCode: string,
  status: AdminLegalityStatusInput,
  applyToAllPrintings: boolean,
  publicSlug?: string,
  note?: string | null,
): Promise<AdminResult<AdminLegalityMutationResult>> {
  const result = await withToken((token) =>
    adminApi.setCardLegality(
      token,
      cardId,
      formatCode,
      status,
      applyToAllPrintings,
      note,
    ),
  );
  if (result.ok) {
    // An oracle-level status changes every printing's page, and the sibling slugs
    // are not known here, so revalidate the whole card subtree in that case.
    if (applyToAllPrintings) revalidatePath("/card", "layout");
    else revalidatePrinting(cardId, publicSlug);
  }
  return result;
}

export async function listPrintingRulingsAction(
  printingId: string,
): Promise<AdminResult<AdminPrintingRulings>> {
  return withToken((token) => adminApi.listPrintingRulings(token, printingId));
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
