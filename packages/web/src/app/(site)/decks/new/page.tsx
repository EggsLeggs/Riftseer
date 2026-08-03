import type { Metadata } from "next";

import { newDeckHref } from "@/features/decks/paths";
import { requireAuth } from "@/lib/session";
import { DeckCreateView } from "@/views/decks/deck-create-view";

export const metadata: Metadata = {
  title: "New deck — Riftseer",
  robots: { index: false, follow: false },
};

export default async function NewDeckPage() {
  await requireAuth(newDeckHref());
  return <DeckCreateView />;
}
