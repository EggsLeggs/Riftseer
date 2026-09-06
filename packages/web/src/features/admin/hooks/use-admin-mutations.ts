"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DECK_ZONE_LABELS } from "@riftseer/types/deck";
import { cardsQueryKeys } from "@/features/cards/api";
import { setsQueryKeys } from "@/features/sets/api";
import {
  confirmReviewEntryAction,
  createOracleAction,
  createPrintingAction,
  createFormatAction,
  createRulingAction,
  createSetAction,
  deleteOracleAction,
  deletePrintingAction,
  restorePrintingAction,
  deleteFormatAction,
  deleteFormatZoneRuleAction,
  deleteRulingAction,
  deleteSetAction,
  dismissReviewEntryAction,
  patchOracleAction,
  patchPrintingAction,
  patchFormatAction,
  patchRulingAction,
  patchSetAction,
  regenerateSlugAction,
  reorderFormatsAction,
  setCardLegalityAction,
  setFormatLegalitySeverityAction,
  setFormatZoneRuleAction,
  setPrintingDeltaAction,
  setRelationshipsAction,
  uploadCardImageAction,
} from "../actions";
import type {
  AdminDeckZone,
  AdminFormatZoneRuleInput,
  AdminLegalityStatus,
  AdminViolationSeverityInput,
  AdminOracleDefinition,
  AdminOraclePatch,
  AdminPrintingDefinition,
  AdminPrintingDelta,
  AdminPrintingPatch,
  AdminFormatInput,
  AdminFormatPatch,
  AdminLegalityStatusInput,
  AdminRelationshipEntry,
  AdminResult,
  AdminRuling,
  AdminRulingCreateInput,
  AdminRulingRecordPatch,
  AdminSetDefinition,
  AdminSetPatch,
} from "../types";

/**
 * Prefix, not a full key: an oracle-scoped save changes every printing in the
 * group, so invalidation is whole-prefix rather than per card.
 */
export const ADMIN_CARD_RELATIONSHIPS_KEY = ["admin", "card-relationships"] as const;

export const adminCardRelationshipsQueryKey = (cardId: string) =>
  [...ADMIN_CARD_RELATIONSHIPS_KEY, cardId] as const;

/** Printing-keyed, unlike the relationships key above: a delta is per printing. */
export const ADMIN_PRINTING_DELTA_KEY = ["admin", "printing-delta"] as const;

/**
 * Locks are per row, and every admin save adds to them, so this rides on
 * `cardsQueryKeys.all` — which every card mutation already invalidates — rather
 * than needing each of them to remember a second key.
 */
export const adminPrintingLocksQueryKey = (printingId: string) =>
  [...cardsQueryKeys.all, "admin", "locks", printingId] as const;

/**
 * Admin server actions resolve with `{ ok: false }` instead of throwing, so
 * `useMutation` would otherwise treat a rejected edit as a success. Rethrowing
 * here puts failures on `mutation.error` and keeps `onSuccess` honest.
 *
 * Callers that need to run something only after a successful edit (navigate,
 * close a dialog) should `await mutateAsync(...)` inside a `try`/`catch` — the
 * toast is already handled, so an empty `catch` that returns early is correct.
 */
