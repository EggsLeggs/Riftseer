/**
 * The play formats a deck can be built in.
 *
 * Public and token-less, like `api.ts`: the create form, the import form and
 * the metadata editor all need the same list, and a format is not deck state —
 * it is catalogue vocabulary the deck merely points at by `code`.
 */

import type { FormatRules } from "@riftseer/types/deck";

import { createApiClient } from "@/lib/api/client";
import { getJsonFromTreaty, requestFetchInit } from "@/lib/api/request";

const formatsClient = createApiClient();

export interface DeckFormatOption {
  id: string;
  code: string;
  name: string;
  /** Absent on an older API build; treated as "constrains nothing". */
  zone_rules?: FormatRules["zones"];
  severity_overrides?: FormatRules["severity_overrides"];
}

/**
 * The rules `validateDeck` takes, from a format the list handed back.
 *
 * Only the guest builder needs this: a saved deck's violations are computed by
 * the API and arrive precomputed. A format the list does not know about (an
 * empty list, a stale cache) validates against no zone rules, which reports the
 * game-level problems — no legend, no champion, wrong zone — and nothing else.
 */
export function formatRulesFor(
  format: DeckFormatOption | undefined | null,
): FormatRules {
  return {
    zones: format?.zone_rules ?? [],
    ...(format?.severity_overrides
      ? { severity_overrides: format.severity_overrides }
      : {}),
  };
}

export const formatsApi = {
  /**
   * Active formats in display order. An empty list is a real answer — the API
   * degrades to "no formats configured" rather than failing — so callers render
   * the deck's own format rather than assuming a default exists.
   */
  async list(): Promise<DeckFormatOption[]> {
    const page = await getJsonFromTreaty<{ formats: DeckFormatOption[] }>(() =>
      formatsClient.api.v1.formats.get({ fetch: requestFetchInit() }),
    );
    return page?.formats ?? [];
  },
};

export const formatsQueryKeys = {
  all: ["formats"] as const,
  list: () => ["formats", "list"] as const,
};

/**
 * Options for a `<select>`, with the deck's current format folded in.
 *
 * A deck can sit in a format that has since been retired, and the public list
 * hides retired formats — so a naive select would silently re-home the deck the
 * next time anyone saved its name.
 */
export function formatSelectOptions(
  formats: readonly DeckFormatOption[],
  current?: { code: string; name: string } | null,
): Array<{ value: string; label: string }> {
  const options = formats.map((format) => ({
    value: format.code,
    label: format.name,
  }));
  if (current && !options.some((option) => option.value === current.code)) {
    options.unshift({ value: current.code, label: current.name });
  }
  return options;
}
