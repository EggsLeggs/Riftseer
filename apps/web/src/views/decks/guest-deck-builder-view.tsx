"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon, LogInIcon, RotateCcwIcon } from "lucide-react";
import { formatDeckText } from "@riftseer/types/deck-text";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { DeckExportDialog } from "@/features/decks/components/deck-export-dialog";
import { DeckWorkspace } from "@/features/decks/components/deck-workspace";
import { formatSelectOptions, formatsApi, formatsQueryKeys } from "@/features/decks/formats";
import {
  GUEST_DECK_DEFAULT_FORMAT,
  guestDeckTextCards,
  isGuestDeckEmpty,
} from "@riftseer/types/deck/guest-deck";
import { useGuestDeck } from "@/features/decks/hooks/use-guest-deck";
import { importDeckHref, signInToSaveDeckHref } from "@/features/decks/paths";

/**
 * `/decks/new`, signed out: the builder, with the deck in localStorage.
 *
 * The body is `DeckWorkspace` — the exact component the signed-in deck page
 * renders. The only two things this view supplies differently are the editor
 * (`useGuestDeck` in place of `useDeckEditor`) and the export source (rendered
 * here rather than fetched), because those are the only two things being
 * signed out actually changes. Tokens and revision history are absent rather
 * than faked: both are derived server-side from data a browser does not have,
 * and an empty panel claiming otherwise would be a lie.
 */
export function GuestDeckBuilderView() {
  const formats = useQuery({
    queryKey: formatsQueryKeys.list(),
    queryFn: () => formatsApi.list(),
    staleTime: 5 * 60_000,
  });

  const editor = useGuestDeck(formats.data ?? []);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);

  const exportText = React.useMemo(
    () => (editor.deck ? formatDeckText(guestDeckTextCards(editor.deck)) : ""),
    [editor.deck],
  );

  // The format list arrives after the deck does. Defaulting once it lands, and
  // only when the stored code is not among the options, keeps a deck built in
  // some other format from being silently re-homed on every mount.
  const options = formatSelectOptions(formats.data ?? []);
  // The selector must always name the format the deck is actually validated
  // against. Falling back to the default when the stored code is unknown would
  // show one format and report violations from another — and if the default is
  // itself absent from `options` the value matches no option at all, which the
  // browser renders as the first one. An unknown code gets its own disabled
  // option instead, so what is displayed is always what is being judged.
  const storedFormat = editor.deck?.format ?? GUEST_DECK_DEFAULT_FORMAT;
  const unknownFormat =
    options.length > 0 && !options.some((option) => option.value === storedFormat);

  const empty = isGuestDeckEmpty(editor.deck);

  return (
    <div className="container flex min-h-[60vh] flex-col py-8">
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">New deck</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Building without an account. This deck is kept in this browser — sign in whenever you
              want to save it, or{" "}
              <Link href={importDeckHref()} className="underline underline-offset-4">
                import a list
              </Link>{" "}
              once you have.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" asChild>
              <Link href={signInToSaveDeckHref()}>
                <LogInIcon className="size-3.5" aria-hidden="true" />
                Sign in to save
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
              <DownloadIcon className="size-3.5" aria-hidden="true" />
              Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={empty}
              onClick={() => setResetOpen(true)}
            >
              <RotateCcwIcon className="size-3.5" aria-hidden="true" />
              Start over
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-56 flex-col gap-1.5">
            <Label htmlFor="guest-deck-name">Name</Label>
            <Input
              id="guest-deck-name"
              value={editor.deck?.name ?? ""}
              maxLength={120}
              placeholder="Yasuo Aggro"
              disabled={!editor.ready}
              onChange={(event) => editor.setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guest-deck-format">Format</Label>
            <select
              id="guest-deck-format"
              className={CARD_BROWSE_SELECT_CLASS}
              value={storedFormat}
              disabled={!editor.ready || options.length === 0}
              onChange={(event) => editor.setFormat(event.target.value)}
            >
              {options.length === 0 ? (
                <option value={GUEST_DECK_DEFAULT_FORMAT}>Standard</option>
              ) : (
                <>
                  {unknownFormat && (
                    <option value={storedFormat} disabled>
                      {storedFormat} (unavailable)
                    </option>
                  )}
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>
      </header>

      <DeckWorkspace editor={editor} canEdit addDisabled={!editor.ready} />

      <DeckExportDialog text={exportText} open={exportOpen} onOpenChange={setExportOpen} />

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Start over"
        description="This deck is only in this browser, so clearing it cannot be undone. Export the list first if you want to keep it."
        confirmLabel="Clear deck"
        destructive
        onConfirm={() => {
          editor.reset();
          setResetOpen(false);
        }}
      />
    </div>
  );
}
