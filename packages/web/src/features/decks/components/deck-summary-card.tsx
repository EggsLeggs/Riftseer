import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { deckHref, userDecksHref } from "../paths";
import type { DeckSummary } from "../types";

/**
 * One deck in a list. Links through `deckHref`, never a hand-built URL, so the
 * cosmetic name tail stays in one place.
 */
export function DeckSummaryCard({
  deck,
  showOwner = true,
}: {
  deck: DeckSummary;
  showOwner?: boolean;
}) {
  return (
    <li className="hover:border-foreground/20 rounded-lg border p-3 transition-colors">
      <div className="flex items-start gap-2">
        <Link
          href={deckHref(deck)}
          className="min-w-0 flex-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          {deck.name}
        </Link>
        {deck.visibility !== "public" && (
          <Badge variant="outline" className="shrink-0 capitalize">
            {deck.visibility}
          </Badge>
        )}
        {deck.role && deck.role !== "owner" && (
          <Badge variant="secondary" className="shrink-0 capitalize">
            {deck.role}
          </Badge>
        )}
      </div>

      {deck.description && (
        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{deck.description}</p>
      )}

      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {deck.format && <span>{deck.format.name}</span>}
        {showOwner && deck.owner?.handle && (
          <Link href={userDecksHref(deck.owner.handle)} className="hover:underline">
            @{deck.owner.handle}
          </Link>
        )}
        <time dateTime={deck.updated_at}>
          Updated {new Date(deck.updated_at).toLocaleDateString()}
        </time>
      </div>
    </li>
  );
}
