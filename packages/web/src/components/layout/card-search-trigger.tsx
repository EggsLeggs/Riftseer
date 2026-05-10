"use client";

import * as React from "react";
import { SearchIcon } from "lucide-react";
import { useCardSearch } from "@/features/cards/card-search-provider";
import { cn } from "@/lib/utils";

/**
 * Detects an Apple-flavored UA so we can show ⌘ vs Ctrl on the trigger badge.
 * `navigator.platform` is deprecated but still the most reliable cross-browser
 * heuristic; userAgentData isn't available in Safari/Firefox yet. Heuristic-only —
 * the keyboard handler accepts both modifiers regardless.
 */
function useIsAppleOs(): boolean {
  const [isApple, setIsApple] = React.useState(false);
  React.useEffect(() => {
    if (typeof navigator === "undefined") return;
    const platform = navigator.platform ?? "";
    const ua = navigator.userAgent ?? "";
    setIsApple(/Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/.test(ua));
  }, []);
  return isApple;
}

interface CardSearchTriggerProps {
  className?: string;
}

export function CardSearchTrigger({ className }: CardSearchTriggerProps) {
  const { open, setOpen, triggerId } = useCardSearch();
  const isApple = useIsAppleOs();
  const modKey = isApple ? "⌘" : "Ctrl";

  return (
    <button
      type="button"
      id={triggerId}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="Search cards"
      onClick={() => setOpen(true)}
      className={cn(
        "group inline-flex h-8 w-full max-w-xs items-center gap-2 rounded-md border border-input/60 bg-input/30 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-input/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <SearchIcon className="size-4 shrink-0 opacity-60" aria-hidden="true" />
      <span className="flex-1 truncate text-left">Search cards…</span>
      <kbd
        aria-hidden="true"
        className="hidden items-center gap-0.5 rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex"
      >
        <span>{modKey}</span>
        <span>K</span>
      </kbd>
    </button>
  );
}
