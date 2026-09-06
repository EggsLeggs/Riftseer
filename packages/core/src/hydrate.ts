/**
 * Response-time helpers that decorate payloads with absolute site URLs
 * (`riftseer_uri`). These are NEVER persisted — they are computed fresh on
 * each response from the configured site origin.
 *
 * This used to need a batched `getPublicSlugsByIds` round-trip on every
 * response, because a related-card stub carried an id and nothing else. An
 * `OracleRef` carries its own slug, so the lookup is gone: hydration is now a
 * pure function.
 */

import { absoluteRiftseerUri, normalizeSiteOrigin } from "@riftseer/types/slug";
import type { Oracle, Printing } from "./types.ts";

/** Add `riftseer_uri` to an oracle and to every relationship ref it carries. */
export function finalizeOracle(
  oracle: Oracle,
  siteOrigin: string | undefined,
): Oracle {
  if (!siteOrigin) return oracle;
  const origin = normalizeSiteOrigin(siteOrigin);

  const next: Oracle = {
    ...oracle,
    riftseer_uri: absoluteRiftseerUri(origin, oracle.slug),
  };

  if (next.preferred_printing) {
    next.preferred_printing = finalizePrinting(next.preferred_printing, origin);
  }
  if (next.printings) {
    next.printings = next.printings.map((p) => finalizePrinting(p, origin));
  }
  if (next.relationships) {
    const withUri = <T extends { slug: string }>(refs: T[]) =>
      refs.map((ref) => ({
        ...ref,
        riftseer_uri: absoluteRiftseerUri(origin, ref.slug),
      }));
    next.relationships = {
      makes_tokens: withUri(next.relationships.makes_tokens),
      used_by: withUri(next.relationships.used_by),
      characters: withUri(next.relationships.characters),
      signatures: withUri(next.relationships.signatures),
    };
  }

  return next;
}

/** Add `riftseer_uri` to a printing, from its own pinned public slug. */
export function finalizePrinting(
  printing: Printing,
  siteOrigin: string | undefined,
): Printing {
  if (!siteOrigin) return printing;
  return {
    ...printing,
    riftseer_uri: absoluteRiftseerUri(
      normalizeSiteOrigin(siteOrigin),
      printing.public_slug,
    ),
  };
}

export function finalizeOracles(
  oracles: Oracle[],
  siteOrigin: string | undefined,
): Oracle[] {
  if (!siteOrigin) return oracles;
  return oracles.map((oracle) => finalizeOracle(oracle, siteOrigin));
}

export function finalizePrintings(
  printings: Printing[],
  siteOrigin: string | undefined,
): Printing[] {
  if (!siteOrigin) return printings;
  return printings.map((printing) => finalizePrinting(printing, siteOrigin));
}
