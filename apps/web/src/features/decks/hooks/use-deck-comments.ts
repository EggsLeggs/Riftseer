"use client";

import { useQuery } from "@tanstack/react-query";

import { listDeckCommentsAction } from "../actions";
import { deckQueryKeys, decksApi } from "../api";

/**
 * The deck's comments, shared by the thread and the header's count chip: same
 * query key, so the page fetches once. The token matters — `can_delete` on
 * each row is computed against it — hence the signed-in/out fork.
 */
export function useDeckComments(deckId: string, isSignedIn: boolean) {
  return useQuery({
    queryKey: deckQueryKeys.comments(deckId),
    queryFn: async () => {
      if (!isSignedIn) {
        const page = await decksApi.listComments(deckId);
        if (!page) throw new Error("Comments are not available for this deck.");
        return page;
      }
      const result = await listDeckCommentsAction(deckId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30_000,
    retry: false,
  });
}
