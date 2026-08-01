"use client";

import * as React from "react";
import type { Oracle, Printing } from "@riftseer/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePrintingMutations } from "@/features/admin/hooks/use-admin-mutations";
import type { AdminPrintingDelta } from "@/features/admin/types";
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

const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

function oracleValue(oracle: Oracle, field: ScalarField): unknown {
  if (field === "text_rich") return oracle.text?.rich;
  if (field === "text_plain") return oracle.text?.plain;
  if (field === "equipment_text") return oracle.text?.equipment;
  return oracle[field];
}

export function AdminPrintingDeltaPanel({ oracle, printing }: { oracle: Oracle; printing: Printing }) {
  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  const { delta } = usePrintingMutations();

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
      {printing.differs_from_oracle ? (
        <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          This printing already differs from its oracle. The API reports that fact but does not expose the stored delta row; saving here replaces only the admin-authored delta layer.
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
      <div className="mt-4 flex gap-2">
        <Button type="button" disabled={delta.isPending} onClick={() => void save()}>{delta.isPending ? "Saving…" : "Save delta"}</Button>
        <Button type="button" variant="outline" disabled={delta.isPending} onClick={() => { setDraft(EMPTY); void delta.mutateAsync([printing.id, null, printing.public_slug]); }}>Clear admin delta</Button>
      </div>
    </AdminSection>
  );
}
