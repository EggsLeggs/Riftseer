"use client";

import * as React from "react";
import { Loader2, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { Card, RelatedCard } from "@riftseer/types";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { cardsApi, cardsQueryKeys } from "@/features/cards/api";
import { listCardRelationshipsAction } from "@/features/admin/actions";
import {
  adminCardRelationshipsQueryKey,
  useCardMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import type {
  AdminRelationshipEntry,
  AdminRelationshipKind,
} from "@/features/admin/types";
import { AdminSection, CheckboxField } from "./admin-form-field";

// A total `Record` over the kinds the API's schema accepts, so a new kind added
// there fails to compile here until it is given a label.
const KIND_LABELS: Record<AdminRelationshipKind, string> = {
  all_parts: "Tokens / parts made",
  used_by: "Used by",
  related_champions: "Champions",
  related_legends: "Legends",
  related_signatures: "Signatures",
  related_printings: "Other printings",
};

const RELATIONSHIP_KINDS = Object.keys(KIND_LABELS) as AdminRelationshipKind[];

interface DraftEntry extends AdminRelationshipEntry {
  /** Stable across reorders so React keys survive edits to the id field. */
  key: string;
}

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

function toDraft(entries: AdminRelationshipEntry[]): DraftEntry[] {
  return entries.map((entry) => ({ ...entry, key: newKey() }));
}

export function AdminCardRelationshipsPanel({ card }: { card: Card }) {
  // One toggle for the whole panel: an admin is normally either curating the
  // card's shared links or fixing a single odd printing, not both at once.
  const [applyToAll, setApplyToAll] = React.useState(true);
  const [oracleDraft, setOracleDraft] = React.useState<DraftEntry[]>([]);
  const [printingDraft, setPrintingDraft] = React.useState<DraftEntry[]>([]);
  const [seededFor, setSeededFor] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const { setRelationships } = useCardMutations();

  const overrides = useQuery({
    queryKey: adminCardRelationshipsQueryKey(card.id),
    queryFn: async () => {
      const result = await listCardRelationshipsAction(card.id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });

  // Seed both drafts once per card load so toggling the scope does not wipe
  // unsaved edits on the other layer.
  React.useEffect(() => {
    if (!overrides.data) return;
    if (seededFor === card.id) return;
    setOracleDraft(toDraft(overrides.data.oracle_entries));
    setPrintingDraft(toDraft(overrides.data.printing_entries));
    setSeededFor(card.id);
  }, [overrides.data, card.id, seededFor]);

  React.useEffect(() => {
    setSeededFor(null);
  }, [card.id]);

  const entries = applyToAll ? oracleDraft : printingDraft;
  const setEntries = applyToAll ? setOracleDraft : setPrintingDraft;

  const trimmedSearch = search.trim();
  const matches = useQuery({
    queryKey: cardsQueryKeys.relationshipSearch(trimmedSearch),
    queryFn: () =>
      cardsApi.searchByName(trimmedSearch, { limit: 8, unique: true }),
    enabled: trimmedSearch.length >= 2,
    staleTime: 60_000,
    retry: false,
  });

  const current: Array<{ kind: AdminRelationshipKind; entries: RelatedCard[] }> =
    (
      [
        { kind: "all_parts", entries: card.all_parts },
        { kind: "used_by", entries: card.used_by },
        { kind: "related_champions", entries: card.related_champions },
        { kind: "related_legends", entries: card.related_legends },
        { kind: "related_signatures", entries: card.related_signatures },
        { kind: "related_printings", entries: card.related_printings },
      ] satisfies Array<{ kind: AdminRelationshipKind; entries: RelatedCard[] }>
    ).filter((group) => group.entries.length > 0);

  function addEntry(seed: Partial<AdminRelationshipEntry> = {}) {
    setEntries((prev) => [
      ...prev,
      {
        key: newKey(),
        kind: seed.kind ?? "related_printings",
        related_card_id: seed.related_card_id ?? "",
        action: seed.action ?? "add",
      },
    ]);
  }

  function updateEntry(key: string, patch: Partial<AdminRelationshipEntry>) {
    setEntries((prev) =>
      prev.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)),
    );
  }

  function removeEntry(key: string) {
    setEntries((prev) => prev.filter((entry) => entry.key !== key));
  }

  function save() {
    const cleaned = entries.map((entry) => ({
      kind: entry.kind,
      related_card_id: entry.related_card_id.trim(),
      action: entry.action,
    }));

    if (cleaned.some((entry) => entry.related_card_id === "")) {
      toast.error("Every override needs a related card ID");
      return;
    }
    if (cleaned.some((entry) => entry.related_card_id === card.id)) {
      toast.error("A card cannot be related to itself");
      return;
    }
    const identities = new Set(
      cleaned.map((entry) => `${entry.kind}${entry.related_card_id}`),
    );
    if (identities.size !== cleaned.length) {
      toast.error("Each kind and related card pair can only appear once");
      return;
    }

    setRelationships.mutate(
      [card.id, cleaned, applyToAll, card.public_slug],
      {
        onSuccess: () => {
          // Apply-to-all clears printing exceptions server-side; mirror that
          // in the inactive draft without re-seeding from a possibly stale
          // GET cache.
          if (applyToAll) setPrintingDraft([]);
        },
      },
    );
  }

  return (
    <AdminSection
      heading="Relationship overrides"
      description="Manual links applied after automatic linking on every ingest. Saving replaces the active scope's override list — include every override that should persist for that scope, not just the new ones."
    >
      <div className="mb-4">
        <CheckboxField
          id="relationship-apply-all"
          label="Apply to every printing"
          hint="On: the overrides are shared by all printings of this card (including future ones) and any per-printing exceptions are cleared. Off: only this printing's exceptions change."
          checked={applyToAll}
          onChange={(e) => setApplyToAll(e.target.checked)}
        />
      </div>

      {overrides.isError ? (
        // The query does not retry, and saving stays disabled until the drafts
        // are seeded, so without this the panel is stuck until a page reload.
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="text-destructive text-sm">
            Couldn&apos;t load relationship overrides. Please try again.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void overrides.refetch()}
            disabled={overrides.isFetching}
          >
            {overrides.isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : overrides.isPending || seededFor !== card.id ? (
        <p className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading overrides…
        </p>
      ) : null}

      {current.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-sm font-medium">Currently linked</p>
          {current.map((group) => (
            <div key={group.kind} className="text-sm">
              <span className="text-muted-foreground">
                {KIND_LABELS[group.kind]}:
              </span>{" "}
              {group.entries.map((related, i) => (
                <React.Fragment key={related.id}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    className="underline-offset-4 hover:underline"
                    title={`Add a remove override for ${related.id}`}
                    onClick={() =>
                      addEntry({
                        kind: group.kind,
                        related_card_id: related.id,
                        action: "remove",
                      })
                    }
                  >
                    {related.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          ))}
          <p className="text-muted-foreground text-xs">
            Click a linked card to start a “remove” override for it.
          </p>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-1.5">
        <Label htmlFor="relationship-search">Find a card ID</Label>
        <Input
          id="relationship-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name to add an override"
        />
        {trimmedSearch.length >= 2 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {matches.isPending ? (
              <span className="text-muted-foreground text-xs">Searching…</span>
            ) : (matches.data?.cards.length ?? 0) === 0 ? (
              <span className="text-muted-foreground text-xs">No matches.</span>
            ) : (
              matches.data?.cards.map((match) => (
                <Button
                  key={match.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    addEntry({ related_card_id: match.id, action: "add" })
                  }
                >
                  {match.name}
                  <span className="text-muted-foreground uppercase">
                    {match.set?.set_code}
                  </span>
                </Button>
              ))
            )}
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <Alert className="mb-4">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            No overrides staged for{" "}
            {applyToAll ? "every printing" : "this printing"}. Saving an empty
            list clears that scope
            {applyToAll
              ? " and any per-printing exceptions in the group"
              : ""}
            .
          </AlertDescription>
        </Alert>
      ) : (
        <ul className="mb-4 space-y-2">
          {entries.map((entry) => (
            <li key={entry.key} className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Relationship kind"
                value={entry.kind}
                onChange={(e) =>
                  updateEntry(entry.key, {
                    kind: e.target.value as AdminRelationshipKind,
                  })
                }
                className={CARD_BROWSE_SELECT_CLASS}
              >
                {RELATIONSHIP_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Override action"
                value={entry.action}
                onChange={(e) =>
                  updateEntry(entry.key, {
                    action: e.target.value as "add" | "remove",
                  })
                }
                className={CARD_BROWSE_SELECT_CLASS}
              >
                <option value="add">Add link</option>
                <option value="remove">Remove link</option>
              </select>
              <Input
                aria-label="Related card ID"
                value={entry.related_card_id}
                onChange={(e) =>
                  updateEntry(entry.key, { related_card_id: e.target.value })
                }
                placeholder="Related card ID"
                className="min-w-56 flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeEntry(entry.key)}
              >
                <Trash2 aria-hidden="true" />
                <span className="sr-only">Remove this override</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => addEntry()}>
          <Plus aria-hidden="true" />
          Add override
        </Button>
        <Button
          type="button"
          onClick={save}
          disabled={
            setRelationships.isPending ||
            overrides.isPending ||
            seededFor !== card.id
          }
        >
          <Save aria-hidden="true" />
          {setRelationships.isPending
            ? "Saving…"
            : applyToAll
              ? "Replace overrides (all printings)"
              : "Replace overrides (this printing)"}
        </Button>
      </div>
    </AdminSection>
  );
}
