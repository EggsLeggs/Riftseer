"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Layers, Shuffle } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

export function CardsNavMenu() {
  const pathname = usePathname();
  const [value, setValue] = React.useState("");

  // Layout persists across navigations; close the menu on route change so it
  // can't stay stuck open (which also breaks hover/click after browser back).
  React.useEffect(() => {
    setValue("");
  }, [pathname]);

  return (
    <NavigationMenu viewport={false} value={value} onValueChange={setValue}>
      <NavigationMenuList>
        <NavigationMenuItem value="cards">
          <NavigationMenuTrigger
            className="h-9 px-2.5 text-sm font-medium"
            onClick={(e) => {
              // Hover already opens the menu; don't let click toggle it closed.
              if (e.currentTarget.getAttribute("data-state") === "open") {
                e.preventDefault();
              }
            }}
          >
            Cards
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="flex w-44 flex-col p-1">
              <NavigationMenuLink asChild>
                <Link href="/cards">
                  <LayoutGrid className="size-4 shrink-0" />
                  Card Gallery
                </Link>
              </NavigationMenuLink>
              <NavigationMenuLink asChild>
                <Link href="/sets">
                  <Layers className="size-4 shrink-0" />
                  Sets
                </Link>
              </NavigationMenuLink>
              <NavigationMenuLink asChild>
                <Link href="/cards/random">
                  <Shuffle className="size-4 shrink-0" />
                  Random
                </Link>
              </NavigationMenuLink>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
