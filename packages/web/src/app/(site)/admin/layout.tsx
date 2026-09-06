import type { Metadata } from "next";
import { requireAdmin } from "@/lib/session";
import { AdminNav } from "@/views/admin/admin-shell";

export const metadata: Metadata = {
  title: "Admin — Riftseer",
  // The admin tools are gated per-request; keep them out of search results too.
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin("/admin");

  return (
    <div className="container py-8">
      <div className="mb-8 border-b pb-3">
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
