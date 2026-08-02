import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { cardsApi } from "@/features/cards/api";
import { cardHref, cardPathFromPublicSlug } from "@/features/cards/paths";
import { cardMetadata } from "@/features/cards/seo";
import { isAdminSession } from "@/lib/session";
import { CardDetailView } from "@/views/cards/card-detail-view";

interface Props {
  params: Promise<{ slug: string; collector: string; slugTail?: string[] }>;
}

// generateMetadata and the page run in the same request, so a cached lookup with
// identical arguments costs one API call instead of two. The key is the joined
// slug because `cache()` compares arguments by identity.
const loadDetail = cache((joinedSlug: string) =>
  cardsApi.getDetail({ slug: joinedSlug.split("/") }),
);

async function resolveSlug(params: Props["params"]): Promise<string | null> {
  const { slug, collector, slugTail } = await params;
  const tail = slugTail ?? [];
  if (tail.length === 0) return null;
  return [slug, collector, ...tail].join("/");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const joined = await resolveSlug(params);
  const detail = joined ? await loadDetail(joined) : null;
  if (!detail) return { title: "Card not found — Riftseer" };
  return cardMetadata(
    detail.oracle,
    detail.printing,
    cardHref(detail.printing),
  );
}

/**
 * Canonical card URL: `/card/<set>/<collector>/<name>` or
 * `/card/<set>/<collector>/signature/<name>` — mirrors persisted `public_slug`.
 */
export default async function CardBySlugPage({ params }: Props) {
  const joined = await resolveSlug(params);
  if (!joined) notFound();

  const detail = await loadDetail(joined);
  if (!detail) notFound();

  const { printing } = detail;
  if (printing.public_slug && printing.public_slug !== joined) {
    permanentRedirect(cardPathFromPublicSlug(printing.public_slug));
  }

  return (
    <Suspense>
      <CardDetailView detail={detail} isAdmin={await isAdminSession()} />
    </Suspense>
  );
}
