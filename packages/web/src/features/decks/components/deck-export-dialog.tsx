"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { exportDeckAction } from "../actions";
import { deckQueryKeys, decksApi } from "../api";

/**
 * The deck as Moxfield-style text, which the importer round-trips.
 *
 * A saved deck's list is fetched on open rather than shipped with the deck: an
 * export is a deliberate act and the text is the server's rendering, not
 * something the builder should try to reproduce from its own state.
 *
 * A deck that exists only in the browser has no server rendering to fetch, so
 * it passes `text` and this renders it. That is the one branch, rather than a
 * second dialog: the copy button, the select-on-focus and the wording are the
 * part worth having once.
 */
export function DeckExportDialog({
  deckId,
  isSignedIn = false,
  text,
  open,
  onOpenChange,
}: {
  /** Absent for a guest deck, which is not on the server to be exported. */
  deckId?: string;
  /** Signed out, the token-less client reads it — a public deck exports fine. */
  isSignedIn?: boolean;
  /** A pre-rendered list. Supplying it skips the fetch entirely. */
  text?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const local = text !== undefined;
  const exported = useQuery({
    queryKey: deckQueryKeys.export(deckId ?? ""),
    queryFn: async () => {
      if (!deckId) throw new Error("This deck cannot be exported.");
      if (!isSignedIn) {
        const fetched = await decksApi.exportDeck(deckId);
        if (!fetched) throw new Error("This deck cannot be exported.");
        return fetched;
      }
      const result = await exportDeckAction(deckId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: open && !local && !!deckId,
    staleTime: 0,
    // Dropped as soon as the dialog closes rather than kept under a key that
    // only names the deck. The cache outlives a sign-out or an account switch,
    // and a protected deck's text must not be readable by whoever is holding
    // the tab next — an export is fetched fresh or not shown.
    gcTime: 0,
    retry: false,
  });

  const value = local ? text : exported.data?.text;

  const copy = React.useCallback(async () => {
    if (value === undefined) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Deck list copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy manually.");
    }
  }, [value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export deck</DialogTitle>
          <DialogDescription>
            Plain text, grouped by zone. Paste it back into the importer to
            recreate the deck.
          </DialogDescription>
        </DialogHeader>

        {!local && exported.isError ? (
          <p className="text-destructive text-sm">{(exported.error as Error).message}</p>
        ) : value === undefined ? (
          <p className="text-muted-foreground text-sm">Building the list…</p>
        ) : (
          <Textarea
            readOnly
            value={value}
            rows={16}
            className="font-mono text-xs"
            aria-label="Deck list text"
            onFocus={(event) => event.currentTarget.select()}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={copy} disabled={value === undefined}>
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
