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
  const trimmedCards = (recentCards ?? []).slice(0, maxRecent);

  useEffect(() => {
    recentRef.current = trimmedCards;
  }, [trimmedCards]);

  // Enforce maxRecent when loading or when maxRecent changes
  useEffect(() => {
    const loaded = recentCards ?? [];
    if (loaded.length > maxRecent) {
      const trimmed = loaded.slice(0, maxRecent);
      recentRef.current = trimmed;
      void setRecentCards(trimmed);
    }
  }, [maxRecent, recentCards, setRecentCards]);

  const recordVisit = useCallback(
    (card: Card) => {
      if (isLoading) return;
      if (maxRecent <= 0) return;
      const next = mergeRecentHistory(recentRef.current, card, maxRecent);
      recentRef.current = next;
      void setRecentCards(next);
    },
    [isLoading, maxRecent, setRecentCards],
  );

  return {
    recentCards: trimmedCards,
    recordVisit,
    isLoadingHistory: isLoading,
  };
}