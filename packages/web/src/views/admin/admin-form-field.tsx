"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { cn } from "@/lib/utils";

/** Section wrapper matching the settings pages' small-caps headings. */
export function AdminSection({
  heading,
  description,
  children,
}: {
  heading: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
        {heading}
      </h2>
      {description && (
        <p className="text-muted-foreground mb-3 text-xs">{description}</p>
      )}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

/**
 * Id of the hint/error paragraph for a field, so the control can point at it
 * with `aria-describedby`. Derived from the field id to stay stable across
 * renders and unique per field.
 */
export function fieldMessageId(id: string): string {
  return `${id}-message`;
}

/** Label/hint/error chrome every field shares — the control itself is the child. */
interface FieldChromeProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  /**
   * Keep the label for screen readers but drop it visually — for a control in a
   * table cell, where the column header already names it and a second visible
   * label would just repeat the row.
   */
  labelHidden?: boolean;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  className,
  labelHidden,
  children,
}: FieldChromeProps & { children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className={labelHidden ? "sr-only" : undefined}>
        {label}
      </Label>
      {children}
      {error ? (
        <p id={fieldMessageId(id)} className="text-destructive text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={fieldMessageId(id)} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  error,
  className,
  labelHidden,
  ...inputProps
}: FieldChromeProps &
  Omit<React.ComponentProps<typeof Input>, "id" | "className" | "children">) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className} labelHidden={labelHidden}>
      <Input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? fieldMessageId(id) : undefined}
        {...inputProps}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  className,
  labelHidden,
  ...textareaProps
}: FieldChromeProps &
  Omit<React.ComponentProps<typeof Textarea>, "id" | "className" | "children">) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className} labelHidden={labelHidden}>
      <Textarea
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? fieldMessageId(id) : undefined}
        {...textareaProps}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  className,
  labelHidden,
  options,
  ...selectProps
}: FieldChromeProps &
  Omit<React.ComponentProps<"select">, "id" | "className" | "children"> & {
    options: Array<{ value: string; label: string }>;
  }) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className} labelHidden={labelHidden}>
      <select
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? fieldMessageId(id) : undefined}
        className={CARD_BROWSE_SELECT_CLASS}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/** Checkbox row — used for the small set of card booleans. */
export function CheckboxField({
  id,
  label,
  hint,
  ...inputProps
}: {
  id: string;
  label: string;
  hint?: string;
} & Omit<React.ComponentProps<"input">, "id" | "type">) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5"
    >
      <input
        id={id}
        type="checkbox"
        className="accent-primary mt-0.5 size-4 shrink-0"
        aria-describedby={hint ? fieldMessageId(id) : undefined}
        {...inputProps}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && (
          <span
            id={fieldMessageId(id)}
            className="text-muted-foreground block text-xs"
          >
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
