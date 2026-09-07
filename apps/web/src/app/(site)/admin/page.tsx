import { getSession } from "@/lib/session";
import { getAdminStatsAction } from "@/features/admin/actions";
import { AdminDashboardView } from "@/views/admin/admin-dashboard-view";
import type { AdminStats } from "@/features/admin/types";

export default async function AdminPage() {
  const session = await getSession();

  // The dashboard is navigation, not a report — a failed lookup renders "—"
  // rather than taking the whole admin area down. Counted by the API from the
  // tables, rather than summed here from the public set list: that summed
  // `card_count`, which counts printings, and left every tile blank whenever
  // the public call failed.
  const result = await getAdminStatsAction();
  const stats: AdminStats | null = result.ok ? result.data : null;

  return <AdminDashboardView stats={stats} email={session?.user.email} />;
}
