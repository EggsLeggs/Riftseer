"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";

import { AppDialogContent } from "@/components/layout/clear-body-pointer-events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { setDeckCardTagsAction } from "../actions";
import type { DeckCard } from "../types";

/**
 * Editing one card's manual tags: chips plus a text field, saved wholesale.
 *
 * Tags key on the oracle, so both arts of a card share one list and a zone
 * move never drops them. The server trims, deduplicates and caps; this dialog
 * mirrors those rules only so what is shown before saving matches what will be
 * stored.
 */

const TAGS_MAX = 20;
const TAG_LENGTH_MAX = 40;

export function DeckCardTagsDialog({
  deckId,
  card,
  onOpenChange,
}: {
  deckId: string;
  /** The card whose tags are being edited, or null while closed. */
  card: DeckCard | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [tags, setTags] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Each opening starts from the card's current tags, not the last edit's.
  React.useEffect(() => {
    if (card) {
      setTags(card.tags);
      setDraft("");
    }
  }, [card]);

  const addDraft = () => {
    const tag = draft.trim().slice(0, TAG_LENGTH_MAX);
    setDraft("");
    if (!tag || tags.includes(tag) || tags.length >= TAGS_MAX) return;
    setTags([...tags, tag]);
  };

  const save = async () => {
    if (!card) return;
    setSaving(true);
    const result = await setDeckCardTagsAction(deckId, card.oracle_id, tags);
    setSaving(false);
    if (result.ok) {
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={card != null} onOpenChange={onOpenChange}>
      <AppDialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tags{card ? ` — ${card.name}` : ""}</DialogTitle>
          <DialogDescription>
            Your own labels for this card in this deck. Everyone who can see the deck sees them.
          </DialogDescription>
        </DialogHeader>

        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li
                key={tag}
                className="bg-muted flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  className="hover:bg-background rounded-full p-0.5"
                  onClick={() => setTags(tags.filter((existing) => existing !== tag))}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Input
          value={draft}
          maxLength={TAG_LENGTH_MAX}
          placeholder={tags.length >= TAGS_MAX ? "Tag limit reached" : "Add a tag…"}
          disabled={tags.length >= TAGS_MAX}
          aria-label="New tag"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addDraft();
            }
          }}
          onBlur={addDraft}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save tags"}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
