"use client";

import * as React from "react";
import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface QuantityStepperProps {
  value: number;
  /** Called with the clamped, integral result of every commit. */
  onChange: (next: number) => void;
  /** Defaults to 0 — a deck row's "remove me" quantity. */
  min?: number;
  max?: number;
  disabled?: boolean;
  /**
   * What is being counted, e.g. the card name. Required: a deck list is a long
   * column of identical steppers, and "Increase" alone names none of them.
   */
  label: string;
  size?: "sm" | "default";
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * `−` / value / `+`, for every row of a deck list.
 *
 * The number is a real text input rather than a label, because typing `4` is
 * faster than pressing `+` four times — but it is committed on blur and Enter,
 * not on every keystroke: mid-edit an empty field is a legitimate state and
 * would otherwise be read as a zero that removes the card.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  disabled,
  label,
  size = "default",
  className,
}: QuantityStepperProps) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const buttonSize = size === "sm" ? "icon-xs" : "icon-sm";

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number.parseInt(raw.trim(), 10);
    if (Number.isNaN(parsed)) return;
    const next = clamp(parsed, min, max);
    if (next !== value) onChange(next);
  };

  const step = (delta: number) => {
    setDraft(null);
    const next = clamp(value + delta, min, max);
    if (next !== value) onChange(next);
  };

  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      data-slot="quantity-stepper"
    >
      <Button
        type="button"
        variant="outline"
        size={buttonSize}
        disabled={disabled || value <= min}
        onClick={() => step(-1)}
        aria-label={`Decrease ${label}`}
      >
        <MinusIcon aria-hidden="true" />
      </Button>
      <input
        // `text` with a numeric keypad, not `number`: a number input's spinners
        // duplicate these buttons and its scroll-wheel increment changes a
        // quantity the user only meant to scroll past.
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        role="spinbutton"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        disabled={disabled}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(event.currentTarget.value);
            return;
          }
          if (event.key === "Escape") {
            setDraft(null);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            step(1);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            step(-1);
          }
        }}
        className={cn(
          "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 rounded-md border text-center tabular-nums shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-6 w-9 text-xs" : "h-7 w-10 text-sm",
        )}
      />
      <Button
        type="button"
        variant="outline"
        size={buttonSize}
        disabled={disabled || value >= max}
        onClick={() => step(1)}
        aria-label={`Increase ${label}`}
      >
        <PlusIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
