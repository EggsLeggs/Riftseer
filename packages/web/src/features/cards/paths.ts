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
