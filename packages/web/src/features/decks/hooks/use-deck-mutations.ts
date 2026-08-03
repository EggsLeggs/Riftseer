"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  addDeckCollaboratorAction,
  clearDeckInviteAction,
  createDeckAction,
  deleteDeckAction,
  importDeckAction,
  patchDeckAction,
  removeDeckCollaboratorAction,
  setDeckInviteAction,
} from "../actions";
import { deckQueryKeys } from "../api";
import type {
  DeckCollaboratorResult,
  DeckCollaboratorRole,
  DeckCreateInput,
  DeckCreateResult,
  DeckDetail,
  DeckImportInput,
  DeckImportResult,
  DeckInviteResult,
  DeckPatch,
  DeckResult,
} from "../types";

/**
 * Deck writes as TanStack mutations, mirroring `use-admin-mutations`.
 *
 * Card changes are deliberately absent: they are batched and debounced by
 * `use-deck-editor`, which owns the queue and renders its own optimistic list.
 * Everything here is a one-shot form submit.
 */

/**
 * A deck action resolves with `{ ok: false }` rather than throwing, so
 * `useMutation` would otherwise call a rejected edit a success. Rethrowing puts
 * the API's own message on `mutation.error` and keeps `onSuccess` honest.
 */
function unwrap<T>(result: DeckResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function useToastMutation<TArgs extends unknown[], TData>(
  run: (...args: TArgs) => Promise<DeckResult<TData>>,
  successMessage: string | ((data: TData) => string),
  invalidate: () => void,
) {
  return useMutation({
    mutationFn: async (args: TArgs) => unwrap(await run(...args)),
    onSuccess: (data) => {
      invalidate();
      toast.success(
        typeof successMessage === "function" ? successMessage(data) : successMessage,
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/** Every deck cache: a rename moves the deck's row in every list it appears in. */
function useInvalidateDecks() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: deckQueryKeys.all });
  };
}

export function useDeckLifecycleMutations() {
  const invalidate = useInvalidateDecks();
  return {
    create: useToastMutation<[input: DeckCreateInput], DeckCreateResult>(
      createDeckAction,
      (deck) => `“${deck.name}” created`,
      invalidate,
    ),
    import: useToastMutation<[input: DeckImportInput], DeckImportResult>(
      importDeckAction,
      (result) =>
        result.unresolved.length === 0
          ? `Imported ${result.imported} card${result.imported === 1 ? "" : "s"}`
          : `Imported ${result.imported}, ${result.unresolved.length} line${
              result.unresolved.length === 1 ? "" : "s"
            } need attention`,
      invalidate,
    ),
  };
}

export function useDeckMutations(deckId: string) {
  const invalidate = useInvalidateDecks();
  return {
    patch: useToastMutation<[deckId: string, patch: DeckPatch], DeckDetail>(
      patchDeckAction,
      "Deck saved",
      invalidate,
    ),
    remove: useToastMutation<[deckId: string], { message: string }>(
      deleteDeckAction,
      "Deck deleted",
      invalidate,
    ),
    setInvite: useToastMutation<
      [deckId: string, role?: DeckCollaboratorRole],
      DeckInviteResult
    >(setDeckInviteAction, "Invite link ready", invalidate),
    clearInvite: useToastMutation<[deckId: string], { message: string }>(
      clearDeckInviteAction,
      "Invite link revoked",
      invalidate,
    ),
    addCollaborator: useToastMutation<
      [deckId: string, handle: string, role?: DeckCollaboratorRole],
      DeckCollaboratorResult
    >(addDeckCollaboratorAction, "Collaborator added", invalidate),
    removeCollaborator: useToastMutation<
      [deckId: string, handle: string],
      { message: string }
    >(removeDeckCollaboratorAction, "Collaborator removed", invalidate),
    // Bound so a caller does not have to thread the id through every call site
    // and cannot accidentally patch a different deck.
    deckId,
  };
}
