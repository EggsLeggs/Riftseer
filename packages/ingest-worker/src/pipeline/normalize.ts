/**
 * Normalize raw RiftCodex data → IngestSet + Card, applying overrides.
 */

import type { RawSetInfo, RawCard } from "../sources/riftcodex.ts";
import type { IngestSet } from "./types.ts";
import type { Card } from "@riftseer/types";
import { rawToCard } from "../sources/riftcodex.ts";
import { overrides } from "../overrides/index.ts";

const PROMO_NAME_PATTERN = /\bpromotional\b/i;

export function normalizeSets(rawSets: RawSetInfo[]): IngestSet[] {
  return rawSets.map((raw) => {
    const setCode = raw.set_id.toUpperCase();
    const override = overrides.riftcodexSets[raw.set_id] ?? overrides.riftcodexSets[setCode] ?? {};
    const name = override.name ?? raw.name ?? raw.label;
    return {
      set_code: setCode,
      set_name: name,
      set_uri: `/search?q=&set=${setCode}`,
      set_search_uri: undefined,
      published_on: override.published_on ?? raw.published_on ?? null,
      is_promo: override.is_promo ?? PROMO_NAME_PATTERN.test(name),
      parent_set_code: override.parent_set_code ?? null,
      external_ids: {
        riftcodex_set_id: raw.set_id,
        tcgplayer_group_id: raw.tcgplayer_id ?? undefined,
        cardmarket_id: raw.cardmarket_id ?? undefined,
      },
    };
  });
}

export function normalizeCards(rawCards: RawCard[]): Card[] {
  return rawCards.map((raw) => {
    const card = rawToCard(raw);
    const override = overrides.cards[raw.id] ?? {};
    if (override.released_at) card.released_at = override.released_at;
    return card;
  });
}
