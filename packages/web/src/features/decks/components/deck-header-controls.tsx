"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { EyeIcon, FolderPlusIcon, MessageSquareIcon, Share2Icon } from "lucide-react";

import {
  AppDropdownMenuContent,
  AppSelectContent,
} from "@/components/layout/clear-body-pointer-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createDeckFolderAction,
  listDeckFoldersAction,
  setDeckFolderMembershipAction,
} from "../actions";
import { deckQueryKeys } from "../api";
import { formatsApi, formatsQueryKeys } from "../formats";
import { useDeckComments } from "../hooks/use-deck-comments";
import { useDeckMutations } from "../hooks/use-deck-mutations";
import { cn } from "@/lib/utils";
import { DECK_VISIBILITY_OPTIONS } from "./deck-metadata-dialog";
import {
  DeckFavoriteButton,
  HEADER_ACTION_CLASS,
  HEADER_SELECT_CLASS,
  HeaderActionStat,
} from "./deck-favorite-button";
import type { DeckDetail, DeckPatch } from "../types";

/**
 * The header's two control rows, either side of the description.
 *
 * `DeckHeaderControls` is the deck's *settings* — format and visibility as
 * one-click dropdowns painted like the action chips. `DeckHeaderActions` is
 * what a reader *does* with the deck — favorite, share, file, see its counts.
 * Views is a figure, not a control. Comments jumps to `#comments`. Details,
 * export, history and delete live in the list toolbar's More menu.
 */
export function DeckHeaderControls({
  deck,
  canEdit,
  isOwner,
  onBeforeFormatChange,
}: {
  deck: DeckDetail;
  canEdit: boolean;
  isOwner: boolean;
  /** Flushes pending card edits, so a format switch re-validates all of them. */
  onBeforeFormatChange: () => void;
}) {
  const mutations = useDeckMutations(deck.id);
  const formats = useQuery({
    queryKey: formatsQueryKeys.list(),
    queryFn: () => formatsApi.list(),
    staleTime: 5 * 60_000,
    // A reader never opens the dropdown, so a reader never pays for the list.
    enabled: canEdit,
  });

  const formatOptions = formats.data ?? [];
  const currentFormat = deck.format;
  const knownFormat =
    currentFormat && formatOptions.some((option) => option.code === currentFormat.code);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {canEdit && formatOptions.length > 0 ? (
        <Select
          value={knownFormat ? currentFormat.code : undefined}
          disabled={mutations.patch.isPending}
          onValueChange={(code) => {
            if (code === currentFormat?.code) return;
            onBeforeFormatChange();
            void mutations.patch.mutateAsync([deck.id, { format: code }]).catch(() => {});
          }}
        >
          <SelectTrigger aria-label="Deck format" className={HEADER_SELECT_CLASS}>
            <SelectValue placeholder={currentFormat?.name ?? "Format"} />
          </SelectTrigger>
          <AppSelectContent>
            {formatOptions.map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.name}
              </SelectItem>
            ))}
          </AppSelectContent>
        </Select>
      ) : (
        currentFormat && (
          <HeaderActionStat label="Format">{currentFormat.name}</HeaderActionStat>
        )
      )}

      {isOwner ? (
        <Select
          value={deck.visibility}
          disabled={mutations.patch.isPending}
          onValueChange={(visibility) => {
            if (visibility === deck.visibility) return;
            void mutations.patch
              .mutateAsync([
                deck.id,
                { visibility: visibility as NonNullable<DeckPatch>["visibility"] },
              ])
              .catch(() => {});
          }}
        >
          <SelectTrigger
            aria-label="Deck visibility"
            className={cn(HEADER_SELECT_CLASS, "capitalize")}
          >
            <SelectValue />
          </SelectTrigger>
          <AppSelectContent>
            {DECK_VISIBILITY_OPTIONS.map((option) => (
              // The one-word value, not the explainer — the dialog keeps the
              // long form for anyone deciding what these mean.
              <SelectItem key={option.value} value={option.value} className="capitalize">
                {option.value}
              </SelectItem>
            ))}
          </AppSelectContent>
        </Select>
      ) : (
        deck.visibility !== "public" && (
          <HeaderActionStat label="Visibility">
            <span className="capitalize">{deck.visibility}</span>
          </HeaderActionStat>
        )
      )}
    </div>
  );
}

