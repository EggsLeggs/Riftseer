import {
  DECK_ZONES,
  LEGALITY_STATUSES,
  type DeckState,
  type DeckZone,
  type LegalityMap,
  type LegalityStatus,
} from "@riftseer/types/deck";
import type { DeckTextCard } from "@riftseer/types/deck-text";

import type { AddableCard } from "./deck-add";
import type { DeckCard, DeckCardChange } from "./types";

/**
 * A deck built without an account, held in localStorage.
 *
 * The whole of "guest" is *where the state lives*. A guest builds in a real
 * format against the real rules, sees the real violations, and exports the same
 * text — the only difference is that nothing is posted until they sign in. So
 * this module owns exactly two things: the shape on disk, and the pure
 * transformations between it, `validateDeck`'s `DeckState`, the text exporter,
 * and the `DeckCardChange[]` that recreates the deck server-side.
 *
 * **Not the URL.** An encoded deck in the query string is the printing-id short
 * form this branch deleted, wearing a hat: it makes a link that rots the moment
 * a printing id changes, and it puts a deck in the referrer of every outbound
 * click. localStorage survives a refresh on that device, which is the actual
 * requirement.
 *
 * Everything exported below the storage section is pure, because the
 * interesting failure is not the browser API — it is a blob written by an older
 * build, hand-edited in devtools, or truncated by a quota error. A corrupt
 * value must cost the user their unsaved deck at worst; it must never white-
 * screen the page they would use to rebuild it.
 */

/**
 * The storage key, versioned in the key rather than only in the payload.
 *
 * A future shape that cannot be migrated changes the key and the old blob is
 * simply never read again — no "is this v1 or v2" branch, and no risk of
 * feeding v1 data to a v2 reader that assumed a field exists.
 */
export const GUEST_DECK_STORAGE_KEY = "riftseer:guest-deck:v1";

/** The version stamped inside the blob, checked before any field is trusted. */
export const GUEST_DECK_VERSION = 1;

/** The format a guest builder opens in when it has no stored deck. */
export const GUEST_DECK_DEFAULT_FORMAT = "standard";

/**
 * One row of a guest deck.
 *
 * Structurally a `DeckCard` — the wire row the builder components already take
 * — with `zone` narrowed to the real vocabulary. Storing the whole row rather
 * than just the rules fields is deliberate: the display fields (`set_code`,
 * `collector_number`, `energy`, `public_slug`) are what `DeckCardRow` renders,
 * and a guest who refreshes offline must get their list back, not a column of
 * blank names waiting on a refetch.
 */
export interface GuestDeckCard extends Omit<DeckCard, "zone"> {
  zone: DeckZone;
}

/** The card fields a new row needs, without its position in the deck. */
export type GuestCardFields = Omit<GuestDeckCard, "zone" | "quantity" | "is_champion">;

export interface GuestDeck {
  version: number;
  name: string;
  /** Format `code`, not id: ids are environment-specific, codes are stable. */
  format: string;
  cards: GuestDeckCard[];
  /**
   * Stored legality rows keyed by format code, in `validateDeck`'s own shape.
   *
   * Keyed by format because the guest can change format mid-build and the
   * answer differs per format; captured at add time from the card-detail
   * payload, which already carries one entry per format. Only non-default rows
   * are kept — absence means legal, which is what the resolver assumes anyway.
   */
  legalities: Record<string, LegalityMap>;
  /** ISO timestamp of the last write. Display only; never a merge input. */
  updated_at: string;
}

const ZONES: ReadonlySet<string> = new Set<string>(DECK_ZONES);
const STATUSES: ReadonlySet<string> = new Set<string>(LEGALITY_STATUSES);

// ─── Construction ─────────────────────────────────────────────────────────────

export function emptyGuestDeck(
  options: { name?: string; format?: string; now?: string } = {},
): GuestDeck {
  return {
    version: GUEST_DECK_VERSION,
    name: options.name ?? "",
    format: options.format ?? GUEST_DECK_DEFAULT_FORMAT,
    cards: [],
    legalities: {},
    updated_at: options.now ?? new Date().toISOString(),
  };
}

