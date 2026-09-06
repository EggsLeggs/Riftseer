/**
 * Search queries and hrefs for the clickable bits of a card — type line, tags,
 * domains, artist and keyword badges.
 *
 * The strings produced here are real queries in the site search language (see
 * `views/search-syntax-view.tsx`), not a private format: whatever a click
 * navigates to is something the user could have typed, and can edit afterwards.
 *
 * Framework-free on purpose so server and client components can both import it.
 */

import type { Oracle } from "@riftseer/types";
import { keywordBaseKey } from "@riftseer/types/keywords";

/**
 * Quote a filter value when a bare word would not survive the lexer.
 *
 * Bare words end at whitespace or a parenthesis, so anything containing those —
 * or a quote of its own — has to be quoted and escaped. A comma is quoted for a
 * different reason: `kw:`, `tag:` and `d:` read an *unquoted* comma list as an
 * OR, so `tag:a,b` would search two tags instead of the one that was clicked.
 * Everything else is left alone, which keeps the common case (`tag:poro`)
 * readable in the URL bar.
 */
export function quoteSearchValue(value: string): string {
  const trimmed = value.trim();
  if (!/[\s(),"\\]/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/([\\"])/g, "\\$1")}"`;
}

/** `/search?q=…` for a ready-made query string. */
export function searchHref(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}

/** `tag:poro` — classification tags only, not the broader `t:`. */
export function tagSearchQuery(tag: string): string {
  return `tag:${quoteSearchValue(tag)}`;
}

/** `a:"Kudos Productions"` — illustrator name. */
export function artistSearchQuery(artist: string): string {
  return `a:${quoteSearchValue(artist)}`;
}

/** `d:body` — a single domain among the card's domains. */
export function domainSearchQuery(domain: string): string {
  return `d:${quoteSearchValue(domain)}`;
}

/**
 * `kw:deathknell` — folded to the base key, so clicking `[Deflect 3]` finds
 * every Deflect card rather than only the ones printed with a 3.
 */
export function keywordSearchQuery(label: string): string {
  return `kw:${quoteSearchValue(keywordBaseKey(label))}`;
}

/**
 * The query matching a card's printed type line.
 *
 * Mirrors `cardTypeLine` in `./format.ts` branch for branch, so the query always
 * describes the label the user actually clicked. The compound case is the point:
 * a Signature Unit is `st:signature t:unit` — two filters — because
 * `t:"signature unit"` is not a type any card carries and would match nothing.
 *
 * Returns null when the card has no type line worth linking.
 */
export function cardTypeLineSearchQuery(
  oracle: Pick<Oracle, "card_type" | "supertype" | "is_token">,
): string | null {
  const type = oracle.card_type?.trim() || undefined;
  const supertype = oracle.supertype?.trim() || undefined;
  const typeKey = type?.toLowerCase();

  // Legends drop their supertype from the label, so the query drops it too.
  if (typeKey === "legend") return `t:${quoteSearchValue(type!)}`;
  if (type && supertype) {
    return `st:${quoteSearchValue(supertype)} t:${quoteSearchValue(type)}`;
  }
  // Labelled "Token Unit" but typed "Token": `is:token` is what the label means,
  // and it also catches tokens flagged by name or riftbound_id rather than type.
  if (typeKey === "token" || oracle.is_token) return "is:token";
  if (type) return `t:${quoteSearchValue(type)}`;
  if (supertype) return `st:${quoteSearchValue(supertype)}`;
  return null;
}
