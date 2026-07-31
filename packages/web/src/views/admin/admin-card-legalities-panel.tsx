"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import type { Card } from "@riftseer/types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { listCardLegalitiesAction } from "@/features/admin/actions";
import {
  adminCardLegalitiesQueryKey,
  useCardLegalityMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import type {
  AdminCardLegalityEntry,
  AdminLegalityStatusInput,
} from "@/features/admin/types";
import { AdminSection } from "./admin-form-field";
import { CheckboxField } from "./admin-form-field";

/**
 * `default` is first because it is the resting state — a card with nothing
 * stored is legal, and clearing a status is the most common correction.
 */
const STATUS_OPTIONS: Array<{
  value: AdminLegalityStatusInput;
  label: string;
}> = [
  { value: "default", label: "Legal (nothing stored)" },
  { value: "legal", label: "Legal (explicit)" },
  { value: "not_legal", label: "Not legal" },
  { value: "banned", label: "Banned" },
];

/** What the select should show for an entry's current state. */
function currentSelection(
  entry: AdminCardLegalityEntry,
  applyToAll: boolean,
): AdminLegalityStatusInput {
  const stored = applyToAll ? entry.oracle_status : entry.printing_status;
  return stored ?? "default";
}

function describeScope(entry: AdminCardLegalityEntry): string {
  if (entry.printing_status) return "This printing only";
  if (entry.oracle_status) return "Every printing";
  return "—";
}

export function AdminCardLegalitiesPanel({ card }: { card: Card }) {
  // One toggle for the whole panel: an admin is normally either curating the
  // card's shared statuses or fixing a single odd printing, not both at once.
  const [applyToAll, setApplyToAll] = React.useState(true);
  const { set: setLegality } = useCardLegalityMutations(card.id);

  const legalities = useQuery({
    queryKey: adminCardLegalitiesQueryKey(card.id),
    queryFn: async () => {
      const result = await listCardLegalitiesAction(card.id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });

  const entries = legalities.data?.entries ?? [];

  function change(entry: AdminCardLegalityEntry, next: AdminLegalityStatusInput) {
    if (next === currentSelection(entry, applyToAll)) return;
    setLegality.mutate([
      card.id,
      entry.format_code,
      next,
      applyToAll,
      card.public_slug,
    ]);
  }

  return (
    <AdminSection
      heading="Format legalities"
      description="Cards are legal unless a status says otherwise, so only non-legal statuses are stored. Changes save immediately."
    >
      <div className="mb-4">
        <CheckboxField
          id="legality-apply-all"
          label="Apply to every printing"
          hint="On: the status is shared by all printings of this card and any per-printing exceptions for that format are cleared. Off: only this printing changes."
          checked={applyToAll}
          onChange={(e) => setApplyToAll(e.target.checked)}
        />
      </div>

      {legalities.isError ? (
        <p className="text-destructive text-sm">
          Couldn&apos;t load legalities. Please try again.
        </p>
      ) : legalities.isPending ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading legalities…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No formats defined yet.{" "}
          <Button variant="link" size="sm" className="h-auto p-0" asChild>
            <Link href="/admin/formats">Create one</Link>
          </Button>{" "}
          to start tracking legalities.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Format</TableHead>
              <TableHead>Now showing</TableHead>
              <TableHead>Set by</TableHead>
              <TableHead>
                {applyToAll ? "Status (all printings)" : "Status (this printing)"}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.format_id}>
                <TableCell>
                  {entry.format_name}
                  {!entry.format_active && (
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      (retired)
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <LegalityBadge status={entry.effective_status} />
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {describeScope(entry)}
                </TableCell>
                <TableCell>
                  <select
                    aria-label={`${entry.format_name} legality`}
                    className={CARD_BROWSE_SELECT_CLASS}
                    disabled={setLegality.isPending}
                    value={currentSelection(entry, applyToAll)}
                    onChange={(e) =>
                      change(
                        entry,
                        e.target.value as AdminLegalityStatusInput,
                      )
                    }
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {entries.some((entry) => entry.printing_status) && !applyToAll && (
        <p className="text-muted-foreground mt-3 text-xs">
          A status set here overrides the card-wide value for this printing only.
        </p>
      )}
    </AdminSection>
  );
}

const BADGE_STYLES: Record<string, string> = {
  legal: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  not_legal: "bg-muted text-muted-foreground",
  banned: "bg-destructive/10 text-destructive",
};

const BADGE_LABELS: Record<string, string> = {
  legal: "Legal",
  not_legal: "Not legal",
  banned: "Banned",
};

export function LegalityBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
        BADGE_STYLES[status] ?? BADGE_STYLES.not_legal
      }`}
    >
      {BADGE_LABELS[status] ?? status}
    </span>
  );
}
