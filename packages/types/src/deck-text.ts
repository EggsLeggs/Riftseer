import { DECK_ZONES, DECK_ZONE_LABELS, type DeckZone } from "./deck.ts";

// ─── Plain-text deck interchange ──────────────────────────────────────────────
//
// Moxfield-style: zone headers, then `<qty> <name>` lines with an optional
// `(SET) COLLECTOR` suffix pinning one printing and a trailing `*CH*` marking
// the chosen champion. This is the interchange format — it replaces an opaque
// XOR-obfuscated binary short form, and unlike that form it can be pasted into
// a forum post, diffed, and typed by hand.
//
// Parsing never throws. A deck list pasted from elsewhere routinely has a line
// or two we cannot read, and dropping the whole import for one bad line is
// worse than reporting that line.

/** The champion flag, written like Moxfield's `*F*` foil marker. */
const CHAMPION_MARKER = "*CH*";

/** One card line, without the identity resolution the API performs. */
export interface DeckTextCard {
  zone: DeckZone;
  quantity: number;
  name: string;
  /** Set code as printed in the suffix, e.g. `OGN`. */
  set_code?: string;
  /**
   * Collector number as printed, including any letter prefix (`T03`, `SP3`).
   * Only meaningful alongside `set_code`: a collector number on its own cannot
   * identify a printing, so it is not written without one.
   */
  collector_number?: string;
  is_champion?: boolean;
}

/** A card line that was read successfully, with where it came from. */
export interface DeckTextLine extends DeckTextCard {
  /** 1-based line number in the source text. */
  line: number;
}

/** A line that could not be read. The rest of the import still applies. */
export interface DeckTextError {
  /** 1-based line number in the source text. */
  line: number;
  /** The offending line, trimmed. */
  text: string;
  message: string;
}

export interface ParsedDeckText {
  cards: DeckTextLine[];
  errors: DeckTextError[];
}

/**
 * Zone headers we accept on import, beyond each zone's own label.
 *
 * Moxfield writes `Deck` and `Maybeboard`; the previous model called
 * battlefields "battlegrounds"; and pasted lists often pluralise or not.
 */
const ZONE_ALIASES: Record<string, DeckZone> = {
  legend: "legend",
  legends: "legend",
  deck: "main",
  main: "main",
  maindeck: "main",
  "main deck": "main",
  mainboard: "main",
  sideboard: "sideboard",
  side: "sideboard",
  rune: "runes",
  runes: "runes",
  "rune deck": "runes",
  battlefield: "battlefields",
  battlefields: "battlefields",
  battleground: "battlefields",
  battlegrounds: "battlefields",
  considering: "considering",
  maybeboard: "considering",
  maybe: "considering",
};

/** A bare list with no header is a main deck, which is how Moxfield reads one. */
const DEFAULT_ZONE: DeckZone = "main";

/**
 * Render a deck as text, grouped into zone sections in {@link DECK_ZONES}
 * order. Zones with no cards emit no header.
 */
export function formatDeckText(cards: readonly DeckTextCard[]): string {
  const sections: string[] = [];
  for (const zone of DECK_ZONES) {
    const inZone = cards.filter((card) => card.zone === zone);
    if (inZone.length === 0) continue;
    const lines = inZone.map((card) => formatDeckTextLine(card));
    sections.push([DECK_ZONE_LABELS[zone], ...lines].join("\n"));
  }
  return sections.join("\n\n");
}

function formatDeckTextLine(card: DeckTextCard): string {
  const parts = [`${card.quantity} ${card.name}`];
  if (card.set_code) {
    parts.push(`(${card.set_code})`);
    if (card.collector_number) parts.push(card.collector_number);
  }
  if (card.is_champion) parts.push(CHAMPION_MARKER);
  return parts.join(" ");
}

const CARD_LINE = /^(\d+)\s*[xX]?\s+(.+)$/;
const PRINTING_SUFFIX = /\s*\(([^()]+)\)(?:\s+([A-Za-z0-9][A-Za-z0-9\-/]*))?\s*$/;

/**
 * Read a deck list. Unreadable lines become {@link DeckTextError}s and the rest
 * of the list is still returned.
 *
 * Names are returned as written: resolving a name (and an optional set and
 * collector number) to an oracle and printing is the caller's job, because only
 * the API can see the catalogue.
 */
export function parseDeckText(text: string): ParsedDeckText {
  const cards: DeckTextLine[] = [];
  const errors: DeckTextError[] = [];
  let zone: DeckZone = DEFAULT_ZONE;

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? "";
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;

    const header = headerZone(trimmed);
    if (header) {
      zone = header;
      continue;
    }

    const match = CARD_LINE.exec(trimmed);
    if (!match) {
      errors.push({
        line,
        text: trimmed,
        message: 'Expected a zone header or a card line like "3 Vayne (OGN) 100".',
      });
      continue;
    }

    const quantity = Number(match[1]);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      errors.push({ line, text: trimmed, message: "Quantity must be a positive whole number." });
      continue;
    }

    let rest = match[2]!.trim();
    let isChampion = false;
    if (rest.toUpperCase().endsWith(CHAMPION_MARKER)) {
      isChampion = true;
      rest = rest.slice(0, rest.length - CHAMPION_MARKER.length).trim();
    }

    let setCode: string | undefined;
    let collectorNumber: string | undefined;
    const suffix = PRINTING_SUFFIX.exec(rest);
    if (suffix) {
      setCode = suffix[1]!.trim();
      collectorNumber = suffix[2]?.trim();
      rest = rest.slice(0, suffix.index).trim();
    }

    if (rest === "") {
      errors.push({ line, text: trimmed, message: "Card line has no name." });
      continue;
    }

    const card: DeckTextLine = { line, zone, quantity, name: rest };
    if (setCode) card.set_code = setCode;
    if (collectorNumber) card.collector_number = collectorNumber;
    if (isChampion) card.is_champion = true;
    cards.push(card);
  }

  return { cards, errors };
}

/**
 * A header is a line with no leading quantity naming a zone, optionally with a
 * trailing colon and a count — `Main`, `Sideboard:`, `Runes (12)`.
 */
function headerZone(trimmed: string): DeckZone | undefined {
  const withoutCount = trimmed.replace(/\s*[:(]\s*\d*\s*\)?\s*$/, "").trim();
  return ZONE_ALIASES[withoutCount.toLowerCase()];
}
