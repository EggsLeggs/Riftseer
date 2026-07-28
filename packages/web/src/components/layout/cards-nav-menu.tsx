"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon, LayoutGrid, Layers, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/cards", label: "Card Gallery", Icon: LayoutGrid },
  { href: "/sets", label: "Sets", Icon: Layers },
  { href: "/cards/random", label: "Random", Icon: Shuffle },
] as const;

/**
 * Hover + keyboard disclosure for Cards nav.
 * Not Radix DropdownMenu — those leave body pointer-events stuck after Next.js navigations.
 */
export function CardsNavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const close = React.useCallback(() => setOpen(false), []);

  const closeUnlessFocusInside = React.useCallback(() => {
    const active = document.activeElement;
    if (active instanceof Node && rootRef.current?.contains(active)) {
      // Keep open while keyboard focus is on a link inside the panel.
      if (active !== triggerRef.current) return;
      // Click left focus on the trigger; blur so mouse-leave actually closes.
      triggerRef.current.blur();
    }
    setOpen(false);
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={closeUnlessFocusInside}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && rootRef.current?.contains(next)) return;
        close();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        close();
        triggerRef.current?.focus();
      }}
    >
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="lg"
        className="gap-1 px-2.5 text-sm font-medium"
        aria-expanded={open}
        aria-controls="cards-nav-menu"
        aria-haspopup="true"
        onFocus={() => setOpen(true)}
      >
        Cards
        <ChevronDownIcon
          className={cn(
            "relative top-px size-3 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </Button>

      {/* pt bridge keeps hover continuous from trigger → panel */}
      <div
        id="cards-nav-menu"
        hidden={!open}
        className="absolute top-full left-0 z-50 w-44 pt-1.5"
      >
        <ul className="overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {links.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
