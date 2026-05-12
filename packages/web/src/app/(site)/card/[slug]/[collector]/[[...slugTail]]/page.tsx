import { notFound, permanentRedirect } from "next/navigation";

import { cardsApi } from "@/features/cards/api";
import { CardJsonView } from "@/features/cards/card-json-view";
import { cardPathFromPublicSlug } from "@/features/cards/paths";

/**
 * Canonical card URL: `/card/<set>/<collector>/<name>` or
 * `/card/<set>/<collector>/signature/<name>` — mirrors persisted `public_slug`.
 */
export default async function CardBySlugPage({
  params,
}: {
  params: Promise<{ slug: string; collector: string; slugTail?: string[] }>;
}) {
  const { slug, collector, slugTail } = await params;
  const tail = slugTail ?? [];
  if (tail.length === 0) notFound();

  const segments = [slug, collector, ...tail];
  const card = await cardsApi.getByPublicSlug(segments);
  if (!card) notFound();

  const joined = segments.join("/");
  if (card.public_slug && card.public_slug !== joined) {
    permanentRedirect(cardPathFromPublicSlug(card.public_slug));
  }

  return <CardJsonView card={card} />;
}
