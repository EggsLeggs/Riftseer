import { getSession } from "@/lib/session";
import { setsApi } from "@/features/sets/api";
import {
  AdminDashboardView,
  type AdminDashboardStats,
} from "@/views/admin/admin-dashboard-view";

export default async function AdminPage() {
  const session = await getSession();

  // The dashboard is navigation, not a report — a failed lookup renders "—"
  // rather than taking the whole admin area down.
  const stats: AdminDashboardStats | null = await setsApi
    .getSets()
    .then(({ sets }) => ({
      setCount: sets.length,
      cardCount: sets.reduce((total, set) => total + set.cardCount, 0),
    }))
    .catch(() => null);

  return <AdminDashboardView stats={stats} email={session?.user.email} />;
}
