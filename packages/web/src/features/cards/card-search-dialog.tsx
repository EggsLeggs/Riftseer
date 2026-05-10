"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cardsApi, cardsQueryKeys } from "./api";
import { cardHref } from "./paths";

const DEBOUNCE_MS = 250;
/** Command palette: keep a small cap so the dialog stays scannable. */
const PALETTE_LIMIT = 10;

interface CardSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Global card search palette. Filtering is server-driven, so cmdk's local
 * filter is disabled; results from `cardsApi.searchByName` are rendered as-is.
 */
export function CardSearchDialog({ open, onOpenChange }: CardSearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const trimmed = debouncedQuery.trim();

  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const search = useQuery({
    queryKey: cardsQueryKeys.search(trimmed, PALETTE_LIMIT, 0),
    queryFn: () => cardsApi.searchByName(trimmed, { limit: PALETTE_LIMIT, offset: 0 }),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const cards = trimmed ? search.data?.cards ?? [] : [];
  const showLoading = trimmed.length > 0 && search.isFetching;

  const goToCard = React.useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  const goToSearchPage = React.useCallback(() => {
    if (!trimmed) return;
    onOpenChange(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }, [onOpenChange, router, trimmed]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search Riftseer"
      description="Search for cards by name. More groups coming soon."
    >
      <Command shouldFilter={false} loop>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search cards…"
          aria-label="Search cards"
        />
        <CommandList aria-busy={showLoading || undefined}>
          {!trimmed ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Type to search cards by name.
            </div>
          ) : showLoading && cards.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Searching…
            </div>
          ) : (
            <CommandEmpty>No cards found.</CommandEmpty>
          )}

          {cards.length > 0 && (
            <CommandGroup heading="Cards">
              {cards.map((card) => {
                const href = cardHref(card);
                const setCode = card.set?.set_code;
                const collector = card.collector_number;
                const subtitle = [setCode, collector].filter(Boolean).join(" · ");
                return (
                  <CommandItem
                    key={card.id}
                    value={`${card.name} ${card.id}`}
                    onSelect={() => goToCard(href)}
                  >
                    <span className="truncate">{card.name}</span>
                    {subtitle && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {subtitle}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {trimmed && (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value={`__view_all__${trimmed}`}
                  onSelect={goToSearchPage}
                >
                  <SearchIcon className="size-4 opacity-60" />
                  <span>View all results for “{trimmed}”</span>
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