function unwrap<T>(result: AdminResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function useToastMutation<TArgs extends unknown[], TData>(
  run: (...args: TArgs) => Promise<AdminResult<TData>>,
  successMessage: string | ((data: TData) => string),
  invalidate: () => void,
) {
  return useMutation({
    mutationFn: async (args: TArgs) => unwrap(await run(...args)),
    onSuccess: (data) => {
      invalidate();
      toast.success(
        typeof successMessage === "function"
          ? successMessage(data)
          : successMessage,
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Every admin mutation writes an audit row, so the log is stale after any of
 * them. Matches the key used by `admin-audit-log-view`.
 */
const ADMIN_AUDIT_LOG_KEY = ["admin", "audit-log"] as const;

export function useOracleMutations() {
  const queryClient = useQueryClient();
  const invalidateCards = () => {
    void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: ADMIN_AUDIT_LOG_KEY });
  };

  return {
    create: useToastMutation<
      [definition: AdminOracleDefinition],
      { oracle_id: string }
    >(createOracleAction, "Card created", invalidateCards),

    patch: useToastMutation<
      [
        oracleId: string,
        patch: AdminOraclePatch,
      ],
      { oracle_id: string }
    >(patchOracleAction, "Oracle saved", invalidateCards),

    remove: useToastMutation<[oracleId: string, reason?: string], { oracle_id: string }>(
      deleteOracleAction,
      "Card deleted",
      invalidateCards,
    ),

    setRelationships: useToastMutation<
      [
        oracleId: string,
        entries: AdminRelationshipEntry[],
      ],
      { oracle_id: string }
    >(setRelationshipsAction, "Relationships saved", () => {
      invalidateCards();
      void queryClient.invalidateQueries({
        queryKey: ADMIN_CARD_RELATIONSHIPS_KEY,
      });
    }),

  };
}

export const adminPrintingDeltaQueryKey = (printingId: string) =>
  [...ADMIN_PRINTING_DELTA_KEY, printingId] as const;

export function usePrintingMutations() {
  const queryClient = useQueryClient();
  const invalidateCards = () => {
    void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: ADMIN_AUDIT_LOG_KEY });
  };
  return {
    create: useToastMutation<
      [id: string, oracleId: string, setCode: string, definition: AdminPrintingDefinition],
      { printing_id: string }
    >(createPrintingAction, "Printing created", invalidateCards),
    patch: useToastMutation<
      [printingId: string, patch: AdminPrintingPatch, publicSlug?: string],
      { printing_id: string }
    >(patchPrintingAction, "Printing saved", invalidateCards),
    remove: useToastMutation<
      [printingId: string, reason?: string],
      { printing_id: string }
    >(deletePrintingAction, "Printing deleted", invalidateCards),
    restore: useToastMutation<
      [printingId: string, publicSlug?: string],
      { printing_id: string }
    >(restorePrintingAction, "Printing restored", invalidateCards),
    // The panel authors against the stored row, so the read has to be refetched
    // too — otherwise the next save starts from a stale draft and drops fields.
    delta: useToastMutation<
      [printingId: string, delta: AdminPrintingDelta | null, publicSlug?: string],
      { printing_id: string }
    >(setPrintingDeltaAction, "Printing delta saved", () => {
      invalidateCards();
      void queryClient.invalidateQueries({ queryKey: ADMIN_PRINTING_DELTA_KEY });
    }),
    regenerateSlug: useToastMutation<
      [printingId: string, previousSlug?: string],
      { public_slug: string }
    >(regenerateSlugAction, (data) => `Slug regenerated: ${data.public_slug}`, invalidateCards),
    uploadImage: useToastMutation<
      [cardId: string, formData: FormData],
      { queued: boolean }
    >(
      uploadCardImageAction,
      (data) =>
        data.queued
          ? "Image uploaded. Variants are being generated"
          : "Image uploaded. Variants will be generated on the next ingest",
      invalidateCards,
    ),
  };
}

export function useSetMutations() {
  const queryClient = useQueryClient();
  const invalidateSets = () => {
    void queryClient.invalidateQueries({ queryKey: setsQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: ADMIN_AUDIT_LOG_KEY });
  };

  return {
    create: useToastMutation<
      [setCode: string, definition: AdminSetDefinition],
      { set_code: string }
    >(createSetAction, "Set created", invalidateSets),

    patch: useToastMutation<
      [setCode: string, patch: AdminSetPatch, note?: string],
      { set_code: string }
    >(patchSetAction, "Set saved", invalidateSets),

    remove: useToastMutation<[setCode: string, reason?: string], { set_code: string }>(
      deleteSetAction,
      "Set deleted",
      invalidateSets,
    ),
  };
}

/** Query key for the admin format list, so a mutation can refresh the table. */
export const adminFormatsQueryKey = ["admin", "formats"] as const;

export function useFormatMutations() {
  const queryClient = useQueryClient();
  const invalidateFormats = () => {
    void queryClient.invalidateQueries({ queryKey: adminFormatsQueryKey });
  };

  return {
    create: useToastMutation<[input: AdminFormatInput], { code: string }>(
      createFormatAction,
      (data) => `Format “${data.code}” created`,
      invalidateFormats,
    ),

    patch: useToastMutation<
      [code: string, patch: AdminFormatPatch],
      { code: string }
    >(patchFormatAction, "Format saved", invalidateFormats),

    remove: useToastMutation<
      [code: string],
      { legalities_removed: number; overrides_removed: number }
    >(
      deleteFormatAction,
      (data) => {
        const removed = data.legalities_removed + data.overrides_removed;
        return removed > 0
          ? `Format deleted, along with ${removed} legality ${
              removed === 1 ? "entry" : "entries"
            }`
          : "Format deleted";
      },
      invalidateFormats,
    ),

    reorder: useToastMutation<[codes: string[]], { ok: true }>(
      reorderFormatsAction,
      "Format order saved",
      invalidateFormats,
    ),

    setZoneRule: useToastMutation<
      [code: string, zone: AdminDeckZone, rule: AdminFormatZoneRuleInput],
      { zone: AdminDeckZone }
    >(
      setFormatZoneRuleAction,
      (data) => `${DECK_ZONE_LABELS[data.zone]} rule saved`,
      invalidateFormats,
    ),

    // Idempotent by design, so a delete that found nothing still succeeds — the
    // zone is unconstrained either way, which is what the message says.
    deleteZoneRule: useToastMutation<
      [code: string, zone: AdminDeckZone],
      { zone: AdminDeckZone }
    >(
      deleteFormatZoneRuleAction,
      (data) => `${DECK_ZONE_LABELS[data.zone]} is now unconstrained`,
      invalidateFormats,
    ),

    setSeverity: useToastMutation<
      [
        code: string,
        legalityStatus: AdminLegalityStatus,
        severity: AdminViolationSeverityInput,
      ],
      { status: AdminLegalityStatus; severity: string | null }
    >(
      setFormatLegalitySeverityAction,
      (data) =>
        data.severity === null
          ? `${data.status} follows the default severity again`
          : `${data.status} now reads as ${data.severity}`,
      invalidateFormats,
    ),
  };
}

/**
 * Prefix key for every review-queue page. Resolving one entry invalidates the
 * whole prefix, because the status counts on the other tabs move too.
 */
export const adminReviewQueryKey = ["admin", "reconciliation"] as const;

export function useReviewMutations() {
  const queryClient = useQueryClient();
  const invalidateReview = () => {
    void queryClient.invalidateQueries({ queryKey: adminReviewQueryKey });
    // A confirmation writes a card override, so cached card reads are stale.
    void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all });
  };

  return {
    confirm: useToastMutation<
      [entryId: string, printingId?: string, oracleId?: string, note?: string],
      { printing_id: string | null; oracle_id: string | null }
    >(
      confirmReviewEntryAction,
      (data) =>
        data.printing_id || data.oracle_id
          ? `Confirmed and saved to ${data.printing_id ?? data.oracle_id}`
          : "Entry confirmed",
      invalidateReview,
    ),

    dismiss: useToastMutation<[entryId: string, note?: string], { entry_id: string }>(
      dismissReviewEntryAction,
      "Entry dismissed — it will not come back",
      invalidateReview,
    ),
  };
}

