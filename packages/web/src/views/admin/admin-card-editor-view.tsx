"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { Card } from "@riftseer/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cardHref } from "@/features/cards/paths";
import {
  buildCardPatch,
  cardEditorSchema,
  cardToEditorValues,
  CARD_ORIENTATIONS,
  type CardEditorValues,
} from "@/features/admin/card-form";
import { useCardMutations } from "@/features/admin/hooks/use-admin-mutations";
import { AdminPageHeader } from "./admin-page-header";
import {
  AdminSection,
  CheckboxField,
  FieldGrid,
  SelectField,
  TextAreaField,
  TextField,
} from "./admin-form-field";
import { AdminCardImagePanel } from "./admin-card-image-panel";
import { AdminCardRelationshipsPanel } from "./admin-card-relationships-panel";
import { AdminCardPlacementPanel } from "./admin-card-placement-panel";
import { AdminCardLegalitiesPanel } from "./admin-card-legalities-panel";
import { AdminCardRulingsPanel } from "./admin-card-rulings-panel";

const ORIENTATION_OPTIONS = [
  { value: "", label: "Auto / unset" },
  ...CARD_ORIENTATIONS.map((value) => ({
    value,
    label: value[0]!.toUpperCase() + value.slice(1),
  })),
];

interface Props {
  card: Card;
  setCodes: string[];
}

