"use client";

import * as React from "react";
import { CheckIcon, ChevronUpIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { countDeckViolations } from "../deck-violations";
import { deckZoneSections } from "../grouping";
import type { DeckCard, DeckViolation } from "../types";
import { DeckViolationList } from "./deck-violation-list";

/**
 * The bar along the bottom of the builder: what is in each zone, what is wrong
 * with it, and whether the last edit has landed.
 *
 * When the page is long enough that this bar sticks to the viewport, it
 * bleeds full-width so the counts are not trapped in the container. When it
 * sits in document flow — the page is short, or the reader has reached the
 * end — extra space above keeps it from kissing the comments.
 */

export function DeckFooterBar({
  cards,
  violations,
  saving,
  dirty,
}: {
  cards: readonly DeckCard[];
  violations: readonly DeckViolation[];
  saving?: boolean;
  dirty?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [stuck, setStuck] = React.useState(false);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const sections = React.useMemo(() => deckZoneSections(cards), [cards]);
  const counts = React.useMemo(() => countDeckViolations(violations), [violations]);

  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry?.isIntersecting), {
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      <div
        className={cn(
          "bg-background/95 sticky bottom-0 z-20 border-t backdrop-blur",
          // Full-bleed via margin, not `relative`/`left`: those replace
          // `sticky` and the bar drops back into the page.
          stuck ? "w-screen max-w-[100vw] ml-[calc(50%-50vw)]" : "mt-10",
        )}
      >
        {open && violations.length > 0 && (
          <div
            className={cn("max-h-64 overflow-y-auto border-b py-2", stuck ? "container" : "px-1")}
          >
            <DeckViolationList violations={violations} />
          </div>
        )}
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-xs",
            stuck ? "container" : undefined,
          )}
        >
          {sections.map((section) => (
            <span key={section.zone} className="flex items-baseline gap-1">
              <span className="text-muted-foreground">{section.label}</span>
              <span className="font-medium tabular-nums">{section.count}</span>
            </span>
          ))}

          <span className="ml-auto flex items-center gap-3">
            {saving ? (
              <span className="text-muted-foreground flex items-center gap-1">
                <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
                Saving…
              </span>
            ) : dirty === false ? (
              <span className="text-muted-foreground flex items-center gap-1">
                <CheckIcon className="size-3" aria-hidden="true" />
                Saved
              </span>
            ) : null}

            {counts.total === 0 ? (
              <span className="text-muted-foreground">No issues</span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-2 px-2 text-xs"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
              >
                {counts.error > 0 && (
                  <span className="text-destructive font-medium">
                    {counts.error} error{counts.error === 1 ? "" : "s"}
                  </span>
                )}
                {counts.warning > 0 && (
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {counts.warning} warning{counts.warning === 1 ? "" : "s"}
                  </span>
                )}
                {counts.info > 0 && (
                  <span className="text-muted-foreground">
                    {counts.info} note{counts.info === 1 ? "" : "s"}
                  </span>
                )}
                <ChevronUpIcon
                  className={cn("size-3 transition-transform", open && "rotate-180")}
                  aria-hidden="true"
                />
              </Button>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
