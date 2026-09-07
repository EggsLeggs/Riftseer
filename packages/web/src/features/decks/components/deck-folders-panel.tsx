"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { createDeckFolderAction, deleteDeckFolderAction, listDeckFoldersAction } from "../actions";
import { deckQueryKeys } from "../api";
import { cn } from "@/lib/utils";

/**
 * The folder rail on `/decks`: chips for each folder, selection, creation and
 * deletion. Deliberately v1-flat — no nesting, no ordering, no sharing — and
 * selection lives in the URL so a folder view is a sendable link.
 */
export function DeckFoldersPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (folderId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const folders = useQuery({
    queryKey: deckQueryKeys.folders(),
    queryFn: async () => {
      const result = await listDeckFoldersAction();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30_000,
    retry: false,
  });

  const items = folders.data?.items ?? [];
  const selected = items.find((folder) => folder.id === selectedId) ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: deckQueryKeys.all });

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreating(false);
      setName("");
      return;
    }
    const result = await createDeckFolderAction(trimmed);
    if (result.ok) {
      setName("");
      setCreating(false);
      void refresh();
      onSelect(result.data.id);
    } else {
      toast.error(result.error);
    }
  };

  if (folders.isError) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "rounded-full border px-3 py-1 text-xs",
          selectedId === null
            ? "border-foreground/30 bg-muted font-medium"
            : "border-border text-muted-foreground hover:bg-muted/50",
        )}
      >
        All decks
      </button>
      {items.map((folder) => (
        <button
          key={folder.id}
          type="button"
          onClick={() => onSelect(folder.id === selectedId ? null : folder.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
            folder.id === selectedId
              ? "border-foreground/30 bg-muted font-medium"
              : "border-border text-muted-foreground hover:bg-muted/50",
          )}
        >
          <FolderIcon className="size-3" aria-hidden="true" />
          {folder.name}
          <span className="tabular-nums opacity-70">{folder.deck_count}</span>
        </button>
      ))}

      {creating ? (
        <Input
          autoFocus
          value={name}
          maxLength={80}
          placeholder="Folder name…"
          aria-label="New folder name"
          className="h-7 w-40 text-xs"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void create();
            if (event.key === "Escape") {
              setCreating(false);
              setName("");
            }
          }}
          onBlur={() => void create()}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setCreating(true)}
        >
          <PlusIcon className="size-3" aria-hidden="true" />
          New folder
        </Button>
      )}

      {selected && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive h-7 px-2 text-xs"
          onClick={() => setDeleting(true)}
        >
          <Trash2Icon className="size-3" aria-hidden="true" />
          Delete folder
        </Button>
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete folder"
        description={
          selected ? `“${selected.name}” will be removed. The decks in it are untouched.` : ""
        }
        confirmLabel="Delete folder"
        destructive
        onConfirm={() => {
          if (!selected) return;
          void deleteDeckFolderAction(selected.id).then((result) => {
            setDeleting(false);
            if (result.ok) {
              onSelect(null);
              void refresh();
            } else {
              toast.error(result.error);
            }
          });
        }}
      />
    </div>
  );
}
