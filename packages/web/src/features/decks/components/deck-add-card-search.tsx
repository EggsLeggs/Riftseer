"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { printingImageUrl } from "@riftseer/types";

import { Command as CommandPrimitive } from "cmdk";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cardsApi, cardsQueryKeys, type CardResult } from "@/features/cards/api";
import { DECK_ZONE_LABELS } from "@riftseer/types/deck";
import { resolveAddZone, type AddableCard } from "../deck-add";
import { addableFromResult } from "./deck-add-card-dialog";
import { cn } from "@/lib/utils";
import type { DeckZone } from "../types";

/**
 * The toolbar's add bar: type a name, Enter drops a copy into the card's
 * natural zone, and the query stays put so Enter again is another copy —
 * the same multi-add contract as the palette, without the dialog.
 *
 * Sideboard still has a zone Add that opens the palette; the other zones
 * rely on this bar.
 */

const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 8;

export function DeckAddCardSearch({
  onAdd,
  disabled,
  className,
}: {
  onAdd: (card: AddableCard, zone: DeckZone) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  const trimmed = debounced.trim();
  const search = useQuery({
    queryKey: cardsQueryKeys.search(trimmed, RESULT_LIMIT, 0),
    queryFn: () => cardsApi.searchByName(trimmed, { limit: RESULT_LIMIT, offset: 0 }),
    enabled: focused && trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });

  const results = trimmed ? (search.data?.cards ?? []) : [];
  const open = focused && query.trim().length > 0;

  const choose = (result: CardResult) => {
    const card = addableFromResult(result);
    const zone = resolveAddZone(card, null);
    onAdd(card, zone);
    // One toast per card, updated in place — same id the dialog uses.
    toast.success(`Added ${card.name ?? "card"} to ${DECK_ZONE_LABELS[zone]}`, {
      id: `deck-add-${card.printing_id}`,
    });
  };

  return (
    <Command
      shouldFilter={false}
      loop
      className={cn(
        "relative h-auto w-full overflow-visible rounded-none! bg-transparent p-0 sm:w-72",
        className,
      )}
      // Focus is tracked on the whole widget, so clicking a result (which
      // moves focus for a moment) does not close the list before it lands.
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setQuery("");
          (event.target as HTMLElement).blur();
        }
      }}
    >
      <div className="border-input bg-background flex h-8 items-center rounded-md border">
        <SearchIcon className="text-muted-foreground ml-2.5 size-4 shrink-0" aria-hidden="true" />
        <CommandPrimitive.Input
          value={query}
          onValueChange={setQuery}
          disabled={disabled}
          placeholder="Add a card…"
          aria-label="Add a card"
          className="placeholder:text-muted-foreground h-8 w-full bg-transparent py-0 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {open && (
        <CommandList className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-40 mt-1 max-h-80 overflow-y-auto rounded-lg p-1 shadow-md ring-1 ring-foreground/10">
          {search.isError ? (
            <p className="text-muted-foreground px-2 py-3 text-sm">Search failed. Try again.</p>
          ) : results.length === 0 ? (
            <CommandEmpty className="text-muted-foreground px-2 py-3 text-sm">
              {search.isFetching ? "Searching…" : "No cards found."}
            </CommandEmpty>
          ) : (
            <CommandGroup>
              {results.map((result) => {
                const imageUrl = printingImageUrl(result.printing, "small");
                const setLine = [
                  result.printing.set?.set_code?.toUpperCase(),
                  result.printing.collector_label ?? result.printing.collector_number,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <CommandItem
                    key={result.printing.id}
                    value={result.printing.id}
                    onSelect={() => choose(result)}
                  >
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt=""
                        aria-hidden="true"
                        className="h-11 w-8 shrink-0 object-contain"
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate leading-none">{result.oracle.name}</span>
                      {setLine && (
                        <span className="text-muted-foreground text-xs leading-none">
                          {setLine}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      )}
    </Command>
  );
}
