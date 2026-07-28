import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { cardsApi } from "@/features/cards/api";
import { cardHref, cardPathFromPublicSlug } from "@/features/cards/paths";
import { cardMetadata } from "@/features/cards/seo";
import { CardDetailView } from "@/views/cards/card-detail-view";

interface Props {
  params: Promise<{ slug: string }>;
}

// generateMetadata and the page run in the same request, so a cached lookup with
// identical arguments costs one API call instead of two.
const loadDetail = cache((id: string) => cardsApi.getDetail({ id }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const detail = slug ? await loadDetail(slug) : null;
  if (!detail) return { title: "Card not found — Riftseer" };
  return cardMetadata(detail.card, cardHref(detail.card));
}

/**
 * Legacy card URL: `/card/<id>` (opaque printing id). Redirects to the canonical
 * slug URL on **this** origin when `public_slug` is set (same host as localhost,
 * preview Workers URL, or production — unlike API `riftseer_uri`).
 */
export default async function CardByIdPage({ params }: Props) {
  const { slug } = await params;
  if (!slug) notFound();

  const detail = await loadDetail(slug);
  if (!detail) notFound();

  if (detail.card.public_slug) {
    permanentRedirect(cardPathFromPublicSlug(detail.card.public_slug));
  }

  return (
    <Suspense>
      <CardDetailView detail={detail} />
    </Suspense>
  );
}
