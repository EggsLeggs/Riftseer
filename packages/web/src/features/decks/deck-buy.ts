import { DECK_ZONE_LABELS, type DeckZone } from "@riftseer/types/deck";

/**
 * A shopping list from a deck, plus the store URLs a "Buy" button can open.
 *
 * TCGPlayer's mass-entry page is a public list format — names and quantities,
 * not per-printing product URLs — so it lives here rather than in the card
 * purchase resolver. Cardmarket has no equivalent list URL; the button copies
 * the same list and opens their Riftbound catalogue.
 */

export const DECK_BUY_AFFILIATES = ["tcgplayer", "cardmarket"] as const;
export type DeckBuyAffiliate = (typeof DECK_BUY_AFFILIATES)[number];

export const DECK_BUY_AFFILIATE_LABELS: Record<DeckBuyAffiliate, string> = {
  tcgplayer: "TCGPlayer",
  cardmarket: "Cardmarket",
};

/** Zones a shopping list usually wants. Considering is a scratch pad. */
export const DECK_BUY_ZONES: readonly DeckZone[] = [
  "legend",
  "main",
  "sideboard",
  "runes",
  "battlefields",
];

export interface BuyableCard {
  name: string;
  quantity: number;
  zone: string;
  set_code?: string | null;
}

export interface BuyableToken {
  name: string;
}

export interface DeckBuyLine {
  quantity: number;
  name: string;
  setCode: string | null;
  zone: DeckZone | "tokens";
  label: string;
}

export interface DeckBuyOptions {
  includeTokens?: boolean;
  includeSetCodes?: boolean;
  includeConsidering?: boolean;
}

export function deckBuyLines(
  cards: readonly BuyableCard[],
  tokens: readonly BuyableToken[] = [],
  options: DeckBuyOptions = {},
): DeckBuyLine[] {
  const zones = new Set<string>(DECK_BUY_ZONES);
  if (options.includeConsidering) zones.add("considering");

  const lines: DeckBuyLine[] = [];
  for (const card of cards) {
    if (!zones.has(card.zone) || card.quantity <= 0 || !card.name.trim()) continue;
    const zone = card.zone as DeckZone;
    lines.push({
      quantity: card.quantity,
      name: card.name,
      setCode: card.set_code ?? null,
      zone,
      label: DECK_ZONE_LABELS[zone],
    });
  }

  if (options.includeTokens) {
    for (const token of tokens) {
      const name = token.name.trim();
      if (!name) continue;
      lines.push({
        quantity: 1,
        name,
        setCode: null,
        zone: "tokens",
        label: "Tokens",
      });
    }
  }

  return lines;
}

export function formatBuyLine(line: DeckBuyLine, includeSetCodes: boolean): string {
  const set = includeSetCodes && line.setCode ? ` [${line.setCode.toUpperCase()}]` : "";
  return `${line.quantity} ${line.name}${set}`;
}

export function formatBuyList(lines: readonly DeckBuyLine[], includeSetCodes = false): string {
  return lines.map((line) => formatBuyLine(line, includeSetCodes)).join("\n");
}

/** TCGPlayer mass-entry: `qty Name||qty Name`. */
export function tcgplayerMassEntryUrl(
  lines: readonly DeckBuyLine[],
  includeSetCodes = false,
): string {
  const encoded = lines.map((line) => formatBuyLine(line, includeSetCodes)).join("||");
  const params = new URLSearchParams({
    productlineName: "Riftbound",
    c: encoded,
  });
  return `https://www.tcgplayer.com/massentry?${params.toString()}`;
}

export function cardmarketCatalogUrl(): string {
  return "https://www.cardmarket.com/en/Riftbound";
}

export function groupBuyLines(
  lines: readonly DeckBuyLine[],
): Array<{ key: string; label: string; lines: DeckBuyLine[] }> {
  const groups: Array<{ key: string; label: string; lines: DeckBuyLine[] }> = [];
  const index = new Map<string, (typeof groups)[number]>();
  for (const line of lines) {
    let group = index.get(line.zone);
    if (!group) {
      group = { key: line.zone, label: line.label, lines: [] };
      index.set(line.zone, group);
      groups.push(group);
    }
    group.lines.push(line);
  }
  return groups;
}
