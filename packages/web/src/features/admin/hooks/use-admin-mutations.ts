"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cardsQueryKeys } from "@/features/cards/api";
import { setsQueryKeys } from "@/features/sets/api";
import {
  confirmReviewEntryAction,
  createCardAction,
  createCardRulingAction,
  createFormatAction,
  createRulingAction,
  createSetAction,
  deleteCardAction,
  deleteCardRulingAction,
  deleteFormatAction,
  deleteRulingAction,
  deleteSetAction,
  dismissReviewEntryAction,
  moveCardAction,
  patchCardAction,
  patchCardRulingAction,
  patchFormatAction,
  patchRulingAction,
  patchSetAction,
  regenerateSlugAction,
  reorderFormatsAction,
  setCardLegalityAction,
  setRelationshipsAction,
  uploadCardImageAction,
} from "../actions";
import type {
  AdminCardDefinition,
  AdminCardPatch,
  AdminFormatInput,
  AdminFormatPatch,
  AdminLegalityStatusInput,
  AdminRelationshipEntry,
  AdminResult,
  AdminRuling,
  AdminRulingCreateInput,
  AdminRulingInput,
  AdminRulingPatch,
  AdminRulingRecordPatch,
  AdminSetDefinition,
  AdminSetPatch,
} from "../types";

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

export function useCardMutations() {
  const queryClient = useQueryClient();
  const invalidateCards = () => {
    void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: ADMIN_AUDIT_LOG_KEY });
  };

  return {
    create: useToastMutation<
      [id: string, definition: AdminCardDefinition],
      { card_id: string }
    >(createCardAction, "Card created", invalidateCards),

    patch: useToastMutation<
      [
        cardId: string,
        patch: AdminCardPatch,
        opts?: { note?: string; publicSlug?: string },
      ],
      { card_id: string }
    >(patchCardAction, "Card saved", invalidateCards),

    remove: useToastMutation<[cardId: string, reason?: string], { card_id: string }>(
      deleteCardAction,
      "Card deleted",
      invalidateCards,
    ),

    regenerateSlug: useToastMutation<
      [cardId: string, previousSlug?: string],
      { public_slug: string }
    >(
      regenerateSlugAction,
      (data) => `Slug regenerated: ${data.public_slug}`,
      invalidateCards,
    ),

    move: useToastMutation<
      [cardId: string, setCode: string, publicSlug?: string],
      { card_id: string }
    >(moveCardAction, "Card moved", invalidateCards),

    setRelationships: useToastMutation<
      [cardId: string, entries: AdminRelationshipEntry[], publicSlug?: string],
      { card_id: string }
    >(setRelationshipsAction, "Relationships saved", invalidateCards),

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
      [entryId: string, cardId?: string, note?: string],
      { card_id: string | null }
    >(
      confirmReviewEntryAction,
      (data) =>
        data.card_id
          ? `Confirmed and saved to ${data.card_id}`
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

export function useCardRulingMutations(cardId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: adminCardRulingsQueryKey(cardId),
    });
    void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all });
  };

  return {
    create: useToastMutation<
      [cardId: string, input: AdminRulingInput, publicSlug?: string],
      { ruling_id: string }
    >(createCardRulingAction, "Entry added", invalidate),

    patch: useToastMutation<
      [
        cardId: string,
        rulingId: string,
        patch: AdminRulingPatch,
        publicSlug?: string,
      ],
      { ruling_id: string }
    >(patchCardRulingAction, "Entry saved", invalidate),

    remove: useToastMutation<
      [cardId: string, rulingId: string, publicSlug?: string],
      { ruling_id: string }
    >(deleteCardRulingAction, "Entry deleted", invalidate),
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
