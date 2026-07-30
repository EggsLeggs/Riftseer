"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cardsQueryKeys } from "@/features/cards/api";
import { setsQueryKeys } from "@/features/sets/api";
import {
  createCardAction,
  createCardRulingAction,
  createFormatAction,
  createSetAction,
  deleteCardAction,
  deleteCardRulingAction,
  deleteFormatAction,
  deleteSetAction,
  moveCardAction,
  patchCardAction,
  patchCardRulingAction,
  patchFormatAction,
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
  AdminRulingInput,
  AdminRulingPatch,
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
