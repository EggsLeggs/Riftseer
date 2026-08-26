"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DownloadIcon, HistoryIcon, PencilIcon, Share2Icon, SlidersHorizontalIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { DeckAddCardDialog } from "@/features/decks/components/deck-add-card-dialog";
import { DeckCollapsible } from "@/features/decks/components/deck-collapsible";
import { DeckExportDialog } from "@/features/decks/components/deck-export-dialog";
import { DeckFooterBar } from "@/features/decks/components/deck-footer-bar";
import { DeckMetadataDialog } from "@/features/decks/components/deck-metadata-dialog";
import { DeckRevisionsPanel } from "@/features/decks/components/deck-revisions-panel";
import { DeckSharingPanel } from "@/features/decks/components/deck-sharing-panel";
import { DeckTokenList } from "@/features/decks/components/deck-token-list";
import { DeckViolationList } from "@/features/decks/components/deck-violation-list";
import { DeckZoneSection } from "@/features/decks/components/deck-zone";
import { indexDeckViolations } from "@/features/decks/deck-violations";
import {
  DECK_GROUP_MODE_LABELS,
  DECK_GROUP_MODES,
  deckZoneSections,
  type DeckGroupMode,
} from "@/features/decks/grouping";
import { useDeckEditor } from "@/features/decks/hooks/use-deck-editor";
import { useDeckMutations } from "@/features/decks/hooks/use-deck-mutations";
import {
  deckBuilderHref,
  deckHref,
  deckRevisionsHref,
  myDecksHref,
  userDecksHref,
} from "@/features/decks/paths";
import {
  canEditDeck,
  ownsDeck,
  type DeckDetail,
  type DeckZone,
} from "@/features/decks/types";
import { ConfirmDialog } from "@/views/admin/confirm-dialog";

/**
 * The deck page, in both of its states.
 *
 * One component rather than a viewer and a separate builder: the difference is
 * a handful of affordances on the same list, and two components would be two
 * places to fix every layout bug. `?edit=1` is what turns the steppers on, and
 * `canEditDeck(role)` is what decides whether that is allowed at all.
 *
 * The list itself is Moxfield-style text: grouped columns with a count and a
 * stepper, a footer that says what is in each zone and what is wrong with it,
 * and the secondary material collapsed underneath.
 */

interface DeckViewProps {
  deck: DeckDetail;
  /** `?edit=1` — already checked for permission and a session by the page. */
  editing: boolean;
  /** `?view=revisions`. */
  showRevisions: boolean;
  /**
   * Which read path the history and export panels take. A signed-out visitor
   * on a public deck reads them token-lessly rather than being told to sign in.
   */
  isSignedIn: boolean;
}

