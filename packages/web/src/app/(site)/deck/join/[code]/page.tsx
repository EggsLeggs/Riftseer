import type { Metadata } from "next";

import { deckJoinHref } from "@/features/decks/paths";
import { requireAuth } from "@/lib/session";
import { DeckJoinView } from "@/views/decks/deck-join-view";

export const metadata: Metadata = {
  title: "Join a deck — Riftseer",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ code: string }>;
}

/**
 * `/deck/join/<code>`. A static segment, so it wins over `/deck/<id>/…`.
 *
 * The session is resolved here and the redemption itself happens on the client
 * from a button, because joining writes a collaborator row and a page render
 * must not.
 */
export default async function DeckJoinPage({ params }: Props) {
  const { code } = await params;
  await requireAuth(deckJoinHref(code));
  return <DeckJoinView code={code} />;
}
