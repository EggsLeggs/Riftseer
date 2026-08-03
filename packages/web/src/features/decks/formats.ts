/**
 * The play formats a deck can be built in.
 *
 * Public and token-less, like `api.ts`: the create form, the import form and
 * the metadata editor all need the same list, and a format is not deck state —
 * it is catalogue vocabulary the deck merely points at by `code`.
 */

import { createApiClient } from "@/lib/api/client";
import { getJsonFromTreaty, requestFetchInit } from "@/lib/api/request";

const formatsClient = createApiClient();

export interface DeckFormatOption {
  id: string;
  code: string;
  name: string;
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