export function AdminCardEditorView({ card, setCodes }: Props) {
  const router = useRouter();
  const initialValues = React.useMemo(() => cardToEditorValues(card), [card]);
  // The save diff is against what the form was last synced to, not the original
  // card, so a second save after a successful one sends only the new changes.
  const baseline = React.useRef<CardEditorValues>(initialValues);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CardEditorValues>({
    resolver: zodResolver(cardEditorSchema),
    defaultValues: initialValues,
  });

  // `defaultValues` and the baseline ref are both mount-only, so a refreshed
  // `card` prop would otherwise leave the form and the save diff pinned to the
  // pre-refresh data. Keyed on identity plus updated_at so a resync happens
  // when the record actually changes and unsaved edits survive a re-render
  // that changed nothing.
  const syncKey = `${card.id}:${card.updated_at ?? ""}`;
  const syncedTo = React.useRef(syncKey);
  React.useEffect(() => {
    if (syncedTo.current === syncKey) return;
    syncedTo.current = syncKey;
    baseline.current = initialValues;
    reset(initialValues);
  }, [syncKey, initialValues, reset]);

  const { patch } = useCardMutations();

  const onSubmit = handleSubmit(async (values) => {
    const cardPatch = buildCardPatch(values, baseline.current);
    if (Object.keys(cardPatch).length === 0) {
      toast.info("No changes to save");
      return;
    }

    try {
      await patch.mutateAsync([
        card.id,
        cardPatch,
        { note: values.note.trim() || undefined, publicSlug: card.public_slug },
      ]);
    } catch {
      // The mutation's onError already surfaced the message; keep the form
      // populated and the baseline untouched so a retry resends the same patch.
      return;
    }

    const saved: CardEditorValues = { ...values, note: "" };
    baseline.current = saved;
    reset(saved);
    // `card` is server-rendered, so the header and the image/relationship/
    // placement panels would keep showing pre-save values. The refreshed prop
    // carries a new `updated_at`, which the `syncKey` effect above picks up.
    router.refresh();
  });

  const busy = isSubmitting || patch.isPending;

  return (
    <>
      <AdminPageHeader
        title={card.name}
        description={`${card.set?.set_code ?? "no set"} · ${card.collector_number ?? "no collector number"} · ${card.source ?? "riftcodex"}`}
        crumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Cards", href: "/admin/cards" },
          { label: card.name },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={cardHref(card)}>
              <ExternalLink aria-hidden="true" />
              View card page
            </Link>
          </Button>
        }
      />

      <form onSubmit={onSubmit} className="space-y-8">
        <AdminSection heading="Basics">
          <FieldGrid>
            <TextField
              id="card-name"
              label="Name"
              error={errors.name?.message}
              hint="Saving a new name also updates the normalized search name."
              {...register("name")}
            />
            <TextField
              id="card-collector"
              label="Collector number"
              error={errors.collector_number?.message}
              {...register("collector_number")}
            />
            <TextField
              id="card-released"
              label="Released at"
              type="date"
              error={errors.released_at?.message}
              {...register("released_at")}
            />
            <TextField
              id="card-artist"
              label="Artist"
              error={errors.artist?.message}
              hint="Clearing this unlinks the card from its artist record."
              {...register("artist")}
            />
          </FieldGrid>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CheckboxField
              id="card-is-token"
              label="Token"
              hint="Tokens are listed under “Tokens used” on the cards that make them."
              {...register("is_token")}
            />
          </div>
        </AdminSection>

        <Separator />

        <AdminSection heading="Attributes">
          <FieldGrid>
            <TextField
              id="card-energy"
              label="Energy"
              inputMode="numeric"
              error={errors.attributes?.energy?.message}
              {...register("attributes.energy")}
            />
            <TextField
              id="card-power"
              label="Power"
              inputMode="numeric"
              error={errors.attributes?.power?.message}
              {...register("attributes.power")}
            />
            <TextField
              id="card-might"
              label="Might"
              inputMode="numeric"
              error={errors.attributes?.might?.message}
              {...register("attributes.might")}
            />
          </FieldGrid>
        </AdminSection>

        <Separator />

        <AdminSection
          heading="Classification"
          description="Tags and domains are comma-separated; the whole list is replaced on save."
        >
          <FieldGrid>
            <TextField
              id="card-type"
              label="Type"
              error={errors.classification?.type?.message}
              {...register("classification.type")}
            />
            <TextField
              id="card-supertype"
              label="Supertype"
              hint="e.g. Champion, Signature"
              error={errors.classification?.supertype?.message}
              {...register("classification.supertype")}
            />
            <TextField
              id="card-rarity"
              label="Rarity"
              error={errors.classification?.rarity?.message}
              {...register("classification.rarity")}
            />
            <TextField
              id="card-tags"
              label="Tags"
              hint="e.g. Poro, Relic"
              error={errors.classification?.tags?.message}
              {...register("classification.tags")}
            />
            <TextField
              id="card-domains"
              label="Domains"
              hint="e.g. Fury, Calm"
              error={errors.classification?.domains?.message}
              {...register("classification.domains")}
            />
          </FieldGrid>
        </AdminSection>

        <Separator />

        <AdminSection
          heading="Text"
          description="Rich text keeps inline symbol tokens like :rb_exhaust: and [Keyword] badges. Plain text is the accessible fallback used in search and exports."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TextAreaField
              id="card-text-rich"
              label="Rules text (rich)"
              rows={6}
              error={errors.text?.rich?.message}
              {...register("text.rich")}
            />
            <TextAreaField
              id="card-text-plain"
              label="Rules text (plain)"
              rows={6}
              error={errors.text?.plain?.message}
              {...register("text.plain")}
            />
            <TextAreaField
              id="card-text-flavour"
              label="Flavour text"
              rows={3}
              className="lg:col-span-2"
              error={errors.text?.flavour?.message}
              {...register("text.flavour")}
            />
          </div>
        </AdminSection>

        <Separator />

        <AdminSection heading="Printing metadata">
          <FieldGrid>
            <TextField
              id="card-finishes"
              label="Finishes"
              hint="Comma-separated, e.g. Normal, Foil"
              error={errors.metadata?.finishes?.message}
              {...register("metadata.finishes")}
            />
            <SelectField
              id="card-orientation"
              label="Image orientation"
              options={ORIENTATION_OPTIONS}
              error={errors.media?.orientation?.message}
              {...register("media.orientation")}
            />
            <TextField
              id="card-alt-text"
              label="Image alt text"
              hint="Describes the art for screen readers."
              error={errors.media?.accessibility_text?.message}
              {...register("media.accessibility_text")}
            />
          </FieldGrid>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CheckboxField
              id="card-signature"
              label="Signature printing"
              hint="Adds /signature to the public slug."
              {...register("metadata.signature")}
            />
            <CheckboxField
              id="card-alternate-art"
              label="Alternate art"
              hint="Appends “a” to a numeric collector number in slugs."
              {...register("metadata.alternate_art")}
            />
            <CheckboxField
              id="card-overnumbered"
              label="Overnumbered"
              hint="Collector number sits beyond the set's printed count."
              {...register("metadata.overnumbered")}
            />
          </div>
        </AdminSection>

        <Separator />

        <AdminSection
          heading="External IDs"
          description="Used to match this printing to upstream sources during ingest."
        >
          <FieldGrid>
            <TextField
              id="card-riftcodex-id"
              label="RiftCodex ID"
              error={errors.external_ids?.riftcodex_id?.message}
              {...register("external_ids.riftcodex_id")}
            />
            <TextField
              id="card-riftbound-id"
              label="Riftbound ID"
              error={errors.external_ids?.riftbound_id?.message}
              {...register("external_ids.riftbound_id")}
            />
            <TextField
              id="card-tcgplayer-id"
              label="TCGPlayer ID"
              hint="Drives price enrichment. A wrong value shows another card's prices."
              error={errors.external_ids?.tcgplayer_id?.message}
              {...register("external_ids.tcgplayer_id")}
            />
          </FieldGrid>
        </AdminSection>

        <Separator />

        <AdminSection
          heading="Marketplace"
          description="Prices are refreshed from TCGPlayer on every ingest unless overridden here."
        >
          <FieldGrid>
            <TextField
              id="card-buy-tcgplayer"
              label="TCGPlayer URL"
              type="url"
              error={errors.purchase_uris?.tcgplayer?.message}
              {...register("purchase_uris.tcgplayer")}
            />
            <TextField
              id="card-buy-cardmarket"
              label="Cardmarket URL"
              type="url"
              error={errors.purchase_uris?.cardmarket?.message}
              {...register("purchase_uris.cardmarket")}
            />
          </FieldGrid>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">TCGPlayer prices (USD)</h3>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  id="price-tcg-normal"
                  label="Market"
                  inputMode="decimal"
                  error={errors.prices?.tcgplayer?.normal?.message}
                  {...register("prices.tcgplayer.normal")}
                />
                <TextField
                  id="price-tcg-foil"
                  label="Market (foil)"
                  inputMode="decimal"
                  error={errors.prices?.tcgplayer?.foil?.message}
                  {...register("prices.tcgplayer.foil")}
                />
                <TextField
                  id="price-tcg-low"
                  label="Low"
                  inputMode="decimal"
                  error={errors.prices?.tcgplayer?.low_normal?.message}
                  {...register("prices.tcgplayer.low_normal")}
                />
                <TextField
                  id="price-tcg-low-foil"
                  label="Low (foil)"
                  inputMode="decimal"
                  error={errors.prices?.tcgplayer?.low_foil?.message}
                  {...register("prices.tcgplayer.low_foil")}
                />
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Cardmarket prices (EUR)</h3>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  id="price-cm-normal"
                  label="Market"
                  inputMode="decimal"
                  error={errors.prices?.cardmarket?.normal?.message}
                  {...register("prices.cardmarket.normal")}
                />
                <TextField
                  id="price-cm-foil"
                  label="Market (foil)"
                  inputMode="decimal"
                  error={errors.prices?.cardmarket?.foil?.message}
                  {...register("prices.cardmarket.foil")}
                />
                <TextField
                  id="price-cm-low"
                  label="Low"
                  inputMode="decimal"
                  error={errors.prices?.cardmarket?.low_normal?.message}
                  {...register("prices.cardmarket.low_normal")}
                />
                <TextField
                  id="price-cm-low-foil"
                  label="Low (foil)"
                  inputMode="decimal"
                  error={errors.prices?.cardmarket?.low_foil?.message}
                  {...register("prices.cardmarket.low_foil")}
                />
              </div>
            </div>
          </div>
        </AdminSection>

        <Separator />

        <div className="bg-background/95 sticky bottom-0 -mx-4 flex flex-wrap items-end justify-between gap-4 border-t px-4 py-4 backdrop-blur">
          <TextField
            id="card-note"
            label="Audit note"
            className="min-w-60 flex-1"
            hint="Stored with the override so the next admin knows why this changed."
            error={errors.note?.message}
            {...register("note")}
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>

      <Separator className="my-8" />

      <div className="space-y-8">
        <AdminCardImagePanel card={card} />
        <Separator />
        <AdminCardRelationshipsPanel card={card} />
        <Separator />
        {/* Legalities and rulings save on their own — they are keyed on the
            card's oracle group, not on the printing's override patch. */}
        <AdminCardLegalitiesPanel card={card} />
        <Separator />
        <AdminCardRulingsPanel card={card} />
        <Separator />
        <AdminCardPlacementPanel card={card} setCodes={setCodes} />
      </div>
    </>
  );
}