export function DeckView({ deck, editing, showRevisions, isSignedIn }: DeckViewProps) {
  const router = useRouter();
  const canEdit = canEditDeck(deck.role);
  const isOwner = ownsDeck(deck.role);
  const active = editing && canEdit;

  const [groupMode, setGroupMode] = React.useState<DeckGroupMode>("type");
  const [addZone, setAddZone] = React.useState<DeckZone | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [metadataOpen, setMetadataOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const initial = React.useMemo(
    () => ({ cards: deck.cards, tokens: deck.tokens, violations: deck.violations }),
    [deck.cards, deck.tokens, deck.violations],
  );
  const editor = useDeckEditor(deck.id, initial, active);
  const mutations = useDeckMutations(deck.id);

  const violationIndex = React.useMemo(
    () => indexDeckViolations(editor.violations),
    [editor.violations],
  );
  const sections = React.useMemo(() => deckZoneSections(editor.cards), [editor.cards]);
  const primary = sections.filter((section) => section.zone !== "considering");
  const considering = sections.find((section) => section.zone === "considering");

  const openAdd = React.useCallback((zone: DeckZone | null) => {
    setAddZone(zone);
    setAddOpen(true);
  }, []);

  return (
    <div className="container flex min-h-[60vh] flex-col py-8">
      <header className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{deck.name}</h1>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {deck.owner?.handle && (
                <Link href={userDecksHref(deck.owner.handle)} className="hover:underline">
                  @{deck.owner.handle}
                </Link>
              )}
              {deck.format && <span>{deck.format.name}</span>}
              {deck.visibility !== "public" && (
                <Badge variant="outline" className="capitalize">
                  {deck.visibility}
                </Badge>
              )}
              {deck.role && deck.role !== "owner" && (
                <Badge variant="secondary" className="capitalize">
                  {deck.role}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <Button variant="outline" size="sm" asChild>
                <Link href={active ? deckHref(deck) : deckBuilderHref(deck)}>
                  <PencilIcon className="size-3.5" aria-hidden="true" />
                  {active ? "Done" : "Edit"}
                </Link>
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setMetadataOpen(true)}>
                <SlidersHorizontalIcon className="size-3.5" aria-hidden="true" />
                Details
              </Button>
            )}
            {isOwner && (
              <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
                <Share2Icon className="size-3.5" aria-hidden="true" />
                Share
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
              <DownloadIcon className="size-3.5" aria-hidden="true" />
              Export
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={showRevisions ? deckHref(deck) : deckRevisionsHref(deck)}>
                <HistoryIcon className="size-3.5" aria-hidden="true" />
                {showRevisions ? "Deck" : "History"}
              </Link>
            </Button>
            {isOwner && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </Button>
            )}
          </div>
        </div>

        {deck.description && (
          <p className="text-muted-foreground max-w-3xl text-sm whitespace-pre-line">
            {deck.description}
          </p>
        )}

        {editing && !canEdit && (
          <p className="text-muted-foreground text-sm">
            You have read-only access to this deck.
          </p>
        )}
      </header>

      {showRevisions ? (
        <section className="flex-1">
          <h2 className="mb-3 text-sm font-semibold">Revision history</h2>
          <DeckRevisionsPanel deckId={deck.id} isSignedIn={isSignedIn} />
        </section>
      ) : (
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
            {active && (
              <Button size="sm" onClick={() => openAdd(null)}>
                Add card
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-8">
            {primary.map((section) =>
              section.cards.length === 0 && !active ? null : (
                <DeckZoneSection
                  key={section.zone}
                  zone={section.zone}
                  label={section.label}
                  cards={section.cards}
                  count={section.count}
                  groupMode={groupMode}
                  canEdit={active}
                  violations={violationIndex}
                  championable={section.zone === "main"}
                  onQuantityChange={editor.setQuantity}
                  onMoveZone={editor.moveZone}
                  onToggleChampion={editor.setChampion}
                  onAdd={openAdd}
                />
              ),
            )}
          </div>

          <div className="mt-8">
            <DeckCollapsible title="Tokens" count={editor.tokens.length}>
              <DeckTokenList tokens={editor.tokens} />
            </DeckCollapsible>

            <DeckCollapsible title="Considering" count={considering?.count ?? 0}>
              <DeckZoneSection
                zone="considering"
                label="Considering"
                cards={considering?.cards ?? []}
                count={considering?.count ?? 0}
                groupMode={groupMode}
                canEdit={active}
                violations={violationIndex}
                onQuantityChange={editor.setQuantity}
                onMoveZone={editor.moveZone}
                onAdd={openAdd}
                emptyHint="Cards parked here count toward nothing."
              />
            </DeckCollapsible>

            <DeckCollapsible title="Recent history" lazy>
              <DeckRevisionsPanel deckId={deck.id} isSignedIn={isSignedIn} />
            </DeckCollapsible>

            {violationIndex.deck.length > 0 && (
              <DeckCollapsible title="Deck notes" count={violationIndex.deck.length}>
                <DeckViolationList violations={violationIndex.deck} />
              </DeckCollapsible>
            )}
          </div>
        </div>
      )}

      <DeckFooterBar
        cards={editor.cards}
        violations={editor.violations}
        saving={editor.saving}
        dirty={active ? editor.dirty : undefined}
      />

      <DeckAddCardDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        zone={addZone}
        onAdd={(card, zone) => editor.addCard(card, { zone })}
      />

      <DeckMetadataDialog
        deck={deck}
        isOwner={isOwner}
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
      />

      <DeckExportDialog
        deckId={deck.id}
        isSignedIn={isSignedIn}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share “{deck.name}”</DialogTitle>
            <DialogDescription>
              Invite people to view or help build this deck.
            </DialogDescription>
          </DialogHeader>
          <DeckSharingPanel deck={deck} />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete deck"
        description={`“${deck.name}” and its revision history will be removed.`}
        confirmLabel="Delete deck"
        destructive
        pending={mutations.remove.isPending}
        onConfirm={() => {
          void mutations.remove
            .mutateAsync([deck.id])
            .then(() => router.push(myDecksHref()))
            .catch(() => setDeleteOpen(false));
        }}
      />
    </div>
  );
}
