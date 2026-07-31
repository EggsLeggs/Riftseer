import { z } from "zod";
import type { Card } from "@riftseer/types";
import { toDateInputValue } from "./dates";
import type { AdminCardPatch } from "./types";

/**
 * The card editor keeps every scalar as a string so an empty input is
 * distinguishable from a zero, and diffs against the values the form was
 * seeded with. Only changed leaves reach the API: `PATCH /admin/cards/:id`
 * applies JSON merge-patch semantics, where an omitted key is left alone and an
 * explicit `null` clears the stored value.
 */
export interface CardEditorValues {
  name: string;
  collector_number: string;
  released_at: string;
  artist: string;
  is_token: boolean;
  external_ids: {
    riftcodex_id: string;
    riftbound_id: string;
    tcgplayer_id: string;
  };
  attributes: {
    energy: string;
    might: string;
    power: string;
    /** Might an [Equip] gear grants; blank for anything that is not equipment. */
    might_bonus: string;
  };
  classification: {
    type: string;
    supertype: string;
    rarity: string;
    tags: string;
    domains: string;
  };
  text: {
    rich: string;
    plain: string;
    flavour: string;
    /** The effect an [Equip] gear grants the unit it is attached to. */
    equipment: string;
  };
  metadata: {
    finishes: string;
    signature: boolean;
    overnumbered: boolean;
    alternate_art: boolean;
    special_collection: boolean;
  };
  media: {
    orientation: string;
    accessibility_text: string;
  };
  purchase_uris: {
    cardmarket: string;
    tcgplayer: string;
  };
  prices: {
    tcgplayer: PriceEntryValues;
    cardmarket: PriceEntryValues;
  };
  note: string;
}

export interface PriceEntryValues {
  normal: string;
  foil: string;
  low_normal: string;
  low_foil: string;
}

export const CARD_ORIENTATIONS = ["portrait", "landscape"] as const;

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Optional-but-validated text. Every editor field stays a plain `ZodString` —
 * a union with `z.literal("")` would widen the inferred form type and break
 * `zodResolver`'s generic inference against `CardEditorValues`.
 */
const blankOr = (isValid: (value: string) => boolean, message: string) =>
  z.string().refine((value) => value === "" || isValid(value), message);

// Restricted to http(s): these values become href targets on the card page, so
// accepting any parseable URL would let `javascript:` through the editor.
function isUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const dateString = blankOr(
  (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  "Use YYYY-MM-DD",
);

const urlString = blankOr(isUrl, "Enter a valid http(s) URL");

const integerString = blankOr(
  (v) => /^-?\d+$/.test(v) && Number.isSafeInteger(Number(v)),
  "Whole numbers only",
);

const moneyString = blankOr(
  (v) => /^\d+(\.\d{1,2})?$/.test(v) && Number.isFinite(Number(v)),
  "Use a positive amount, e.g. 1.25",
);

const priceEntrySchema = z.object({
  normal: moneyString,
  foil: moneyString,
  low_normal: moneyString,
  low_foil: moneyString,
});

export const cardEditorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(300, "Name is too long"),
  collector_number: z.string().max(64, "Collector number is too long"),
  released_at: dateString,
  artist: z.string().max(200, "Artist name is too long"),
  is_token: z.boolean(),
  external_ids: z.object({
    riftcodex_id: z.string().max(128),
    riftbound_id: z.string().max(128),
    tcgplayer_id: z.string().max(128),
  }),
  attributes: z.object({
    energy: integerString,
    might: integerString,
    power: integerString,
    might_bonus: integerString,
  }),
  classification: z.object({
    type: z.string().max(120),
    supertype: z.string().max(120),
    rarity: z.string().max(120),
    tags: z.string().max(2000),
    domains: z.string().max(2000),
  }),
  text: z.object({
    rich: z.string().max(8000),
    plain: z.string().max(8000),
    flavour: z.string().max(8000),
    equipment: z.string().max(8000),
  }),
  metadata: z.object({
    finishes: z.string().max(500),
    signature: z.boolean(),
    overnumbered: z.boolean(),
    alternate_art: z.boolean(),
    special_collection: z.boolean(),
  }),
  media: z.object({
    orientation: blankOr(
      (v) => (CARD_ORIENTATIONS as readonly string[]).includes(v),
      "Choose portrait or landscape",
    ),
    accessibility_text: z.string().max(2000),
  }),
  purchase_uris: z.object({
    cardmarket: urlString,
    tcgplayer: urlString,
  }),
  prices: z.object({
    tcgplayer: priceEntrySchema,
    cardmarket: priceEntrySchema,
  }),
  note: z.string().max(2000, "Note is too long"),
});

