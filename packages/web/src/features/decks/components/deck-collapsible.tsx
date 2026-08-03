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
  children,
  className,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group border-t py-3", className)} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
        <ChevronRightIcon
          className="text-muted-foreground size-3.5 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        {title}
        {count != null && (
          <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
        )}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}
