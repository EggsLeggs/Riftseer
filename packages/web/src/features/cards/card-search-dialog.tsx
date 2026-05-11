"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cardsApi, cardsQueryKeys, CardApiError } from "./api";
import { cardHref } from "./paths";

function searchErrorInfo(err: unknown): { title: string; detail: string } {
  if (err instanceof CardApiError) {
    if (err.code === "timeout")
      return { title: "Search timed out", detail: "Please try again." };
    if (err.code === "network")
      return { title: "Couldn't connect", detail: "Check your connection and try again." };
    if (err.status === 400 && err.detail)
      return { title: "Invalid query", detail: err.detail };
    if (err.status != null && err.status >= 500)
      return { title: "Search unavailable", detail: "The search service is having issues. Try again shortly." };
  }
  return { title: "Something went wrong", detail: "Please try again." };
}

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
  const hasNavigated = React.useRef(false);
  const trimmed = debouncedQuery.trim();

  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  React.useEffect(() => {
    hasNavigated.current = false;
  }, [query]);

  const search = useQuery({
    queryKey: cardsQueryKeys.search(trimmed, PALETTE_LIMIT, 0),
    queryFn: () => cardsApi.searchByName(trimmed, { limit: PALETTE_LIMIT, offset: 0 }),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });

  const cards = trimmed ? search.data?.cards ?? [] : [];
  const showLoading = trimmed.length > 0 && search.isFetching && !search.isError;
  const errorInfo = search.isError ? searchErrorInfo(search.error) : null;

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
      className="sm:max-w-xl"
    >
      <Command
        shouldFilter={false}
        loop
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            hasNavigated.current = true;
          }
          if (e.key === "Enter" && !e.nativeEvent.isComposing && !hasNavigated.current && trimmed) {
            e.preventDefault();
            goToSearchPage();
          }
        }}
      >
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
          ) : errorInfo ? (
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <img
                src="/lambsheep.png"
                alt=""
                aria-hidden="true"
                className="h-20 w-auto opacity-80"
              />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{errorInfo.title}</p>
                <p className="text-xs text-muted-foreground">{errorInfo.detail}</p>
              </div>
            </div>
          ) : showLoading && cards.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Searching…
            </div>
          ) : !showLoading && search.data != null && cards.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <img
                src="/lambsheep.png"
                alt=""
                aria-hidden="true"
                className="h-20 w-auto opacity-80"
              />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">No cards found</p>
                <p className="text-xs text-muted-foreground">
                  Try a different spelling or broaden your search.
                </p>
              </div>
            </div>
          ) : null}

          {cards.length > 0 && (
            <CommandGroup heading="Cards">
              {cards.map((card) => {
                const href = cardHref(card);
                const setCode = [
                  card.set?.set_code?.toUpperCase(),
                  card.collector_number,
                ].filter(Boolean).join(" · ");
                const imageUrl =
                  card.media?.media_urls?.small ??
                  card.media?.media_urls?.normal;
                return (
                  <CommandItem
                    key={card.id}
                    value={`${card.name} ${card.id}`}
                    onSelect={() => goToCard(href)}
                  >
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt=""
                        aria-hidden="true"
                        className="h-11 w-8 shrink-0 rounded-sm object-cover"
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate leading-none">{card.name}</span>
                      {setCode && (
                        <span className="text-xs leading-none text-muted-foreground">
                          {setCode}
                        </span>
                      )}
                    </div>
                    <kbd
                      aria-hidden="true"
                      data-slot="command-shortcut"
                      className="inline-flex items-center rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground opacity-0 group-data-[selected=true]/command-item:opacity-100"
                    >
                      ↵
                    </kbd>
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
                  <span className="flex-1">View all results for "{trimmed}"</span>
                  <kbd
                    aria-hidden="true"
                    data-slot="command-shortcut"
                    className="inline-flex items-center rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground opacity-0 group-data-[selected=true]/command-item:opacity-100"
                  >
                    ↵
                  </kbd>
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
        <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {trimmed && search.data?.total != null && (
            <span>{search.data.total} result{search.data.total !== 1 ? "s" : ""}</span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center rounded border border-border bg-background/60 px-1 py-0.5 font-mono text-[10px] font-medium">↑</kbd>
              <kbd className="inline-flex items-center rounded border border-border bg-background/60 px-1 py-0.5 font-mono text-[10px] font-medium">↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-medium">↵</kbd>
              Open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-medium">Esc</kbd>
              Close
            </span>
          </div>
        </div>
      </Command>
    </CommandDialog>
  );
}
