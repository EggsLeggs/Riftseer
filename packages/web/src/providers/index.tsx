"use client";

import { CardSearchProvider } from "@/features/cards/card-search-provider";
import { SitePreferencesProvider } from "@/features/site-preferences/site-preferences-provider";
import { QueryProvider } from "./query-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SitePreferencesProvider>
        <CardSearchProvider>{children}</CardSearchProvider>
      </SitePreferencesProvider>
    </QueryProvider>
  );
}
