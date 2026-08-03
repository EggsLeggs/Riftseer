"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import type { Printing } from "@riftseer/types";
import type { LegalityStatus } from "@riftseer/types/deck";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LEGALITY_STATUS_LABELS,
  LegalityStatusBadge,
} from "@/features/cards/card-legalities";
import { listPrintingLegalitiesAction } from "@/features/admin/actions";
import {
  adminCardLegalitiesQueryKey,
  useCardLegalityMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import type {
  AdminLegalityStatusInput,
  AdminPrintingLegalityEntry,
} from "@/features/admin/types";
import {
  AdminSection,
  CheckboxField,
  SelectField,
  TextField,
} from "./admin-form-field";

const STATUS_OPTIONS: Array<{ value: AdminLegalityStatusInput; label: string }> = [
  { value: "default", label: "Default / inherit" },
  { value: "legal", label: "Legal (explicit)" },
  { value: "restricted", label: "Restricted" },
  { value: "not_legal", label: "Not legal" },
  { value: "banned", label: "Banned" },
];

export function AdminCardLegalitiesPanel({ printing }: { printing: Printing }) {
  const [applyToAll, setApplyToAll] = React.useState(true);
  // Keyed by format code, and only for rows the admin has actually typed in.
  // Anything absent falls back to the stored note, so a refetch never has to
  // race a draft — and switching scope drops the drafts, because the note being
  // edited belongs to whichever row the save will write.
  const [noteDrafts, setNoteDrafts] = React.useState<Record<string, string>>({});
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
  const targetScope = applyToAll ? "oracle" : "printing";

  /** What the select shows: the stored value at the scope being edited. */
  function selection(entry: AdminPrintingLegalityEntry): AdminLegalityStatusInput {
    return entry.scope === targetScope ? entry.status : "default";
  }

  function noteValue(entry: AdminPrintingLegalityEntry): string {
    const draft = noteDrafts[entry.format_code];
    if (draft !== undefined) return draft;
    return entry.scope === targetScope ? (entry.note ?? "") : "";
  }

  function save(
    entry: AdminPrintingLegalityEntry,
    status: AdminLegalityStatusInput,
  ) {
    setLegality.mutate([
      printing.id,
      entry.format_code,
      status,
      applyToAll,
      printing.public_slug,
      // Clearing the status deletes the row the note lives on, so the note goes
      // with it rather than being carried onto nothing.
      status === "default" ? null : noteValue(entry).trim() || null,
    ]);
  }

  return (
    <AdminSection
      heading="Format legalities"
      description="Legalities retain oracle and printing scopes. Default removes the selected scope's stored row — and its note with it."
    >
      <div className="mb-4">
        <CheckboxField
          id="legality-apply-all"
          label="Apply to every printing"
          hint="On writes the oracle status and clears printing exceptions for that format. Off changes only this printing."
          checked={applyToAll}
          onChange={(event) => {
            setApplyToAll(event.target.checked);
            setNoteDrafts({});
          }}
        />
      </div>

      {legalities.isError ? (
        <p className="text-destructive text-sm">Couldn&apos;t load legalities.</p>
      ) : legalities.isPending ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading legalities…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No formats defined.{" "}
          <Button variant="link" size="sm" className="h-auto p-0" asChild>
            <Link href="/admin/formats">Create one</Link>
          </Button>
          .
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Format</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead>Set by</TableHead>
              <TableHead>
                {applyToAll ? "Oracle status" : "Printing status"}
              </TableHead>
              <TableHead>Note</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const status = selection(entry);
              return (
                <TableRow key={entry.format_id}>
                  <TableCell>{entry.format_name}</TableCell>
                  <TableCell>
                    <LegalityBadge status={entry.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {entry.scope}
                  </TableCell>
                  <TableCell>
                    <SelectField
                      id={`legality-${entry.format_code}`}
                      label={`${entry.format_name} legality`}
                      labelHidden
                      disabled={setLegality.isPending}
                      value={status}
                      onChange={(event) =>
                        save(entry, event.target.value as AdminLegalityStatusInput)
                      }
                      options={STATUS_OPTIONS}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      id={`legality-note-${entry.format_code}`}
                      label={`${entry.format_name} note`}
                      labelHidden
                      className="min-w-56"
                      maxLength={500}
                      disabled={status === "default" || setLegality.isPending}
                      placeholder={
                        status === "default"
                          ? "No stored status to explain"
                          : "Why — e.g. restricted to 1 copy as of the 2026-07 update"
                      }
                      value={noteValue(entry)}
                      onChange={(event) =>
                        setNoteDrafts((current) => ({
                          ...current,
                          [entry.format_code]: event.target.value,
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={status === "default" || setLegality.isPending}
                      onClick={() => save(entry, status)}
                    >
                      <Save aria-hidden="true" />
                      <span className="sr-only">
                        Save the {entry.format_name} note
                      </span>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <p className="text-muted-foreground mt-3 text-xs">
        The note is admin-authored explanation text, shown to players wherever
        the status is reported — the deck builder puts it in the legality
        tooltip. Changing the status saves immediately; editing a note saves on
        the row&apos;s save button.
      </p>
    </AdminSection>
  );
}

/**
 * The public card page's badge, sized for a table cell. Labels and tints are
 * the shared ones: this panel carried its own pair only while the card type was
 * too narrow to name `restricted`, and two maps meant two things to remember.
 *
 * A status this build does not know is still rendered verbatim rather than
 * blank — the admin is the person who needs to see an unexpected value.
 */
export function LegalityBadge({ status }: { status: string }) {
  const known =
    status in LEGALITY_STATUS_LABELS ? (status as LegalityStatus) : null;
  if (!known) {
    return (
      <span className="bg-muted text-muted-foreground inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium">
        {status}
      </span>
    );
  }
  return (
    <LegalityStatusBadge
      status={known}
      className="w-auto px-2 py-0.5 text-xs font-medium tracking-normal normal-case"
    />
  );
}
