/**
 * The durable admin layer.
 *
 * There is no override overlay any more. An admin edit is stored on the row it
 * edits and protected by `printings.locked_fields`, which the ingest RPC honours
 * per column — so ingest no longer has to re-apply anything for an edit to
 * survive. It does still have to *read* two of those locks:
 *
 *   • `tcgplayer_id` — a link an admin confirmed in the review queue. RiftCodex
 *     does not know it, so without seeding it back onto the in-memory printing
 *     the enricher cannot match the product: the printing would stay priceless
 *     forever and the reconciler would re-file the "unmatched product" entry the
 *     admin just resolved.
 *   • `image` — an admin upload. The bytes may not be transcoded yet, and only
 *     this run's job producer can queue them.
 *
 * Everything else an admin has locked is invisible here on purpose: the RPC
 * keeps the stored value regardless of what we send.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../utils.ts";
import type { IngestPrinting } from "./types.ts";
import type { CardImageSourceProvider } from "../images/types.ts";

const DATABASE_PAGE_SIZE = 1000;

export interface DurablePrinting {
  id: string;
  tcgplayer_id: string | null;
  image_source_url: string | null;
  image_source_hash: string | null;
  image_source_provider: string | null;
  image_hosted_at: string | null;
  locked_fields: string[];
}

function isLocked(row: DurablePrinting, field: string): boolean {
  return row.locked_fields.includes(field);
}

export function hasLockedImage(row: DurablePrinting | undefined): boolean {
  return row !== undefined && isLocked(row, "image");
}

/** True when the full R2 variant set already exists for this row. */
export function isHosted(row: DurablePrinting | undefined): boolean {
  return Boolean(row?.image_hosted_at);
}

/**
 * Read the stored state of every printing, paged.
 *
 * A plain `.select()` silently stops at PostgREST's max-rows cap, which would
 * read an admin's lock as absent and quietly undo their edit.
 */
export async function loadDurablePrintings(
  supabase: SupabaseClient,
): Promise<Map<string, DurablePrinting>> {
  const rows = new Map<string, DurablePrinting>();

  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("printings")
      .select(
        "id, tcgplayer_id, image_source_url, image_source_hash, image_source_provider, image_hosted_at, locked_fields",
      )
      .order("id")
      .range(from, from + DATABASE_PAGE_SIZE - 1);
    if (error) throw new Error(`load printings failed: ${error.message}`);

    const page = (data ?? []) as DurablePrinting[];
    for (const row of page) {
      rows.set(row.id, { ...row, locked_fields: row.locked_fields ?? [] });
    }
    if (page.length < DATABASE_PAGE_SIZE) break;
  }

  return rows;
}

/**
 * Seed admin-confirmed TCGPlayer links onto the printings before enrichment.
 *
 * Marked as locked so the enricher's contention resolver can tell a decision
 * from an observation: a confirmed link wins the product outright and is never
 * shed.
 */
export function applyLockedProductLinks(
  printings: IngestPrinting[],
  durable: Map<string, DurablePrinting>,
): number {
  let applied = 0;
  for (const printing of printings) {
    const row = durable.get(printing.id);
    if (!row || !isLocked(row, "tcgplayer_id") || !row.tcgplayer_id) continue;
    printing.tcgplayer_id = row.tcgplayer_id;
    printing.tcgplayer_id_locked = true;
    applied++;
  }
  if (applied > 0) {
    logger.info("Applied admin-confirmed TCGPlayer links", { applied });
  }
  return applied;
}

/** Narrow a stored provider string to the queue's union, or undefined. */
export function toImageProvider(
  value: string | null | undefined,
): CardImageSourceProvider | undefined {
  return value === "riftcodex" || value === "tcgplayer" || value === "admin"
    ? value
    : undefined;
}