export const adminCardLegalitiesQueryKey = (cardId: string) =>
  ["admin", "card-legalities", cardId] as const;

export const adminCardRulingsQueryKey = (cardId: string) =>
  ["admin", "card-rulings", cardId] as const;

export function useCardLegalityMutations(cardId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: adminCardLegalitiesQueryKey(cardId),
    });
    void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all });
  };

  return {
    set: useToastMutation<
      [
        cardId: string,
        formatCode: string,
        status: AdminLegalityStatusInput,
        applyToAllPrintings: boolean,
        publicSlug?: string,
        note?: string | null,
      ],
      { scope: "printing" | "oracle" }
    >(
      setCardLegalityAction,
      (data) =>
        data.scope === "oracle"
          ? "Legality saved for every printing"
          : "Legality saved for this printing",
      invalidate,
    ),
  };
}

/** Prefix key for every rulings-tab page, so a filter change refetches. */
export const adminRulingsQueryKey = ["admin", "rulings"] as const;

export function useRulingMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: adminRulingsQueryKey });
    // A rule target can cover cards the editor never named, so drop the card
    // caches wholesale rather than guessing which ones moved.
    void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all });
  };

  return {
    create: useToastMutation<
      [input: AdminRulingCreateInput],
      { ok: true; ruling: AdminRuling }
    >(
      createRulingAction,
      (data) => rulingSavedMessage(data.ruling, "created"),
      invalidate,
    ),

    patch: useToastMutation<
      [rulingId: string, patch: AdminRulingRecordPatch],
      { ok: true; ruling: AdminRuling }
    >(
      patchRulingAction,
      (data) => rulingSavedMessage(data.ruling, "saved"),
      invalidate,
    ),

    remove: useToastMutation<[rulingId: string], { ruling_id: string }>(
      deleteRulingAction,
      "Ruling deleted",
      invalidate,
    ),
  };
}

/**
 * Report what a rule actually caught. A rule that saves cleanly but matches
 * nothing is the most likely mistake, and the count is the only signal of it.
 */
function rulingSavedMessage(
  ruling: AdminRuling,
  verb: "created" | "saved",
): string {
  const matched = ruling.targets
    .filter((target) => target.kind === "query")
    .reduce((sum, target) => sum + (target.match_count ?? 0), 0);
  const hasRule = ruling.targets.some((target) => target.kind === "query");
  if (!hasRule) return `Ruling ${verb}`;
  return `Ruling ${verb} — ${matched} card${matched === 1 ? "" : "s"} matched`;
}
