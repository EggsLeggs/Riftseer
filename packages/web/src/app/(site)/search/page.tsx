import { Suspense } from "react";
import type { Metadata } from "next";
import { SearchCardsView } from "@/views/search/search-cards-view";

export const metadata: Metadata = {
  title: "Search — Riftseer",
  description: "Search the Riftbound card database on Riftseer.",
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchCardsView />
    </Suspense>
  );
}
