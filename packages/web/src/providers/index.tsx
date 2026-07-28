"use client";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CardSearchProvider } from "@/features/cards/card-search-provider";
import { SitePreferencesProvider } from "@/features/site-preferences/site-preferences-provider";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <SitePreferencesProvider>
          <CardSearchProvider>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </CardSearchProvider>
        </SitePreferencesProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