export function DeckHeaderActions({
  deck,
  isOwner,
  isSignedIn,
  onOpenShare,
}: {
  deck: DeckDetail;
  isOwner: boolean;
  isSignedIn: boolean;
  onOpenShare: () => void;
}) {
  const comments = useDeckComments(deck.id, isSignedIn);
  const commentCount = comments.data?.total ?? 0;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <DeckFavoriteButton deck={deck} isSignedIn={isSignedIn} />

      <HeaderActionStat label={`${deck.view_count.toLocaleString()} views`}>
        <EyeIcon className="size-3.5" aria-hidden="true" />
        <span className="tabular-nums">{compactCount(deck.view_count)}</span>
      </HeaderActionStat>

      <Button variant="outline" size="sm" className={HEADER_ACTION_CLASS} asChild>
        <a href="#comments" title="Jump to comments">
          <MessageSquareIcon className="size-3.5" aria-hidden="true" />
          <span className="tabular-nums">{compactCount(commentCount)}</span>
          <span className="sr-only">comments</span>
        </a>
      </Button>

      {isOwner && (
        <Button
          variant="outline"
          size="icon-sm"
          className={HEADER_ACTION_CLASS}
          onClick={onOpenShare}
          aria-label="Share this deck"
        >
          <Share2Icon className="size-3.5" aria-hidden="true" />
        </Button>
      )}

      {isSignedIn && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className={HEADER_ACTION_CLASS}
              aria-label="Add to folder"
            >
              <FolderPlusIcon className="size-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <AppDropdownMenuContent align="start" className="w-52">
            <DeckFolderMenuItems deckId={deck.id} />
          </AppDropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/**
 * "Add to folder": the caller's folders with membership checkmarks, plus a
 * one-line creator. Only mounted while its menu is open, so the folder list is
 * fetched on demand and shared with `/decks` through the query cache.
 */
function DeckFolderMenuItems({ deckId }: { deckId: string }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");

  const folders = useQuery({
    queryKey: deckQueryKeys.folders(deckId),
    queryFn: async () => {
      const result = await listDeckFoldersAction(deckId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30_000,
    retry: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: deckQueryKeys.all });

  const toggle = async (folderId: string, filed: boolean) => {
    const result = await setDeckFolderMembershipAction(folderId, deckId, filed);
    if (result.ok) void invalidate();
    else toast.error(result.error);
  };

  const create = async () => {
    const trimmed = name.trim();
    setCreating(false);
    setName("");
    if (!trimmed) return;
    const created = await createDeckFolderAction(trimmed);
    if (!created.ok) {
      toast.error(created.error);
      return;
    }
    await toggle(created.data.id, true);
  };

  return (
    <>
      {folders.isPending ? (
        <DropdownMenuItem disabled>Loading folders…</DropdownMenuItem>
      ) : (
        (folders.data?.items ?? []).map((folder) => (
          <DropdownMenuCheckboxItem
            key={folder.id}
            checked={folder.contains_deck ?? false}
            // Keep the menu open: filing into several folders is one visit.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => void toggle(folder.id, checked === true)}
          >
            {folder.name}
          </DropdownMenuCheckboxItem>
        ))
      )}
      <DropdownMenuSeparator />
      {creating ? (
        <div className="px-1.5 py-1">
          <Input
            autoFocus
            value={name}
            maxLength={80}
            placeholder="Folder name…"
            aria-label="New folder name"
            className="h-7 text-xs"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") void create();
              if (event.key === "Escape") {
                setCreating(false);
                setName("");
              }
            }}
          />
        </div>
      ) : (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setCreating(true);
          }}
        >
          New folder…
        </DropdownMenuItem>
      )}
    </>
  );
}

/** 1234 → "1.2k" — the header has room for a figure, not a number. */
function compactCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}
