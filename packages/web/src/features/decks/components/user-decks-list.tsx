"use client";

import { useQuery } from "@tanstack/react-query";

import { listDecksByHandleAction } from "../actions";
import { deckQueryKeys } from "../api";
import { DeckSummaryCard } from "./deck-summary-card";

/**
 * A profile's decks.
 *
 * The API decides what this caller may see — their own private decks on their
 * own profile, only the public ones on anybody else's — so there is nothing to
 * filter here.
 */
export function UserDecksList({
  handle,
  isOwnProfile,
}: {
  handle: string;
  isOwnProfile: boolean;
}) {
  const decks = useQuery({
    queryKey: deckQueryKeys.byHandle(handle),
    queryFn: async () => {
      const result = await listDecksByHandleAction(handle);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30_000,
    retry: false,
  });

  if (decks.isPending) {
    return <p className="text-muted-foreground py-8 text-center text-sm">Loading decks…</p>;
  }
  if (decks.isError) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {(decks.error as Error).message}
      </p>
    );
  }
  if (decks.data.items.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {isOwnProfile
          ? "You have no decks yet."
          : "This user has no public decks."}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {decks.data.items.map((deck) => (
        <DeckSummaryCard key={deck.id} deck={deck} showOwner={false} />
      ))}
    </ul>
  );
}
