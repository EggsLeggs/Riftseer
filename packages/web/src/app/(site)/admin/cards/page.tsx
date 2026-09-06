import { Suspense } from "react";
import { AdminCardsView } from "@/views/admin/admin-cards-view";

export default function AdminCardsPage() {
  return (
    <Suspense>
      <AdminCardsView />
    </Suspense>
  );
}
