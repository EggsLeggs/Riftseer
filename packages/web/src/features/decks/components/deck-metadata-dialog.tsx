"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SelectField,
  TextAreaField,
  TextField,
} from "@/views/admin/admin-form-field";
import { formatSelectOptions, formatsApi, formatsQueryKeys } from "../formats";
import { useDeckMutations } from "../hooks/use-deck-mutations";
import type { DeckDetail, DeckPatch, DeckVisibility } from "../types";

/**
 * Deck metadata: name, description, primer, format, visibility.
 *
 * `visibility` is owner-only on the API — an editor was invited to help build,
 * which is not consent to publish — so an editor is not offered a control that
 * would answer 403. Everything else an editor may change.
 *
 * The patch carries only the fields that actually changed: omission preserves a
 * value and an explicit `null` clears it, and the route rejects an empty patch.
 */

const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "A deck needs a name" })
    .max(NAME_MAX, { message: `At most ${NAME_MAX} characters` }),
  description: z.string().max(DESCRIPTION_MAX, {
    message: `At most ${DESCRIPTION_MAX} characters`,
  }),
  primer: z.string(),
  format: z.string().min(1, { message: "Pick a format" }),
  visibility: z.enum(["private", "unlisted", "public"]),
});

type Fields = z.infer<typeof schema>;

export const DECK_VISIBILITY_OPTIONS: Array<{ value: DeckVisibility; label: string }> = [
  { value: "private", label: "Private — only people you invite" },
  { value: "unlisted", label: "Unlisted — anyone with the link" },
  { value: "public", label: "Public — listed on your profile" },
];

export function DeckMetadataDialog({
  deck,
  isOwner,
  open,
  onOpenChange,
}: {
  deck: DeckDetail;
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { patch } = useDeckMutations(deck.id);
  const formats = useQuery({
    queryKey: formatsQueryKeys.list(),
    queryFn: () => formatsApi.list(),
    staleTime: 5 * 60_000,
  });

  const defaults = React.useMemo<Fields>(
    () => ({
      name: deck.name,
      description: deck.description ?? "",
      primer: deck.primer ?? "",
      format: deck.format?.code ?? "",
      visibility: (deck.visibility as DeckVisibility) ?? "private",
    }),
    [deck.description, deck.format?.code, deck.name, deck.primer, deck.visibility],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: defaults });

  React.useEffect(() => {
    if (open) reset(defaults);
  }, [defaults, open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const next: DeckPatch = {};
    if (values.name.trim() !== deck.name) next.name = values.name.trim();
    if (values.description.trim() !== (deck.description ?? "")) {
      next.description = values.description.trim() || null;
    }
    if (values.primer !== (deck.primer ?? "")) next.primer = values.primer || null;
    if (values.format && values.format !== deck.format?.code) next.format = values.format;
    if (isOwner && values.visibility !== deck.visibility) {
      next.visibility = values.visibility;
    }

    if (Object.keys(next).length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      await patch.mutateAsync([deck.id, next]);
      onOpenChange(false);
    } catch {
      // The toast already carried the API's reason; keep the dialog open so the
      // edit is not lost.
    }
  });

  const formatOptions = formatSelectOptions(formats.data ?? [], deck.format);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deck details</DialogTitle>
          <DialogDescription>
            {isOwner
              ? "Rename the deck, change its format, or choose who can see it."
              : "You can edit this deck's details. Only the owner can change who can see it."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextField
            id="deck-name"
            label="Name"
            maxLength={NAME_MAX}
            error={errors.name?.message}
            {...register("name")}
          />
          <TextAreaField
            id="deck-description"
            label="Description"
            hint="One or two lines, shown in deck lists."
            rows={2}
            maxLength={DESCRIPTION_MAX}
            error={errors.description?.message}
            {...register("description")}
          />
          <TextAreaField
            id="deck-primer"
            label="Primer"
            hint="The long write-up shown on the deck page."
            rows={6}
            error={errors.primer?.message}
            {...register("primer")}
          />
          <SelectField
            id="deck-format"
            label="Format"
            error={errors.format?.message}
            options={
              formatOptions.length > 0
                ? formatOptions
                : [{ value: deck.format?.code ?? "", label: deck.format?.name ?? "Unknown" }]
            }
            {...register("format")}
          />
          {isOwner && (
            <SelectField
              id="deck-visibility"
              label="Visibility"
              error={errors.visibility?.message}
              options={DECK_VISIBILITY_OPTIONS}
              {...register("visibility")}
            />
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={patch.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={patch.isPending}>
              {patch.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
