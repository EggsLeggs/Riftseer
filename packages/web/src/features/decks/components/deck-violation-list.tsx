"use client";

import * as React from "react";
import { AlertTriangleIcon, InfoIcon, OctagonAlertIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  violationScopeNote,
  violationSeverity,
  type DeckViolationSeverity,
} from "../deck-violations";
import type { DeckViolation } from "../types";

/**
 * How a violation looks.
 *
 * `severity` decides the treatment and nothing else does: an error and a
 * warning must not read the same, because one means the deck is illegal and the
 * other means somebody should look. Colour is never the only signal — each
 * severity also has its own icon and its own word.
 *
 * Nothing here parses `message`. The structured fields (`scope`, `count`,
 * `limit`, `zone`) are what the layout reads; `message` is displayed verbatim.
 */

const SEVERITY_STYLES: Record<
  DeckViolationSeverity,
  { icon: React.ComponentType<{ className?: string }>; text: string; chip: string; word: string }
> = {
  error: {
    icon: OctagonAlertIcon,
    text: "text-destructive",
    chip: "border-destructive/40 bg-destructive/10 text-destructive",
    word: "Error",
  },
  warning: {
    icon: AlertTriangleIcon,
    text: "text-amber-700 dark:text-amber-400",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    word: "Warning",
  },
  info: {
    icon: InfoIcon,
    text: "text-muted-foreground",
    chip: "border-border bg-muted text-muted-foreground",
    word: "Note",
  },
};

export function violationStyle(violation: Pick<DeckViolation, "severity">) {
  return SEVERITY_STYLES[violationSeverity(violation)];
}

/** Inline marker for a deck row or a zone heading. */
export function DeckViolationMarker({
  violations,
  className,
  decorative = false,
}: {
  violations: readonly DeckViolation[];
  className?: string;
  /** Set where the same messages are already on screen, so they are not read twice. */
  decorative?: boolean;
}) {
  if (violations.length === 0) return null;
  // Worst first: a row that is both banned and over the copy limit reads as an
  // error, not as whichever entry the API happened to emit first.
  const worst =
    violations.find((v) => violationSeverity(v) === "error") ??
    violations.find((v) => violationSeverity(v) === "warning") ??
    violations[0]!;
  const style = violationStyle(worst);
  const Icon = style.icon;
  return (
    <span
      className={cn("inline-flex items-center", style.text, className)}
      title={violations.map((v) => v.message).join("\n")}
      aria-hidden={decorative || undefined}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {!decorative && (
        <span className="sr-only">
          {style.word}: {violations.map((v) => v.message).join(". ")}
        </span>
      )}
    </span>
  );
}

export function DeckViolationRow({ violation }: { violation: DeckViolation }) {
  const style = violationStyle(violation);
  const Icon = style.icon;
  const note = violationScopeNote(violation);
  return (
    <li className="flex items-start gap-2 py-1.5 text-sm">
      <Icon className={cn("mt-0.5 size-4 shrink-0", style.text)} aria-hidden="true" />
      <span className="min-w-0">
        <span
          className={cn(
            "mr-2 inline-flex h-4 items-center rounded border px-1 text-[10px] font-medium tracking-wide uppercase",
            style.chip,
          )}
        >
          {style.word}
        </span>
        <span>{violation.message}</span>
        {violation.count != null && violation.limit != null && (
          <span className="text-muted-foreground ml-2 tabular-nums">
            {violation.count}/{violation.limit}
          </span>
        )}
        {note && <span className="text-muted-foreground block text-xs">{note}</span>}
      </span>
    </li>
  );
}

export function DeckViolationList({
  violations,
  className,
  emptyMessage,
}: {
  violations: readonly DeckViolation[];
  className?: string;
  emptyMessage?: string;
}) {
  if (violations.length === 0) {
    return emptyMessage ? (
      <p className={cn("text-muted-foreground text-sm", className)}>{emptyMessage}</p>
    ) : null;
  }
  return (
    <ul className={cn("divide-border divide-y", className)}>
      {violations.map((violation, index) => (
        <DeckViolationRow
          key={`${violation.code}-${violation.printing_id ?? violation.oracle_id ?? violation.zone ?? index}`}
          violation={violation}
        />
      ))}
    </ul>
  );
}
