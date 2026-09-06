"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProfileIcon } from "@/components/profile-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeckBanner } from "@/features/decks/components/deck-banner";
import { DeckCardTagsDialog } from "@/features/decks/components/deck-card-tags-dialog";
import { DeckCollapsible } from "@/features/decks/components/deck-collapsible";
import { DeckCommentsSection } from "@/features/decks/components/deck-comments-section";
import { DeckExportDialog } from "@/features/decks/components/deck-export-dialog";
import {
  DeckHeaderActions,
  DeckHeaderControls,
} from "@/features/decks/components/deck-header-controls";
import { DeckMoreMenu } from "@/features/decks/components/deck-more-menu";
import { DeckGuideButton, DeckPrimerEditor } from "@/features/decks/components/deck-primer-editor";
import {
  DeckEditableDescription,
  DeckEditableTitle,
} from "@/features/decks/components/deck-inline-meta";
import { DeckMetadataDialog } from "@/features/decks/components/deck-metadata-dialog";
import { DeckGuideScreen } from "@/features/decks/components/deck-guide-screen";
import { DeckReturnButton } from "@/features/decks/components/deck-return-button";
import { DeckRevisionsPanel } from "@/features/decks/components/deck-revisions-panel";
import { DeckSharingPanel } from "@/features/decks/components/deck-sharing-panel";
import { DeckTokenList } from "@/features/decks/components/deck-token-list";
import { DeckWorkspace } from "@/features/decks/components/deck-workspace";
import { useDeckEditor } from "@/features/decks/hooks/use-deck-editor";
import { useDeckMutations } from "@/features/decks/hooks/use-deck-mutations";
import {
  deckGuideHref,
  deckRevisionsHref,
  myDecksHref,
  userDecksHref,
} from "@/features/decks/paths";
import { decksApi } from "@/features/decks/api";
import { canEditDeck, ownsDeck, type DeckCard, type DeckDetail } from "@/features/decks/types";

/**
 * The deck page. Modeless: `canEditDeck(role)` alone decides whether the edit
 * affordances exist, and they render quiet until a row is hovered or focused.
 * A reader sees the same page minus the controls — there is no builder URL and
 * no mode to leave.
 *
 * The list itself is `DeckWorkspace`, shared verbatim with the guest builder;
 * this view supplies only what a saved deck adds: the banner, the actions, the
 * token shelf and the revision history.
 */

interface DeckViewProps {
  deck: DeckDetail;
  /** `?view=revisions`. */
  showRevisions: boolean;
  /** `?view=guide`. */
  showGuide: boolean;
  /**
   * Which read path the history and export panels take. A signed-out visitor
   * on a public deck reads them token-lessly rather than being told to sign in.
   */
  isSignedIn: boolean;
}

export function DeckView({ deck, showRevisions, showGuide, isSignedIn }: DeckViewProps) {
  const router = useRouter();
  const canEdit = canEditDeck(deck.role);
  const isOwner = ownsDeck(deck.role);

  const [metadataOpen, setMetadataOpen] = React.useState(false);
  const [primerOpen, setPrimerOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [taggingCard, setTaggingCard] = React.useState<DeckCard | null>(null);

  const initial = React.useMemo(
    () => ({ cards: deck.cards, tokens: deck.tokens, violations: deck.violations }),
    [deck.cards, deck.tokens, deck.violations],
  );
  const editor = useDeckEditor(deck.id, initial, canEdit);
  const mutations = useDeckMutations(deck.id);

  // One ping per visit; the API refuses owners and deduplicates readers, so
  // firing unconditionally is simpler than guessing either here.
  React.useEffect(() => {
    void decksApi.countView(deck.id);
  }, [deck.id]);

  if (showGuide) {
    return (
      <>
        <DeckGuideScreen
          deck={deck}
          editor={editor}
          canEdit={canEdit}
          onEdit={() => setPrimerOpen(true)}
        />
        <DeckPrimerEditor
          deck={deck}
          open={primerOpen}
          onOpenChange={setPrimerOpen}
        />
      </>
    );
  }

  return (
    <div className="container flex min-h-[60vh] flex-col py-8">
      <DeckBanner cards={editor.cards} className="mb-6">
        <div className="max-w-2xl">
          {/* The person above the deck: a deck is named "X's Standard brew",
              never the other way round. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {deck.owner?.handle && (
              <Link
                href={userDecksHref(deck.owner.handle)}
                className="text-foreground hover:underline flex items-center gap-2 text-base font-semibold"
              >
                <ProfileIcon
                  username={deck.owner.username}
                  handle={deck.owner.handle}
                  size="md"
                />
                {deck.owner.username}
              </Link>
            )}
            {deck.role && deck.role !== "owner" && (
              <span className="border-border rounded border px-1.5 py-0.5 text-xs capitalize">
                {deck.role}
              </span>
            )}
          </div>
          <DeckEditableTitle deck={deck} canEdit={canEdit} />
          <DeckHeaderControls
            deck={deck}
            canEdit={canEdit}
            isOwner={isOwner}
            onBeforeFormatChange={editor.flush}
          />
          <DeckEditableDescription deck={deck} canEdit={canEdit} />
          <DeckHeaderActions
            deck={deck}
            isOwner={isOwner}
            isSignedIn={isSignedIn}
            onOpenShare={() => setShareOpen(true)}
          />
        </div>
      </DeckBanner>

      {showRevisions ? (
        <section className="flex-1">
          <div className="mb-6">
            <DeckReturnButton deck={deck} />
          </div>
          <h2 className="mb-3 text-sm font-semibold">Revision history</h2>
          <DeckRevisionsPanel deckId={deck.id} isSignedIn={isSignedIn} wide />
        </section>
      ) : (
        <DeckWorkspace
          editor={editor}
          canEdit={canEdit}
          onEditTags={setTaggingCard}
          tokens={editor.tokens}
          toolbarStart={
            canEdit || deck.primer ? (
              <DeckGuideButton href={deckGuideHref(deck)} />
            ) : null
          }
          toolbarEnd={
            <DeckMoreMenu
              deck={deck}
              canEdit={canEdit}
              isOwner={isOwner}
              onExport={() => setExportOpen(true)}
              onDetails={() => setMetadataOpen(true)}
              onShare={() => setShareOpen(true)}
              onDelete={() => setDeleteOpen(true)}
            />
          }
          collapsiblesBefore={
            <DeckCollapsible title="Tokens" count={editor.tokens.length}>
              <DeckTokenList tokens={editor.tokens} cards={editor.cards} />
            </DeckCollapsible>
          }
          collapsiblesAfter={
            <DeckCollapsible title="Recent history" lazy>
              <DeckRevisionsPanel deckId={deck.id} isSignedIn={isSignedIn} limit={5} />
              <Link
                href={deckRevisionsHref(deck)}
                className="text-muted-foreground mt-2 inline-block text-xs underline-offset-4 hover:underline"
              >
                View all history →
              </Link>
            </DeckCollapsible>
          }
        />
      )}

      {!showRevisions && (
        <div className="mt-10">
          <DeckCommentsSection deck={deck} isSignedIn={isSignedIn} />
        </div>
      )}

      <DeckCardTagsDialog
        deckId={deck.id}
        card={taggingCard}
        onOpenChange={(open) => !open && setTaggingCard(null)}
      />

      <DeckMetadataDialog
        deck={deck}
        isOwner={isOwner}
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
      />

      <DeckPrimerEditor
        deck={deck}
        open={primerOpen}
        onOpenChange={setPrimerOpen}
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
