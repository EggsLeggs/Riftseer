"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Radix modal layers (DropdownMenu, Dialog, etc.) set `pointer-events: none` on
 * `document.body` while open. Soft navigation can unmount them before cleanup,
 * leaving the page unclickable after back/forward. Clear on every route change.
 */
export function ClearBodyPointerEventsOnNavigate() {
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.pointerEvents = "";
  }, [pathname]);

  return null;
}
