"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DECK_ZONES,
  DECK_ZONE_LABELS,
  DEFAULT_LEGALITY_SEVERITY,
  LEGALITY_STATUSES,
} from "@riftseer/types/deck";
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
import { useInlineRowEdit } from "@/features/admin/hooks/use-inline-row-edit";
import type {
  AdminDeckZone,
  AdminFormat,
  AdminFormatPatch,
  AdminLegalityStatus,
  AdminViolationSeverityInput,
} from "@/features/admin/types";
import { AdminPageHeader } from "./admin-page-header";
import { CheckboxField, SelectField } from "./admin-form-field";
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
  const { editing, draft, setDraft, startEdit, cancelEdit } = useInlineRowEdit<
    AdminFormat,
    FormatDraft
  >(draftFrom, (format) => format.code);
  const [pendingDelete, setPendingDelete] = React.useState<AdminFormat | null>(
    null,
  );
  const [expanded, setExpanded] = React.useState<string | null>(null);
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
              const isExpanded = expanded === format.code;
              return (
                <React.Fragment key={format.code}>
                <TableRow>
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
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpanded((open) =>
                                open === format.code ? null : format.code,
                              )
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown aria-hidden="true" />
                            ) : (
                              <ChevronRight aria-hidden="true" />
                            )}
                            Rules
                          </Button>
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
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-muted/30 p-0">
                      <FormatRulesPanel format={format} />
                    </TableCell>
                  </TableRow>
                )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}

      {rows.length > 0 && (
        <p className="text-muted-foreground mt-4 text-xs">
          Open a format&apos;s <strong>Rules</strong> to set what it demands of
          each deck zone. A format with no rules at all — like Sandbox —
          enforces nothing.
        </p>
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

// ─── Deck construction rules ──────────────────────────────────────────────────
//
// Blank is unconstrained, and that is the whole point of the rules table: a
// format states only what it actually demands. So the drafts are strings rather
// than numbers — `0` is a real limit an admin can type, and a numeric state
// would have to invent a sentinel to tell "no limit" apart from it.

interface ZoneDraft {
  min: string;
  max: string;
  copies: string;
}

const EMPTY_ZONE_DRAFT: ZoneDraft = { min: "", max: "", copies: "" };

function numberField(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function zoneDraftsFor(format: AdminFormat): Record<AdminDeckZone, ZoneDraft> {
  const drafts = {} as Record<AdminDeckZone, ZoneDraft>;
  for (const zone of DECK_ZONES) drafts[zone] = { ...EMPTY_ZONE_DRAFT };
  for (const rule of format.zone_rules) {
    drafts[rule.zone] = {
      min: numberField(rule.min_count),
      max: numberField(rule.max_count),
      copies: numberField(rule.copy_limit),
    };
  }
  return drafts;
}

/** Blank means unconstrained; anything that is not a whole number is refused. */
function parseBound(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) return "invalid";
  return parsed;
}

const SEVERITY_OPTIONS: Array<{
  value: AdminViolationSeverityInput;
  label: string;
}> = [
  { value: "default", label: "Default" },
  { value: "none", label: "None — allow silently" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
];

const STATUS_LABELS: Record<AdminLegalityStatus, string> = {
  legal: "Legal",
  restricted: "Restricted",
  not_legal: "Not legal",
  banned: "Banned",
};

function FormatRulesPanel({ format }: { format: AdminFormat }) {
  const { setZoneRule, deleteZoneRule, setSeverity } = useFormatMutations();
  // Seeded once on open. A save writes exactly what is on screen, so the server
  // and the draft already agree afterwards; re-seeding on every refetch would
  // yank the field the admin is still typing in.
  const [drafts, setDrafts] = React.useState<Record<AdminDeckZone, ZoneDraft>>(
    () => zoneDraftsFor(format),
  );
  const [pendingClear, setPendingClear] = React.useState<AdminDeckZone | null>(
    null,
  );

  const storedZones = new Set(format.zone_rules.map((rule) => rule.zone));
  const severityFor = (status: AdminLegalityStatus): AdminViolationSeverityInput =>
    format.severity_overrides.find((row) => row.status === status)?.severity ??
    "default";

  function edit(zone: AdminDeckZone, field: keyof ZoneDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [zone]: { ...current[zone], [field]: value },
    }));
  }

  function save(zone: AdminDeckZone) {
    const draft = drafts[zone];
    const min = parseBound(draft.min);
    const max = parseBound(draft.max);
    const copies = parseBound(draft.copies);
    if (min === "invalid" || max === "invalid" || copies === "invalid") {
      toast.error(
        "Counts must be whole numbers of zero or more. Leave a box empty to leave it unconstrained.",
      );
      return;
    }
    if (min !== null && max !== null && min > max) {
      toast.error("A zone's minimum cannot be larger than its maximum");
      return;
    }
    setZoneRule.mutate([
      format.code,
      zone,
      { min_count: min, max_count: max, copy_limit: copies },
    ]);
  }

  async function clear(zone: AdminDeckZone) {
    try {
      await deleteZoneRule.mutateAsync([format.code, zone]);
    } catch {
      // Already surfaced as a toast; leave the row as it was.
      return;
    }
    setDrafts((current) => ({ ...current, [zone]: { ...EMPTY_ZONE_DRAFT } }));
    setPendingClear(null);
  }

  return (
    <div className="space-y-6 px-4 py-5">
      <div>
        <h3 className="text-sm font-semibold">Zone rules</h3>
        <p className="text-muted-foreground mt-1 text-xs">
          An empty box means <strong>unconstrained</strong> — not zero. Copies
          is the limit per card across the zone&apos;s counting group, so main
          and sideboard share one limit.
        </p>
        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>Zone</TableHead>
              <TableHead>Minimum</TableHead>
              <TableHead>Maximum</TableHead>
              <TableHead>Copies per card</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DECK_ZONES.map((zone) => {
              const draft = drafts[zone];
              const stored = storedZones.has(zone);
              return (
                <TableRow key={zone}>
                  <TableCell>
                    <span className="text-sm font-medium">
                      {DECK_ZONE_LABELS[zone]}
                    </span>
                    {!stored && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        unconstrained
                      </span>
                    )}
                  </TableCell>
                  {(["min", "max", "copies"] as const).map((field) => (
                    <TableCell key={field}>
                      <Input
                        aria-label={`${DECK_ZONE_LABELS[zone]} ${field}`}
                        value={draft[field]}
                        inputMode="numeric"
                        placeholder="Any"
                        className="w-24"
                        onChange={(e) => edit(zone, field, e.target.value)}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={setZoneRule.isPending}
                        onClick={() => save(zone)}
                      >
                        <Save aria-hidden="true" />
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!stored || deleteZoneRule.isPending}
                        onClick={() => setPendingClear(zone)}
                      >
                        Clear
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Legality severity</h3>
        <p className="text-muted-foreground mt-1 text-xs">
          How loudly the deck builder complains about each status in this
          format. <strong>Default</strong> stores nothing and follows the shared
          mapping, so a status added later needs no backfill here.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LEGALITY_STATUSES.map((legalityStatus) => (
            <SelectField
              key={legalityStatus}
              id={`severity-${format.code}-${legalityStatus}`}
              label={STATUS_LABELS[legalityStatus]}
              hint={`Default: ${DEFAULT_LEGALITY_SEVERITY[legalityStatus]}`}
              disabled={setSeverity.isPending}
              value={severityFor(legalityStatus)}
              onChange={(event) =>
                setSeverity.mutate([
                  format.code,
                  legalityStatus,
                  event.target.value as AdminViolationSeverityInput,
                ])
              }
              options={SEVERITY_OPTIONS}
            />
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={pendingClear !== null}
        onOpenChange={(open) => {
          if (!open) setPendingClear(null);
        }}
        title={`Clear the ${
          pendingClear ? DECK_ZONE_LABELS[pendingClear] : "zone"
        } rule?`}
        description="The zone becomes unconstrained in this format: no minimum, no maximum and no copy limit. Existing decks are never invalidated retroactively — validation is advisory and recomputed on read."
        confirmLabel="Clear rule"
        destructive
        pending={deleteZoneRule.isPending}
        onConfirm={() => {
          if (pendingClear) void clear(pendingClear);
        }}
      />
    </div>
  );
}
