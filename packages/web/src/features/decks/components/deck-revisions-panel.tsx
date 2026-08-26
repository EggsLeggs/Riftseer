"use client";

import { useQuery } from "@tanstack/react-query";

import { listDeckRevisionsAction } from "../actions";
import { deckQueryKeys, decksApi } from "../api";
import { DECK_ZONE_LABELS, type DeckRevision, type DeckZone } from "../types";

/**
 * Recent history.
 *
 * The API coalesces edits inside a five-minute window into one revision, so a
 * burst of `+` presses is a single entry with the net change — which is what
 * makes this readable at all.
 */
function zoneLabel(zone: string): string {
  return DECK_ZONE_LABELS[zone as DeckZone] ?? zone;
}

function RevisionEntry({ revision }: { revision: DeckRevision }) {
  const when = new Date(revision.created_at);
  return (
    <li className="border-border border-b py-2 last:border-b-0">
      <div className="text-muted-foreground flex items-baseline gap-2 text-xs">
        <span className="tabular-nums">#{revision.ordinal}</span>
        <span>{revision.author?.username ?? "Unknown"}</span>
        {/* Next.js prerenders this client component on the server, where
            `toLocaleString()` reads the host locale and time zone rather than
            the viewer's — the two disagree and React reports a hydration
            mismatch. The browser's rendering is the correct one. */}
        <time dateTime={revision.created_at} suppressHydrationWarning>
          {when.toLocaleString()}
        </time>
      </div>
      <ul className="mt-1">
        {revision.changes.map((change) => {
          const delta = change.qty_after - change.qty_before;
          return (
            <li
              key={`${change.zone}:${change.printing_id}`}
              className="flex items-baseline gap-2 text-sm"
            >
              <span
                className={
                  delta > 0
                    ? "w-8 shrink-0 text-right tabular-nums text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground w-8 shrink-0 text-right tabular-nums"
                }
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
              <span className="min-w-0 truncate">{change.name ?? change.printing_id}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {zoneLabel(change.zone)}
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export function DeckRevisionsPanel({
  deckId,
  isSignedIn,
}: {
  deckId: string;
  /**
   * A signed-out visitor reads through the token-less client: the action would
   * answer "you are signed out" for a deck they can perfectly well read.
   */
  isSignedIn: boolean;
}) {
  const revisions = useQuery({
    queryKey: deckQueryKeys.revisions(deckId),
    queryFn: async () => {
      if (!isSignedIn) {
        const page = await decksApi.listRevisions(deckId);
        if (!page) throw new Error("This deck's history is not available.");
        return page;
      }
      const result = await listDeckRevisionsAction(deckId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30_000,
    retry: false,
  });

  if (revisions.isPending) {
    return <p className="text-muted-foreground text-sm">Loading history…</p>;
  }
  if (revisions.isError) {
    return (
      <p className="text-muted-foreground text-sm">
        {(revisions.error as Error).message}
      </p>
    );
  }
  if (revisions.data.items.length === 0) {
    return <p className="text-muted-foreground text-sm">No edits recorded yet.</p>;
  }
  return (
    <ul>
      {revisions.data.items.map((revision) => (
        <RevisionEntry key={revision.id} revision={revision} />
      ))}
    </ul>
  );
}
