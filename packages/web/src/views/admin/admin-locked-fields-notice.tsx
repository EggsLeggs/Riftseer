"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { listPrintingsAction } from "@/features/admin/actions";
import { adminPrintingLocksQueryKey } from "@/features/admin/hooks/use-admin-mutations";

/**
 * Which columns on this card an admin has already decided.
 *
 * `locked_fields` is what replaced the whole override overlay: the admin write
 * goes to the real column, and the field name is appended here so the next
 * ingest keeps the stored value instead of overwriting it. Without showing it,
 * an editor cannot tell a value that will survive the next ingest from one that
 * will be replaced in six hours — which looks like the edit silently failing.
 *
 * Read from the admin printing list rather than from the card payload, because
 * `Oracle` and `Printing` are the public wire types and this is bookkeeping no
 * public reader should receive.
 */
export function AdminLockedFieldsNotice({ printingId }: { printingId: string }) {
  const locks = useQuery({
    queryKey: adminPrintingLocksQueryKey(printingId),
    queryFn: async () => {
      const result = await listPrintingsAction({ id: printingId, limit: 1 });
      if (!result.ok) throw new Error(result.error);
      return result.data.printings[0] ?? null;
    },
    retry: false,
  });

  // A failed read and a card with no locks otherwise look identical, which is
  // the reading that gets an admin's edit silently overwritten six hours later.
  if (locks.isError) {
    return (
      <p className="text-muted-foreground mb-4 text-xs">
        Could not read this card&rsquo;s admin-locked fields.
      </p>
    );
  }

  const row = locks.data;
  if (!row) return null;

  const groups: Array<[string, string[]]> = [
    ["Oracle", row.oracle_locked_fields],
    ["Printing", row.locked_fields],
  ];
  const locked = groups.filter(([, fields]) => fields.length > 0);
  if (locked.length === 0) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">Admin-locked fields</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Ingest will keep the stored value for these columns. Saving a field here
          locks it too.
        </p>
        <ul className="mt-1.5 space-y-0.5 text-xs">
          {locked.map(([level, fields]) => (
            <li key={level}>
              <span className="font-medium">{level}:</span>{" "}
              <span className="font-mono">{fields.join(", ")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
