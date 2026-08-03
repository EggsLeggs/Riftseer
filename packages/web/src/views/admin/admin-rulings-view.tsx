"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cardsApi } from "@/features/cards/api";
import {
  listRulingsAction,
  previewRuleAction,
} from "@/features/admin/actions";
import {
  adminRulingsQueryKey,
  useRulingMutations,
} from "@/features/admin/hooks/use-admin-mutations";
import type {
  AdminRuling,
  AdminRulingRecordPatch,
  AdminRulingTarget,
  AdminRulingTargetInput,
  AdminRulingTargetKind,
  AdminRulingType,
} from "@/features/admin/types";
import { cn } from "@/lib/utils";
import { AdminPageHeader } from "./admin-page-header";
import { AdminListState, AdminPager } from "./admin-list";
import { CheckboxField, SelectField, TextAreaField, TextField } from "./admin-form-field";
import { ConfirmDialog } from "./confirm-dialog";

const PAGE_SIZE = 25;
/** Long enough that typing a rule does not fire a request per keystroke. */
const PREVIEW_DEBOUNCE_MS = 400;

// A total `Record` over the types the API's schema accepts, so a new one added
// there fails to compile here until it is given a label.
const RULING_TYPE_LABELS: Record<AdminRulingType, string> = {
  ruling: "Ruling",
  note: "Note",
};

