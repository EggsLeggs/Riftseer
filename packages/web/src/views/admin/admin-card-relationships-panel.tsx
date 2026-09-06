"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Oracle } from "@riftseer/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listOracleRelationshipsAction } from "@/features/admin/actions";
import {
  adminCardRelationshipsQueryKey,
  useOracleMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import type { AdminRelationshipEntry, AdminRelationshipKind } from "@/features/admin/types";
import { cardsApi, cardsQueryKeys } from "@/features/cards/api";
import { AdminSection } from "./admin-form-field";

const KIND_LABELS: Record<AdminRelationshipKind, string> = {
  makes_token: "Makes token",
  character: "Character",
  signature: "Signature",
};

export function AdminCardRelationshipsPanel({ oracle }: { oracle: Oracle }) {
  const [entries, setEntries] = React.useState<AdminRelationshipEntry[]>([]);
  const [names, setNames] = React.useState<Record<string, string>>({});
  const [kind, setKind] = React.useState<AdminRelationshipKind>("makes_token");
  const [search, setSearch] = React.useState("");
  const [synced, setSynced] = React.useState(false);
  const { setRelationships } = useOracleMutations();
  const relationships = useQuery({
    queryKey: adminCardRelationshipsQueryKey(oracle.id),
    queryFn: async () => {
      const result = await listOracleRelationshipsAction(oracle.id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });
  React.useEffect(() => {
    if (!relationships.data || synced) return;
    setEntries(relationships.data.outgoing.map((edge) => ({ kind: edge.kind, to_oracle_id: edge.oracle_id })));
    setNames(Object.fromEntries(relationships.data.outgoing.map((edge) => [edge.oracle_id, edge.name])));
    setSynced(true);
  }, [relationships.data, synced]);
  const results = useQuery({
    queryKey: cardsQueryKeys.relationshipSearch(search),
    queryFn: () => cardsApi.searchByName(search, { limit: 8 }),
    enabled: search.trim().length > 1,
    staleTime: 30_000,
  });

  function add(target: Oracle) {
    if (target.id === oracle.id || entries.some((entry) => entry.kind === kind && entry.to_oracle_id === target.id)) return;
    setNames((current) => ({ ...current, [target.id]: target.name }));
    setEntries((current) => [...current, { kind, to_oracle_id: target.id }]);
    setSearch("");
  }

  async function save() {
    await setRelationships.mutateAsync([oracle.id, entries]);
  }

  const nameFor = (id: string) => names[id] ?? id;

  return (
    <AdminSection heading="Oracle relationships" description="Relationships are oracle-scoped. Incoming edges are shown for context; saving replaces only this oracle's outgoing edges.">
      {relationships.isError ? <p className="text-destructive text-sm">Couldn&apos;t load relationships.</p> : relationships.isPending ? <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Loading relationships…</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <select className="border-input bg-background h-9 rounded-md border px-3 text-sm" value={kind} onChange={(event) => setKind(event.target.value as AdminRelationshipKind)}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <div className="relative"><Input aria-label="Find related card" placeholder="Search cards…" value={search} onChange={(event) => setSearch(event.target.value)} />{results.data?.cards.length ? <div className="bg-popover absolute z-20 mt-1 w-full rounded-md border p-1 shadow-md">{results.data.cards.map(({ oracle: target }) => <button key={target.id} type="button" className="hover:bg-muted flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm" onClick={() => add(target)}><Plus className="size-3.5" />{target.name}</button>)}</div> : null}</div>
          </div>
          <ul className="mt-4 space-y-2">{entries.map((entry) => <li key={`${entry.kind}:${entry.to_oracle_id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span><span className="text-muted-foreground mr-2">{KIND_LABELS[entry.kind]}</span>{nameFor(entry.to_oracle_id)}</span><Button type="button" variant="ghost" size="icon-sm" onClick={() => setEntries((current) => current.filter((item) => item !== entry))}><Trash2 /><span className="sr-only">Remove relationship</span></Button></li>)}</ul>
          {relationships.data?.incoming.length ? <div className="mt-5"><h3 className="mb-2 text-sm font-medium">Incoming (read-only)</h3><ul className="space-y-1 text-sm text-muted-foreground">{relationships.data.incoming.map((edge) => <li key={`${edge.kind}:${edge.oracle_id}`}>{KIND_LABELS[edge.kind]} from {edge.name}</li>)}</ul></div> : null}
          <Button type="button" className="mt-4" disabled={setRelationships.isPending} onClick={() => void save()}>{setRelationships.isPending ? "Saving…" : "Save relationships"}</Button>
        </>
      )}
    </AdminSection>
  );
}
