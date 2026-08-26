import { Suspense } from "react";
import type { Metadata } from "next";

import { getSession } from "@/lib/session";
import { DecksBrowseView } from "@/views/decks/decks-browse-view";

export const metadata: Metadata = {
  title: "Decks — Riftseer",
  description: "Build and share Riftbound decks on Riftseer.",
  // A person's deck list is theirs; there is nothing here for a crawler.
  robots: { index: false, follow: true },
};

export default async function DecksPage() {
  const session = await getSession();
  return (
    <Suspense fallback={null}>
      <DecksBrowseView isSignedIn={session !== null} />
    </Suspense>
  );
}
