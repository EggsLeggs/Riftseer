"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  DialogContent,
  type DialogContentProps,
} from "@/components/ui/dialog";
import {
  DropdownMenuContent,
  type DropdownMenuContentProps,
} from "@/components/ui/dropdown-menu";

/**
 * Radix modal layers (DropdownMenu, Dialog, etc.) set `pointer-events: none` on
 * `document.body` while open. Soft navigation can unmount them before cleanup,
 * leaving the page unclickable after back/forward.
 */

/** True when a blocking Radix overlay is still mounted and open. */
export function hasBlockingRadixOverlay(): boolean {
  return Boolean(
    document.querySelector(
      [
        '[data-slot="dialog-overlay"][data-state="open"]',
        '[data-slot="dialog-content"][data-state="open"]',
        '[data-slot="dropdown-menu-content"][data-state="open"]',
        '[role="dialog"][data-state="open"]',
      ].join(","),
    ),
  );
}

/** Clear stale body pointer-events only when no open Radix overlay remains. */
export function clearBodyPointerEventsIfSafe(): void {
  if (hasBlockingRadixOverlay()) return;
  document.body.style.pointerEvents = "";
}

/**
 * Clears stale body pointer-events after pathname changes, unless another
 * overlay is still open.
 */
export function ClearBodyPointerEventsOnNavigate() {
  const pathname = usePathname();

  useEffect(() => {
    clearBodyPointerEventsIfSafe();
  }, [pathname]);

  return null;
}

/** App-owned DialogContent with pointer-events cleanup on close. */
export function AppDialogContent({
  onCloseAutoFocus,
  ...props
}: DialogContentProps) {
  return (
    <DialogContent
      onCloseAutoFocus={(event) => {
        clearBodyPointerEventsIfSafe();
        onCloseAutoFocus?.(event);
      }}
      {...props}
    />
  );
}

/** App-owned DropdownMenuContent with pointer-events cleanup on close. */
export function AppDropdownMenuContent({
  onCloseAutoFocus,
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuContent
      onCloseAutoFocus={(event) => {
        clearBodyPointerEventsIfSafe();
        onCloseAutoFocus?.(event);
      }}
      {...props}
    />
  );
}
