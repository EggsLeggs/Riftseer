"use client";

import { ChevronDownIcon, ChevronUpIcon, PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import type { DeckDetail } from "../types";
import { DeckPrimer } from "./deck-primer";
import { DeckReturnButton } from "./deck-return-button";
import { DeckWorkspace, type DeckWorkspaceEditor } from "./deck-workspace";

/**
 * The guide as a page, not a strip under the list.
 *
 * The list is a pull-up drawer — a rounded handle, not a sticky footer — so a
 * reader can check a card without leaving the write-up, then fold it away.
 */
export function DeckGuideScreen({
  deck,
  editor,
  canEdit,
  onEdit,
}: {
  deck: DeckDetail;
  editor: DeckWorkspaceEditor;
  canEdit: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="container flex min-h-[60vh] flex-col py-8">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <DeckReturnButton deck={deck} />
        {canEdit && onEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={onEdit}
          >
            <PencilIcon className="size-3.5" aria-hidden="true" />
            Edit guide
          </Button>
        )}
      </div>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">{deck.name}</h1>

      {deck.primer ? (
        <DeckPrimer primer={deck.primer} />
      ) : (
        <p className="text-muted-foreground text-sm">
          {canEdit ? "No guide yet. Write one whenever you are ready." : "This deck has no guide."}
        </p>
      )}

      <Drawer>
        <div className="mt-10 flex justify-center">
          <DrawerTrigger className="bg-muted/80 hover:bg-muted inline-flex flex-col items-center gap-1.5 rounded-2xl px-6 py-3 text-sm font-medium shadow-sm">
            <span className="bg-foreground/25 h-1 w-10 rounded-full" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5">
              <ChevronUpIcon className="size-4" aria-hidden="true" />
              View deck
            </span>
          </DrawerTrigger>
        </div>
        <DrawerContent className="data-[vaul-drawer-direction=bottom]:h-[85vh] data-[vaul-drawer-direction=bottom]:max-h-[85vh]">
          <DrawerTitle className="sr-only">Deck list</DrawerTitle>
          <div className="flex justify-center px-4 pt-1 pb-3">
            <DrawerClose asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-3 text-xs"
              >
                <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                Hide deck
              </Button>
            </DrawerClose>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <DeckWorkspace editor={editor} canEdit={false} preview />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
