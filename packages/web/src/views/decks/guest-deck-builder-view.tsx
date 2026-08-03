"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon, LogInIcon, RotateCcwIcon } from "lucide-react";
import { formatDeckText } from "@riftseer/types/deck-text";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { DeckAddCardDialog } from "@/features/decks/components/deck-add-card-dialog";
import { DeckCollapsible } from "@/features/decks/components/deck-collapsible";
import { DeckExportDialog } from "@/features/decks/components/deck-export-dialog";
import { DeckFooterBar } from "@/features/decks/components/deck-footer-bar";
import { DeckViolationList } from "@/features/decks/components/deck-violation-list";
import { DeckZoneSection } from "@/features/decks/components/deck-zone";
import { indexDeckViolations } from "@/features/decks/deck-violations";
import {
  formatSelectOptions,
  formatsApi,
  formatsQueryKeys,
} from "@/features/decks/formats";
import {
  GUEST_DECK_DEFAULT_FORMAT,
  guestDeckTextCards,
  isGuestDeckEmpty,
} from "@/features/decks/guest-deck";
import { useGuestDeck } from "@/features/decks/hooks/use-guest-deck";
import {
  DECK_GROUP_MODE_LABELS,
  DECK_GROUP_MODES,
  deckZoneSections,
  type DeckGroupMode,
} from "@/features/decks/grouping";
import { importDeckHref, signInToSaveDeckHref } from "@/features/decks/paths";
import type { DeckZone } from "@/features/decks/types";
import { ConfirmDialog } from "@/views/admin/confirm-dialog";

/**
 * `/decks/new`, signed out: the builder, with the deck in localStorage.
 *
 * Every list, row, violation marker and footer count below is the component the
 * signed-in builder uses. The only two things this view supplies differently
 * are the editor (`useGuestDeck` in place of `useDeckEditor`) and the export
 * source (rendered here rather than fetched), because those are the only two
 * things being signed out actually changes. Tokens and revision history are
 * absent rather than faked: both are derived server-side from data a browser
 * does not have, and an empty panel claiming otherwise would be a lie.
 */
export function GuestDeckBuilderView() {
  const formats = useQuery({
    queryKey: formatsQueryKeys.list(),
    queryFn: () => formatsApi.list(),
    staleTime: 5 * 60_000,
  });

  const editor = useGuestDeck(formats.data ?? []);
  const [groupMode, setGroupMode] = React.useState<DeckGroupMode>("type");
  const [addZone, setAddZone] = React.useState<DeckZone | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);

  const violationIndex = React.useMemo(
    () => indexDeckViolations(editor.violations),
    [editor.violations],
  );
  const sections = React.useMemo(() => deckZoneSections(editor.cards), [editor.cards]);
  const primary = sections.filter((section) => section.zone !== "considering");
  const considering = sections.find((section) => section.zone === "considering");

  const exportText = React.useMemo(
    () => (editor.deck ? formatDeckText(guestDeckTextCards(editor.deck)) : ""),
    [editor.deck],
  );

  const openAdd = React.useCallback((zone: DeckZone | null) => {
    setAddZone(zone);
    setAddOpen(true);
  }, []);

  // The format list arrives after the deck does. Defaulting once it lands, and
  // only when the stored code is not among the options, keeps a deck built in
  // some other format from being silently re-homed on every mount.
  const options = formatSelectOptions(formats.data ?? []);
  const formatValue =
    editor.deck && options.some((option) => option.value === editor.deck?.format)
      ? editor.deck.format
      : GUEST_DECK_DEFAULT_FORMAT;

  const empty = isGuestDeckEmpty(editor.deck);

  return (
    <div className="container flex min-h-[60vh] flex-col py-8">
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">New deck</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Building without an account. This deck is kept in this browser —
              sign in whenever you want to save it, or{" "}
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
              value={formatValue}
              disabled={!editor.ready || options.length === 0}
              onChange={(event) => editor.setFormat(event.target.value)}
            >
              {options.length === 0 ? (
                <option value={GUEST_DECK_DEFAULT_FORMAT}>Standard</option>
              ) : (
                options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            Group by
            <select
              aria-label="Group cards by"
              className={CARD_BROWSE_SELECT_CLASS}
              value={groupMode}
              onChange={(event) => setGroupMode(event.target.value as DeckGroupMode)}
            >
              {DECK_GROUP_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {DECK_GROUP_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" disabled={!editor.ready} onClick={() => openAdd(null)}>
            Add card
          </Button>
        </div>

        <div className="flex flex-col gap-8">
          {primary.map((section) => (
            <DeckZoneSection
              key={section.zone}
              zone={section.zone}
              label={section.label}
              cards={section.cards}
              count={section.count}
              groupMode={groupMode}
              canEdit
              violations={violationIndex}
              championable={section.zone === "main"}
              onQuantityChange={editor.setQuantity}
              onMoveZone={editor.moveZone}
              onToggleChampion={editor.setChampion}
              onAdd={openAdd}
            />
          ))}
        </div>

        <div className="mt-8">
          <DeckCollapsible title="Considering" count={considering?.count ?? 0}>
            <DeckZoneSection
              zone="considering"
              label="Considering"
              cards={considering?.cards ?? []}
              count={considering?.count ?? 0}
              groupMode={groupMode}
              canEdit
              violations={violationIndex}
              onQuantityChange={editor.setQuantity}
              onMoveZone={editor.moveZone}
              onAdd={openAdd}
              emptyHint="Cards parked here count toward nothing."
            />
          </DeckCollapsible>

          {violationIndex.deck.length > 0 && (
            <DeckCollapsible title="Deck notes" count={violationIndex.deck.length}>
              <DeckViolationList violations={violationIndex.deck} />
            </DeckCollapsible>
          )}
        </div>
      </div>

      <DeckFooterBar cards={editor.cards} violations={editor.violations} />

      <DeckAddCardDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        zone={addZone}
        onAdd={(card, zone) => editor.addCard(card, { zone })}
      />

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
