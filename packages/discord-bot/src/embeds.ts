/**
 * Build Discord embeds for Riftbound cards.
 */
import type { APIEmbed, APIEmbedField } from "discord-api-types/v10";
import { renderTextForDiscord } from "@riftseer/core/icons";
import type { Card, CardSet } from "./api.ts";

// Domain → embed accent colour
const DOMAIN_COLORS: Record<string, number> = {
  Fury: 0xe53e3e,
  Light: 0xd69e2e,
  Nature: 0x38a169,
  Order: 0x4299e1,
  Shadow: 0x805ad5,
  Tech: 0xed8936,
  Water: 0x00b5d8,
};
const DEFAULT_COLOR = 0x7c3aed; // RiftSeer brand purple

function domainColor(domains?: string[]): number {
  const first = domains?.[0];
  return first ? (DOMAIN_COLORS[first] ?? DEFAULT_COLOR) : DEFAULT_COLOR;
}

/** Full card embed — image, stats, rules text, links. */
export function buildCardEmbed(
  card: Card,
  siteBaseUrl: string,
  emojiMap: Record<string, string> = {},
): APIEmbed {
  const fields: APIEmbedField[] = [];

  const supertype = card.classification?.supertype;
  const typeLine = card.classification?.type;
  const domains = card.classification?.domains;
  const tags = card.classification?.tags;
  const rarity = card.classification?.rarity;
  const energy = card.attributes?.energy;
  const might = card.attributes?.might;
  const power = card.attributes?.power;
  const imageUrl = card.media?.media_urls?.normal;
  const setCode = card.set?.set_code;
  const collectorNumber = card.collector_number;
  const plainText = card.text?.plain;

  const typeParts = [supertype, typeLine].filter(Boolean);
  if (typeParts.length) {
    fields.push({ name: "Type", value: typeParts.join(" — "), inline: true });
  }

  if (energy != null) {
    fields.push({ name: "Cost", value: `⚡ ${energy}`, inline: true });
  }

  if (rarity) {
    fields.push({ name: "Rarity", value: rarity, inline: true });
  }

  if (domains?.length) {
    fields.push({ name: "Domain", value: domains.join(", "), inline: true });
  }

  // Unit stats
  if (might != null || power != null) {
    const parts = [
      might != null ? `Might ${might}` : null,
      power != null ? `Power ${power}` : null,
    ].filter(Boolean);
    fields.push({ name: "Stats", value: parts.join(" · "), inline: true });
  }

  if (tags?.length) {
    fields.push({ name: "Tags", value: tags.join(", "), inline: true });
  }

  if (card.artist) {
    fields.push({ name: "Artist", value: card.artist, inline: false });
  }

  const description = plainText
    ? renderTextForDiscord(plainText, emojiMap)
    : undefined;

  const footerText = [setCode, card.set?.set_name, collectorNumber]
    .filter(Boolean)
    .join(" · ");

  return {
    title: card.name,
    url: `${siteBaseUrl}/card/${card.id}`,
    description,
    color: domainColor(domains),
    image: imageUrl ? { url: imageUrl } : undefined,
    fields,
    footer: { text: footerText || "RiftSeer" },
  };
}

/** Compact card embed — image only, minimal fields. Mirrors Scryfall's [[!Name]] mode. */
export function buildCardImageEmbed(card: Card, siteBaseUrl: string): APIEmbed {
  const imageUrl = card.media?.media_urls?.normal;
  const domains = card.classification?.domains;
  return {
    title: card.name,
    url: `${siteBaseUrl}/card/${card.id}`,
    color: domainColor(domains),
    image: imageUrl ? { url: imageUrl } : undefined,
    footer: { text: [card.set?.set_code, card.collector_number].filter(Boolean).join(" · ") || "RiftSeer" },
  };
}

/** Sets list embed. */
export function buildSetsEmbed(sets: CardSet[]): APIEmbed {
  const description = sets
    .map((s) => `**${s.setCode}** — ${s.setName} (${s.cardCount} cards)`)
    .join("\n");

  return {
    title: "Riftbound Card Sets",
    description: description || "No sets found.",
    color: DEFAULT_COLOR,
    footer: { text: "RiftSeer" },
  };
}
