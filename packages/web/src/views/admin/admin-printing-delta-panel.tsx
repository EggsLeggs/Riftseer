"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { Oracle, Printing } from "@riftseer/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPrintingDeltaAction } from "@/features/admin/actions";
import {
  adminPrintingDeltaQueryKey,
  usePrintingMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import type { AdminPrintingDelta, AdminPrintingDeltaRead } from "@/features/admin/types";
import { AdminSection } from "./admin-form-field";

const SCALAR_FIELDS = [
  ["name", "Name"], ["card_type", "Type"], ["supertype", "Supertype"],
  ["energy", "Energy"], ["might", "Might"], ["power", "Power"],
  ["might_bonus", "Might bonus"], ["text_rich", "Rules text (rich)"],
  ["text_plain", "Rules text (plain)"], ["equipment_text", "Equipment text"],
] as const;

type ScalarField = (typeof SCALAR_FIELDS)[number][0];
type Draft = Record<ScalarField, string> & {
  cleared: ScalarField[];
  tags_added: string;
  tags_removed: string;
  domains_added: string;
  domains_removed: string;
  keywords_added: string;
  keywords_removed: string;
  meta_flags_added: string;
  meta_flags_removed: string;
};

const EMPTY: Draft = {
  name: "", card_type: "", supertype: "", energy: "", might: "", power: "",
  might_bonus: "", text_rich: "", text_plain: "", equipment_text: "", cleared: [],
  tags_added: "", tags_removed: "", domains_added: "", domains_removed: "",
  keywords_added: "", keywords_removed: "", meta_flags_added: "", meta_flags_removed: "",
};

const ARRAY_FIELDS = ["tags", "domains", "keywords", "meta_flags"] as const;

const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

/**
 * Stored delta row → editable draft. `PUT /deltas` replaces the row wholesale,
 * so anything not reconstructed here would be dropped by the next save.
 */
function draftFromDelta(delta: AdminPrintingDeltaRead["delta"]): Draft {
  if (!delta) return EMPTY;
  const row = delta as unknown as Record<string, unknown>;
  const draft: Draft = { ...EMPTY };

  for (const [field] of SCALAR_FIELDS) {
    const stored = row[`${field}_override`];
    // 0 is a real printed Might bonus, so test for null/undefined, not falsiness.
    draft[field] = stored === null || stored === undefined ? "" : String(stored);
  }

  const cleared = row.cleared_fields;
  if (Array.isArray(cleared)) {
    draft.cleared = cleared.filter((item): item is ScalarField =>
      SCALAR_FIELDS.some(([field]) => field === item),
    );
  }

  for (const group of ARRAY_FIELDS) {
    for (const direction of ["added", "removed"] as const) {
      const stored = row[`${group}_${direction}`];
      draft[`${group}_${direction}`] = Array.isArray(stored) ? stored.join(", ") : "";
    }
  }

  return draft;
}

function oracleValue(oracle: Oracle, field: ScalarField): unknown {
  if (field === "text_rich") return oracle.text?.rich;
  if (field === "text_plain") return oracle.text?.plain;
  if (field === "equipment_text") return oracle.text?.equipment;
  return oracle[field];
}

export function AdminPrintingDeltaPanel({ oracle, printing }: { oracle: Oracle; printing: Printing }) {
  const { delta } = usePrintingMutations();
  const stored = useQuery({
    queryKey: adminPrintingDeltaQueryKey(printing.id),
    queryFn: async () => {
      const result = await getPrintingDeltaAction(printing.id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });

  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  // Seed once per delta row rather than on every render, so the load does not
  // stamp over edits made while it was in flight.
  const seeded = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!stored.data || seeded.current === printing.id) return;
    seeded.current = printing.id;
    setDraft(draftFromDelta(stored.data.delta ?? null));
  }, [stored.data, printing.id]);

  async function save() {
    const payload: Record<string, unknown> = {};
    for (const field of SCALAR_FIELDS.map(([key]) => key)) {
      const value = draft[field].trim();
      if (!value || draft.cleared.includes(field)) continue;
      const key = `${field}_override`;
      payload[key] = ["energy", "might", "power", "might_bonus"].includes(field)
        ? Number(value)
        : value;
    }
    for (const key of ["tags_added", "tags_removed", "domains_added", "domains_removed", "keywords_added", "keywords_removed", "meta_flags_added", "meta_flags_removed"] as const) {
      const values = list(draft[key]);
      if (values.length > 0) payload[key] = values;
    }
    if (draft.cleared.length > 0) payload.cleared_fields = draft.cleared;
    await delta.mutateAsync([
      printing.id,
      Object.keys(payload).length > 0 ? payload as AdminPrintingDelta : null,
      printing.public_slug,
    ]);
  }

  return (
    <AdminSection
      heading="Printing delta"
      description="A delta records a genuine rules difference on this printing. The oracle value stays visible so an override or removal always has context."
    >
      {stored.isPending ? (
        <p className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />Loading the stored delta…
        </p>
      ) : stored.isError ? (
        <p className="text-destructive mb-4 text-sm">
          Couldn&apos;t load the stored delta. Saving now would replace it with only what is typed here — reload before editing.
        </p>
      ) : stored.data?.delta ? (
        <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          This printing carries an admin delta, loaded below. Saving replaces it wholesale, so clear a field to drop it rather than deleting the row.
        </p>
      ) : printing.differs_from_oracle ? (
        // A delta row is PK'd on printing_id and carries one source, so a
        // printing that differs without an admin row differs because of ingest.
        <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          This printing differs from its oracle through an <strong>ingest</strong> delta, which records genuine upstream divergence. Saving here replaces it with an admin delta.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/50 text-left"><th className="p-2">Field</th><th className="p-2">Oracle</th><th className="p-2">Override</th><th className="p-2">Remove</th></tr></thead>
          <tbody>
            {SCALAR_FIELDS.map(([field, label]) => (
              <tr key={field} className="border-t align-top">
                <th className="p-2 text-left font-medium">{label}</th>
                <td className="max-w-72 whitespace-pre-wrap p-2 text-muted-foreground">{String(oracleValue(oracle, field) ?? "—")}</td>
                <td className="p-2"><Input aria-label={`${label} override`} value={draft[field]} disabled={draft.cleared.includes(field)} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} /></td>
                <td className="p-2 text-center"><input type="checkbox" aria-label={`Remove ${label}`} checked={draft.cleared.includes(field)} onChange={(event) => setDraft((current) => ({ ...current, cleared: event.target.checked ? [...current.cleared, field] : current.cleared.filter((item) => item !== field) }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(["tags", "domains", "keywords", "meta_flags"] as const).map((field) => (
          <div key={field} className="rounded-md border p-3">
            <p className="mb-2 font-medium capitalize">{field.replace("_", " ")}</p>
            <p className="mb-3 text-xs text-muted-foreground">Oracle: {oracle[field].join(", ") || "—"}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div><Label htmlFor={`${field}-added`}>Added</Label><Input id={`${field}-added`} value={draft[`${field}_added`]} onChange={(event) => setDraft((current) => ({ ...current, [`${field}_added`]: event.target.value }))} placeholder="Comma-separated" /></div>
              <div><Label htmlFor={`${field}-removed`}>Removed</Label><Input id={`${field}-removed`} value={draft[`${field}_removed`]} onChange={(event) => setDraft((current) => ({ ...current, [`${field}_removed`]: event.target.value }))} placeholder="Comma-separated" /></div>
            </div>
          </div>
        ))}
      </div>
      {/* Saving before the stored row has loaded would replace it with an empty
          draft, which is the wipe this panel used to perform on every save. */}
      <div className="mt-4 flex gap-2">
        <Button type="button" disabled={delta.isPending || !stored.isSuccess} onClick={() => void save()}>{delta.isPending ? "Saving…" : "Save delta"}</Button>
        <Button type="button" variant="outline" disabled={delta.isPending} onClick={() => { setDraft(EMPTY); void delta.mutateAsync([printing.id, null, printing.public_slug]); }}>Clear admin delta</Button>
      </div>
    </AdminSection>
  );
}
