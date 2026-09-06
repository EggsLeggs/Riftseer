"use client";

import Link from "next/link";
import { EllipsisVerticalIcon } from "lucide-react";

import { AppDropdownMenuContent } from "@/components/layout/clear-body-pointer-events";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deckRevisionsHref, importDeckHref } from "../paths";
import type { DeckDetail } from "../types";

/**
 * The list toolbar's overflow: things the page already does, gathered the way
 * a Moxfield "More" menu is — two columns, destructive at the bottom right.
 *
 * Only actions we actually have. Duplicate, compare, playtest sheets, sell
 * and bulk printing swaps are absent because the product does not do them.
 */
export function DeckMoreMenu({
  deck,
  canEdit,
  isOwner,
  onExport,
  onDetails,
  onShare,
  onDelete,
}: {
  deck: DeckDetail;
  canEdit: boolean;
  isOwner: boolean;
  onExport: () => void;
  onDetails: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const showRight = canEdit || isOwner;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs"
          aria-label="More deck actions"
        >
          <EllipsisVerticalIcon className="size-3.5" aria-hidden="true" />
          More
        </Button>
      </DropdownMenuTrigger>
      <AppDropdownMenuContent align="start" className="min-w-64 p-0">
        <div className={showRight ? "grid grid-cols-2" : undefined}>
          <div className={showRight ? "flex flex-col border-r p-1" : "flex flex-col p-1"}>
            <DropdownMenuItem asChild>
              <Link href={importDeckHref()}>Import</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onExport}>Export</DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={deckRevisionsHref(deck)}>View history</Link>
            </DropdownMenuItem>
          </div>
          {showRight && (
            <div className="flex flex-col p-1">
              {canEdit && (
                <DropdownMenuItem onSelect={onDetails}>Details</DropdownMenuItem>
              )}
              {isOwner && (
                <DropdownMenuItem onSelect={onShare}>Collaborators</DropdownMenuItem>
              )}
              {isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </div>
          )}
        </div>
      </AppDropdownMenuContent>
    </DropdownMenu>
  );
}
