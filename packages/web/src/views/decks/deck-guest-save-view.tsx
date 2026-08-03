"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { saveGuestDeck, type GuestDeckSaveOutcome } from "@/features/decks/guest-deck-save";
import { isGuestDeckEmpty, readGuestDeck, type GuestDeck } from "@/features/decks/guest-deck";
import { deckBuilderHref, newDeckHref } from "@/features/decks/paths";
import { DeckCreateView } from "@/views/decks/deck-create-view";

/**
 * `/decks/new` for a signed-in user.
 *
 * Normally this is the create form, unchanged. The one addition is the return
 * leg of "sign in to save": `?save=1` says a deck was built signed-out, so the
 * stored blob is looked for and turned into a real deck before the form is
 * offered. With no stored deck — a bookmarked link, a different browser, a
 * cleared store — it is the create form as before, because there is nothing to
 * convert and saying so would only confuse.
 *
 * The read happens in an effect: localStorage does not exist on the server, and
 * this component is rendered by a server page.
 */
export function NewDeckView() {
  const router = useRouter();
  const params = useSearchParams();
  const wantsSave = params.get("save") === "1";

  const [deck, setDeck] = React.useState<GuestDeck | null>(null);
  const [checked, setChecked] = React.useState(false);
  const [outcome, setOutcome] = React.useState<GuestDeckSaveOutcome | null>(null);
  const [saving, setSaving] = React.useState(false);
  const started = React.useRef(false);

  React.useEffect(() => {
    setDeck(wantsSave ? readGuestDeck() : null);
    setChecked(true);
  }, [wantsSave]);

  const save = React.useCallback(
    async (target: GuestDeck) => {
      setSaving(true);
      const result = await saveGuestDeck(target);
      setSaving(false);
      setOutcome(result);
      if (result.ok) {
        toast.success("Deck saved to your account");
        router.replace(deckBuilderHref({ id: result.deckId, name: result.name }));
      }
    },
    [router],
  );

  // Attempted once, automatically: the user asked for this by pressing "Sign in
  // to save" and then signing in, so a second confirmation is a step with no
  // decision in it. A failure stops the automation and hands control back.
  React.useEffect(() => {
    if (!checked || started.current || isGuestDeckEmpty(deck) || !deck) return;
    started.current = true;
    void save(deck);
  }, [checked, deck, save]);

  if (!checked) return null;

  if (deck && !isGuestDeckEmpty(deck)) {
    const failed = outcome && !outcome.ok ? outcome : null;
    return (
      <div className="container max-w-xl py-16">
        <h1 className="text-xl font-semibold tracking-tight">
          {failed ? "Couldn't save your deck" : "Saving your deck…"}
        </h1>

        {failed ? (
          <>
            <p className="text-destructive mt-3 text-sm">{failed.error}</p>
            <p className="text-muted-foreground mt-2 text-sm">
              {failed.deckId
                ? "The deck was created but its cards did not land. Your local copy is untouched — try again, or open the deck and add them there."
                : "Your deck is still here in this browser. Nothing has been lost."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button disabled={saving} onClick={() => void save(deck)}>
                {saving ? "Saving…" : "Try again"}
              </Button>
              {failed.deckId && (
                <Button variant="outline" asChild>
                  <Link href={deckBuilderHref({ id: failed.deckId, name: failed.name })}>
                    Open the deck
                  </Link>
                </Button>
              )}
              <Button variant="ghost" asChild>
                <Link href={newDeckHref()}>Back to the builder</Link>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Creating the deck and adding {deck.cards.length} row
            {deck.cards.length === 1 ? "" : "s"}.
          </p>
        )}
      </div>
    );
  }

  return <DeckCreateView />;
}
