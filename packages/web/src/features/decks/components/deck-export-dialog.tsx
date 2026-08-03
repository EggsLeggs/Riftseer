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
 * Fetched on open rather than with the deck: an export is a deliberate act and
 * the text is the server's rendering, not something the builder should try to
 * reproduce from its own state.
 */
export function DeckExportDialog({
  deckId,
  isSignedIn,
  open,
  onOpenChange,
}: {
  deckId: string;
  /** Signed out, the token-less client reads it — a public deck exports fine. */
  isSignedIn: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const exported = useQuery({
    queryKey: deckQueryKeys.export(deckId),
    queryFn: async () => {
      if (!isSignedIn) {
        const text = await decksApi.exportDeck(deckId);
        if (!text) throw new Error("This deck cannot be exported.");
        return text;
      }
      const result = await exportDeckAction(deckId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: open,
    staleTime: 0,
    retry: false,
  });

  const copy = React.useCallback(async () => {
    if (!exported.data) return;
    try {
      await navigator.clipboard.writeText(exported.data.text);
      toast.success("Deck list copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy manually.");
    }
  }, [exported.data]);

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

        {exported.isPending ? (
          <p className="text-muted-foreground text-sm">Building the list…</p>
        ) : exported.isError ? (
          <p className="text-destructive text-sm">{(exported.error as Error).message}</p>
        ) : (
          <Textarea
            readOnly
            value={exported.data.text}
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
          <Button onClick={copy} disabled={!exported.data}>
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
