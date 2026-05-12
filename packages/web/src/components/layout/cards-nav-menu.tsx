"use client";

import Link from "next/link";
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
  return (
    <NavigationMenu viewport={false}>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger className="h-9 px-2.5 text-sm font-medium">
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
