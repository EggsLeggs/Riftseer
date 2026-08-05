"use client";

import * as React from "react";
import { ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The collapsed sections under the deck list — tokens, considering, history.
 *
 * A native `<details>` rather than a Radix collapsible: these are secondary
 * content, they must be findable by the browser's in-page search when open, and
 * they need no animation or controlled state to earn a dependency.
 */
export function DeckCollapsible({
  title,
  count,
  defaultOpen = false,
  lazy = false,
  children,
  className,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  /**
   * Hold the children back until the section is first opened.
   *
   * `<details>` renders its content while closed, so a child that fetches on
   * mount fetches on page load. Off by default: for a section whose content is
   * already in hand this would only cost a re-render, and only the paying
   * sections should opt in.
   */
  lazy?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [opened, setOpened] = React.useState(defaultOpen);
  return (
    <details
      className={cn("group border-t py-3", className)}
      open={defaultOpen}
      onToggle={lazy && !opened ? () => setOpened(true) : undefined}
    >
      {/* Safari draws `::-webkit-details-marker` regardless of `list-none`,
          which would show a second indicator beside the chevron. */}
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          className="text-muted-foreground size-3.5 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        {title}
        {count != null && (
          <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
        )}
      </summary>
      <div className="pt-3">{lazy && !opened ? null : children}</div>
    </details>
  );
}
