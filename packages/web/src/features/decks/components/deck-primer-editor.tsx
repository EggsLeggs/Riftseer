"use client";

import * as React from "react";
import {
  BoldIcon,
  BookOpenIcon,
  CodeIcon,
  HeadingIcon,
  ImageIcon,
  ItalicIcon,
  LayersIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  Maximize2Icon,
  QuoteIcon,
  RectangleHorizontalIcon,
  StrikethroughIcon,
  UserRoundIcon,
} from "lucide-react";

import { AppDialogContent, AppPopoverContent } from "@/components/layout/clear-body-pointer-events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CardSearchDialog } from "@/features/cards/card-search-dialog";
import { CardTextInline } from "@/features/cards/card-text";
import { cn } from "@/lib/utils";
import { useDeckMutations } from "../hooks/use-deck-mutations";
import { DeckPrimer } from "./deck-primer";
import type { DeckDetail } from "../types";

const PRIMER_MAX = 20_000;

const ICONS = [
  { token: ":rb_exhaust:", label: "Exhaust" },
  { token: ":rb_might:", label: "Might" },
  { token: ":rb_power:", label: "Power" },
  { token: ":rb_energy_1:", label: "1 Energy" },
  { token: ":rb_energy_2:", label: "2 Energy" },
  { token: ":rb_energy_3:", label: "3 Energy" },
  { token: ":rb_rune_fury:", label: "Fury" },
  { token: ":rb_rune_calm:", label: "Calm" },
  { token: ":rb_rune_mind:", label: "Mind" },
  { token: ":rb_rune_body:", label: "Body" },
  { token: ":rb_rune_chaos:", label: "Chaos" },
  { token: ":rb_rune_order:", label: "Order" },
  { token: ":rb_rune_rainbow:", label: "Rainbow" },
] as const;

const KEYWORDS = [
  "Accelerate",
  "Action",
  "Reaction",
  "Assault",
  "Tank",
  "Shield",
  "Hidden",
  "Ambush",
  "Deflect",
  "Temporary",
  "Empower",
  "Equip",
  "Add",
  "Unique",
  "Ganking",
  "Deathknell",
  "Hunt",
  "Legion",
] as const;

const TAGS = ["Unit", "Champion", "Spell", "Gear", "Legend", "Battlefield", "Rune"] as const;

type EditorMode = "write" | "split" | "preview";
type CardInsert = "mention" | "embed";

/**
 * The guide editor: Markdown with the same card, user and symbol tokens the
 * renderer already understands. Preview is `DeckPrimer` itself, so write and
 * read cannot drift.
 */
