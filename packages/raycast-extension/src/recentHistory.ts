import { useCallback, useEffect, useRef } from "react";
import { useLocalStorage } from "@raycast/utils";
import type { Card } from "./types";

const STORAGE_KEY = "recent-card-history";

export function parseMaxRecentHistory(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return 50;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return 50;
  return n;
}

export function mergeRecentHistory(
  prev: Card[] | undefined,
  card: Card,
  max: number,
): Card[] {
  const without = (prev ?? []).filter((c) => c.id !== card.id);
  return [card, ...without].slice(0, max);
}

export function useRecentCardHistory(maxRecent: number) {
  const {
    value: recentCards,
    setValue: setRecentCards,
    isLoading,
  } = useLocalStorage<Card[]>(STORAGE_KEY, []);

  const recentRef = useRef<Card[]>([]);
  useEffect(() => {
    recentRef.current = recentCards ?? [];
  }, [recentCards]);

  const recordVisit = useCallback(
    (card: Card) => {
      if (maxRecent <= 0) return;
      const next = mergeRecentHistory(recentRef.current, card, maxRecent);
      recentRef.current = next;
      void setRecentCards(next);
    },
    [maxRecent, setRecentCards],
  );

  return {
    recentCards: recentCards ?? [],
    recordVisit,
    isLoadingHistory: isLoading,
  };
}
