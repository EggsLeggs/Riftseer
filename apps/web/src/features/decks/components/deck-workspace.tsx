"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayersIcon, LayoutGridIcon, ListIcon, ShoppingBagIcon, TagIcon } from "lucide-react";

import { AppSelectContent } from "@/components/layout/clear-body-pointer-events";
import { Button } from "@/components/ui/button";
import { Select, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CardQuickView } from "@/features/cards/card-quick-view";
import { DeckAddCardDialog } from "@/features/decks/components/deck-add-card-dialog";
import { DeckAddCardSearch } from "@/features/decks/components/deck-add-card-search";
import {
  DeckBulkEditButton,
  DeckBulkEditDialog,
} from "@/features/decks/components/deck-bulk-edit-dialog";
import { DeckBuyDialog } from "@/features/decks/components/deck-buy-dialog";
import { DeckCardPreview, defaultPreviewCard } from "@/features/decks/components/deck-card-preview";
import { DeckCollapsible } from "@/features/decks/components/deck-collapsible";
import { DeckDndContext, DeckZoneDropArea } from "@/features/decks/components/deck-dnd";
import { DeckPrintingPicker } from "@/features/decks/components/deck-printing-picker";
import { DeckFooterBar } from "@/features/decks/components/deck-footer-bar";
import { DeckStatsPanel } from "@/features/decks/components/deck-stats-panel";
import { DeckViolationList } from "@/features/decks/components/deck-violation-list";
import { DeckZoneSection } from "@/features/decks/components/deck-zone";
import { indexDeckViolations } from "@/features/decks/deck-violations";
import type { AddableCard } from "@riftseer/types/deck/add";
import {
  DECK_GROUP_MODE_LABELS,
  DECK_GROUP_MODES,
  deckDisplayOrder,
  deckZoneSections,
  type DeckGroupMode,
} from "@riftseer/types/deck/grouping";
import {
  DECK_LIST_VIEW_LABELS,
  DECK_LIST_VIEWS,
  parseDeckListView,
  type DeckListView,
} from "@/features/decks/deck-views";
import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";
import type { DeckCard, DeckToken, DeckViolation, DeckZone } from "@/features/decks/types";
import type { Printing } from "@riftseer/types";

/**
 * The deck page's body: the grouped list, its rail, its dialogs and its
 * footer. The signed-in deck page and the guest builder both render exactly
 * this — a second builder is the thing this component exists to avoid — and
 * each wraps it in its own chrome (banner and actions there, name and format
 * fields here). Guide is `toolbarStart`, More is `toolbarEnd`; Bulk and Buy are shared.
 *
 * The editor prop is the common surface `useDeckEditor` and `useGuestDeck`
 * already share; the workspace never knows which one it holds.
 */
export interface DeckWorkspaceEditor {
  cards: DeckCard[];
  violations: DeckViolation[];
  /** Present only where saving is a request rather than a `setItem`. */
  saving?: boolean;
  dirty?: boolean;
  setQuantity: (
    card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "is_champion">,
    quantity: number,
  ) => void;
  addCard: (card: AddableCard, options?: { zone?: DeckZone | null; copies?: number }) => void;
  moveZone: (
    card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "quantity" | "is_champion">,
    zone: DeckZone,
  ) => void;
  setChampion: (
    card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "quantity">,
    isChampion: boolean,
  ) => void;
  changePrinting: (
    card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "quantity" | "is_champion">,
    printing: AddableCard,
  ) => void;
}

interface DeckWorkspaceProps {
  editor: DeckWorkspaceEditor;
  canEdit: boolean;
  /** Keeps the add buttons dead while the stored guest deck is still loading. */
  addDisabled?: boolean;
  /** Deck-only collapsibles (tokens) rendered above the shared ones. */
  collapsiblesBefore?: React.ReactNode;
  /** Deck-only collapsibles (revision history) rendered below the shared ones. */
  collapsiblesAfter?: React.ReactNode;
  /** Opens the tags dialog — supplied by the deck page, absent for guests. */
  onEditTags?: (card: DeckCard) => void;
  /**
   * Left of Buy (Guide). Bulk edit and Buy live here; More is `toolbarEnd`.
   */
  toolbarStart?: React.ReactNode;
  /** Right of Buy (More). */
  toolbarEnd?: React.ReactNode;
  /** Derived tokens, for the buy dialog's optional include. Guests have none. */
  tokens?: readonly DeckToken[];
  /**
   * The list as a reader-only preview (guide drawer): view/group/tags and the
   * rail, no buy/export chrome, no footer, no edits.
   */
  preview?: boolean;
}

