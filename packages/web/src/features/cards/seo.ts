import type { Metadata } from "next";
import type { Oracle, Printing } from "@riftseer/types";
import { printingImageUrl } from "@riftseer/types";

import { cardTypeLine, meaningfulRulesText } from "@/features/cards/format";

import { env } from "@/lib/env";

/** Search-result descriptions are truncated well before this, but keep them sane. */
const MAX_DESCRIPTION_LENGTH = 300;

/**
 * Plain-text description for `<meta name="description">` and social cards:
 * domains, stats, type line, rules text, artist.
 */
export function cardSeoDescription(oracle: Oracle, printing: Printing): string {
  const parts: string[] = [];

  const domains = oracle.domains;
  if (domains.length > 0) parts.push(domains.join(", "));

  const stats: string[] = [];
  if (oracle.energy != null) stats.push(`${oracle.energy} Energy`);
  if (oracle.power != null) stats.push(`${oracle.power} Power`);
  if (stats.length > 0) parts.push(stats.join(", "));

  const typeLine = cardTypeLine(oracle);
  if (typeLine !== "—") parts.push(typeLine);

  const rules = (meaningfulRulesText(oracle.text?.plain) ?? "")
    .replace(/:[a-z_]+:/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (rules) parts.push(rules);

  if (printing.artist) parts.push(`Illustrated by ${printing.artist}`);

  parts.push("Riftbound TCG");

  const description = parts.join(" • ");
  return description.length > MAX_DESCRIPTION_LENGTH
    ? `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`
    : description;
}

/** `Sun Disc (OGN 21) — Riftseer` — set context helps disambiguate reprints in search results. */
export function cardPageTitle(oracle: Oracle, printing: Printing): string {
  const setCode = printing.set?.set_code;
  const collector = printing.collector_number;
  const context = [setCode, collector].filter(Boolean).join(" ");
  return context ? `${oracle.name} (${context}) — Riftseer` : `${oracle.name} — Riftseer`;
}

/**
 * Page metadata for a card. `path` is the canonical relative path — always the
 * `public_slug` route when one exists, so reprints don't compete for the same
 * canonical URL.
 */
export function cardMetadata(oracle: Oracle, printing: Printing, path: string): Metadata {
  const title = cardPageTitle(oracle, printing);
  const description = cardSeoDescription(oracle, printing);
  const canonical = new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
  const image = printingImageUrl(printing, "large");
  const images = image
    ? [{ url: image, alt: printing.image_alt_text ?? oracle.name }]
    : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "article",
      url: canonical,
      images,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}