/** True when there is nothing worth offering to save. */
export function isGuestDeckEmpty(deck: GuestDeck | null | undefined): boolean {
  return !deck || deck.cards.length === 0;
}

// ─── Serialisation ────────────────────────────────────────────────────────────

export function serializeGuestDeck(deck: GuestDeck): string {
  return JSON.stringify(deck);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * One stored row, or `null` when it is not one.
 *
 * Every field is re-derived rather than spread: a blob with an extra key, a
 * number where a string belongs, or a zone this build has never heard of
 * produces a well-formed row or no row, and never a `DeckCard` whose `zone`
 * indexes a label map that has no such key.
 */
function parseCard(value: unknown): GuestDeckCard | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;

  const zone = str(row.zone);
  const printingId = str(row.printing_id);
  const oracleId = str(row.oracle_id);
  if (!zone || !ZONES.has(zone) || !printingId || !oracleId) return null;

  const quantity = nullableNum(row.quantity);
  if (quantity === null || quantity <= 0) return null;

  return {
    zone: zone as DeckZone,
    printing_id: printingId,
    oracle_id: oracleId,
    quantity: Math.floor(quantity),
    is_champion: row.is_champion === true,
    name: typeof row.name === "string" ? row.name : printingId,
    card_type: nullableStr(row.card_type),
    supertype: nullableStr(row.supertype),
    is_token: row.is_token === true,
    domains: strList(row.domains),
    energy: nullableNum(row.energy),
    might: nullableNum(row.might),
    power: nullableNum(row.power),
    set_code: nullableStr(row.set_code),
    collector_number: nullableStr(row.collector_number),
    rarity: nullableStr(row.rarity),
    public_slug: nullableStr(row.public_slug),
    has_hosted_image: row.has_hosted_image === true,
  };
}

function parseLegalityMap(value: unknown): LegalityMap {
  if (typeof value !== "object" || value === null) return {};
  const source = value as Record<string, unknown>;
  const map: LegalityMap = {};
  for (const rung of ["printings", "oracles"] as const) {
    const rows = source[rung];
    if (typeof rows !== "object" || rows === null) continue;
    const kept: Record<string, { status: LegalityStatus; note?: string | null }> = {};
    for (const [id, entry] of Object.entries(rows as Record<string, unknown>)) {
      if (typeof entry !== "object" || entry === null) continue;
      const status = (entry as Record<string, unknown>).status;
      if (typeof status !== "string" || !STATUSES.has(status)) continue;
      const note = (entry as Record<string, unknown>).note;
      kept[id] = {
        status: status as LegalityStatus,
        note: typeof note === "string" ? note : null,
      };
    }
    if (Object.keys(kept).length > 0) map[rung] = kept;
  }
  return map;
}

/**
 * Read a stored blob. `null` means "there is no usable guest deck" — no stored
 * value, unparseable JSON, a version this build does not own, or a payload that
 * is not a deck. Individual unreadable *rows* are dropped and the rest of the
 * deck survives, on the same reasoning as the text importer: losing one line is
 * better than losing the list.
 */
