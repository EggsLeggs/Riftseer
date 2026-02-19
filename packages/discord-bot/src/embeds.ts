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

  const typeParts = [card.supertype, card.typeLine].filter(Boolean);
  if (typeParts.length) {
    fields.push({ name: "Type", value: typeParts.join(" — "), inline: true });
  }

  if (card.cost != null) {
    fields.push({ name: "Cost", value: `⚡ ${card.cost}`, inline: true });
  }

  if (card.rarity) {
    fields.push({ name: "Rarity", value: card.rarity, inline: true });
  }

  if (card.domains?.length) {
    fields.push({ name: "Domain", value: card.domains.join(", "), inline: true });
  }

  // Unit stats
  if (card.might != null || card.power != null) {
    const parts = [
      card.might != null ? `Might ${card.might}` : null,
      card.power != null ? `Power ${card.power}` : null,
    ].filter(Boolean);
    fields.push({ name: "Stats", value: parts.join(" · "), inline: true });
  }

  if (card.tags?.length) {
    fields.push({ name: "Tags", value: card.tags.join(", "), inline: true });
  }

  if (card.artist) {
    fields.push({ name: "Artist", value: card.artist, inline: false });
  }

  const description =
    [card.text, card.effect]
      .filter(Boolean)
      .map((t) => renderTextForDiscord(t!, emojiMap))
      .join("\n\n") || undefined;
  const footerText = [card.setCode, card.setName, card.collectorNumber]
    .filter(Boolean)
    .join(" · ");

  return {
    title: card.name,
    url: `${siteBaseUrl}/card/${card.id}`,
    description,
    color: domainColor(card.domains),
    image: card.imageUrl ? { url: card.imageUrl } : undefined,
    fields,
    footer: { text: footerText || "RiftSeer" },
  };
}

/** Compact card embed — image only, minimal fields. Mirrors Scryfall's [[!Name]] mode. */
export function buildCardImageEmbed(card: Card, siteBaseUrl: string): APIEmbed {
  return {
    title: card.name,
    url: `${siteBaseUrl}/card/${card.id}`,
    color: domainColor(card.domains),
    image: card.imageUrl ? { url: card.imageUrl } : undefined,
    footer: { text: [card.setCode, card.collectorNumber].filter(Boolean).join(" · ") || "RiftSeer" },
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
