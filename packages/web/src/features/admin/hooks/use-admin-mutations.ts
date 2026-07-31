"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cardsQueryKeys } from "@/features/cards/api";
import { setsQueryKeys } from "@/features/sets/api";
import {
  createCardAction,
  createSetAction,
  deleteCardAction,
  deleteSetAction,
  moveCardAction,
  patchCardAction,
  patchSetAction,
  regenerateSlugAction,
  setRelationshipsAction,
  uploadCardImageAction,
} from "../actions";
import type {
  AdminCardDefinition,
  AdminCardPatch,
  AdminRelationshipEntry,
  AdminResult,
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