export function parseGuestDeck(raw: string | null | undefined): GuestDeck | null {
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const blob = value as Record<string, unknown>;
  if (blob.version !== GUEST_DECK_VERSION) return null;

  const cards: GuestDeckCard[] = [];
  if (Array.isArray(blob.cards)) {
    for (const entry of blob.cards) {
      const card = parseCard(entry);
      if (card) cards.push(card);
    }
  }

  const legalities: Record<string, LegalityMap> = {};
  if (typeof blob.legalities === "object" && blob.legalities !== null) {
    for (const [code, map] of Object.entries(blob.legalities as Record<string, unknown>)) {
      const parsed = parseLegalityMap(map);
      if (parsed.printings || parsed.oracles) legalities[code] = parsed;
    }
  }

  return {
    version: GUEST_DECK_VERSION,
    name: typeof blob.name === "string" ? blob.name : "",
    format: str(blob.format) ?? GUEST_DECK_DEFAULT_FORMAT,
    cards,
    legalities,
    updated_at:
      typeof blob.updated_at === "string" ? blob.updated_at : new Date(0).toISOString(),
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────
//
// The only impure functions here. Each one swallows its failure: localStorage
// throws on a full quota and on a browser configured to deny it, and neither is
// a reason for the builder to stop working — an unsaved deck that does not
// survive a refresh is worse than one that does, and better than a crash.

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readGuestDeck(): GuestDeck | null {
  const store = storage();
  if (!store) return null;
  try {
    return parseGuestDeck(store.getItem(GUEST_DECK_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist, returning whether it landed so a caller can warn before navigating. */
export function writeGuestDeck(deck: GuestDeck): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(GUEST_DECK_STORAGE_KEY, serializeGuestDeck(deck));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestDeck(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(GUEST_DECK_STORAGE_KEY);
  } catch {
    // Nothing to do: the blob is stale rather than dangerous.
  }
}

// ─── Editing ──────────────────────────────────────────────────────────────────

function rowKey(zone: string, printingId: string): string {
  return `${zone} ${printingId}`;
}

/**
 * Apply card changes to a guest deck's rows.
 *
 * The sibling of `applyDeckCardChanges`, with the one difference that matters
 * offline: this **creates** rows. The server projection deliberately does not,
 * because a response is coming with the real row on it; here no response is
 * coming, so the caller hands over the card's fields in `templates` and a move
 * finds them on the row it is moving.
 *
 * Change semantics are the API's, unchanged: absolute quantities, `0` removes,
 * identity is zone plus printing.
 */
export function applyGuestCardChanges(
  cards: readonly GuestDeckCard[],
  changes: readonly DeckCardChange[],
  templates: readonly GuestCardFields[] = [],
): GuestDeckCard[] {
  if (changes.length === 0) return [...cards];

  const fields = new Map<string, GuestCardFields>();
  for (const card of cards) fields.set(card.printing_id, card);
  for (const template of templates) fields.set(template.printing_id, template);

  const byKey = new Map<string, DeckCardChange>();
  for (const change of changes) byKey.set(rowKey(change.zone, change.printing_id), change);

  const applied = new Set<string>();
  const result: GuestDeckCard[] = [];
  for (const card of cards) {
    const key = rowKey(card.zone, card.printing_id);
    const change = byKey.get(key);
    if (!change) {
      result.push(card);
      continue;
    }
    applied.add(key);
    if (change.quantity <= 0) continue;
    result.push({
      ...card,
      quantity: Math.floor(change.quantity),
      is_champion: change.is_champion ?? card.is_champion,
    });
  }

  for (const change of changes) {
    const key = rowKey(change.zone, change.printing_id);
    if (applied.has(key) || change.quantity <= 0) continue;
    const template = fields.get(change.printing_id);
    // A change for a row with no card data behind it describes nothing we can
    // render, so it is dropped rather than stored as a blank line.
    if (!template) continue;
    applied.add(key);
    result.push({
      ...template,
      zone: change.zone,
      quantity: Math.floor(change.quantity),
      is_champion: change.is_champion === true,
    });
  }

  return result;
}

/**
 * A picked card as the row a guest deck stores.
 *
 * The picker's display fields are optional — the signed-in path has no use for
 * them — so every one of them has a defined empty value here rather than an
 * `undefined` that would survive a `JSON.stringify` round trip as a missing
 * key and come back through `parseGuestDeck` as a different row.
 */
export function guestCardFields(card: AddableCard): GuestCardFields {
  return {
    printing_id: card.printing_id,
    oracle_id: card.oracle_id,
    name: card.name ?? card.printing_id,
    card_type: card.card_type ?? null,
    supertype: card.supertype ?? null,
    is_token: card.is_token === true,
    domains: card.domains ?? [],
    energy: card.energy ?? null,
    might: card.might ?? null,
    power: card.power ?? null,
    set_code: card.set_code ?? null,
    collector_number: card.collector_number ?? null,
    rarity: card.rarity ?? null,
    public_slug: card.public_slug ?? null,
    has_hosted_image: false,
  };
}

/**
 * Fold one card's legality rows into the deck, as the card-detail payload
 * reports them.
 *
 * `default` entries are dropped: they mean no row is stored, which is what an
 * absent key already says, and keeping them would grow the blob by one entry
 * per format per card for no answer anyone reads.
 */
export function withGuestLegalities(
  deck: GuestDeck,
  card: { oracle_id: string; printing_id: string },
  entries: readonly {
    format_code: string;
    status: string;
    scope: string;
    note?: string | null;
  }[],
): GuestDeck {
  if (entries.length === 0) return deck;

  const legalities: Record<string, LegalityMap> = { ...deck.legalities };
  let changed = false;

  for (const entry of entries) {
    if (entry.scope !== "printing" && entry.scope !== "oracle") continue;
    if (!STATUSES.has(entry.status)) continue;

    const rung = entry.scope === "printing" ? "printings" : "oracles";
    const id = entry.scope === "printing" ? card.printing_id : card.oracle_id;
    const existing = legalities[entry.format_code] ?? {};
    legalities[entry.format_code] = {
      ...existing,
      [rung]: {
        ...(existing[rung] ?? {}),
        [id]: { status: entry.status as LegalityStatus, note: entry.note ?? null },
      },
    };
    changed = true;
  }

  return changed ? { ...deck, legalities } : deck;
}

// ─── Projections ──────────────────────────────────────────────────────────────

/** The deck as `validateDeck` reads it. */
export function guestDeckState(deck: GuestDeck): DeckState {
  return {
    entries: deck.cards.map((card) => ({
      zone: card.zone,
      oracle_id: card.oracle_id,
      printing_id: card.printing_id,
      quantity: card.quantity,
      is_champion: card.is_champion,
      name: card.name,
      card_type: card.card_type,
      supertype: card.supertype,
      is_token: card.is_token,
      domains: card.domains,
    })),
  };
}

/** The stored legality rows for one format. Absent means every card is legal. */
export function guestDeckLegalities(deck: GuestDeck, formatCode: string): LegalityMap {
  return deck.legalities[formatCode] ?? {};
}

/**
 * The deck as text-export lines. `set_code` and `collector_number` are nullable
 * columns here and optional strings there, so this is a real conversion rather
 * than a cast — a `null` set code must produce a bare `3 Vayne` line, not
 * `3 Vayne (null)`.
 */
export function guestDeckTextCards(deck: GuestDeck): DeckTextCard[] {
  return deck.cards.map((card) => ({
    zone: card.zone,
    quantity: card.quantity,
    name: card.name,
    ...(card.set_code ? { set_code: card.set_code } : {}),
    ...(card.set_code && card.collector_number
      ? { collector_number: card.collector_number }
      : {}),
    ...(card.is_champion ? { is_champion: true } : {}),
  }));
}

/**
 * The batch that recreates this deck on the server, after the guest signs in.
 *
 * One change per row, absolute quantities — exactly what `PUT /decks/:id/cards`
 * takes — so the whole deck lands in one transaction and one revision, rather
 * than a request per card and a history that reads like a keystroke log.
 */
export function guestDeckToChanges(deck: GuestDeck): DeckCardChange[] {
  return deck.cards
    .filter((card) => card.quantity > 0)
    .map((card) => ({
      zone: card.zone,
      printing_id: card.printing_id,
      oracle_id: card.oracle_id,
      quantity: card.quantity,
      ...(card.is_champion ? { is_champion: true } : {}),
    }));
}

/** The name a guest deck is saved under when the user never typed one. */
export function guestDeckSaveName(deck: GuestDeck): string {
  const trimmed = deck.name.trim();
  if (trimmed) return trimmed.slice(0, 120);
  const legend = deck.cards.find((card) => card.zone === "legend");
  return legend ? `${legend.name} deck`.slice(0, 120) : "Untitled deck";
}

/**
 * The metadata half of turning a guest deck into a real one.
 *
 * Private, always: a deck the owner has not yet looked at signed in is not a
 * deck they have decided to publish, and the visibility control is one click
 * away in the builder they land on.
 */
export function guestDeckCreateInput(
  deck: GuestDeck,
  fallbackFormat: string = GUEST_DECK_DEFAULT_FORMAT,
): { name: string; format: string; visibility: "private" } {
  return {
    name: guestDeckSaveName(deck),
    format: deck.format || fallbackFormat,
    visibility: "private",
  };
}
