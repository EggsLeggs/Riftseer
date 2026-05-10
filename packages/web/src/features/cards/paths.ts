import type { Card } from "@riftseer/types";

/**
 * Relative pathname for a persisted `public_slug`.
 * Use this for redirects so dev/preview stay on the same origin — unlike
 * `card.riftseer_uri`, which is absolute and tied to `SITE_ORIGIN` on the API.
 */
export function cardPathFromPublicSlug(publicSlug: string): string {
  return `/card/${publicSlug
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;
}

/**
 * Best-available relative path for a card, preferring the canonical
 * `public_slug` route and falling back to the legacy `/card/<id>` lookup
 * when no slug has been persisted yet.
 */
export function cardHref(card: Pick<Card, "id" | "public_slug">): string {
  if (card.public_slug) return cardPathFromPublicSlug(card.public_slug);
  return `/card/${encodeURIComponent(card.id)}`;
}
