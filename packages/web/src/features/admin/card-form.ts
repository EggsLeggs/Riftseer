import type { Oracle, Printing } from "@riftseer/types";
import type { AdminOraclePatch, AdminPrintingPatch } from "./types";
import { toDateInputValue } from "./dates";

export interface OracleEditorValues {
  name: string;
  card_type: string;
  supertype: string;
  is_token: boolean;
  energy: string;
  might: string;
  power: string;
  might_bonus: string;
  text_rich: string;
  text_plain: string;
  equipment_text: string;
  tags: string;
  domains: string;
  meta_flags: string;
}

export interface PrintingEditorValues {
  set_code: string;
  collector_number: string;
  released_at: string;
  rarity: string;
  flavour_text: string;
  finishes: string;
  artist: string;
  is_signature: boolean;
  is_alternate_art: boolean;
  is_overnumbered: boolean;
  is_special_collection: boolean;
  tcgplayer_id: string;
  tcgplayer_url: string;
  cardmarket_url: string;
}

const text = (value: string | null | undefined) => value ?? "";
const csv = (values: string[]) => values.join(", ");

export function oracleToEditorValues(oracle: Oracle): OracleEditorValues {
  return {
    name: oracle.name,
    card_type: text(oracle.card_type),
    supertype: text(oracle.supertype),
    is_token: oracle.is_token,
    energy: oracle.energy == null ? "" : String(oracle.energy),
    might: oracle.might == null ? "" : String(oracle.might),
    power: oracle.power == null ? "" : String(oracle.power),
    // Empty means absent. The string "0" remains present and is never folded away.
    might_bonus: oracle.might_bonus == null ? "" : String(oracle.might_bonus),
    text_rich: text(oracle.text?.rich),
    text_plain: text(oracle.text?.plain),
    equipment_text: text(oracle.text?.equipment),
    tags: csv(oracle.tags),
    domains: csv(oracle.domains),
    meta_flags: csv(oracle.meta_flags),
  };
}

export function printingToEditorValues(printing: Printing): PrintingEditorValues {
  return {
    set_code: text(printing.set?.set_code),
    collector_number: text(printing.collector_number),
    released_at: toDateInputValue(printing.released_at),
    rarity: text(printing.rarity),
    flavour_text: text(printing.flavour_text),
    finishes: csv(printing.finishes),
    artist: text(printing.artist),
    is_signature: printing.signature,
    is_alternate_art: printing.alternate_art,
    is_overnumbered: printing.overnumbered,
    is_special_collection: printing.special_collection,
    tcgplayer_id: text(printing.external_ids?.tcgplayer_id),
    tcgplayer_url: text(printing.purchase_uris?.tcgplayer),
    cardmarket_url: text(printing.purchase_uris?.cardmarket),
  };
}

const nullableText = (value: string) => value.trim() || null;
const nullableNumber = (value: string): number | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
};
const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

export function buildOraclePatch(
  values: OracleEditorValues,
  initial: OracleEditorValues,
): AdminOraclePatch {
  const patch: AdminOraclePatch = {};
  const setText = (key: "name" | "card_type" | "supertype" | "text_rich" | "text_plain" | "equipment_text") => {
    if (values[key] === initial[key]) return;
    if (key === "name") patch.name = values.name.trim();
    else patch[key] = nullableText(values[key]);
  };
  setText("name"); setText("card_type"); setText("supertype");
  setText("text_rich"); setText("text_plain"); setText("equipment_text");
  if (values.is_token !== initial.is_token) patch.is_token = values.is_token;
  for (const key of ["energy", "might", "power", "might_bonus"] as const) {
    if (values[key] !== initial[key]) patch[key] = nullableNumber(values[key]);
  }
  for (const key of ["tags", "domains", "meta_flags"] as const) {
    if (values[key] !== initial[key]) patch[key] = list(values[key]);
  }
  return patch;
}

export function buildPrintingPatch(
  values: PrintingEditorValues,
  initial: PrintingEditorValues,
): AdminPrintingPatch {
  const patch: AdminPrintingPatch = {};
  if (values.set_code !== initial.set_code) patch.set_code = values.set_code.trim();
  for (const key of ["collector_number", "released_at", "rarity", "flavour_text", "artist", "tcgplayer_id", "tcgplayer_url", "cardmarket_url"] as const) {
    if (values[key] !== initial[key]) patch[key] = nullableText(values[key]);
  }
  if (values.finishes !== initial.finishes) patch.finishes = list(values.finishes);
  for (const key of ["is_signature", "is_alternate_art", "is_overnumbered", "is_special_collection"] as const) {
    if (values[key] !== initial[key]) patch[key] = values[key];
  }
  return patch;
}
