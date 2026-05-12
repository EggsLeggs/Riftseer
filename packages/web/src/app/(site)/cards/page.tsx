import { Suspense } from "react";
import type { Metadata } from "next";
import { CardGalleryView } from "@/views/cards/card-gallery-view";

export const metadata: Metadata = { title: "Cards – Riftseer" };

export default function CardsPage() {
  return (
    <Suspense>
      <CardGalleryView />
    </Suspense>
  );
}
