/**
 * Site URLs for cards, derived one way for every surface.
 *
 * Relative paths are for the site itself, so dev and preview stay on their own
 * origin. Absolute URLs take a `siteOrigin` and are what the API stamps onto
 * payloads as `riftseer_uri`; a bot prefers that field and only falls back to
 * building a URL when the API left it out.
 */

/** Strip trailing slashes from an origin like `https://riftseer.com/`. */
export function normalizeSiteOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

/** Relative pathname for a persisted `public_slug` or oracle `slug`. */
export function cardPathFromPublicSlug(publicSlug: string): string {
  return `/card/${publicSlug
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;
}

/**
 * Best-available relative path for a printing, preferring the canonical
 * `public_slug` route and falling back to the permanent `/card/<id>`
 * compatibility route when no slug has been persisted yet.
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

/** Oracle refs use the single-segment slug route, never the printing-id lookup. */
export function oracleHref(oracle: { slug: string }): string {
  return cardPathFromPublicSlug(oracle.slug);
}

/**
 * Build an absolute site URL for a card.  Returns `undefined` when either the
 * origin or slug is empty so callers can no-op cleanly.
 */
export function absoluteRiftseerUri(
  siteOrigin: string | undefined | null,
  publicSlug: string | undefined | null,
): string | undefined {
  if (!siteOrigin || !publicSlug) return undefined;
  return `${normalizeSiteOrigin(siteOrigin)}${cardPathFromPublicSlug(publicSlug)}`;
}

/**
 * The absolute URL a client links a resolved card to. Prefer the API's
 * `riftseer_uri` so clients follow whatever path scheme the API decides on;
 * fall back to the `/card/<id>` compatibility route only when the API has not
 * filled it in (`SITE_ORIGIN` unset, or pre-backfill rows).
 */
export function cardSiteUrl(
  oracle: { id: string; riftseer_uri?: string },
  printing: { id: string; riftseer_uri?: string } | null | undefined,
  siteOrigin: string,
): string {
  if (printing?.riftseer_uri) return printing.riftseer_uri;
  if (oracle.riftseer_uri) return oracle.riftseer_uri;
  return `${normalizeSiteOrigin(siteOrigin)}/card/${printing?.id ?? oracle.id}`;
}
