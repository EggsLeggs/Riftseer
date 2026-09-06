"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  DialogContent,
  type DialogContentProps,
} from "@/components/ui/dialog";
import {
  ContextMenuContent,
  type ContextMenuContentProps,
} from "@/components/ui/context-menu";
import {
  DropdownMenuContent,
  type DropdownMenuContentProps,
} from "@/components/ui/dropdown-menu";
import {
  PopoverContent,
  type PopoverContentProps,
} from "@/components/ui/popover";
import {
  SelectContent,
  type SelectContentProps,
} from "@/components/ui/select";

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
        '[data-slot="context-menu-content"][data-state="open"]',
        '[data-slot="select-content"][data-state="open"]',
        '[data-slot="drawer-overlay"][data-state="open"]',
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

/** App-owned ContextMenuContent with pointer-events cleanup on close. */
export function AppContextMenuContent({
  onCloseAutoFocus,
  ...props
}: ContextMenuContentProps) {
  return (
    <ContextMenuContent
      onCloseAutoFocus={(event) => {
        clearBodyPointerEventsIfSafe();
        onCloseAutoFocus?.(event);
      }}
      {...props}
    />
  );
}

/** App-owned SelectContent with pointer-events cleanup on close. */
export function AppSelectContent({
  onCloseAutoFocus,
  ...props
}: SelectContentProps) {
  return (
    <SelectContent
      onCloseAutoFocus={(event) => {
        clearBodyPointerEventsIfSafe();
        onCloseAutoFocus?.(event);
      }}
      {...props}
    />
  );
}

/**
 * App-owned PopoverContent with pointer-events cleanup on close. A non-modal
 * popover never blocks the body, but a `modal` one does, so route both through
 * here. HoverCard has no App wrapper: it is never modal and exposes no close
 * hook to clean up from.
 */
export function AppPopoverContent({
  onCloseAutoFocus,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverContent
      onCloseAutoFocus={(event) => {
        clearBodyPointerEventsIfSafe();
        onCloseAutoFocus?.(event);
      }}
      {...props}
    />
  );
}
