"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { formatSelectOptions, formatsApi, formatsQueryKeys } from "@/features/decks/formats";
import { DECK_VISIBILITY_OPTIONS } from "@/features/decks/components/deck-metadata-dialog";
import { useDeckLifecycleMutations } from "@/features/decks/hooks/use-deck-mutations";
import { deckBuilderHref, importDeckHref, myDecksHref } from "@/features/decks/paths";
import type { DeckVisibility } from "@/features/decks/types";
import { SelectField, TextAreaField, TextField } from "@/views/admin/admin-form-field";

/**
 * `/decks/new`. Metadata only — a new deck has no cards yet, so the create
 * response carries no list and the user goes straight to the builder.
 */

const schema = z.object({
  name: z.string().trim().min(1, { message: "A deck needs a name" }).max(120),
  format: z.string().min(1, { message: "Pick a format" }),
  visibility: z.enum(["private", "unlisted", "public"]),
  description: z.string().max(500).optional(),
});

type Fields = z.infer<typeof schema>;

export function DeckCreateView() {
  const router = useRouter();
  const { create } = useDeckLifecycleMutations();
  const formats = useQuery({
    queryKey: formatsQueryKeys.list(),
    queryFn: () => formatsApi.list(),
    staleTime: 5 * 60_000,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", format: "", visibility: "private", description: "" },
  });

  // The format list arrives after the first render, so the default is applied
  // once it does rather than being guessed at mount.
  React.useEffect(() => {
    const first = formats.data?.[0];
    if (first) reset((values) => ({ ...values, format: values.format || first.code }));
  }, [formats.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const deck = await create.mutateAsync([
        {
          name: values.name.trim(),
          format: values.format,
          visibility: values.visibility as DeckVisibility,
          ...(values.description?.trim() ? { description: values.description.trim() } : {}),
        },
      ]);
      router.push(deckBuilderHref({ id: deck.id, name: deck.name }));
    } catch {
      // The toast carried the API's reason.
    }
  });

  const options = formatSelectOptions(formats.data ?? []);

  return (
    <div className="container max-w-xl py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">New deck</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Start empty, or{" "}
          <Link href={importDeckHref()} className="underline underline-offset-4">
            import a list
          </Link>
          .
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          id="new-deck-name"
          label="Name"
          maxLength={120}
          placeholder="Yasuo Aggro"
          error={errors.name?.message}
          {...register("name")}
        />
        <SelectField
          id="new-deck-format"
          label="Format"
          hint={
            formats.isPending
              ? "Loading formats…"
              : options.length === 0
                ? "No formats are configured on this environment."
                : undefined
          }
          error={errors.format?.message}
          options={options}
          {...register("format")}
        />
        <SelectField
          id="new-deck-visibility"
          label="Visibility"
          error={errors.visibility?.message}
          options={DECK_VISIBILITY_OPTIONS}
          {...register("visibility")}
        />
        <TextAreaField
          id="new-deck-description"
          label="Description"
          hint="Optional. Shown in deck lists."
          rows={3}
          maxLength={500}
          error={errors.description?.message}
          {...register("description")}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending || options.length === 0}>
            {create.isPending ? "Creating…" : "Create deck"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href={myDecksHref()}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