export function DeckWorkspace({
  editor,
  canEdit,
  addDisabled = false,
  collapsiblesBefore,
  collapsiblesAfter,
  onEditTags,
  toolbarStart,
  toolbarEnd,
  tokens = [],
  preview = false,
}: DeckWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { accessibility, patchAccessibility } = useSitePreferences();

  // Both controls are the stored preference until touched, exactly like the
  // search page's layout toggle; `?display=` overrides the view so a shared
  // link shows what its sender was looking at.
  const [groupOverride, setGroupOverride] = React.useState<DeckGroupMode | null>(null);
  const groupMode = groupOverride ?? accessibility.deckGroupMode;
  const setGroupMode = (mode: DeckGroupMode) => {
    setGroupOverride(mode);
    patchAccessibility({ deckGroupMode: mode });
  };

  const view = parseDeckListView(searchParams.get("display")) ?? accessibility.deckListView;
  const showTags = accessibility.deckShowTags;
  const setView = (next: DeckListView) => {
    patchAccessibility({ deckListView: next });
    const params = new URLSearchParams(searchParams.toString());
    params.set("display", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const [addZone, setAddZone] = React.useState<DeckZone | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  // The preview sticks to the last card pointed at rather than clearing on the
  // way out: a rail that empties whenever the cursor crosses a gap flickers.
  const [pointedAt, setPointedAt] = React.useState<DeckCard | null>(null);
  const [openedCard, setOpenedCard] = React.useState<DeckCard | null>(null);
  const [reprinting, setReprinting] = React.useState<DeckCard | null>(null);
  const [buyOpen, setBuyOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const violationIndex = React.useMemo(
    () => indexDeckViolations(editor.violations),
    [editor.violations],
  );
  const sections = React.useMemo(() => deckZoneSections(editor.cards), [editor.cards]);
  const primary = sections.filter((section) => section.zone !== "considering");
  const considering = sections.find((section) => section.zone === "considering");

  // A pointed-at card that has since been removed must not keep the rail on a
  // card the deck no longer has.
  const previewCard =
    (pointedAt && editor.cards.find((card) => card.printing_id === pointedAt.printing_id)) ||
    defaultPreviewCard(editor.cards);

  // What Prev and Next in the quick view walk: the order on screen, which the
  // grouping select changes.
  const displayOrder = React.useMemo(
    () => deckDisplayOrder(editor.cards, groupMode),
    [editor.cards, groupMode],
  );

  const openAdd = React.useCallback((zone: DeckZone | null) => {
    setAddZone(zone);
    setAddOpen(true);
  }, []);

  // The picker hands back a `Printing`; the editor wants an `AddableCard`,
  // because a guest's new row has no server answer coming and must be described
  // here. Rules fields come from the old row — same oracle, same rules — and
  // the display fields from the printing chosen.
  const changePrinting = React.useCallback(
    (card: DeckCard, printing: Printing) => {
      editor.changePrinting(card, {
        oracle_id: card.oracle_id,
        printing_id: printing.id,
        card_type: card.card_type,
        supertype: card.supertype,
        is_token: card.is_token,
        name: card.name,
        domains: card.domains as string[],
        energy: card.energy,
        might: card.might,
        power: card.power,
        set_code: printing.set?.set_code ?? null,
        collector_number: printing.collector_number ?? null,
        rarity: printing.rarity ?? null,
        public_slug: printing.public_slug ?? null,
      });
    },
    [editor],
  );

  return (
    <DeckDndContext enabled={canEdit} onMoveZone={editor.moveZone}>
      {!preview && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {toolbarStart}
          {canEdit && <DeckBulkEditButton onClick={() => setBulkOpen(true)} />}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={() => setBuyOpen(true)}
          >
            <ShoppingBagIcon className="size-3.5" aria-hidden="true" />
            Buy
          </Button>
          {toolbarEnd}
          {canEdit && (
            <DeckAddCardSearch
              disabled={addDisabled}
              onAdd={(card, zone) => editor.addCard(card, { zone })}
              className="sm:ml-auto"
            />
          )}
        </div>
      )}

      <div className="flex flex-1 gap-6">
        {/* In the art views the art is already on screen; the rail would repeat it. */}
        {view === "list" && <DeckCardPreview card={previewCard} className="hidden lg:block" />}

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Toggle
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs"
              pressed={showTags}
              onPressedChange={(pressed) => patchAccessibility({ deckShowTags: pressed })}
              aria-label={showTags ? "Hide card tags" : "Show card tags"}
            >
              <TagIcon className="size-3.5" aria-hidden="true" />
              Tags
            </Toggle>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                spacing={0}
                variant="outline"
                size="sm"
                value={view}
                onValueChange={(next) => {
                  if (next) setView(next as DeckListView);
                }}
                aria-label="Deck layout"
                className="h-8 items-stretch rounded-md"
              >
                {DECK_LIST_VIEWS.map((option) => (
                  <ToggleGroupItem
                    key={option}
                    value={option}
                    className="h-full min-h-0 gap-1.5 rounded-none px-2.5 text-xs first:!rounded-l-md last:!rounded-r-md"
                  >
                    {option === "list" ? (
                      <ListIcon className="size-3.5" aria-hidden="true" />
                    ) : option === "grid" ? (
                      <LayoutGridIcon className="size-3.5" aria-hidden="true" />
                    ) : (
                      <LayersIcon className="size-3.5" aria-hidden="true" />
                    )}
                    {DECK_LIST_VIEW_LABELS[option]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <label className="text-muted-foreground flex items-center gap-2 text-xs">
                Group by
                <Select value={groupMode} onValueChange={(v) => setGroupMode(v as DeckGroupMode)}>
                  <SelectTrigger aria-label="Group cards by" size="default">
                    <SelectValue />
                  </SelectTrigger>
                  <AppSelectContent>
                    {DECK_GROUP_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {DECK_GROUP_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </AppSelectContent>
                </Select>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-8">
            {primary.map((section) =>
              section.cards.length === 0 && !canEdit ? null : (
                <DeckZoneSection
                  key={section.zone}
                  zone={section.zone}
                  label={section.label}
                  cards={section.cards}
                  count={section.count}
                  groupMode={groupMode}
                  view={view}
                  canEdit={canEdit}
                  showTags={showTags}
                  violations={violationIndex}
                  championable={section.zone === "main"}
                  onQuantityChange={editor.setQuantity}
                  onMoveZone={editor.moveZone}
                  onToggleChampion={editor.setChampion}
                  onChangePrinting={canEdit ? setReprinting : undefined}
                  onEditTags={canEdit ? onEditTags : undefined}
                  onAdd={section.zone === "sideboard" ? openAdd : undefined}
                  onPreview={setPointedAt}
                  onOpenCard={setOpenedCard}
                />
              ),
            )}
          </div>

          {!preview && (
            <div className="mt-8">
              {collapsiblesBefore}

              {/* A second drop target for the same zone: the section inside is
                  invisible while the details element is closed. */}
              <DeckZoneDropArea zone="considering" id="considering-strip">
                <DeckCollapsible title="Considering" count={considering?.count ?? 0}>
                  <DeckZoneSection
                    zone="considering"
                    label="Considering"
                    cards={considering?.cards ?? []}
                    count={considering?.count ?? 0}
                    groupMode={groupMode}
                    view={view}
                    canEdit={canEdit}
                    showTags={showTags}
                    violations={violationIndex}
                    onQuantityChange={editor.setQuantity}
                    onMoveZone={editor.moveZone}
                    onChangePrinting={canEdit ? setReprinting : undefined}
                    onEditTags={canEdit ? onEditTags : undefined}
                    onPreview={setPointedAt}
                    onOpenCard={setOpenedCard}
                    hideHeader
                    emptyHint="Cards parked here count toward nothing."
                  />
                </DeckCollapsible>
              </DeckZoneDropArea>

              {collapsiblesAfter}

              {violationIndex.deck.length > 0 && (
                <DeckCollapsible title="Deck notes" count={violationIndex.deck.length}>
                  <DeckViolationList violations={violationIndex.deck} />
                </DeckCollapsible>
              )}
            </div>
          )}
        </div>
      </div>

      {!preview && (
        <>
          {/* Full width, outside the list's flex row: the statistics describe the
              whole deck rather than the column the list happens to occupy. */}
          <section className="mt-10" aria-label="Deck statistics">
            <h2 className="mb-4 text-sm font-semibold">Statistics</h2>
            <DeckStatsPanel cards={editor.cards} />
          </section>

          <DeckFooterBar
            cards={editor.cards}
            violations={editor.violations}
            saving={editor.saving}
            dirty={canEdit ? editor.dirty : undefined}
          />
        </>
      )}

      <CardQuickView
        target={openedCard}
        siblings={displayOrder}
        onSelect={setOpenedCard}
        onOpenChange={(open) => !open && setOpenedCard(null)}
      />

      <DeckAddCardDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        zone={addZone}
        onAdd={(card, zone) => editor.addCard(card, { zone })}
      />

      <DeckPrintingPicker
        card={reprinting}
        onOpenChange={(open) => !open && setReprinting(null)}
        onSelect={changePrinting}
      />

      <DeckBuyDialog
        cards={editor.cards}
        tokens={tokens}
        open={buyOpen}
        onOpenChange={setBuyOpen}
      />

      <DeckBulkEditDialog editor={editor} open={bulkOpen} onOpenChange={setBulkOpen} />
    </DeckDndContext>
  );
}
