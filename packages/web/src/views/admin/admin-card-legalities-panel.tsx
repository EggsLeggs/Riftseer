"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { Printing } from "@riftseer/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPrintingLegalitiesAction } from "@/features/admin/actions";
import { adminCardLegalitiesQueryKey, useCardLegalityMutations } from "@/features/admin/hooks/use-admin-mutations";
import type { AdminLegalityStatusInput, AdminPrintingLegalityEntry } from "@/features/admin/types";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { AdminSection, CheckboxField } from "./admin-form-field";

const STATUS_OPTIONS: Array<{ value: AdminLegalityStatusInput; label: string }> = [
  { value: "default", label: "Default / inherit" },
  { value: "legal", label: "Legal (explicit)" },
  { value: "not_legal", label: "Not legal" },
  { value: "banned", label: "Banned" },
];

export function AdminCardLegalitiesPanel({ printing }: { printing: Printing }) {
  const [applyToAll, setApplyToAll] = React.useState(true);
  const { set: setLegality } = useCardLegalityMutations(printing.id);
  const legalities = useQuery({
    queryKey: adminCardLegalitiesQueryKey(printing.id),
    queryFn: async () => {
      const result = await listPrintingLegalitiesAction(printing.id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });
  const entries = legalities.data?.entries ?? [];

  function selection(entry: AdminPrintingLegalityEntry): AdminLegalityStatusInput {
    const targetScope = applyToAll ? "oracle" : "printing";
    return entry.scope === targetScope ? entry.status : "default";
  }

  return (
    <AdminSection heading="Format legalities" description="Legalities retain oracle and printing scopes. Changes save immediately; default removes the selected scope's stored row.">
      <div className="mb-4"><CheckboxField id="legality-apply-all" label="Apply to every printing" hint="On writes the oracle status and clears printing exceptions for that format. Off changes only this printing." checked={applyToAll} onChange={(event) => setApplyToAll(event.target.checked)} /></div>
      {legalities.isError ? <p className="text-destructive text-sm">Couldn&apos;t load legalities.</p> : legalities.isPending ? <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Loading legalities…</p> : entries.length === 0 ? <p className="text-muted-foreground text-sm">No formats defined. <Button variant="link" size="sm" className="h-auto p-0" asChild><Link href="/admin/formats">Create one</Link></Button>.</p> : (
        <Table><TableHeader><TableRow><TableHead>Format</TableHead><TableHead>Effective</TableHead><TableHead>Set by</TableHead><TableHead>{applyToAll ? "Oracle status" : "Printing status"}</TableHead></TableRow></TableHeader><TableBody>
          {entries.map((entry) => <TableRow key={entry.format_id}><TableCell>{entry.format_name}</TableCell><TableCell><LegalityBadge status={entry.status} /></TableCell><TableCell className="text-muted-foreground capitalize">{entry.scope}</TableCell><TableCell><select aria-label={`${entry.format_name} legality`} className={CARD_BROWSE_SELECT_CLASS} disabled={setLegality.isPending} value={selection(entry)} onChange={(event) => setLegality.mutate([printing.id, entry.format_code, event.target.value as AdminLegalityStatusInput, applyToAll, printing.public_slug])}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></TableCell></TableRow>)}
        </TableBody></Table>
      )}
    </AdminSection>
  );
}

const BADGE_STYLES: Record<string, string> = { legal: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", not_legal: "bg-muted text-muted-foreground", banned: "bg-destructive/10 text-destructive" };
const BADGE_LABELS: Record<string, string> = { legal: "Legal", not_legal: "Not legal", banned: "Banned" };
export function LegalityBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[status] ?? BADGE_STYLES.not_legal}`}>{BADGE_LABELS[status] ?? status}</span>;
}
