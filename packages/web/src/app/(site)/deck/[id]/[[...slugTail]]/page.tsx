import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { deckHref, deckSlugTail } from "@/features/decks/paths";
import { loadDeckForViewer } from "@/features/decks/server-loader";
import { getSession } from "@/lib/session";
import { DeckView } from "@/views/decks/deck-view";

/**
 * `/deck/<id>/<tail>` — the deck page, which is also the builder: editing is
 * modeless, so there is no separate URL for it.
 *
 * The tail is cosmetic and derived from the current name, so a link copied
 * before a rename still resolves and is redirected onto the current spelling.
 * The id alone is the identity; nothing is pinned.
 */

interface Props {
  params: Promise<{ id: string; slugTail?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const deck = await loadDeckForViewer(id);
  if (!deck) return { title: "Deck not found — Riftseer" };
  return {
    title: `${deck.name} — Riftseer`,
    description: deck.description ?? `A Riftbound deck on Riftseer.`,
    // Only a public deck belongs in an index; an unlisted deck's link is its
    // credential and a crawler must not spread it.
    robots:
      deck.visibility === "public"
        ? { index: true, follow: true }
        : { index: false, follow: false },
  };
}

export default async function DeckPage({ params, searchParams }: Props) {
  const { id, slugTail } = await params;
  const query = await searchParams;

  const deck = await loadDeckForViewer(id);
  // 404 covers "no such deck" and "not yours" alike — the API refuses to
  // distinguish them and neither should this page.
  if (!deck) notFound();

  const currentTail = deckSlugTail(deck.name);
  const requestedTail = slugTail?.join("/") ?? null;
  // `edit` is the retired builder flag: editing is modeless now, so old
  // `?edit=1` links are redirected onto the plain deck URL.
  if (requestedTail !== currentTail || firstValue(query.edit) != null) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      const single = firstValue(value);
      if (single != null && key !== "edit") params.set(key, single);
    }
    const qs = params.toString();
    // 307, not 308: the tail is derived from the deck's *current* name, so a
    // permanent redirect would let browsers and CDNs cache a mapping that the
    // next rename invalidates.
    redirect(qs ? `${deckHref(deck)}?${qs}` : deckHref(deck));
  }

  return (
    <DeckView
      deck={deck}
      showRevisions={firstValue(query.view) === "revisions"}
      showGuide={firstValue(query.view) === "guide"}
      isSignedIn={(await getSession()) !== null}
    />
  );
}
