import type { Metadata } from "next";
import { requireAuth } from "@/lib/session";
import { SecurityView } from "@/views/settings/security-view";

export const metadata: Metadata = { title: "Login & Security — Settings — Riftseer" };

export default async function SecurityPage() {
  const session = await requireAuth("/settings/security");
  return <SecurityView session={session} />;
}
