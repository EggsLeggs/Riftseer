"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
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
import { listFormatsAction } from "@/features/admin/actions";
import {
  adminFormatsQueryKey,
  useFormatMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import type { AdminFormat, AdminFormatPatch } from "@/features/admin/types";
import { AdminPageHeader } from "./admin-page-header";
import { CheckboxField } from "./admin-form-field";
import { ConfirmDialog } from "./confirm-dialog";

/** Mirrors the API's accepted input shape; the stored code is always lowercase. */
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

interface FormatDraft {
  name: string;
  active: boolean;
}

function draftFrom(format: AdminFormat): FormatDraft {
  return { name: format.name, active: format.active };
}

export function AdminFormatsView() {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<FormatDraft | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AdminFormat | null>(
    null,
  );
  const [creating, setCreating] = React.useState(false);
  const [newCode, setNewCode] = React.useState("");
  const [newName, setNewName] = React.useState("");

  const { create, patch, remove, reorder } = useFormatMutations();

  const formats = useQuery({
    queryKey: adminFormatsQueryKey,
    queryFn: async () => {
      const result = await listFormatsAction();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });

  const rows = formats.data?.formats ?? [];

  function startEdit(format: AdminFormat) {
    setEditing(format.code);
    setDraft(draftFrom(format));
  }

  function cancelEdit() {
    setEditing(null);
    setDraft(null);
  }

  async function saveEdit(format: AdminFormat) {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      toast.error("Format name is required");
      return;
    }

    // Merge-patch semantics: send only what actually changed.
    const original = draftFrom(format);
    const formatPatch: AdminFormatPatch = {};
    if (name !== original.name) formatPatch.name = name;
    if (draft.active !== original.active) formatPatch.active = draft.active;

    if (Object.keys(formatPatch).length === 0) {
      cancelEdit();
      return;
    }

    try {
      await patch.mutateAsync([format.code, formatPatch]);
    } catch {
      // Already surfaced as a toast — keep the row open for a retry.
      return;
    }
    cancelEdit();
  }

  async function createFormat() {
    const code = newCode.trim().toLowerCase();
    const name = newName.trim();
    if (!CODE_PATTERN.test(code)) {
      toast.error(
        "Code must start with a letter or number and use only letters, numbers, - or _",
      );
      return;
    }
    if (!name) {
      toast.error("Format name is required");
      return;
    }

    try {
      await create.mutateAsync([{ code, name }]);
    } catch {
      return;
    }
    setCreating(false);
    setNewCode("");
    setNewName("");
  }

  /**
   * Reordering posts the whole list, so build the new order locally and let the
   * server rewrite every `sort_order` from its position.
   */
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const codes = rows.map((format) => format.code);
    [codes[index], codes[target]] = [codes[target], codes[index]];
    reorder.mutate([codes]);
  }

  async function deleteFormat(code: string) {
    try {
      await remove.mutateAsync([code]);
    } catch {
      return;
    }
    setPendingDelete(null);
  }

  const pendingRowCount = pendingDelete
    ? pendingDelete.legality_count + pendingDelete.override_count
    : 0;

  return (
    <>
      <AdminPageHeader
        title="Formats"
        description="Play formats shown on every card page. Cards are legal in a format unless a status says otherwise, so an empty legality list means legal everywhere."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Formats" }]}
        actions={
          <Button onClick={() => setCreating((open) => !open)}>
            {creating ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {creating ? "Cancel" : "New format"}
          </Button>
        }
      />

      {creating && (
        <div className="mb-8 rounded-lg border p-4">
          <h2 className="mb-4 text-sm font-semibold">Create a format</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-format-code">Code</Label>
              <Input
                id="new-format-code"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="standard"
                maxLength={64}
                className="w-44 lowercase"
              />
            </div>
            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label htmlFor="new-format-name">Name</Label>
              <Input
                id="new-format-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Standard"
                maxLength={120}
              />
            </div>
            <Button
              onClick={() => void createFormat()}
              disabled={create.isPending}
            >
              {create.isPending ? "Creating…" : "Create format"}
            </Button>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            The code is the public handle used by API clients and cannot be
            changed later. New formats are appended to the end of the order.
          </p>
        </div>
      )}

      {formats.isError ? (
        <p className="text-destructive text-sm">
          Couldn&apos;t load formats. Please try again.
        </p>
      ) : formats.isPending ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading formats…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No formats yet. Create one to start tracking legalities.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Statuses stored</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((format, index) => {
              const isEditing = editing === format.code && draft !== null;
              return (
                <TableRow key={format.code}>
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp aria-hidden="true" />
                        <span className="sr-only">
                          Move {format.name} earlier
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={
                          index === rows.length - 1 || reorder.isPending
                        }
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                        <span className="sr-only">Move {format.name} later</span>
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {format.code}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        aria-label="Format name"
                        value={draft.name}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, name: e.target.value } : d,
                          )
                        }
                        maxLength={120}
                      />
                    ) : (
                      format.name
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {format.legality_count + format.override_count === 0
                      ? "—"
                      : `${format.legality_count} card${
                          format.legality_count === 1 ? "" : "s"
                        }, ${format.override_count} printing${
                          format.override_count === 1 ? "" : "s"
                        }`}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <input
                        type="checkbox"
                        aria-label="Active"
                        className="accent-primary size-4"
                        checked={draft.active}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, active: e.target.checked } : d,
                          )
                        }
                      />
                    ) : format.active ? (
                      "Yes"
                    ) : (
                      "Retired"
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
                            onClick={() => void saveEdit(format)}
                          >
                            <Save aria-hidden="true" />
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(format)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete this format"
                            onClick={() => setPendingDelete(format)}
                          >
                            <Trash2 aria-hidden="true" />
                            <span className="sr-only">
                              Delete {format.name}
                            </span>
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

      {rows.some((format) => !format.active) && (
        <p className="text-muted-foreground mt-4 text-xs">
          Retired formats keep their stored statuses but are hidden from card
          pages. Reactivate one to bring its legalities back.
        </p>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.name ?? "format"}?`}
        description={
          pendingRowCount > 0
            ? `This also deletes ${pendingRowCount} stored ${
                pendingRowCount === 1 ? "status" : "statuses"
              } and cannot be undone. Retire the format instead if you want to keep them.`
            : "No statuses are stored against this format, so nothing else is affected."
        }
        confirmLabel="Delete format"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (pendingDelete) void deleteFormat(pendingDelete.code);
        }}
      />
    </>
  );
}
