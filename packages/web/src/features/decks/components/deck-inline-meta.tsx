"use client";

import * as React from "react";

import { Textarea } from "@/components/ui/textarea";
import { useDeckMutations } from "../hooks/use-deck-mutations";
import { cn } from "@/lib/utils";
import type { DeckDetail } from "../types";

/**
 * The deck's name and description, edited in place: click the text, type, and
 * blur or Enter commits through the same `PATCH /decks/:id` the Details dialog
 * uses. Readers get plain text; there is no pencil, because the text itself is
 * the control.
 *
 * A rename changes the URL's cosmetic tail only on the next navigation — the
 * id is the identity, so the stale tail keeps resolving.
 */

const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;

export function DeckEditableTitle({ deck, canEdit }: { deck: DeckDetail; canEdit: boolean }) {
  const mutations = useDeckMutations(deck.id);
  const [draft, setDraft] = React.useState<string | null>(null);
  const heading = "mt-1 text-2xl font-semibold tracking-tight sm:text-3xl";

  if (!canEdit) return <h1 className={heading}>{deck.name}</h1>;

  if (draft === null) {
    return (
      <h1 className={heading}>
        <button
          type="button"
          title="Click to rename"
          onClick={() => setDraft(deck.name)}
          className="text-left"
        >
          {deck.name}
        </button>
      </h1>
    );
  }

  const commit = (raw: string) => {
    setDraft(null);
    const name = raw.trim();
    if (!name || name === deck.name) return;
    void mutations.patch.mutateAsync([deck.id, { name }]).catch(() => {});
  };

  return (
    <input
      autoFocus
      value={draft}
      maxLength={NAME_MAX}
      aria-label="Deck name"
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget.value);
        }
        if (event.key === "Escape") setDraft(null);
      }}
      className={cn(
        heading,
        "border-input bg-background/60 focus-visible:ring-ring -mx-1 block w-full max-w-xl rounded border px-1 outline-none focus-visible:ring-2",
      )}
    />
  );
}

export function DeckEditableDescription({ deck, canEdit }: { deck: DeckDetail; canEdit: boolean }) {
  const mutations = useDeckMutations(deck.id);
  const [draft, setDraft] = React.useState<string | null>(null);

  if (draft !== null) {
    const commit = (raw: string) => {
      setDraft(null);
      const description = raw.trim();
      if (description === (deck.description ?? "")) return;
      void mutations.patch
        .mutateAsync([deck.id, { description: description || null }])
        .catch(() => {});
    };

    return (
      <Textarea
        autoFocus
        value={draft}
        rows={2}
        maxLength={DESCRIPTION_MAX}
        aria-label="Deck description"
        placeholder="One or two lines about the deck…"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          // Enter commits — a description is a line or two, and Shift+Enter
          // still breaks one when it truly needs to.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            commit(event.currentTarget.value);
          }
          if (event.key === "Escape") setDraft(null);
        }}
        className="bg-background/60 mt-3 max-w-2xl text-sm"
      />
    );
  }

  if (!deck.description) {
    if (!canEdit) return null;
    return (
      <button
        type="button"
        onClick={() => setDraft("")}
        className="text-muted-foreground/70 hover:text-muted-foreground mt-3 block text-sm italic"
      >
        Add a description…
      </button>
    );
  }

  const text = <p className="mt-3 text-sm whitespace-pre-line">{deck.description}</p>;
  if (!canEdit) {
    return <div className="text-muted-foreground">{text}</div>;
  }
  return (
    <button
      type="button"
      title="Click to edit the description"
      onClick={() => setDraft(deck.description ?? "")}
      className="text-muted-foreground hover:text-foreground block max-w-2xl text-left"
    >
      {text}
    </button>
  );
}
