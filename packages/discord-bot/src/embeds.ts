/**
 * Build Discord embeds for Riftbound cards.
 */
import type { APIEmbed, APIEmbedField } from "discord-api-types/v10";
import { renderTextForDiscord } from "@riftseer/core/icons";
import { printingImageUrl } from "@riftseer/types";
import type { Oracle, Printing } from "@riftseer/types";
import type { CardSet } from "./api.ts";

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
const DEFAULT_COLOR = 0x7c3aed; // Riftseer brand purple

function domainColor(domains?: string[]): number {
  const first = domains?.[0];
  return first ? (DOMAIN_COLORS[first] ?? DEFAULT_COLOR) : DEFAULT_COLOR;
}

/**
 * Build the canonical site URL for a card. Prefer the API-provided
 * `riftseer_uri` so we follow whatever path scheme the API decides on; fall
 * back to the legacy `/card/<id>` shape only when the API hasn't filled it
 * in yet (e.g. SITE_ORIGIN unset, or pre-backfill rows).
 */
function cardSiteUrl(
  oracle: Oracle,
  printing: Printing | null | undefined,
  siteBaseUrl: string,
): string {
  if (printing?.riftseer_uri) return printing.riftseer_uri;
  if (oracle.riftseer_uri) return oracle.riftseer_uri;
  return `${siteBaseUrl.replace(/\/+$/, "")}/card/${printing?.id ?? oracle.id}`;
}

function tcgplayerPrice(printing: Printing | null | undefined): string | null {
  const price =
    printing?.prices?.tcgplayer?.normal ?? printing?.prices?.tcgplayer?.foil;
  return price == null ? null : `$${price.toFixed(2)}`;
}

/** Full card embed — image, stats, rules text, links. */
export function buildCardEmbed(
  oracle: Oracle,
  printing: Printing | null | undefined,
  siteBaseUrl: string,
  emojiMap: Record<string, string> = {},
): APIEmbed {
  const fields: APIEmbedField[] = [];

  const supertype = oracle.supertype;
  const typeLine = oracle.card_type;
  const domains = oracle.domains;
  const tags = oracle.tags;
  const rarity = printing?.rarity;
  const energy = oracle.energy;
  const might = oracle.might;
  const power = oracle.power;
  const imageUrl = printingImageUrl(printing, "normal");
  const setCode = printing?.set?.set_code;
  const collectorNumber =
    printing?.collector_label ?? printing?.collector_number;
  const plainText = oracle.text?.plain;

  const typeParts = [typeLine, supertype].filter(Boolean);
  if (typeParts.length) {
    fields.push({ name: "Type", value: typeParts.join(" — "), inline: true });
  }

  if (energy != null) {
    fields.push({ name: "Cost", value: `⚡ ${energy}`, inline: true });
  }

  if (rarity) {
    fields.push({ name: "Rarity", value: rarity, inline: true });
  }

  const price = tcgplayerPrice(printing);
  if (price) {
    fields.push({ name: "TCGPlayer", value: price, inline: true });
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

  if (printing?.artist) {
    fields.push({ name: "Artist", value: printing.artist, inline: false });
  }

  const description = plainText
    ? renderTextForDiscord(plainText, emojiMap)
    : undefined;

  const footerText = [setCode, printing?.set?.set_name, collectorNumber]
    .filter(Boolean)
    .join(" · ");

  return {
    title: oracle.name,
    url: cardSiteUrl(oracle, printing, siteBaseUrl),
    description,
    color: domainColor(domains),
    image: imageUrl ? { url: imageUrl } : undefined,
    fields,
    footer: { text: footerText || "Riftseer" },
  };
}

/** Compact card embed — image only, minimal fields. Mirrors Scryfall's [[!Name]] mode. */
export function buildCardImageEmbed(
  oracle: Oracle,
  printing: Printing | null | undefined,
  siteBaseUrl: string,
): APIEmbed {
  const imageUrl = printingImageUrl(printing, "large");
  return {
    title: oracle.name,
    url: cardSiteUrl(oracle, printing, siteBaseUrl),
    color: domainColor(oracle.domains),
    image: imageUrl ? { url: imageUrl } : undefined,
    footer: {
      text:
        [
          printing?.set?.set_code,
          printing?.collector_label ?? printing?.collector_number,
        ]
          .filter(Boolean)
          .join(" · ") || "Riftseer",
    },
  };
}

/** Sets list embed. */
export function buildSetsEmbed(sets: CardSet[]): APIEmbed {
  const byDateDesc = (a: CardSet, b: CardSet): number => {
    const aDate = a.publishedOn ?? "";
    const bDate = b.publishedOn ?? "";
    if (aDate && bDate) {
      if (bDate > aDate) return 1;
      if (bDate < aDate) return -1;
      return a.setName.localeCompare(b.setName);
    }
    if (aDate) return -1;
    if (bDate) return 1;
    return a.setName.localeCompare(b.setName);
  };

  const formatSetLine = (s: CardSet): string => {
    const released = s.publishedOn ? ` · ${s.publishedOn}` : "";
    return `**${s.setCode}** — ${s.setName} (${s.cardCount} cards${released})`;
  };

  const mainSets = sets.filter((s) => !s.isPromo).sort(byDateDesc);
  const promoSets = sets.filter((s) => s.isPromo).sort(byDateDesc);

  const sections: string[] = [];
  if (mainSets.length > 0) {
    sections.push(["__Main Sets__", ...mainSets.map(formatSetLine)].join("\n"));
  }
  if (promoSets.length > 0) {
    sections.push(
      ["__Promo & Special Sets__", ...promoSets.map(formatSetLine)].join("\n"),
    );
  }

  const description = sections.join("\n\n");

  return {
    title: "Riftbound Card Sets",
    description: description || "No sets found.",
    color: DEFAULT_COLOR,
    footer: { text: "Riftseer" },
  };
}
