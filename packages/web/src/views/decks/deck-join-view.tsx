"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { joinDeckAction } from "@/features/decks/actions";
import { deckHref, myDecksHref } from "@/features/decks/paths";

/**
 * Redeeming an invite link.
 *
 * Joining is a **write** — it adds a collaborator row — so it happens on a
 * button press, not while the page renders. A GET that mutates would also join
 * the deck for every link preview crawler that touched the URL.
 */
export function DeckJoinView({ code }: { code: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const join = async () => {
    setPending(true);
    setError(null);
    const result = await joinDeckAction(code);
    if (result.ok) {
      router.replace(deckHref({ id: result.data.deck_id }));
      return;
    }
    setPending(false);
    setError(result.error);
  };

  return (
    <div className="container max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Join this deck</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        You were invited to collaborate. Accepting adds you to the deck, and the
        owner can remove you at any time.
      </p>
      <p className="text-muted-foreground mt-4 font-mono text-xs">{code}</p>

      {error && <p className="text-destructive mt-4 text-sm">{error}</p>}

      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={join} disabled={pending}>
          {pending ? "Joining…" : "Accept invite"}
        </Button>
        <Button variant="outline" asChild>
          <Link href={myDecksHref()}>Not now</Link>
        </Button>
      </div>
    </div>
  );
}
