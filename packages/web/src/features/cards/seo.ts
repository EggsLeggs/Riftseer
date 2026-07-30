import type { Metadata } from "next";
import type { Card } from "@riftseer/types";
import { cardImageUrl } from "@riftseer/types";

import { cardTypeLine, meaningfulRulesText } from "@/features/cards/format";

import { env } from "@/lib/env";

/** Search-result descriptions are truncated well before this, but keep them sane. */
const MAX_DESCRIPTION_LENGTH = 300;

/**
 * Plain-text description for `<meta name="description">` and social cards:
 * domains, stats, type line, rules text, artist.
 */
export function cardSeoDescription(card: Card): string {
  const parts: string[] = [];

  const domains = card.classification?.domains ?? [];
  if (domains.length > 0) parts.push(domains.join(", "));

  const stats: string[] = [];
  if (card.attributes?.energy != null) stats.push(`${card.attributes.energy} Energy`);
  if (card.attributes?.power != null) stats.push(`${card.attributes.power} Power`);
  if (stats.length > 0) parts.push(stats.join(", "));

  const typeLine = cardTypeLine(card);
  if (typeLine !== "—") parts.push(typeLine);

  const rules = (meaningfulRulesText(card.text?.plain) ?? "")
    .replace(/:[a-z_]+:/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (rules) parts.push(rules);

  if (card.artist) parts.push(`Illustrated by ${card.artist}`);

  parts.push("Riftbound TCG");

  const description = parts.join(" • ");
  return description.length > MAX_DESCRIPTION_LENGTH
    ? `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`
    : description;
}

/** `Sun Disc (OGN 21) — Riftseer` — set context helps disambiguate reprints in search results. */
export function cardPageTitle(card: Card): string {
  const setCode = card.set?.set_code;
  const collector = card.collector_number;
  const context = [setCode, collector].filter(Boolean).join(" ");
  return context ? `${card.name} (${context}) — Riftseer` : `${card.name} — Riftseer`;
}

/**
 * Page metadata for a card. `path` is the canonical relative path — always the
 * `public_slug` route when one exists, so reprints don't compete for the same
 * canonical URL.
 */
export function cardMetadata(card: Card, path: string): Metadata {
  const title = cardPageTitle(card);
  const description = cardSeoDescription(card);
  const canonical = new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
  const image = cardImageUrl(card.media, "large");
  const images = image
    ? [{ url: image, alt: card.media?.accessibility_text ?? card.name }]
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
