import { Suspense } from "react";
import type { Metadata } from "next";
import { SetsListView } from "@/views/sets/sets-list-view";

export const metadata: Metadata = { title: "Sets – Riftseer" };

export default function SetsPage() {
  return (
    <Suspense>
      <SetsListView />
    </Suspense>
  );
}
