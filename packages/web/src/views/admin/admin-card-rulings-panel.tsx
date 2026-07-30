"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Card } from "@riftseer/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { listCardRulingsAction } from "@/features/admin/actions";
import {
  adminCardRulingsQueryKey,
  useCardRulingMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import type {
  AdminCardRuling,
  AdminRulingPatch,
  AdminRulingType,
} from "@/features/admin/types";
import { AdminSection, CheckboxField } from "./admin-form-field";
import { ConfirmDialog } from "./confirm-dialog";

const TYPE_OPTIONS: Array<{ value: AdminRulingType; label: string }> = [
  { value: "ruling", label: "Ruling" },
  { value: "note", label: "Note" },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface RulingDraft {
  type: AdminRulingType;
  text: string;
  dated: string;
  source: string;
  applyToAll: boolean;
}

const EMPTY_DRAFT: RulingDraft = {
  type: "ruling",
  text: "",
  dated: "",
  source: "",
  applyToAll: true,
};

function draftFrom(ruling: AdminCardRuling): RulingDraft {
  return {
    type: ruling.type,
    text: ruling.text,
    dated: ruling.dated ?? "",
    source: ruling.source ?? "",
    applyToAll: ruling.card_id === null,
  };
}

/** Shared validation for both the create form and an inline edit. */
function validate(draft: RulingDraft): string | null {
  if (!draft.text.trim()) return "Text is required";
  if (draft.dated && !DATE_PATTERN.test(draft.dated)) {
    return "Date must be YYYY-MM-DD";
  }
  return null;
}

export function AdminCardRulingsPanel({ card }: { card: Card }) {
  const [creating, setCreating] = React.useState(false);
  const [newDraft, setNewDraft] = React.useState<RulingDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<RulingDraft | null>(null);
  const [pendingDelete, setPendingDelete] =
    React.useState<AdminCardRuling | null>(null);

  const { create, patch, remove } = useCardRulingMutations(card.id);

  const rulings = useQuery({
    queryKey: adminCardRulingsQueryKey(card.id),
    queryFn: async () => {
      const result = await listCardRulingsAction(card.id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });

  const entries = rulings.data?.entries ?? [];

  async function addRuling() {
    const problem = validate(newDraft);
    if (problem) {
      toast.error(problem);
      return;
    }

    try {
      await create.mutateAsync([
        card.id,
        {
          type: newDraft.type,
          text: newDraft.text.trim(),
          dated: newDraft.dated || undefined,
          source: newDraft.source.trim() || undefined,
          apply_to_all_printings: newDraft.applyToAll,
        },
        card.public_slug,
      ]);
    } catch {
      // Already surfaced as a toast — keep the form filled for a retry.
      return;
    }
    setCreating(false);
    setNewDraft(EMPTY_DRAFT);
  }

  async function saveEdit(ruling: AdminCardRuling) {
    if (!draft) return;
    const problem = validate(draft);
    if (problem) {
      toast.error(problem);
      return;
    }

    // Merge-patch semantics: send only the fields that actually changed, and
    // null to clear an optional one.
    const original = draftFrom(ruling);
    const rulingPatch: AdminRulingPatch = {};
    if (draft.type !== original.type) rulingPatch.type = draft.type;
    if (draft.text.trim() !== original.text) {
      rulingPatch.text = draft.text.trim();
    }
    if (draft.dated !== original.dated) {
      rulingPatch.dated = draft.dated || null;
    }
    if (draft.source.trim() !== original.source) {
      rulingPatch.source = draft.source.trim() || null;
    }
    if (draft.applyToAll !== original.applyToAll) {
      rulingPatch.apply_to_all_printings = draft.applyToAll;
    }

    if (Object.keys(rulingPatch).length === 0) {
      setEditing(null);
      setDraft(null);
      return;
    }

    try {
      await patch.mutateAsync([
        card.id,
        ruling.id,
        rulingPatch,
        card.public_slug,
      ]);
    } catch {
      return;
    }
    setEditing(null);
    setDraft(null);
  }

  async function deleteRuling(rulingId: string) {
    try {
      await remove.mutateAsync([card.id, rulingId, card.public_slug]);
    } catch {
      return;
    }
    setPendingDelete(null);
  }

  return (
    <AdminSection
      heading="Rulings and notes"
      description="Rulings are attached to the card, so they show on every printing unless you scope one to this printing."
    >
      <div className="mb-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setCreating((open) => !open)}
        >
          {creating ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {creating ? "Cancel" : "Add entry"}
        </Button>
      </div>

      {creating && (
        <div className="mb-6 space-y-3 rounded-lg border p-4">
          <RulingFields
            idPrefix="new-ruling"
            draft={newDraft}
            onChange={(next) => setNewDraft((d) => ({ ...d, ...next }))}
          />
          <Button
            type="button"
            onClick={() => void addRuling()}
            disabled={create.isPending}
          >
            <Save aria-hidden="true" />
            {create.isPending ? "Adding…" : "Add entry"}
          </Button>
        </div>
      )}

      {rulings.isError ? (
        <p className="text-destructive text-sm">
          Couldn&apos;t load rulings. Please try again.
        </p>
      ) : rulings.isPending ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading rulings…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No rulings or notes for this card yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((ruling) => {
            const isEditing = editing === ruling.id && draft !== null;
            return (
              <li key={ruling.id} className="rounded-lg border p-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <RulingFields
                      idPrefix={`ruling-${ruling.id}`}
                      draft={draft}
                      onChange={(next) =>
                        setDraft((d) => (d ? { ...d, ...next } : d))
                      }
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={patch.isPending}
                        onClick={() => void saveEdit(ruling)}
                      >
                        <Save aria-hidden="true" />
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(null);
                          setDraft(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="bg-muted rounded px-1.5 py-0.5 font-medium capitalize">
                        {ruling.type}
                      </span>
                      <span className="text-muted-foreground">
                        {ruling.card_id === null
                          ? "All printings"
                          : "This printing only"}
                      </span>
                      {ruling.dated && (
                        <span className="text-muted-foreground tabular-nums">
                          {ruling.dated}
                        </span>
                      )}
                      {ruling.source && (
                        <span className="text-muted-foreground truncate">
                          {ruling.source}
                        </span>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-line">{ruling.text}</p>
                    <div className="mt-2 flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(ruling.id);
                          setDraft(draftFrom(ruling));
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(ruling)}
                      >
                        <Trash2 aria-hidden="true" />
                        <span className="sr-only">Delete this entry</span>
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete this ${pendingDelete?.type ?? "entry"}?`}
        description={
          pendingDelete?.card_id === null
            ? "This entry shows on every printing of the card, so it will disappear from all of them."
            : "This entry only shows on this printing."
        }
        confirmLabel="Delete entry"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (pendingDelete) void deleteRuling(pendingDelete.id);
        }}
      />
    </AdminSection>
  );
}

/** The four editable fields plus the scope toggle, shared by create and edit. */
function RulingFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: RulingDraft;
  onChange: (next: Partial<RulingDraft>) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-type`}>Type</Label>
          <select
            id={`${idPrefix}-type`}
            className={CARD_BROWSE_SELECT_CLASS}
            value={draft.type}
            onChange={(e) =>
              onChange({ type: e.target.value as AdminRulingType })
            }
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-dated`}>Dated</Label>
          <Input
            id={`${idPrefix}-dated`}
            type="date"
            value={draft.dated}
            onChange={(e) => onChange({ dated: e.target.value })}
          />
        </div>
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-source`}>Source</Label>
          <Input
            id={`${idPrefix}-source`}
            value={draft.source}
            onChange={(e) => onChange({ source: e.target.value })}
            placeholder="Rules team update, comprehensive rules §4.2, …"
            maxLength={500}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-text`}>Text</Label>
        <Textarea
          id={`${idPrefix}-text`}
          rows={3}
          value={draft.text}
          onChange={(e) => onChange({ text: e.target.value })}
          maxLength={4000}
        />
      </div>

      <CheckboxField
        id={`${idPrefix}-all`}
        label="Applies to every printing"
        hint="Turn off only when the entry is specific to this printing, e.g. a misprint."
        checked={draft.applyToAll}
        onChange={(e) => onChange({ applyToAll: e.target.checked })}
      />
    </>
  );
}
