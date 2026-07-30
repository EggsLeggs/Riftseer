"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setsApi, setsQueryKeys, type SetInfo } from "@/features/sets/api";
import { toDateInputValue } from "@/features/admin/dates";
import { useSetMutations } from "@/features/admin/hooks/use-admin-mutations";
import type { AdminSetPatch } from "@/features/admin/types";
import { AdminPageHeader } from "./admin-page-header";
import { CheckboxField } from "./admin-form-field";
import { ConfirmDialog } from "./confirm-dialog";

interface SetDraft {
  setName: string;
  publishedOn: string;
  isPromo: boolean;
}

function draftFrom(info: SetInfo): SetDraft {
  return {
    setName: info.setName,
    publishedOn: toDateInputValue(info.publishedOn),
    isPromo: info.isPromo,
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function AdminSetsView() {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<SetDraft | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<SetInfo | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newCode, setNewCode] = React.useState("");
  const [newDraft, setNewDraft] = React.useState<SetDraft>({
    setName: "",
    publishedOn: "",
    isPromo: false,
  });

  const { create, patch, remove } = useSetMutations();

  const sets = useQuery({
    queryKey: setsQueryKeys.list(),
    queryFn: () => setsApi.getSets(),
    retry: false,
  });

  function startEdit(info: SetInfo) {
    setEditing(info.setCode);
    setDraft(draftFrom(info));
  }

  function cancelEdit() {
    setEditing(null);
    setDraft(null);
  }

  async function saveEdit(info: SetInfo) {
    if (!draft) return;
    const name = draft.setName.trim();
    if (!name) {
      toast.error("Set name is required");
      return;
    }
    if (draft.publishedOn && !DATE_PATTERN.test(draft.publishedOn)) {
      toast.error("Release date must be YYYY-MM-DD");
      return;
    }

    // Merge-patch semantics: send only what changed, and null to clear a date.
    const original = draftFrom(info);
    const setPatch: AdminSetPatch = {};
    if (name !== original.setName) setPatch.set_name = name;
    if (draft.publishedOn !== original.publishedOn) {
      setPatch.published_on = draft.publishedOn || null;
    }
    if (draft.isPromo !== original.isPromo) setPatch.is_promo = draft.isPromo;

    if (Object.keys(setPatch).length === 0) {
      cancelEdit();
      return;
    }

    try {
      await patch.mutateAsync([info.setCode, setPatch]);
    } catch {
      // Already surfaced as a toast — keep the row open for a retry.
      return;
    }
    cancelEdit();
  }

  async function createSet() {
    const code = newCode.trim().toUpperCase();
    const name = newDraft.setName.trim();
    if (!code) {
      toast.error("Set code is required");
      return;
    }
    if (!name) {
      toast.error("Set name is required");
      return;
    }
    if (newDraft.publishedOn && !DATE_PATTERN.test(newDraft.publishedOn)) {
      toast.error("Release date must be YYYY-MM-DD");
      return;
    }

    try {
      await create.mutateAsync([
        code,
        {
          set_name: name,
          published_on: newDraft.publishedOn || null,
          is_promo: newDraft.isPromo,
        },
      ]);
    } catch {
      return;
    }
    setCreating(false);
    setNewCode("");
    setNewDraft({ setName: "", publishedOn: "", isPromo: false });
  }

  async function deleteSet(setCode: string, reason: string) {
    try {
      await remove.mutateAsync([setCode, reason || undefined]);
    } catch {
      return;
    }
    setPendingDelete(null);
  }

  return (
    <>
      <AdminPageHeader
        title="Sets"
        description="Sets come from RiftCodex. Create manual sets for printings it does not cover, and correct names or release dates here."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Sets" }]}
        actions={
          <Button onClick={() => setCreating((open) => !open)}>
            {creating ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {creating ? "Cancel" : "New set"}
          </Button>
        }
      />

      {creating && (
        <div className="mb-8 rounded-lg border p-4">
          <h2 className="mb-4 text-sm font-semibold">Create a manual set</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-set-code">Set code</Label>
              <Input
                id="new-set-code"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="OGN"
                maxLength={32}
                className="w-32 uppercase"
              />
            </div>
            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label htmlFor="new-set-name">Set name</Label>
              <Input
                id="new-set-name"
                value={newDraft.setName}
                onChange={(e) =>
                  setNewDraft((d) => ({ ...d, setName: e.target.value }))
                }
                placeholder="Origins"
                maxLength={200}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-set-date">Released</Label>
              <Input
                id="new-set-date"
                type="date"
                value={newDraft.publishedOn}
                onChange={(e) =>
                  setNewDraft((d) => ({ ...d, publishedOn: e.target.value }))
                }
              />
            </div>
            <CheckboxField
              id="new-set-promo"
              label="Promo set"
              checked={newDraft.isPromo}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, isPromo: e.target.checked }))
              }
            />
            <Button
              onClick={() => void createSet()}
              disabled={create.isPending}
            >
              {create.isPending ? "Creating…" : "Create set"}
            </Button>
          </div>
        </div>
      )}

      {sets.isError ? (
        <p className="text-destructive text-sm">
          Couldn&apos;t load sets. Please try again.
        </p>
      ) : sets.isPending ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading sets…
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Released</TableHead>
              <TableHead>Cards</TableHead>
              <TableHead>Promo</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sets.data.sets.map((info) => {
              const isEditing = editing === info.setCode && draft !== null;
              return (
                <TableRow key={info.setCode}>
                  <TableCell className="font-medium uppercase">
                    <Link
                      href={`/sets/${info.setCode.toLowerCase()}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {info.setCode}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        aria-label="Set name"
                        value={draft.setName}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, setName: e.target.value } : d,
                          )
                        }
                        maxLength={200}
                      />
                    ) : (
                      info.setName
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        aria-label="Release date"
                        type="date"
                        value={draft.publishedOn}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, publishedOn: e.target.value } : d,
                          )
                        }
                      />
                    ) : (
                      (toDateInputValue(info.publishedOn) || "—")
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{info.cardCount}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <input
                        type="checkbox"
                        aria-label="Promo set"
                        className="accent-primary size-4"
                        checked={draft.isPromo}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, isPromo: e.target.checked } : d,
                          )
                        }
                      />
                    ) : info.isPromo ? (
                      "Yes"
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={patch.isPending}
                            onClick={() => void saveEdit(info)}
                          >
                            <Save aria-hidden="true" />
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(info)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={info.cardCount > 0}
                            title={
                              info.cardCount > 0
                                ? "Move or delete every card in the set first"
                                : "Delete this set"
                            }
                            onClick={() => setPendingDelete(info)}
                          >
                            <Trash2 aria-hidden="true" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.setName ?? "set"}?`}
        description="Only empty sets can be deleted. A deletion record is stored so ingest will not recreate it."
        confirmLabel="Delete set"
        destructive
        reasonLabel="Reason (optional)"
        pending={remove.isPending}
        onConfirm={(reason) => {
          if (pendingDelete) void deleteSet(pendingDelete.setCode, reason);
        }}
      />
    </>
  );
}
