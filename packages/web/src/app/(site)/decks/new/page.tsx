import { Suspense } from "react";
import type { Metadata } from "next";

import { getSession } from "@/lib/session";
import { GuestDeckBuilderView } from "@/views/decks/guest-deck-builder-view";
import { NewDeckView } from "@/views/decks/deck-guest-save-view";

export const metadata: Metadata = {
  title: "New deck — Riftseer",
  robots: { index: false, follow: false },
};

/**
 * One route, two builders, chosen by whether there is a session.
 *
 * Signed out this used to redirect to the login page, which asked for an
 * account before the user had any reason to want one. It now renders the guest
 * builder: the deck lives in localStorage, exports as text, and becomes a real
 * deck the moment they sign in. Signed in, nothing has changed — except that
 * `?save=1` on the way back from that sign-in is the cue to convert.
 */
export default async function NewDeckPage() {
  const session = await getSession();
  if (!session) return <GuestDeckBuilderView />;
  // `NewDeckView` reads `?save=1`, which needs a boundary to render statically.
  return (
    <Suspense fallback={null}>
      <NewDeckView />
    </Suspense>
  );
}
