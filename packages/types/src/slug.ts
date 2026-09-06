/**
 * Slug rules and helpers for public site URLs.
 *
 * There are two, because there are two things to address:
 *
 *   printing  `<set>/<collector><a?>(/signature)?/<name>(-<n>)?`
 *             The persisted `printings.public_slug` — one physical card.
 *
 *   oracle    `<name>(-<n>)?`
 *             The persisted `oracles.slug` — the canonical page for the card,
 *             which renders through the preferred printing.
 *
 * Printing slug segments:
 *
 *   • <set>          — lowercased set code (`OGN` → `ogn`)
 *   • <collector>    — collector_number, with literal `a` appended for
 *                      alternate-art printings (unless the number already
 *                      ends with a non-digit, e.g. `12a`).
 *                      Printings with no collector number get the sentinel `x`.
 *   • signature      — present iff the printing is a signature printing
 *   • <name>         — slugifyCardName(name)
 *   • -<n>           — collision suffix (-2, -3, …) appended to the name
 *                      segment only, never to set/collector/signature.
 *
 * Both are generated on first insert and never overwritten, so links stay
 * stable as upstream data is corrected. Because the derivation is pure, a
 * catalogue rebuilt from the same upstream data regenerates identical slugs.
 */

/** The printing fields a slug is derived from — deliberately not a whole Printing. */
export interface SlugPrinting {
  id: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  alternateArt?: boolean;
  signature?: boolean;
}

/** Sentinel used as the collector segment when a card has no collector number. */
export const MISSING_COLLECTOR_SEGMENT = "x";

/**
 * Lowercase, ASCII-fold, hyphenate.  Strips apostrophes, replaces non-alnum
 * characters with hyphens, collapses runs and trims edges.  Stars (`★`) and
 * other Unicode embellishments are stripped — the `signature` segment carries
 * that signal in URLs.
 */
export function slugifyCardName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .toLowerCase()
    .replace(/['\u2019]/g, "") // apostrophes → nothing
    .replace(/[^a-z0-9]+/g, "-") // anything else → hyphen
    .replace(/^-+|-+$/g, "") // trim hyphens
    .replace(/-{2,}/g, "-");
}

/**
 * Build the segments that form a printing's public_slug.  Collision-suffixing
 * is the caller's responsibility (see {@link withNameCollisionSuffix}).
 */
export function buildPublicSlugSegments(printing: SlugPrinting): string[] {
  const setCode = printing.setCode?.toLowerCase() ?? "";

  // Lowercased so prefixed tracks (`T03`, `SP3`, `R01`) give the same
  // all-lowercase path shape as every other slug segment.
  let collector = printing.collectorNumber?.toLowerCase() ?? "";
  if (printing.alternateArt && collector && /\d$/.test(collector)) {
    collector = `${collector}a`;
  }
  if (!collector) collector = MISSING_COLLECTOR_SEGMENT;

  const name = slugifyCardName(printing.name) || "card";

  const segments: string[] = [setCode || "unknown", collector];
  if (printing.signature) segments.push("signature");
  segments.push(name);
  return segments;
}

/** Join slug segments into the persisted form (no leading slash). */
export function joinPublicSlug(segments: string[]): string {
  return segments.join("/");
}

/** Apply a collision suffix (`-2`, `-3`, …) to the final (name) segment. */
export function withNameCollisionSuffix(
  segments: string[],
  attempt: number,
): string[] {
  if (attempt <= 1 || segments.length === 0) return segments;
  const next = segments.slice();
  next[next.length - 1] = `${next[next.length - 1]}-${attempt}`;
  return next;
}

/**
 * Pick the first non-colliding slug for a printing.  `isTaken` is called with
 * the candidate slug — the caller decides what "taken" means (DB row, batch
 * entry).
 */
export function generatePublicSlug(
  printing: SlugPrinting,
  isTaken: (slug: string) => boolean,
): string {
  const base = buildPublicSlugSegments(printing);
  for (let attempt = 1; attempt < 1000; attempt++) {
    const candidate = joinPublicSlug(withNameCollisionSuffix(base, attempt));
    if (!isTaken(candidate)) return candidate;
  }
  // Fall back to id-suffixed slug — extraordinarily unlikely to be reached.
  return `${joinPublicSlug(base)}-${printing.id.slice(-6)}`;
}

/**
 * Pick the first non-colliding oracle slug for `name`.
 *
 * A single segment: the oracle page is `/card/brush`, and the printing pages
 * hang off the set/collector form. Collisions are real — two genuinely
 * different cards can slugify identically — so the same `-2` suffix applies.
 */
export function generateOracleSlug(
  name: string,
  isTaken: (slug: string) => boolean,
): string {
  const base = slugifyCardName(name) || "card";
  for (let attempt = 1; attempt < 1000; attempt++) {
    const candidate = attempt <= 1 ? base : `${base}-${attempt}`;
    if (!isTaken(candidate)) return candidate;
  }
  return base;
}

/** Strip trailing slashes from an origin like `https://riftseer.com/`. */
export function normalizeSiteOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
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
  const origin = normalizeSiteOrigin(siteOrigin);
  const path = publicSlug
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `${origin}/card/${path}`;
}
