import { notFound, permanentRedirect } from "next/navigation";

import { cardsApi } from "@/features/cards/api";
import { CardJsonView } from "@/features/cards/card-json-view";
import { cardPathFromPublicSlug } from "@/features/cards/paths";

/**
 * Legacy card URL: `/card/<id>` (opaque printing id). Redirects to the canonical
 * slug URL on **this** origin when `public_slug` is set (same host as localhost,
 * preview Workers URL, or production — unlike API `riftseer_uri`).
 */
export default async function CardByIdPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!slug) notFound();

  const card = await cardsApi.getById(slug);
  if (!card) notFound();

  if (card.public_slug) {
    permanentRedirect(cardPathFromPublicSlug(card.public_slug));
  }

  return <CardJsonView card={card} />;
}
