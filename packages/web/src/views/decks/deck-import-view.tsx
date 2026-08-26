"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { formatSelectOptions, formatsApi, formatsQueryKeys } from "@/features/decks/formats";
import { DECK_VISIBILITY_OPTIONS } from "@/features/decks/components/deck-metadata-dialog";
import { useDeckLifecycleMutations } from "@/features/decks/hooks/use-deck-mutations";
import { deckBuilderHref, myDecksHref, newDeckHref } from "@/features/decks/paths";
import type { DeckImportProblem, DeckVisibility } from "@/features/decks/types";
import { SelectField, TextAreaField, TextField } from "@/views/admin/admin-form-field";

/**
 * `/decks/import`. Moxfield-style text in, a deck out.
 *
 * Lines the API could not resolve are reported rather than thrown away — the
 * rest of the list still imported, so the screen has to say which lines need a
 * human before sending the user on to the deck.
 */
export function DeckImportView() {
  const router = useRouter();
  const { import: importDeck } = useDeckLifecycleMutations();
  const formats = useQuery({
    queryKey: formatsQueryKeys.list(),
    queryFn: () => formatsApi.list(),
    staleTime: 5 * 60_000,
  });

  const [name, setName] = React.useState("");
  const [text, setText] = React.useState("");
  const [format, setFormat] = React.useState("");
  const [visibility, setVisibility] = React.useState<DeckVisibility>("private");
  const [problems, setProblems] = React.useState<DeckImportProblem[] | null>(null);
  const [created, setCreated] = React.useState<{ id: string; name: string } | null>(null);

  React.useEffect(() => {
    const first = formats.data?.[0];
    if (first) setFormat((current) => current || first.code);
  }, [formats.data]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    try {
      const result = await importDeck.mutateAsync([
        {
          text,
          format,
          visibility,
          ...(name.trim() ? { name: name.trim() } : {}),
        },
      ]);
      setCreated({ id: result.id, name: result.name });
      if (result.unresolved.length === 0) {
        router.push(deckBuilderHref({ id: result.id, name: result.name }));
        return;
      }
      setProblems(result.unresolved);
    } catch {
      // The toast carried the API's reason.
    }
  };

  const options = formatSelectOptions(formats.data ?? []);

  if (created && problems && problems.length > 0) {
    return (
      <div className="container max-w-2xl py-8">
        <h1 className="text-xl font-semibold tracking-tight">
          Imported “{created.name}”
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {problems.length} line{problems.length === 1 ? "" : "s"} could not be
          matched to a card. Everything else is in the deck.
        </p>
        <ul className="mt-4 rounded-md border">
          {problems.map((problem, index) => (
            <li
              key={`${problem.line}-${index}`}
              className="flex items-baseline gap-3 border-b px-3 py-2 text-sm last:border-b-0"
            >
              <span className="text-muted-foreground w-10 shrink-0 text-right tabular-nums">
                {problem.line}
              </span>
              <span className="min-w-0 flex-1 font-mono text-xs">{problem.text}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {problem.message}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex gap-2">
          <Button asChild>
            <Link href={deckBuilderHref(created)}>Open the deck</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={myDecksHref()}>All decks</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Import a deck</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Paste a plain-text list, or{" "}
          <Link href={newDeckHref()} className="underline underline-offset-4">
            start from scratch
          </Link>
          .
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          id="import-deck-name"
          label="Name"
          hint="Optional — a name in the list wins, otherwise “Imported deck”."
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextAreaField
          id="import-deck-text"
          label="Deck list"
          hint="One card per line, e.g. “4 Yasuo (OGN) 042”. Zone headers are honoured."
          rows={16}
          className="font-mono"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <SelectField
          id="import-deck-format"
          label="Format"
          options={options}
          value={format}
          onChange={(event) => setFormat(event.target.value)}
        />
        <SelectField
          id="import-deck-visibility"
          label="Visibility"
          options={DECK_VISIBILITY_OPTIONS}
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as DeckVisibility)}
        />

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={importDeck.isPending || !text.trim() || !format}
          >
            {importDeck.isPending ? "Importing…" : "Import"}
          </Button>
          {!format && (
            <p className="text-muted-foreground self-center text-sm">
              No formats are configured on this environment.
            </p>
          )}
          <Button type="button" variant="outline" asChild>
            <Link href={myDecksHref()}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
