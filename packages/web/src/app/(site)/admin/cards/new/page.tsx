import { Suspense } from "react";
import { AdminNewCardView } from "@/views/admin/admin-new-card-view";

export default function AdminNewCardPage() {
  return (
    <Suspense>
      <AdminNewCardView />
    </Suspense>
  );
}
