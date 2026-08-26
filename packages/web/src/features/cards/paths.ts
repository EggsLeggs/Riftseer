import type { OracleRef } from "@riftseer/types";

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
export function cardHref(printing: {
  id: string;
  // Nullable rather than `Pick<Printing, …>`: the fallback below exists exactly
  // because a slug may be absent, and deck payloads report it as `null`.
  public_slug?: string | null;
}): string {
  if (printing.public_slug) return cardPathFromPublicSlug(printing.public_slug);
  return `/card/${encodeURIComponent(printing.id)}`;
}

/** Oracle refs use the single-segment slug route, not the legacy printing-id lookup. */
export function oracleHref(oracle: Pick<OracleRef, "slug">): string {
  return `/card/${encodeURIComponent(oracle.slug)}`;
}
