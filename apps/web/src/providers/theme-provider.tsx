"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export const SITE_THEME_STORAGE_KEY = "riftseer.prefs.theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={SITE_THEME_STORAGE_KEY}
    >
      {children}
    </NextThemesProvider>
  );
}
