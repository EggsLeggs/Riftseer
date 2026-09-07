import { requireAuth } from "@/lib/session";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAuth("/settings");
  return <>{children}</>;
}
