import type { Metadata } from "next";

import { importDeckHref } from "@/features/decks/paths";
import { requireAuth } from "@/lib/session";
import { DeckImportView } from "@/views/decks/deck-import-view";

export const metadata: Metadata = {
  title: "Import a deck — Riftseer",
  robots: { index: false, follow: false },
};

export default async function ImportDeckPage() {
  await requireAuth(importDeckHref());
  return <DeckImportView />;
}
