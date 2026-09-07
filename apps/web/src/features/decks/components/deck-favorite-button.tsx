"use client";

import * as React from "react";
import Link from "next/link";
import { HeartIcon } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { setDeckFavoriteAction } from "../actions";
import { deckHref } from "../paths";
import { cn } from "@/lib/utils";
import type { DeckDetail } from "../types";

/** Shared with the other header chips so favorite, views, comments and folder match. */
export const HEADER_ACTION_CLASS =
  "text-foreground bg-background/40 hover:bg-background/60 h-7 gap-1 px-2 backdrop-blur-sm";

/** Format and visibility: the action-chip paint, no chevron. */
export const HEADER_SELECT_CLASS = cn(
  buttonVariants({ variant: "outline", size: "sm" }),
  HEADER_ACTION_CLASS,
  "[&_svg]:hidden",
);

/**
 * A header chip that is not a control — views. Same paint as the buttons,
 * no hover, no click. `pointer-events-none` is the whole behaviour.
 */
export function HeaderActionStat({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <span
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        HEADER_ACTION_CLASS,
        "pointer-events-none",
      )}
      aria-label={label}
    >
      {children}
    </span>
  );
}

/**
 * The heart: favorite the deck, with the live count beside it.
 *
 * Optimistic — the heart fills the moment it is pressed and the count moves
 * with it; the server's answer replaces both, and a failure puts them back.
 * Signed out it is a link into sign-in that lands back on this deck.
 */
export function DeckFavoriteButton({
  deck,
  isSignedIn,
}: {
  deck: DeckDetail;
  isSignedIn: boolean;
}) {
  const [state, setState] = React.useState({
    favorited: deck.is_favorited ?? false,
    count: deck.favorite_count,
  });
  const [pending, setPending] = React.useState(false);

  // A revalidated payload (someone else's favorite, a navigation back) wins
  // over whatever this button last showed.
  React.useEffect(() => {
    setState({ favorited: deck.is_favorited ?? false, count: deck.favorite_count });
  }, [deck.favorite_count, deck.is_favorited]);

  if (!isSignedIn) {
    return (
      <Button variant="outline" size="sm" className={HEADER_ACTION_CLASS} asChild>
        <Link
          href={`/auth/login?next=${encodeURIComponent(deckHref(deck))}`}
          aria-label="Sign in to favorite this deck"
        >
          <HeartIcon className="size-3.5" aria-hidden="true" />
          <span className="tabular-nums">{state.count}</span>
        </Link>
      </Button>
    );
  }

  const toggle = async () => {
    const next = !state.favorited;
    const before = state;
    setState({ favorited: next, count: Math.max(0, state.count + (next ? 1 : -1)) });
    setPending(true);
    const result = await setDeckFavoriteAction(deck.id, next);
    setPending(false);
    if (result.ok) {
      setState({ favorited: result.data.favorited, count: result.data.favorite_count });
    } else {
      setState(before);
      toast.error(result.error);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={HEADER_ACTION_CLASS}
      disabled={pending}
      aria-pressed={state.favorited}
      aria-label={state.favorited ? "Unfavorite this deck" : "Favorite this deck"}
      onClick={toggle}
    >
      <HeartIcon
        className={cn(
          "size-3.5",
          state.favorited && "fill-red-500 text-red-500 dark:fill-red-400 dark:text-red-400",
        )}
        aria-hidden="true"
      />
      <span className="tabular-nums">{state.count}</span>
    </Button>
  );
}