// ─── Card → form ──────────────────────────────────────────────────────────────

/**
 * Card fields are typed as strings but reach the browser as whatever the API
 * serialized, so the editor coerces rather than trusting the declared type — a
 * surprise object here would otherwise crash the whole page on render.
 */
function str(value: string | null | undefined): string {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function num(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function list(value: string[] | null | undefined): string {
  return (value ?? []).join(", ");
}

function priceValues(
  entry:
    | { normal?: number | null; foil?: number | null; low_normal?: number | null; low_foil?: number | null }
    | undefined,
): PriceEntryValues {
  return {
    normal: num(entry?.normal),
    foil: num(entry?.foil),
    low_normal: num(entry?.low_normal),
    low_foil: num(entry?.low_foil),
  };
}

/** Seed the editor from a card. Also the baseline every save diffs against. */
export function cardToEditorValues(card: Card): CardEditorValues {
  return {
    name: card.name,
    collector_number: str(card.collector_number),
    released_at: toDateInputValue(card.released_at),
    artist: str(card.artist),
    is_token: card.is_token,
    external_ids: {
      riftcodex_id: str(card.external_ids?.riftcodex_id),
      riftbound_id: str(card.external_ids?.riftbound_id),
      tcgplayer_id: str(card.external_ids?.tcgplayer_id),
    },
    attributes: {
      energy: num(card.attributes?.energy),
      might: num(card.attributes?.might),
      power: num(card.attributes?.power),
      might_bonus: num(card.attributes?.might_bonus),
    },
    classification: {
      type: str(card.classification?.type),
      supertype: str(card.classification?.supertype),
      rarity: str(card.classification?.rarity),
      tags: list(card.classification?.tags),
      domains: list(card.classification?.domains),
    },
    text: {
      rich: str(card.text?.rich),
      plain: str(card.text?.plain),
      flavour: str(card.text?.flavour),
      equipment: str(card.text?.equipment),
    },
    metadata: {
      finishes: list(card.metadata?.finishes),
      signature: card.metadata?.signature ?? false,
      overnumbered: card.metadata?.overnumbered ?? false,
      alternate_art: card.metadata?.alternate_art ?? false,
      special_collection: card.metadata?.special_collection ?? false,
    },
    media: {
      orientation: str(card.media?.orientation),
      accessibility_text: str(card.media?.accessibility_text),
    },
    purchase_uris: {
      cardmarket: str(card.purchase_uris?.cardmarket),
      tcgplayer: str(card.purchase_uris?.tcgplayer),
    },
    prices: {
      tcgplayer: priceValues(card.prices?.tcgplayer),
      cardmarket: priceValues(card.prices?.cardmarket),
    },
    note: "",
  };
}

// ─── Form → patch ─────────────────────────────────────────────────────────────

type PatchTarget = Record<string, unknown>;

function diffText(target: PatchTarget, key: string, next: string, prev: string) {
  const a = next.trim();
  const b = prev.trim();
  if (a === b) return;
  target[key] = a === "" ? null : a;
}

function diffNumber(target: PatchTarget, key: string, next: string, prev: string) {
  const a = next.trim();
  const b = prev.trim();
  if (a === b) return;
  target[key] = a === "" ? null : Number(a);
}

function diffBoolean(target: PatchTarget, key: string, next: boolean, prev: boolean) {
  if (next === prev) return;
  target[key] = next;
}

/** Comma-separated input → array. Blank entries are dropped, order is kept. */
export function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function diffList(target: PatchTarget, key: string, next: string, prev: string) {
  const a = parseList(next);
  const b = parseList(prev);
  if (a.length === b.length && a.every((entry, i) => entry === b[i])) return;
  target[key] = a.length > 0 ? a : null;
}

/** Attach a nested group only when one of its leaves actually changed. */
function attach(patch: PatchTarget, key: string, group: PatchTarget) {
  if (Object.keys(group).length > 0) patch[key] = group;
}

function diffPriceEntry(
  next: PriceEntryValues,
  prev: PriceEntryValues,
): PatchTarget {
  const entry: PatchTarget = {};
  diffNumber(entry, "normal", next.normal, prev.normal);
  diffNumber(entry, "foil", next.foil, prev.foil);
  diffNumber(entry, "low_normal", next.low_normal, prev.low_normal);
  diffNumber(entry, "low_foil", next.low_foil, prev.low_foil);
  return entry;
}

/**
 * Build the merge patch for `PATCH /admin/cards/:id` from the form's current
 * values and the values it was seeded with. Returns `{}` when nothing changed,
 * which callers should treat as "no save needed" — the API rejects an empty
 * patch with `EMPTY_PATCH`.
 */
export function buildCardPatch(
  values: CardEditorValues,
  initial: CardEditorValues,
): AdminCardPatch {
  const patch: PatchTarget = {};

  // `name` is required, so it is the one string that never becomes null.
  if (values.name.trim() !== initial.name.trim()) {
    patch.name = values.name.trim();
  }
  diffText(patch, "collector_number", values.collector_number, initial.collector_number);
  diffText(patch, "released_at", values.released_at, initial.released_at);
  diffText(patch, "artist", values.artist, initial.artist);
  diffBoolean(patch, "is_token", values.is_token, initial.is_token);

  const externalIds: PatchTarget = {};
  diffText(externalIds, "riftcodex_id", values.external_ids.riftcodex_id, initial.external_ids.riftcodex_id);
  diffText(externalIds, "riftbound_id", values.external_ids.riftbound_id, initial.external_ids.riftbound_id);
  diffText(externalIds, "tcgplayer_id", values.external_ids.tcgplayer_id, initial.external_ids.tcgplayer_id);
  attach(patch, "external_ids", externalIds);

  const attributes: PatchTarget = {};
  diffNumber(attributes, "energy", values.attributes.energy, initial.attributes.energy);
  diffNumber(attributes, "might", values.attributes.might, initial.attributes.might);
  diffNumber(attributes, "power", values.attributes.power, initial.attributes.power);
  diffNumber(attributes, "might_bonus", values.attributes.might_bonus, initial.attributes.might_bonus);
  attach(patch, "attributes", attributes);

  const classification: PatchTarget = {};
  diffText(classification, "type", values.classification.type, initial.classification.type);
  diffText(classification, "supertype", values.classification.supertype, initial.classification.supertype);
  diffText(classification, "rarity", values.classification.rarity, initial.classification.rarity);
  diffList(classification, "tags", values.classification.tags, initial.classification.tags);
  diffList(classification, "domains", values.classification.domains, initial.classification.domains);
  attach(patch, "classification", classification);

  const text: PatchTarget = {};
  diffText(text, "rich", values.text.rich, initial.text.rich);
  diffText(text, "plain", values.text.plain, initial.text.plain);
  diffText(text, "flavour", values.text.flavour, initial.text.flavour);
  diffText(text, "equipment", values.text.equipment, initial.text.equipment);
  attach(patch, "text", text);

  const metadata: PatchTarget = {};
  diffList(metadata, "finishes", values.metadata.finishes, initial.metadata.finishes);
  diffBoolean(metadata, "signature", values.metadata.signature, initial.metadata.signature);
  diffBoolean(metadata, "overnumbered", values.metadata.overnumbered, initial.metadata.overnumbered);
  diffBoolean(metadata, "alternate_art", values.metadata.alternate_art, initial.metadata.alternate_art);
  diffBoolean(metadata, "special_collection", values.metadata.special_collection, initial.metadata.special_collection);
  attach(patch, "metadata", metadata);

  const media: PatchTarget = {};
  diffText(media, "orientation", values.media.orientation, initial.media.orientation);
  diffText(media, "accessibility_text", values.media.accessibility_text, initial.media.accessibility_text);
  attach(patch, "media", media);

  const purchaseUris: PatchTarget = {};
  diffText(purchaseUris, "cardmarket", values.purchase_uris.cardmarket, initial.purchase_uris.cardmarket);
  diffText(purchaseUris, "tcgplayer", values.purchase_uris.tcgplayer, initial.purchase_uris.tcgplayer);
  attach(patch, "purchase_uris", purchaseUris);

  const prices: PatchTarget = {};
  attach(prices, "tcgplayer", diffPriceEntry(values.prices.tcgplayer, initial.prices.tcgplayer));
  attach(prices, "cardmarket", diffPriceEntry(values.prices.cardmarket, initial.prices.cardmarket));
  attach(patch, "prices", prices);

  return patch as AdminCardPatch;
}

/** How many top-level groups a patch touches — drives the "N changes" hint. */
export function countPatchChanges(patch: AdminCardPatch): number {
  return Object.values(patch).reduce<number>((total, value) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return total + Object.keys(value as PatchTarget).length;
    }
    return total + 1;
  }, 0);
}
