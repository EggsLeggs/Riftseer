"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { Printing } from "@riftseer/types";
import { Button } from "@/components/ui/button";
import { listPrintingRulingsAction } from "@/features/admin/actions";
import { adminCardRulingsQueryKey } from "@/features/admin/hooks/use-admin-mutations";
import { AdminSection } from "./admin-form-field";

export function AdminCardRulingsPanel({ printing }: { printing: Printing }) {
  const rulings = useQuery({
    queryKey: adminCardRulingsQueryKey(printing.id),
    queryFn: async () => {
      const result = await listPrintingRulingsAction(printing.id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });
  const entries = rulings.data?.entries ?? [];
  return (
    <AdminSection heading="Rulings and notes" description="Rulings can target several cards or a saved query, so creation and retargeting live in the rulings manager.">
      <Button variant="outline" size="sm" asChild><Link href="/admin/rulings">Manage rulings</Link></Button>
      {rulings.isError ? <p className="text-destructive mt-4 text-sm">Couldn&apos;t load rulings.</p> : rulings.isPending ? <p className="text-muted-foreground mt-4 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Loading rulings…</p> : entries.length === 0 ? <p className="text-muted-foreground mt-4 text-sm">No rulings reach this printing.</p> : <ul className="mt-4 space-y-3">{entries.map((ruling) => <li key={ruling.id} className="rounded-lg border p-4"><div className="mb-1 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="capitalize">{ruling.type}</span><span className="capitalize">{ruling.scope}</span>{ruling.shared ? <span>{ruling.target_count} targets</span> : null}{ruling.dated ? <span>{ruling.dated}</span> : null}</div><p className="text-sm whitespace-pre-line">{ruling.text}</p></li>)}</ul>}
    </AdminSection>
  );
}
