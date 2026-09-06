"use client";

import * as React from "react";
import { CardSearchDialog } from "./card-search-dialog";

interface CardSearchContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  triggerId: string;
}

const CardSearchContext = React.createContext<CardSearchContextValue | null>(
  null,
);

export function useCardSearch(): CardSearchContextValue {
  const ctx = React.useContext(CardSearchContext);
  if (!ctx) {
    throw new Error("useCardSearch must be used inside <CardSearchProvider>");
  }
  return ctx;
}

/**
 * Hosts a single global card search dialog and registers a Cmd/Ctrl+K
 * shortcut. Lives below QueryClientProvider so the dialog's TanStack Query
 * hooks resolve.
 */
export function CardSearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerId = React.useId();

  const value = React.useMemo<CardSearchContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((prev) => !prev),
      triggerId,
    }),
    [open, triggerId],
  );

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "k" && event.key !== "K") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <CardSearchContext.Provider value={value}>
      {children}
      <CardSearchDialog open={open} onOpenChange={setOpen} />
    </CardSearchContext.Provider>
  );
}
