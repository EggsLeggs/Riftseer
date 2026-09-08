import { Color, Image } from "@raycast/api";
import {
  cardTypeIconKey,
  domainKey,
  type DomainKey,
  type Oracle,
} from "@riftseer/types";

/**
 * The extension's asset paths, keyed by the render kernel's icon keys. Which
 * key a card gets is the kernel's decision (`cardTypeIconKey`, `domainKey`);
 * this file only says where Raycast finds the picture.
 */

const TYPE_ICONS: Record<string, string> = {
  unit: "icons/types/unit.png",
  champion: "icons/types/champion.png",
  legend: "icons/types/legend.png",
  spell: "icons/types/spell.png",
  gear: "icons/types/gear.png",
  battlefield: "icons/types/battlefield.png",
  rune: "icons/types/rune.png",
};

const RARITY_ICONS: Record<string, string> = {
  common: "icons/rarity/rarity_common.png",
  uncommon: "icons/rarity/rarity_uncommon.png",
  rare: "icons/rarity/rarity_rare.png",
  showcase: "icons/rarity/rarity_showcase.png",
};

const DOMAIN_ICONS: Record<DomainKey, string> = {
  fury: "icons/domains/rune_fury.png",
  calm: "icons/domains/rune_calm.png",
  mind: "icons/domains/rune_mind.png",
  body: "icons/domains/rune_body.png",
  chaos: "icons/domains/rune_chaos.png",
  order: "icons/domains/rune_order.png",
};

/**
 * SVG token icons have a hardcoded `fill="white"`; the renderer swaps it for
 * black in light mode. PNG rune icons carry their own colour and are used
 * as-is, so `:rb_rune_fury:` in rules text and the Fury domain tag share a
 * file.
 */
export const TOKEN_SVG_ASSETS: Record<string, string> = {
  exhaust: "icons/stats/exhaust.svg",
  might: "icons/stats/might.svg",
  power: "icons/stats/card_type_rune.svg",
  rune_rainbow: "icons/domains/rune_rainbow.svg",
};

export const TOKEN_PNG_ASSETS: Record<string, string> = Object.fromEntries(
  Object.entries(DOMAIN_ICONS).map(([key, path]) => [`rune_${key}`, path]),
);

export function tinted(source: string): Image.ImageLike {
  return { source, tintColor: Color.PrimaryText };
}

export function typeIcon(
  card: Pick<Oracle, "card_type" | "supertype">,
): Image.ImageLike | undefined {
  const key = cardTypeIconKey(card);
  const src = key ? TYPE_ICONS[key] : undefined;
  return src ? tinted(src) : undefined;
}

export function rarityIcon(rarity?: string): Image.ImageLike | undefined {
  const src = rarity ? RARITY_ICONS[rarity.toLowerCase()] : undefined;
  return src ? { source: src } : undefined;
}

export function domainIcon(domain: string): Image.ImageLike | undefined {
  const key = domainKey(domain);
  return key ? { source: DOMAIN_ICONS[key] } : undefined;
}
