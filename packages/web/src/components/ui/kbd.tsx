import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A keyboard-shortcut badge. One place for the chrome so every hint in the app
 * (palette footers, search triggers, menu shortcuts) stays the same shape;
 * callers add colour or reveal behaviour via `className`.
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex items-center gap-0.5 rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-medium",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