const RULING_TYPE_OPTIONS = Object.entries(RULING_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const KIND_FILTERS = [
  { value: "", label: "All targets" },
  { value: "printing", label: "Single printings" },
  { value: "oracle", label: "Oracles" },
  { value: "query", label: "Rules" },
] as const;

/** Starter rules, shown when the editor's rule box is empty. */
const RULE_EXAMPLES = [
  { query: "t:unit kw:deathknell", label: "every unit with Deathknell" },
  { query: "t:unit might>=4 tag:poro", label: "big Poro units" },
  { query: 'produces:"gem"', label: "anything that makes a Gem token" },
  { query: "kw:deflect or kw:shield", label: "Deflect or Shield" },
  { query: "d:fury d:order", label: "cards in both Fury and Order" },
  { query: "banned:standard", label: "everything banned in Standard" },
] as const;

interface RulingDraft {
  type: AdminRulingType;
  text: string;
  dated: string;
  source: string;
  active: boolean;
  targets: AdminRulingTargetInput[];
}

function emptyDraft(): RulingDraft {
  return {
    type: "ruling",
    text: "",
    dated: "",
    source: "",
    active: true,
    targets: [],
  };
}

function draftFrom(ruling: AdminRuling): RulingDraft {
  return {
    type: ruling.type,
    text: ruling.text,
    dated: ruling.dated ?? "",
    source: ruling.source ?? "",
    active: ruling.active,
    targets: ruling.targets.map(targetToInput),
  };
}

function targetToInput(target: AdminRulingTarget): AdminRulingTargetInput {
  if (target.kind === "printing") {
    return { kind: "printing", printing_id: target.printing_id ?? "" };
  }
  if (target.kind === "query") {
    return { kind: "query", query: target.query ?? "" };
  }
  return { kind: "oracle", oracle_id: target.oracle_id ?? "" };
}

function targetKey(target: AdminRulingTargetInput): string {
  if (target.kind === "printing") return `printing:${target.printing_id}`;
  if (target.kind === "query") return `query:${target.query}`;
  return `oracle:${target.oracle_id}`;
}

/**
 * The API resolves the card name, so a saved target reads as a card rather than
 * as the id it is stored under. Falling back to the id still beats an empty
 * chip: it means the name lookup found nothing, which is itself worth seeing.
 */
function describeTarget(target: AdminRulingTarget): string {
  if (target.kind === "query") return target.query ?? "";
  return (
    target.label ??
    target.printing_id ??
    target.oracle_id ??
    "Unknown card"
  );
}

export function AdminRulingsView() {
  const [search, setSearch] = React.useState("");
  const [submitted, setSubmitted] = React.useState("");
  const [kind, setKind] = React.useState<AdminRulingTargetKind | "">("");
  const [page, setPage] = React.useState(0);
  const [editing, setEditing] = React.useState<AdminRuling | null>(null);
  const [draft, setDraft] = React.useState<RulingDraft | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AdminRuling | null>(
    null,
  );

  const { create, patch, remove } = useRulingMutations();
  const offset = page * PAGE_SIZE;

  const rulings = useQuery({
    queryKey: [...adminRulingsQueryKey, submitted, kind, offset],
    queryFn: async () => {
      const result = await listRulingsAction({
        q: submitted || undefined,
        kind: kind || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });

  // A narrower filter can leave the viewer past the end of the new result set.
  React.useEffect(() => {
    setPage(0);
  }, [submitted, kind]);

  const rows = rulings.data?.rulings ?? [];
  const total = rulings.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isCreating = draft !== null && editing === null;

  function startCreate() {
    setEditing(null);
    setDraft(emptyDraft());
  }

  function startEdit(ruling: AdminRuling) {
    setEditing(ruling);
    setDraft(draftFrom(ruling));
  }

  function closeEditor() {
    setEditing(null);
    setDraft(null);
  }

  async function save() {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) {
      toast.error("Ruling text is required");
      return;
    }
    if (draft.targets.length === 0) {
      toast.error("Add at least one target — a printing, a card, or a rule");
      return;
    }

    try {
      if (editing) {
        // Merge-patch semantics, except `targets`, which the API replaces
        // wholesale — send it only when the list actually changed.
        const original = draftFrom(editing);
        const rulingPatch: AdminRulingRecordPatch = {};
        if (draft.type !== original.type) rulingPatch.type = draft.type;
        if (text !== original.text) rulingPatch.text = text;
        if (draft.dated !== original.dated) {
          rulingPatch.dated = draft.dated || null;
        }
        if (draft.source.trim() !== original.source) {
          rulingPatch.source = draft.source.trim() || null;
        }
        if (draft.active !== original.active) rulingPatch.active = draft.active;
        if (
          draft.targets.map(targetKey).join("|") !==
          original.targets.map(targetKey).join("|")
        ) {
          rulingPatch.targets = draft.targets;
        }

        if (Object.keys(rulingPatch).length === 0) {
          closeEditor();
          return;
        }
        await patch.mutateAsync([editing.id, rulingPatch]);
      } else {
        await create.mutateAsync([
          {
            type: draft.type,
            text,
            dated: draft.dated || undefined,
            source: draft.source.trim() || undefined,
            targets: draft.targets,
          },
        ]);
      }
    } catch {
      // Already surfaced as a toast — keep the editor open for a retry.
      return;
    }
    closeEditor();
  }

  async function deleteRuling(ruling: AdminRuling) {
    try {
      await remove.mutateAsync([ruling.id]);
    } catch {
      return;
    }
    setPendingDelete(null);
    if (editing?.id === ruling.id) closeEditor();
  }

  return (
    <>
      <AdminPageHeader
        title="Rulings"
        description="Rulings and editorial notes, and what they apply to. A ruling can name one printing, an oracle, or a rule — a saved search that keeps matching cards as new sets are released."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Rulings" }]}
        actions={
          <Button onClick={() => (draft ? closeEditor() : startCreate())}>
            {draft ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {draft ? "Cancel" : "New ruling"}
          </Button>
        }
      />

      {draft && (
        <RulingEditor
          draft={draft}
          setDraft={setDraft}
          heading={isCreating ? "Create a ruling" : "Edit ruling"}
          pending={create.isPending || patch.isPending}
          onSave={() => void save()}
          onCancel={closeEditor}
        />
      )}

      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(search.trim());
        }}
      >
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="ruling-search">Search text or source</Label>
          <Input
            id="ruling-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="deathknell"
            maxLength={200}
          />
        </div>
        <SelectField
          id="ruling-kind"
          label="Target kind"
          value={kind}
          onChange={(event) =>
            setKind(event.target.value as AdminRulingTargetKind | "")
          }
          options={KIND_FILTERS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Search
        </Button>
      </form>

      <AdminListState
        isError={rulings.isError}
        isPending={rulings.isPending}
        isEmpty={rows.length === 0}
        errorMessage="Couldn't load rulings. Please try again."
        loadingMessage="Loading rulings…"
        emptyMessage={
          submitted || kind
            ? "No rulings match this filter."
            : "No rulings yet. Create one to get started."
        }
      >
        <ul className="flex flex-col gap-3">
          {rows.map((ruling) => (
            <li
              key={ruling.id}
              className={cn(
                "rounded-lg border p-4",
                !ruling.active && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">
                      {ruling.type === "note" ? "Note" : "Ruling"}
                    </span>
                    {ruling.dated && (
                      <span className="text-muted-foreground text-xs">
                        {ruling.dated}
                      </span>
                    )}
                    {!ruling.active && (
                      <span className="text-muted-foreground text-xs">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{ruling.text}</p>
                  {ruling.source && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Source: {ruling.source}
                    </p>
                  )}
                  {/* `admin__replace_ruling_targets` refuses to save a ruling
                      with no targets, but ON DELETE CASCADE can empty one
                      afterwards. Both card-page read paths inner-join the
                      target table, so such a ruling exists and reaches nothing.
                      This list is the only place it still shows up. */}
                  {ruling.targets.length === 0 ? (
                    <p className="text-destructive mt-3 text-xs font-medium">
                      No targets — this ruling reaches no card. Edit it to add one.
                    </p>
                  ) : (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {ruling.targets.map((target) => (
                        <li key={target.id}>
                          <TargetChip target={target} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(ruling)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Delete this ruling"
                    onClick={() => setPendingDelete(ruling)}
                  >
                    <Trash2 aria-hidden="true" />
                    <span className="sr-only">Delete ruling</span>
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <AdminPager page={page} totalPages={totalPages} onPageChange={setPage} />
      </AdminListState>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete this ruling?"
        description={
          pendingDelete
            ? `It will be removed from ${pendingDelete.targets.length} target${
                pendingDelete.targets.length === 1 ? "" : "s"
              }, wherever it currently appears. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete ruling"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (pendingDelete) void deleteRuling(pendingDelete);
        }}
      />
    </>
  );
}

const TARGET_KIND_LABELS: Record<AdminRulingTargetKind, string> = {
  printing: "Printing",
  oracle: "Card",
  query: "Rule",
};

/**
 * Shared by the saved chip and the draft chip in the editor below, which
 * previously carried their own copies of this markup and drifted in tone.
 * `children` is the trailing slot: a match count on a saved target, a remove
 * button on a draft one.
 */
function TargetChipShell({
  kind,
  text,
  destructive,
  children,
}: {
  kind: AdminRulingTargetKind;
  text: string;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs",
        destructive
          ? "border-destructive/50 bg-destructive/10"
          : kind === "query"
            ? "border-primary/40 bg-primary/10"
            : "border-border bg-muted",
      )}
    >
      <span className="text-muted-foreground">{TARGET_KIND_LABELS[kind]}</span>
      <span className={kind === "query" ? "font-mono" : undefined}>{text}</span>
      {children}
    </span>
  );
}

function TargetChip({ target }: { target: AdminRulingTarget }) {
  return (
    <TargetChipShell
      kind={target.kind}
      text={describeTarget(target)}
      destructive={target.deleted}
    >
      {target.kind === "query" && target.match_count !== null && (
        <span className="text-muted-foreground tabular-nums">
          · {target.match_count}
        </span>
      )}
      {/* The target row survives a soft delete, so the ruling looks fine while
          silently reaching no card page at all. */}
      {target.deleted && (
        <span className="text-destructive font-medium">· deleted</span>
      )}
    </TargetChipShell>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function RulingEditor({
  draft,
  setDraft,
  heading,
  pending,
  onSave,
  onCancel,
}: {
  draft: RulingDraft;
  setDraft: React.Dispatch<React.SetStateAction<RulingDraft | null>>;
  heading: string;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  function update(patch: Partial<RulingDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function addTarget(target: AdminRulingTargetInput) {
    setDraft((current) => {
      if (!current) return current;
      const key = targetKey(target);
      if (current.targets.some((t) => targetKey(t) === key)) return current;
      return { ...current, targets: [...current.targets, target] };
    });
  }

  function removeTarget(key: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            targets: current.targets.filter((t) => targetKey(t) !== key),
          }
        : current,
    );
  }

  return (
    <div className="mb-8 rounded-lg border p-4">
      <h2 className="mb-4 text-sm font-semibold">{heading}</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          id="ruling-type"
          label="Type"
          value={draft.type}
          onChange={(event) =>
            update({ type: event.target.value as AdminRulingType })
          }
          options={RULING_TYPE_OPTIONS}
          hint="Notes are editorial; rulings are official."
        />
        <TextField
          id="ruling-dated"
          label="Dated"
          type="date"
          value={draft.dated}
          onChange={(event) => update({ dated: event.target.value })}
          hint="When the ruling was issued."
        />
        <TextField
          id="ruling-source"
          label="Source"
          value={draft.source}
          onChange={(event) => update({ source: event.target.value })}
          placeholder="Rules team"
          maxLength={500}
          hint="Where it came from."
          className="lg:col-span-2"
        />
      </div>

      <div className="mt-4">
        <TextAreaField
          id="ruling-text"
          label="Text"
          value={draft.text}
          onChange={(event) => update({ text: event.target.value })}
          rows={3}
          maxLength={4000}
          placeholder="Deathknell triggers resolve before the unit leaves play."
        />
      </div>

      <div className="mt-4">
        <CheckboxField
          id="ruling-active"
          label="Active"
          hint="Disable to hide the ruling everywhere without deleting it."
          checked={draft.active}
          onChange={(event) => update({ active: event.target.checked })}
        />
      </div>

      <TargetEditor
        targets={draft.targets}
        onAdd={addTarget}
        onRemove={removeTarget}
      />

      <div className="mt-5 flex gap-2">
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save ruling"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function TargetEditor({
  targets,
  onAdd,
  onRemove,
}: {
  targets: AdminRulingTargetInput[];
  onAdd: (target: AdminRulingTargetInput) => void;
  onRemove: (key: string) => void;
}) {
  const [mode, setMode] = React.useState<AdminRulingTargetKind>("query");

  return (
    <div className="mt-5 rounded-md border p-3">
      <h3 className="text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
        Applies to
      </h3>
      <p className="text-muted-foreground mb-3 text-xs">
        A ruling can carry any number of targets. Rules are re-evaluated after
        every ingest, so cards released later are picked up automatically.
      </p>

      {targets.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {targets.map((target) => {
            const key = targetKey(target);
            return (
              <li key={key}>
                <TargetChipShell
                  kind={target.kind}
                  text={
                    target.kind === "printing"
                      ? target.printing_id
                      : target.kind === "oracle"
                        ? target.oracle_id
                        : target.query
                  }
                >
                  <button
                    type="button"
                    onClick={() => onRemove(key)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" aria-hidden="true" />
                    <span className="sr-only">Remove target</span>
                  </button>
                </TargetChipShell>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mb-3 flex flex-wrap gap-1">
        {(["query", "printing", "oracle"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              mode === value
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {value === "query"
              ? "Rule"
              : value === "printing"
                ? "Single printing"
                : "Oracle"}
          </button>
        ))}
      </div>

      {mode === "query" ? (
        <RuleTargetInput onAdd={onAdd} />
      ) : (
        <CardTargetInput mode={mode} onAdd={onAdd} />
      )}
    </div>
  );
}

/**
 * Rule editor with a live match count.
 *
 * The preview runs the real parser and the real evaluator server-side, so what
 * it reports is exactly what the rule will attach to — including a syntax error,
 * which is shown before the rule can be added rather than on save.
 */
function RuleTargetInput({
  onAdd,
}: {
  onAdd: (target: AdminRulingTargetInput) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const trimmed = query.trim();
    const timer = setTimeout(() => setDebounced(trimmed), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const preview = useQuery({
    queryKey: ["admin", "rulings", "preview", debounced],
    queryFn: async () => {
      const result = await previewRuleAction(debounced, 8);
      // A syntax error is a legitimate answer here, not a failure to surface as
      // a toast: it is what the admin needs to see while typing.
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: debounced.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const canAdd = debounced.length > 0 && preview.isSuccess;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor="ruling-rule">Rule</Label>
          <Input
            id="ruling-rule"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="t:unit kw:deathknell"
            maxLength={256}
            className="font-mono"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={!canAdd}
          onClick={() => {
            onAdd({ kind: "query", query: debounced });
            setQuery("");
            setDebounced("");
          }}
        >
          Add rule
        </Button>
      </div>

      <div className="mt-2 min-h-5 text-xs">
        {debounced.length === 0 ? (
          <span className="text-muted-foreground">
            Uses the same syntax as site search — try{" "}
            {RULE_EXAMPLES.map((example, index) => (
              <React.Fragment key={example.query}>
                {index > 0 && ", "}
                <button
                  type="button"
                  onClick={() => setQuery(example.query)}
                  className="text-primary font-mono underline-offset-4 hover:underline"
                  title={example.label}
                >
                  {example.query}
                </button>
              </React.Fragment>
            ))}
            .
          </span>
        ) : preview.isPending ? (
          <span className="text-muted-foreground">Checking…</span>
        ) : preview.isError ? (
          <span className="text-destructive">{preview.error.message}</span>
        ) : preview.data.total === 0 ? (
          <span className="text-destructive">
            Matches no cards right now. It can still be saved — a rule may be
            written ahead of the set it targets.
          </span>
        ) : (
          <span className="text-muted-foreground">
            Matches {preview.data.total} card
            {preview.data.total === 1 ? "" : "s"}
            {preview.data.sample.length > 0 && (
              <>
                {" — "}
                {preview.data.sample.map((card) => card.name).join(", ")}
                {preview.data.total > preview.data.sample.length && "…"}
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Card picker for the two direct target kinds. Searching resolves real cards so
 * an admin never has to know a 24-character ObjectId — `printing` stores the id
 * of the exact printing chosen, `oracle` stores the name-derived group key that
 * every printing of that card shares.
 */
function CardTargetInput({
  mode,
  onAdd,
}: {
  mode: "printing" | "oracle";
  onAdd: (target: AdminRulingTargetInput) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [submitted, setSubmitted] = React.useState("");

  const results = useQuery({
    queryKey: ["admin", "rulings", "card-search", submitted],
    queryFn: () =>
      cardsApi.searchByName(submitted, { limit: 10, unique: mode === "printing" }),
    enabled: submitted.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const cards = results.data?.cards ?? [];

  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(query.trim());
        }}
      >
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor="ruling-card-search">
            {mode === "printing" ? "Find a printing" : "Find a card"}
          </Label>
          <Input
            id="ruling-card-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sun Disc"
            maxLength={120}
          />
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Search
        </Button>
      </form>

      <div className="mt-2 min-h-5 text-xs">
        {submitted.length === 0 ? (
          <span className="text-muted-foreground">
            {mode === "printing"
              ? "Targets exactly one printing — other printings of the same card are unaffected."
              : "Targets every printing of the card, including ones released later."}
          </span>
        ) : results.isPending ? (
          <span className="text-muted-foreground">Searching…</span>
        ) : results.isError ? (
          <span className="text-destructive">
            Couldn&apos;t search cards. Please try again.
          </span>
        ) : cards.length === 0 ? (
          <span className="text-muted-foreground">No cards match.</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {cards.map(({ oracle, printing }) => (
              <li key={printing.id}>
                <button
                  type="button"
                  className="hover:bg-muted w-full rounded px-2 py-1 text-left"
                  onClick={() => {
                    onAdd(
                      mode === "printing"
                        ? { kind: "printing", printing_id: printing.id }
                        : { kind: "oracle", oracle_id: oracle.id },
                    );
                    setQuery("");
                    setSubmitted("");
                  }}
                >
                  {oracle.name}
                  <span className="text-muted-foreground ml-2">
                    {printing.set?.set_code}
                    {printing.collector_number ? ` ${printing.collector_number}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
