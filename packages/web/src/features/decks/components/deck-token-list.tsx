"use client";

import Link from "next/link";

import { cardHref } from "@/features/cards/paths";
import type { DeckToken } from "../types";

/**
 * The tokens this deck makes.
 *
 * Derived from `makes_token` edges, never stored membership — so there is no
 * quantity, no stepper and no remove. A token leaves this list by cutting the
 * card that makes it, which is why each row names its sources.
 */
export function DeckTokenList({ tokens }: { tokens: readonly DeckToken[] }) {
  if (tokens.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No cards in this deck make tokens.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
      {tokens.map((token) => (
        <li key={token.printing_id} className="flex items-baseline gap-2 text-sm">
          <Link
            href={cardHref({ id: token.printing_id, public_slug: token.public_slug })}
            className="truncate underline-offset-4 hover:underline"
          >
            {token.name}
          </Link>
          {token.card_type && (
            <span className="text-muted-foreground shrink-0 text-xs">{token.card_type}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