export function DeckPrimerEditor({
  deck,
  open,
  onOpenChange,
}: {
  deck: DeckDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { patch } = useDeckMutations(deck.id);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = React.useState(deck.primer ?? "");
  const [mode, setMode] = React.useState<EditorMode>("write");
  const [fullscreen, setFullscreen] = React.useState(false);
  const [cardInsert, setCardInsert] = React.useState<CardInsert | null>(null);
  const [userOpen, setUserOpen] = React.useState(false);
  const [userHandle, setUserHandle] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setDraft(deck.primer ?? "");
      setMode("write");
      setFullscreen(false);
    }
  }, [deck.primer, open]);

  const insert = React.useCallback((before: string, after = "", placeholder = "") => {
    const field = textareaRef.current;
    if (!field) {
      setDraft((value) => value + before + placeholder + after);
      return;
    }
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = field.value.slice(start, end);
    const inner = selected || placeholder;
    const next = field.value.slice(0, start) + before + inner + after + field.value.slice(end);
    setDraft(next);
    const innerStart = start + before.length;
    const cursor = selected ? innerStart + inner.length + after.length : innerStart;
    const cursorEnd = selected ? cursor : innerStart + inner.length;
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(cursor, cursorEnd);
    });
  }, []);

  const save = async () => {
    const next = draft.trim() || null;
    if (next === (deck.primer ?? null)) {
      onOpenChange(false);
      return;
    }
    try {
      await patch.mutateAsync([deck.id, { primer: next }]);
      onOpenChange(false);
    } catch {
      // Toast already carried the reason.
    }
  };

  const showWrite = mode !== "preview";
  const showPreview = mode !== "write";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        showCloseButton
        className={cn(
          "flex max-h-[90vh] flex-col gap-3 sm:max-w-3xl",
          fullscreen &&
            "top-4 left-4 h-[calc(100vh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-none translate-x-0 translate-y-0",
        )}
      >
        <DialogHeader>
          <DialogTitle>Guide</DialogTitle>
          <DialogDescription>
            Markdown for the write-up. [[Card]] mentions a card, ![[Card]] shows
            it, [@handle] names a user. Icons and keywords use the same tokens
            as card text.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            spacing={0}
            variant="outline"
            size="sm"
            value={mode}
            onValueChange={(next) => next && setMode(next as EditorMode)}
            aria-label="Editor view"
            className="h-8"
          >
            <ToggleGroupItem value="write" className="h-8 px-2.5 text-xs">
              Write
            </ToggleGroupItem>
            <ToggleGroupItem value="split" className="h-8 px-2.5 text-xs">
              Split
            </ToggleGroupItem>
            <ToggleGroupItem value="preview" className="h-8 px-2.5 text-xs">
              Preview
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            type="button"
            variant={fullscreen ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={() => setFullscreen((value) => !value)}
          >
            <Maximize2Icon className="size-3.5" aria-hidden="true" />
            Fullscreen
          </Button>
        </div>

        {showWrite && (
          <div className="flex flex-wrap items-center gap-0.5">
            <Tool icon={HeadingIcon} label="Heading" onClick={() => insert("\n## ", "", "Heading")} />
            <Tool icon={BoldIcon} label="Bold" onClick={() => insert("**", "**", "bold")} />
            <Tool icon={ItalicIcon} label="Italic" onClick={() => insert("*", "*", "italic")} />
            <Tool icon={StrikethroughIcon} label="Strikethrough" onClick={() => insert("~~", "~~", "text")} />
            <Tool icon={QuoteIcon} label="Quote" onClick={() => insert("\n> ", "", "quote")} />
            <Tool icon={CodeIcon} label="Code" onClick={() => insert("`", "`", "code")} />
            <Tool icon={ListIcon} label="Bullet list" onClick={() => insert("\n- ", "", "item")} />
            <Tool icon={ListOrderedIcon} label="Numbered list" onClick={() => insert("\n1. ", "", "item")} />
            <Tool icon={LinkIcon} label="Link" onClick={() => insert("[", "](https://)", "text")} />
            <Tool
              icon={RectangleHorizontalIcon}
              label="Mention a card"
              onClick={() => setCardInsert("mention")}
            />
            <Tool
              icon={ImageIcon}
              label="Embed a card image"
              onClick={() => setCardInsert("embed")}
            />
            <Tool
              icon={LayersIcon}
              label="Card images"
              onClick={() => setCardInsert("embed")}
            />
            <Popover open={userOpen} onOpenChange={setUserOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Mention a user">
                  <UserRoundIcon className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <AppPopoverContent align="start" className="w-56 p-2">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const handle = userHandle.trim().replace(/^@/, "");
                    if (handle) insert(`[@${handle}]`);
                    setUserHandle("");
                    setUserOpen(false);
                  }}
                >
                  <Input
                    autoFocus
                    value={userHandle}
                    onChange={(event) => setUserHandle(event.target.value)}
                    placeholder="@handle"
                    aria-label="User handle"
                    className="h-8 text-sm"
                  />
                  <Button type="submit" size="sm" className="mt-2 w-full">
                    Insert
                  </Button>
                </form>
              </AppPopoverContent>
            </Popover>
            <SymbolPicker onInsert={(token) => insert(token)} />
          </div>
        )}

        <div
          className={cn(
            "min-h-0 flex-1 overflow-hidden",
            showWrite && showPreview ? "grid gap-3 md:grid-cols-2" : "flex flex-col",
          )}
        >
          {showWrite && (
            <Textarea
              ref={textareaRef}
              value={draft}
              maxLength={PRIMER_MAX}
              aria-label="Guide"
              placeholder="How the deck plays…"
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-64 flex-1 resize-y bg-background font-mono text-sm"
            />
          )}
          {showPreview && (
            <div className="min-h-64 flex-1 overflow-y-auto rounded-lg border px-3 py-2">
              {draft.trim() ? (
                <DeckPrimer primer={draft} />
              ) : (
                <p className="text-muted-foreground text-sm italic">Nothing to preview yet.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={patch.isPending}>
            {patch.isPending ? "Saving…" : "Save primer"}
          </Button>
        </DialogFooter>
      </AppDialogContent>

      <CardSearchDialog
        open={cardInsert != null}
        onOpenChange={(next) => !next && setCardInsert(null)}
        showViewAll={false}
        onSelect={(result) => {
          const name = result.oracle.name;
          const set = result.printing.set?.set_code;
          const number = result.printing.collector_number;
          const spec = set && number ? `${name}|${set}-${number}` : name;
          insert(cardInsert === "embed" ? `![[${spec}]]` : `[[${spec}]]`);
          setCardInsert(null);
        }}
      />
    </Dialog>
  );
}

export function DeckGuideButton({
  onClick,
  href,
}: {
  onClick?: () => void;
  /** Readers jump to the rendered guide; editors open the writer. */
  href?: string;
}) {
  const inner = (
    <>
      <BookOpenIcon className="size-3.5" aria-hidden="true" />
      Guide
    </>
  );
  const className = "h-8 gap-1.5 px-2.5 text-xs";
  if (href) {
    return (
      <Button variant="outline" size="sm" className={className} asChild>
        <a href={href}>{inner}</a>
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={onClick}>
      {inner}
    </Button>
  );
}

function Tool({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
      <Icon className="size-3.5" />
    </Button>
  );
}

function SymbolPicker({ onInsert }: { onInsert: (token: string) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Insert a symbol">
          <span className="icon-rune-rainbow size-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <AppPopoverContent align="start" className="w-72 p-2">
        <p className="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase">
          Icons
        </p>
        <div className="mb-3 flex flex-wrap gap-1">
          {ICONS.map((icon) => (
            <button
              key={icon.token}
              type="button"
              title={icon.label}
              className="hover:bg-muted rounded p-1"
              onClick={() => {
                onInsert(icon.token);
                setOpen(false);
              }}
            >
              <CardTextInline text={icon.token} />
            </button>
          ))}
        </div>
        <p className="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase">
          Keywords
        </p>
        <div className="mb-3 flex flex-wrap gap-1">
          {KEYWORDS.map((label) => (
            <button
              key={label}
              type="button"
              className="hover:bg-muted rounded px-1 py-0.5"
              onClick={() => {
                onInsert(`[${label}]`);
                setOpen(false);
              }}
            >
              <CardTextInline text={`[${label}]`} />
            </button>
          ))}
        </div>
        <p className="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase">
          Tags
        </p>
        <div className="flex flex-wrap gap-1">
          {TAGS.map((label) => (
            <button
              key={label}
              type="button"
              className="hover:bg-muted rounded px-1 py-0.5"
              onClick={() => {
                onInsert(`[${label}]`);
                setOpen(false);
              }}
            >
              <CardTextInline text={`[${label}]`} />
            </button>
          ))}
        </div>
      </AppPopoverContent>
    </Popover>
  );
}
